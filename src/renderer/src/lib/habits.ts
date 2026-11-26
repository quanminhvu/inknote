import { create } from 'zustand'

// Theo dõi thói quen (giống plugin "habits"): danh sách thói quen, tick từng ngày, đếm chuỗi ngày liên tiếp.
// Lưu trên máy này.

export interface Habit {
  id: string
  name: string
}

interface Data {
  habits: Habit[]
  /** id thói quen → các ngày đã làm ("2026-11-27") */
  done: Record<string, string[]>
}

const KEY = 'inknote:habits'
const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function read(): Data {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Data>
    return { habits: Array.isArray(raw.habits) ? raw.habits : [], done: raw.done && typeof raw.done === 'object' ? raw.done : {} }
  } catch {
    return { habits: [], done: {} }
  }
}

interface State extends Data {
  add: (name: string) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  toggle: (id: string, day: string) => void
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
    localStorage.setItem(KEY, JSON.stringify({ habits: s.habits, done: s.done }))
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
