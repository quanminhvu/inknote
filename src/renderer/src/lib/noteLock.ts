import { create } from 'zustand'
import { db, setNoteSealer, writesSettled } from './db'
import { forgetHistory } from './history'
import { useStore } from './store'
import type { LockedBody, Note } from './types'

// Khoá ghi chú bằng mật khẩu.
//
// - Nội dung được mã hoá AES-256-GCM, khoá suy ra từ mật khẩu bằng PBKDF2-SHA256 (310.000 vòng, salt riêng
//   cho mỗi ghi chú). Trên đĩa (và trong file sao lưu) chỉ có bản mã hoá: `body` luôn rỗng, nội dung nằm trong `locked`.
// - Tiêu đề, notebook, tag vẫn để thường (để còn thấy trong danh sách). Ảnh / file đính kèm không được mã hoá.
// - Mở khoá: chữ chỉ nằm trong bộ nhớ của cửa sổ này cho tới khi bấm "Lock Now" hoặc thoát app.
//   Trạng thái mở / đóng theo dõi riêng (không đoán từ việc nội dung rỗng hay không).
// - Quên mật khẩu thì không lấy lại được nội dung.

const ITERATIONS = 310_000
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encrypt(key: CryptoKey, salt: string, text: string): Promise<LockedBody> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)))
  return { v: 1, salt, iv: b64(iv), data: b64(data) }
}

async function decrypt(key: CryptoKey, locked: LockedBody): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(locked.iv) as BufferSource }, key, unb64(locked.data) as BufferSource)
  return dec.decode(plain)
}

// ── Phiên mở khoá (chỉ trong bộ nhớ) ──
const keys = new Map<string, { key: CryptoKey; salt: string }>()
/** Mật khẩu đã nhập đúng trong phiên này: mở ghi chú khoá khác cùng mật khẩu thì không phải gõ lại */
let remembered: string[] = []

export const useLockSession = create<{ revealed: Record<string, number> }>(() => ({ revealed: {} }))

export const isLocked = (note: Pick<Note, 'locked'> | undefined | null): boolean => !!note?.locked
export const isRevealed = (id: string): boolean => id in useLockSession.getState().revealed
/** Ghi chú khoá và đang đóng (chưa nhập mật khẩu) */
export const isSealed = (note: Pick<Note, '_id' | 'locked'> | undefined | null): boolean => !!note?.locked && !isRevealed(note._id)

function markRevealed(id: string): void {
  useLockSession.setState((s) => ({ revealed: { ...s.revealed, [id]: (s.revealed[id] ?? 0) + 1 } }))
}

// Lớp lưu (db.ts) gọi hàm này trước khi ghi một ghi chú có khoá: trả về bản đã mã hoá, hoặc null để KHÔNG ghi.
setNoteSealer(async (doc) => {
  const id = doc._id
  if (isRevealed(id)) {
    const session = keys.get(id)
    if (!session) {
      console.error('Locked note has no key in this session; not saving', id)
      return null
    }
    return { ...doc, body: '', locked: await encrypt(session.key, session.salt, doc.body) }
  }
  // Đang đóng: chỉ đổi thông tin ngoài (ghim, tag, notebook…). Nội dung trong bộ nhớ phải rỗng.
  if (doc.body) {
    console.error('Refusing to save text into a sealed locked note', id)
    return null
  }
  return doc
})

const store = (): ReturnType<typeof useStore.getState> => useStore.getState()

/** Đặt khoá cho ghi chú (đang mở bình thường). Ghi chú vẫn mở cho tới khi bấm Lock Now. */
export async function lockNote(id: string, password: string): Promise<void> {
  const note = store().notes[id]
  if (!note || note.locked) return
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = b64(saltBytes)
  const key = await deriveKey(password, saltBytes)
  keys.set(id, { key, salt })
  if (!remembered.includes(password)) remembered.push(password)
  markRevealed(id)
  // Xoá các phiên bản cũ (chữ thường) của ghi chú khỏi lịch sử
  await forgetHistory(id)
  // Đánh dấu có khoá: lớp lưu sẽ mã hoá nội dung trước khi ghi
  store().updateNote(id, { locked: { v: 1, salt, iv: '', data: '' } })
}

/** Bản mã hoá mới nhất: đọc từ cơ sở dữ liệu (bản trong bộ nhớ có thể chưa cập nhật sau lần lưu cuối) */
async function storedLock(id: string): Promise<LockedBody | null> {
  await writesSettled()
  try {
    const doc = (await db.get(id)) as unknown as Note
    return doc.locked ?? null
  } catch {
    return null
  }
}

/** Mở khoá bằng mật khẩu. Trả về false nếu sai mật khẩu. */
export async function unlockNote(id: string, password: string): Promise<boolean> {
  const note = store().notes[id]
  if (!note?.locked) return true
  if (isRevealed(id)) return true
  const locked = await storedLock(id)
  if (!locked) return false
  try {
    const key = await deriveKey(password, unb64(locked.salt))
    // Ghi chú vừa đặt khoá nhưng chưa kịp lưu lần nào: chưa có dữ liệu mã hoá
    const body = locked.data ? await decrypt(key, locked) : ''
    keys.set(id, { key, salt: locked.salt })
    if (!remembered.includes(password)) remembered.push(password)
    // Đưa nội dung vào trước, rồi mới đánh dấu đã mở: editor được dựng mới với đúng nội dung
    // (không phải "thay đổi" từ rỗng sang có chữ, nên ⌘Z không xoá trắng ghi chú)
    store().revealNote(id, body)
    markRevealed(id)
    return true
  } catch {
    return false
  }
}

/** Thử mở bằng mật khẩu đã nhập đúng trước đó trong phiên này */
export async function tryRememberedPasswords(id: string): Promise<boolean> {
  for (const p of remembered) if (await unlockNote(id, p)) return true
  return false
}

/** Đóng mọi ghi chú khoá đang mở: lưu nốt (đã mã hoá) rồi xoá chữ khỏi bộ nhớ */
export async function lockAll(): Promise<number> {
  const ids = Object.keys(useLockSession.getState().revealed)
  for (const id of ids) store().saveNoteNow(id)
  // Chờ bản mã hoá ghi xong trước khi quên khoá
  await writesSettled()
  const latest = new Map<string, LockedBody | null>()
  for (const id of ids) latest.set(id, await storedLock(id))
  // Quên mật khẩu và khoá trước, rồi xoá chữ khỏi bộ nhớ, sau cùng mới đổi sang màn hình khoá
  // (màn hình khoá tự thử mật khẩu đã nhớ: nếu còn nhớ thì ghi chú sẽ tự mở lại ngay)
  keys.clear()
  remembered = []
  for (const id of ids) store().sealNote(id, latest.get(id) ?? undefined)
  useLockSession.setState({ revealed: {} })
  return ids.length
}

/** Bỏ khoá hẳn (ghi chú phải đang mở): lưu lại nội dung dạng thường */
export function removeLock(id: string): void {
  const note = store().notes[id]
  if (!note?.locked || !isRevealed(id)) return
  keys.delete(id)
  useLockSession.setState((s) => {
    const { [id]: _gone, ...rest } = s.revealed
    return { revealed: rest }
  })
  store().updateNote(id, { locked: undefined })
}
