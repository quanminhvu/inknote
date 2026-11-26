import { getActiveEditor } from './editorCommands'
import { useStore } from './store'

// Công cụ cho ghi chú kỹ thuật, tất cả chạy trên máy:
//   - chèn UUID, mật khẩu ngẫu nhiên, chuỗi ngẫu nhiên (dùng bộ sinh số ngẫu nhiên an toàn của hệ thống)
//   - đoạn chọn: Base64, URL encode/decode; giải mã JWT để xem (không kiểm tra chữ ký)

// ── Sinh ngẫu nhiên ──
const LOWER = 'abcdefghijkmnopqrstuvwxyz' // bỏ l
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // bỏ I, O
const DIGITS = '23456789' // bỏ 0, 1
const SYMBOLS = '!@#$%^&*-_=+?'
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Số ngẫu nhiên đều trong [0, n), không lệch (bỏ các giá trị vượt bội số của n) */
function randomIndex(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

const pick = (chars: string): string => chars[randomIndex(chars.length)]

export const uuid = (): string => crypto.randomUUID()

/** Mật khẩu: có đủ chữ thường, chữ hoa, số, ký hiệu; bỏ các ký tự dễ nhầm (l, I, O, 0, 1) */
export function password(length = 20): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(all))
  // Xáo trộn (Fisher–Yates) để 4 ký tự bắt buộc không luôn nằm đầu
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function randomString(length = 32): string {
  return Array.from({ length }, () => pick(ALNUM)).join('')
}

// ── Mã hoá / giải mã ──
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Giải Base64 (cả kiểu URL-safe), bắt buộc ra chữ UTF-8 hợp lệ */
export function base64Decode(text: string): string {
  const clean = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('This is not Base64 text.')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('The decoded data is not text.')
  }
}

export const urlEncode = (text: string): string => encodeURIComponent(text)
export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    throw new Error('This is not valid URL-encoded text.')
  }
}

const JWT = /^\s*(?:Bearer\s+)?([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\s*$/

export const looksLikeJwt = (text: string): boolean => JWT.test(text)
export const looksLikeBase64 = (text: string): boolean => {
  const t = text.trim()
  if (t.length < 8 || /\s/.test(t) || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) return false
  try {
    base64Decode(t)
    return true
  } catch {
    return false
  }
}
export const looksUrlEncoded = (text: string): boolean => /%[0-9A-Fa-f]{2}/.test(text)

const when = (sec: unknown): string | null => (typeof sec === 'number' ? new Date(sec * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null)

/** Giải mã JWT thành Markdown dễ đọc: thời hạn, header và payload. Không kiểm tra chữ ký. */
export function decodeJwt(text: string, now = Date.now()): string {
  const m = JWT.exec(text)
  if (!m) throw new Error('This is not a JWT (three parts separated by dots).')
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = JSON.parse(base64Decode(m[1])) as Record<string, unknown>
    payload = JSON.parse(base64Decode(m[2])) as Record<string, unknown>
  } catch {
    throw new Error('This token does not contain readable JSON.')
  }
  const facts: string[] = []
  if (typeof header.alg === 'string') facts.push(`alg ${header.alg}`)
  const exp = when(payload.exp)
  if (exp) {
    const left = (payload.exp as number) * 1000 - now
    const days = Math.round(Math.abs(left) / 86_400_000)
    const span = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.max(1, Math.round(Math.abs(left) / 60_000))} min`
    facts.push(left < 0 ? `**expired** ${exp} (${span} ago)` : `expires ${exp} (in ${span})`)
  }
  const iat = when(payload.iat)
  if (iat) facts.push(`issued ${iat}`)
  if (typeof payload.sub === 'string' || typeof payload.sub === 'number') facts.push(`sub ${payload.sub}`)
  return [`**JWT** · ${facts.join(' · ')} · signature not checked`, '', '```json', JSON.stringify({ header, payload }, null, 2), '```'].join('\n')
}

// ── Thao tác trong editor ──
const notice = (text: string, tone: 'info' | 'error' = 'info'): void => useStore.getState().showNotice(text, tone)

/** Chèn chữ tại con trỏ (thay vùng đang chọn) */
export function insertText(text: string, what: string): void {
  const view = getActiveEditor()
  if (!view || view.state.readOnly) {
    notice('Open a note in Write or Live view first.')
    return
  }
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input', scrollIntoView: true })
  view.focus()
  notice(`${what} inserted.`)
}

export type Transform = 'base64-encode' | 'base64-decode' | 'url-encode' | 'url-decode' | 'jwt'

const RUN: Record<Exclude<Transform, 'jwt'>, (t: string) => string> = {
  'base64-encode': base64Encode,
  'base64-decode': base64Decode,
  'url-encode': urlEncode,
  'url-decode': urlDecode
}

/** Đổi đoạn đang chọn tại chỗ (JWT: chèn bản giải mã xuống dưới, giữ nguyên token) */
export function transformSelection(kind: Transform): void {
  const view = getActiveEditor()
  const sel = view?.state.selection.main
  if (!view || !sel || sel.empty || view.state.readOnly) {
    notice('Select some text in the editor first.')
    return
  }
  const text = view.state.sliceDoc(sel.from, sel.to)
  try {
    if (kind === 'jwt') {
      const line = view.state.doc.lineAt(sel.to)
      const insert = `\n\n${decodeJwt(text)}\n`
      view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length }, userEvent: 'input', scrollIntoView: true })
      return
    }
    const out = RUN[kind](text)
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: out }, selection: { anchor: sel.from, head: sel.from + out.length }, userEvent: 'input' })
  } catch (err) {
    notice(err instanceof Error ? err.message : String(err), 'error')
  }
}

/** Mục cho menu chuột phải: chỉ những phép đổi hợp với đoạn đang chọn */
export function transformsFor(text: string): { label: string; kind: Transform }[] {
  const out: { label: string; kind: Transform }[] = []
  if (looksLikeJwt(text)) out.push({ label: 'Decode JWT', kind: 'jwt' })
  if (looksLikeBase64(text)) out.push({ label: 'Base64 Decode', kind: 'base64-decode' })
  else out.push({ label: 'Base64 Encode', kind: 'base64-encode' })
  if (looksUrlEncoded(text)) out.push({ label: 'URL Decode', kind: 'url-decode' })
  else if (/[^A-Za-z0-9\-_.~]/.test(text)) out.push({ label: 'URL Encode', kind: 'url-encode' })
  return out
}
