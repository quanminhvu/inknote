import { create } from 'zustand'

// Theo dõi thói quen (giống plugin "habits"): danh sách thói quen, tick từng ngày, đếm chuỗi ngày liên tiếp.
// Lưu trên máy này.

export interface Habit {
  id: string
  name: string
  /** Mục tiêu theo tuần: số lần mỗi tuần (không có = mỗi ngày) */
  perWeek?: number
  /** Nhắc lúc "HH:MM" mỗi ngày (nếu chưa làm) */
  remind?: string
}

interface Data {
  habits: Habit[]
  /** id thói quen → các ngày đã làm ("2026-11-27") */
  done: Record<string, string[]>
  /** id thói quen → ngày đã nhắc gần nhất (mỗi ngày nhắc một lần) */
  reminded: Record<string, string>
}

const KEY = 'inknote:habits'
const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function read(): Data {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Data>
    return {
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      done: raw.done && typeof raw.done === 'object' ? raw.done : {},
      reminded: raw.reminded && typeof raw.reminded === 'object' ? raw.reminded : {}
    }
  } catch {
    return { habits: [], done: {}, reminded: {} }
  }
}

interface State extends Data {
  add: (name: string) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  toggle: (id: string, day: string) => void
  setGoal: (id: string, perWeek: number | undefined) => void
  setRemind: (id: string, time: string | undefined) => void
}

export const useHabits = create<State>((set) => ({
  ...read(),
  add: (name) => set((s) => ({ habits: [...s.habits, { id: crypto.randomUUID().slice(0, 8), name }] })),
  remove: (id) =>
    set((s) => {
      const { [id]: _gone, ...done } = s.done
      return { habits: s.habits.filter((h) => h.id !== id), done }
    }),
  rename: (id, name) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, name } : h)) })),
  setGoal: (id, perWeek) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, perWeek: perWeek || undefined } : h)) })),
  setRemind: (id, remind) => set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, remind } : h)) })),
  toggle: (id, day) =>
    set((s) => {
      const days = new Set(s.done[id] ?? [])
      if (days.has(day)) days.delete(day)
      else days.add(day)
      return { done: { ...s.done, [id]: [...days].sort() } }
    })
}))

useHabits.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ habits: s.habits, done: s.done, reminded: s.reminded }))
  } catch {
    // không lưu được thì lần sau mất thay đổi này
  }
})

/** Số ngày liên tiếp tới hôm nay (hôm nay chưa tick thì tính tới hôm qua) */
export function streak(days: string[] | undefined, now = new Date()): number {
  if (!days?.length) return 0
  const set = new Set(days)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!set.has(dayOf(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(dayOf(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Số lần đã làm trong tuần này (thứ Hai → Chủ nhật) */
export function weekCount(days: string[] | undefined, now = new Date()): number {
  if (!days?.length) return 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const from = dayOf(monday)
  const to = dayOf(now)
  return days.filter((d) => d >= from && d <= to).length
}

/** Nhắc thói quen chưa làm hôm nay, đúng giờ đã đặt (mỗi ngày một lần). Gọi một lần ở cửa sổ chính. */
export function startHabitReminders(): () => void {
  const check = (): void => {
    const s = useHabits.getState()
    const now = new Date()
    const today = dayOf(now)
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const reminded = { ...s.reminded }
    let changed = false
    for (const h of s.habits) {
      if (!h.remind || h.remind > hhmm || reminded[h.id] === today) continue
      const days = s.done[h.id] ?? []
      // Đã làm hôm nay, hoặc thói quen theo tuần đã đủ số lần: không nhắc
      if (days.includes(today) || (h.perWeek && weekCount(days, now) >= h.perWeek)) continue
      reminded[h.id] = today
      changed = true
      if (typeof Notification !== 'undefined') {
        try {
          new Notification(h.name, { body: h.perWeek ? `${weekCount(days, now)} of ${h.perWeek} this week` : 'Not done yet today' })
        } catch {
          // không hiện được thông báo thì thôi
        }
      }
    }
    if (changed) useHabits.setState({ reminded })
  }
  const first = window.setTimeout(check, 4_000)
  const timer = window.setInterval(check, 30_000)
  return () => {
    window.clearTimeout(first)
    window.clearInterval(timer)
  }
}
