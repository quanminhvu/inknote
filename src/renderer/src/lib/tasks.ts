import type { Note } from './types'
import { dueOf } from './dueDates'

export interface TaskItem {
  noteId: string
  noteTitle: string
  /** Dòng trong ghi chú (đếm từ 0) */
  line: number
  /** Thứ tự của ô checkbox trong ghi chú (khớp với toggleTask) */
  index: number
  text: string
  done: boolean
  /** Hạn chót "YYYY-MM-DD" (viết @2026-11-20 trong task), nếu có */
  due: string | null
  updatedAt: number
}

const TASK = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/
const FENCE = /^\s*(```|~~~)/

/** Mọi task trong các ghi chú chưa bỏ vào thùng rác, ghi chú sửa gần nhất lên trước. */
export function collectTasks(notes: Record<string, Note>): TaskItem[] {
  const out: TaskItem[] = []
  const list = Object.values(notes)
    .filter((n) => !n.trashed && n.body.includes('['))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  for (const note of list) {
    let fence = false
    let index = -1
    note.body.split('\n').forEach((raw, line) => {
      if (FENCE.test(raw)) {
        fence = !fence
        return
      }
      if (fence) return
      const m = TASK.exec(raw)
      if (!m) return
      index++
      out.push({ noteId: note._id, noteTitle: note.title || 'Untitled', line, index, text: m[2].trim() || '(empty task)', done: m[1] !== ' ', due: dueOf(m[2]), updatedAt: note.updatedAt })
    })
  }
  return out
}

/** Số task chưa xong đến hạn hôm nay và đã quá hạn */
export function dueCounts(tasks: TaskItem[], today: string): { today: number; overdue: number } {
  let dueToday = 0
  let overdue = 0
  for (const t of tasks) {
    if (t.done || !t.due) continue
    if (t.due === today) dueToday++
    else if (t.due < today) overdue++
  }
  return { today: dueToday, overdue }
}
