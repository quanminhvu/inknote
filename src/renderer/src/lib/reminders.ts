import { create } from 'zustand'
import { withoutDue } from './dueDates'
import { useStore } from './store'
import { collectTasks } from './tasks'

// Nhắc việc: task chưa xong có hạn kèm giờ ("@2026-11-20 09:00") hiện thông báo của hệ thống
// đúng giờ, khi Inknote đang chạy. Bấm vào thông báo để mở ghi chú đó.
// Lỡ giờ vì app đang tắt: nhắc bù khi mở lại, nếu chưa quá 6 tiếng.
// Mỗi task chỉ nhắc một lần cho mỗi mốc giờ (nhớ trên máy).

const CHECK_EVERY = 20_000
const LATE_LIMIT = 6 * 3_600_000
const KEEP = 3 * 86_400_000
const FIRED_KEY = 'inknote:reminded'
const PREF_KEY = 'inknote:reminders'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export const useReminderPrefs = create<{ enabled: boolean; setEnabled: (on: boolean) => void }>((set) => ({
  enabled: readEnabled(),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
    } catch {
      // chỉ là tiện ích
    }
    set({ enabled })
  }
}))

function readFired(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveFired(fired: Record<string, number>, now: number): void {
  for (const [k, at] of Object.entries(fired)) if (now - at > KEEP) delete fired[k]
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired))
  } catch {
    // không lưu được thì có thể nhắc lại sau khi mở lại app
  }
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function notify(noteId: string, noteTitle: string, text: string, at: number): void {
  if (typeof Notification === 'undefined') return
  const n = new Notification(withoutDue(text) || 'Task due', { body: `${noteTitle} · due ${clock(at)}`, tag: `${noteId}|${at}` })
  n.onclick = () => {
    if (window.inknote) window.inknote.showInMain(noteId)
    else {
      window.focus()
      useStore.getState().selectNote(noteId)
    }
  }
}

/** Kiểm tra định kỳ; trả về hàm dừng. Chỉ gọi ở cửa sổ chính. */
export function startReminders(): () => void {
  const check = (): void => {
    if (!useReminderPrefs.getState().enabled) return
    const { notes } = useStore.getState()
    const now = Date.now()
    const fired = readFired()
    let changed = false
    for (const t of collectTasks(notes)) {
      if (notes[t.noteId]?.locked) continue
      if (t.done || t.dueAt === null || t.dueAt > now || now - t.dueAt > LATE_LIMIT) continue
      const key = `${t.noteId}|${t.text}|${t.dueAt}`
      if (fired[key]) continue
      fired[key] = t.dueAt
      changed = true
      notify(t.noteId, t.noteTitle, t.text, t.dueAt)
    }
    if (changed) saveFired(fired, now)
  }
  // Chờ dữ liệu nạp xong rồi mới kiểm tra lần đầu
  const first = window.setTimeout(check, 3_000)
  const timer = window.setInterval(check, CHECK_EVERY)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(timer)
  }
}
