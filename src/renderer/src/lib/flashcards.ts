import type { Note } from './types'

// Thẻ ghi nhớ: một dòng "Câu hỏi :: Trả lời" ở bất kỳ ghi chú nào (có thể là gạch đầu dòng).
// Cần dấu cách hai bên "::" để không nhầm với code như std::vector. Bỏ qua khối code.
// Lịch ôn theo kiểu SM-2 (như Anki), lưu trên máy này.

export interface Card {
  id: string
  noteId: string
  noteTitle: string
  front: string
  back: string
}

export interface CardState {
  /** Số ngày tới lần ôn sau */
  interval: number
  ease: number
  reps: number
  due: number
  lapses: number
}

export type Grade = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

const LINE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?!\[[ xX]\])(.+?)\s+::\s+(.+?)\s*$/
const FENCE = /^\s*(```|~~~)/
const DAY = 86_400_000
const KEY = 'inknote:cards'

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function collectCards(notes: Record<string, Note>): Card[] {
  const out: Card[] = []
  for (const note of Object.values(notes)) {
    if (note.trashed || !note.body.includes(' :: ')) continue
    let fence = false
    for (const raw of note.body.split('\n')) {
      if (FENCE.test(raw)) {
        fence = !fence
        continue
      }
      if (fence || raw.trimStart().startsWith('|')) continue
      const m = LINE.exec(raw)
      if (!m) continue
      const front = m[1].replace(/^#+\s+/, '').trim()
      const back = m[2].trim()
      if (!front || !back) continue
      out.push({ id: `${note._id}|${hash(front)}`, noteId: note._id, noteTitle: note.title || 'Untitled', front, back })
    }
  }
  return out
}

// ── Lịch ôn ──
export function loadStates(): Record<string, CardState> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' ? (raw as Record<string, CardState>) : {}
  } catch {
    return {}
  }
}

export function saveState(id: string, state: CardState): void {
  const all = loadStates()
  all[id] = state
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // không lưu được thì lần sau thẻ này được hỏi lại
  }
}

const fresh = (now: number): CardState => ({ interval: 0, ease: 2.5, reps: 0, due: now, lapses: 0 })

/** Trạng thái mới sau khi chấm điểm một thẻ */
export function schedule(prev: CardState | undefined, grade: Grade, now = Date.now()): CardState {
  const s = prev ?? fresh(now)
  if (grade === 1) {
    // Quên: hỏi lại sau 10 phút, giảm độ dễ
    return { interval: 0, ease: Math.max(1.3, s.ease - 0.2), reps: 0, due: now + 10 * 60_000, lapses: s.lapses + 1 }
  }
  const ease = Math.max(1.3, s.ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0))
  let interval: number
  if (s.reps === 0) interval = grade === 2 ? 1 : grade === 3 ? 1 : 4
  else if (s.reps === 1) interval = grade === 2 ? 2 : grade === 3 ? 3 : 6
  else interval = Math.round(s.interval * (grade === 2 ? 1.2 : grade === 3 ? ease : ease * 1.3))
  interval = Math.max(1, Math.min(interval, 3650))
  return { interval, ease, reps: s.reps + 1, due: now + interval * DAY, lapses: s.lapses }
}

/** Nhãn ngắn cho khoảng tới lần ôn sau: "10 min", "1 day", "3 mo" */
export function nextLabel(prev: CardState | undefined, grade: Grade, now = Date.now()): string {
  const next = schedule(prev, grade, now)
  const ms = next.due - now
  if (ms < DAY) return `${Math.round(ms / 60_000)} min`
  const days = Math.round(ms / DAY)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${(days / 365).toFixed(1)} yr`
}

/** Thẻ đến hạn ôn (thẻ mới tính là đến hạn), thẻ quá hạn lâu nhất lên trước */
export function dueCards(cards: Card[], now = Date.now()): Card[] {
  const states = loadStates()
  return cards
    .filter((c) => (states[c.id]?.due ?? 0) <= now)
    .sort((a, b) => (states[a.id]?.due ?? 0) - (states[b.id]?.due ?? 0))
}
