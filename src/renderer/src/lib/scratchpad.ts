import { useStore } from './store'

// Ghi chú nháp (giống plugin "scratchpad"): một ghi chú duy nhất để ghi vội.
// Không sửa gì trong 24 giờ thì tự chuyển vào Thùng rác (vẫn khôi phục được); lần sau mở lại là tờ mới.

const KEY = 'inknote:scratchpad'
const IDLE = 24 * 3_600_000

const readId = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const writeId = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // chỉ là tiện ích
  }
}

/** Mở ghi chú nháp (tạo mới nếu chưa có hoặc đã bị dọn) */
export function openScratchpad(): void {
  const s = useStore.getState()
  const id = readId()
  const note = id ? s.notes[id] : undefined
  if (note && !note.trashed) {
    s.select({ kind: 'all' })
    s.selectNote(note._id)
  } else {
    s.select({ kind: 'all' })
    const fresh = s.createNote()
    s.updateNote(fresh, { title: 'Scratchpad' })
    writeId(fresh)
  }
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.note-body .cm-content')?.focus())
}

/** Dọn ghi chú nháp đã để yên quá 24 giờ. Gọi lúc mở app và mỗi giờ (cửa sổ chính). */
export function startScratchpadSweep(): () => void {
  const sweep = (): void => {
    const s = useStore.getState()
    const id = readId()
    if (!id) return
    const note = s.notes[id]
    if (!note || note.trashed) {
      if (!note) writeId(null)
      return
    }
    if (Date.now() - note.updatedAt > IDLE && s.selectedNoteId !== id) {
      s.trashNote(id)
      writeId(null)
    }
  }
  const first = window.setTimeout(sweep, 5_000)
  const timer = window.setInterval(sweep, 3_600_000)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(timer)
  }
}
