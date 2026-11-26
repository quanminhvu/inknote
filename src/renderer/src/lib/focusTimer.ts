import { create } from 'zustand'
import { useStore } from './store'

// Hẹn giờ tập trung (Pomodoro): 25 phút làm việc, 5 phút nghỉ, cứ 4 phiên thì nghỉ dài 15 phút.
// Đồng hồ nằm ở thanh trạng thái; hết giờ thì hiện thông báo của hệ thống và tự chuyển sang nghỉ / làm.
// Số phiên đã xong trong ngày được nhớ trên máy.

export type Phase = 'idle' | 'focus' | 'break'

const LENGTHS_KEY = 'inknote:focus-length'
const COUNT_KEY = 'inknote:focus-count'

const today = (): string => new Date().toISOString().slice(0, 10)

function readCount(): number {
  try {
    const saved = JSON.parse(localStorage.getItem(COUNT_KEY) ?? '{}') as { day?: string; n?: number }
    return saved.day === today() ? (saved.n ?? 0) : 0
  } catch {
    return 0
  }
}
function saveCount(n: number): void {
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify({ day: today(), n }))
  } catch {
    // chỉ là tiện ích
  }
}
function readLength(): number {
  try {
    const v = Number(localStorage.getItem(LENGTHS_KEY))
    return [15, 25, 50].includes(v) ? v : 25
  } catch {
    return 25
  }
}

interface FocusState {
  phase: Phase
  /** Thời điểm hết giờ (ms); khi tạm dừng thì là null và `left` giữ số ms còn lại */
  endsAt: number | null
  left: number
  /** Độ dài phiên làm việc (phút) */
  length: number
  /** Số phiên làm việc đã xong hôm nay */
  done: number
  now: number
  start: (length?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  skip: () => void
}

const breakFor = (done: number): number => (done > 0 && done % 4 === 0 ? 15 : 5)

export const useFocusTimer = create<FocusState>((set, get) => ({
  phase: 'idle',
  endsAt: null,
  left: 0,
  length: readLength(),
  done: readCount(),
  now: Date.now(),
  start: (length) => {
    const len = length ?? get().length
    if (length) {
      try {
        localStorage.setItem(LENGTHS_KEY, String(length))
      } catch {
        // chỉ là tiện ích
      }
    }
    set({ phase: 'focus', length: len, endsAt: Date.now() + len * 60_000, left: len * 60_000, now: Date.now() })
  },
  pause: () => {
    const { endsAt } = get()
    if (endsAt) set({ endsAt: null, left: Math.max(0, endsAt - Date.now()) })
  },
  resume: () => {
    const { endsAt, left, phase } = get()
    if (!endsAt && phase !== 'idle') set({ endsAt: Date.now() + left, now: Date.now() })
  },
  stop: () => set({ phase: 'idle', endsAt: null, left: 0 }),
  skip: () => finish(true)
}))

function notify(title: string, body: string): void {
  if (typeof Notification === 'undefined') return
  try {
    new Notification(title, { body, silent: false })
  } catch {
    // không hiện được thông báo thì vẫn chuyển phiên bình thường
  }
}

/** Hết một phiên: làm việc → nghỉ, nghỉ → làm việc */
function finish(skipped = false): void {
  const s = useFocusTimer.getState()
  if (s.phase === 'focus') {
    const done = skipped ? s.done : s.done + 1
    if (!skipped) saveCount(done)
    const rest = breakFor(done)
    useFocusTimer.setState({ phase: 'break', done, endsAt: Date.now() + rest * 60_000, left: rest * 60_000 })
    if (!skipped) notify('Focus session done', `${done} today. Take a ${rest}-minute break.`)
  } else if (s.phase === 'break') {
    useFocusTimer.setState({ phase: 'focus', endsAt: Date.now() + s.length * 60_000, left: s.length * 60_000 })
    if (!skipped) notify('Break is over', `Next focus session: ${s.length} minutes.`)
  }
}

let ticking = false
/** Đồng hồ chạy ở cửa sổ chính (gọi một lần) */
export function startFocusClock(): () => void {
  if (ticking) return () => undefined
  ticking = true
  const timer = window.setInterval(() => {
    const s = useFocusTimer.getState()
    if (s.phase === 'idle' || !s.endsAt) return
    const now = Date.now()
    if (now >= s.endsAt) finish()
    else useFocusTimer.setState({ now })
  }, 1000)
  return () => {
    ticking = false
    window.clearInterval(timer)
  }
}

export function remainingMs(s: Pick<FocusState, 'endsAt' | 'left' | 'now'>): number {
  return s.endsAt ? Math.max(0, s.endsAt - s.now) : s.left
}

export const mmss = (ms: number): string => {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function toggleFocus(): void {
  const s = useFocusTimer.getState()
  if (s.phase === 'idle') {
    s.start()
    useStore.getState().showNotice(`Focus for ${s.length} minutes. The timer is in the status bar.`)
  } else if (s.endsAt) s.pause()
  else s.resume()
}
