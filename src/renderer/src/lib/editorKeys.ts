import type { KeyBinding } from '@codemirror/view'
import { insertLink, LIST_PREFIX, toggleLinePrefix, toggleWrap } from './formatToolbar'

// Phím tắt định dạng trong editor (liệt kê cho người dùng ở lib/shortcuts.ts, nhóm "Writing").
// Chỉ dùng tổ hợp chưa bị CodeMirror dùng, trừ Mod-Enter: ở dòng task thì tick/bỏ tick,
// ở dòng khác trả lại cho CodeMirror (chèn dòng trống như cũ).

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/

/** Tick hoặc bỏ tick mọi task trong vùng chọn; không có task thì không làm gì */
const toggleTask: KeyBinding['run'] = (view) => {
  const { state } = view
  const changes: { from: number; to: number; insert: string }[] = []
  const seen = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const line = state.doc.line(n)
      const m = TASK.exec(line.text)
      if (!m) continue
      const at = line.from + m[1].length
      changes.push({ from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' })
    }
  }
  if (!changes.length) return false
  view.dispatch({ changes, userEvent: 'input.toggle' })
  return true
}

const heading = (level: number): KeyBinding['run'] => (view) => toggleLinePrefix(`${'#'.repeat(level)} `, LIST_PREFIX)(view)

/** Bỏ mọi tiền tố đầu dòng (tiêu đề, danh sách, trích dẫn) */
const plain: KeyBinding['run'] = (view) => {
  const { state } = view
  const { from, to } = state.selection.main
  const changes = []
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
    const line = state.doc.line(n)
    const m = LIST_PREFIX.exec(line.text)
    if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'input' })
  return true
}

export const writingKeymap: KeyBinding[] = [
  { key: 'Mod-Shift-x', preventDefault: true, run: toggleWrap('~~') },
  { key: 'Mod-Shift-c', preventDefault: true, run: toggleWrap('`') },
  { key: 'Mod-Alt-k', preventDefault: true, run: insertLink },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `Mod-Alt-${n}`, preventDefault: true, run: heading(n) })),
  { key: 'Mod-Alt-0', preventDefault: true, run: plain },
  { key: 'Mod-Shift-7', preventDefault: true, run: toggleLinePrefix('1. ', LIST_PREFIX) },
  { key: 'Mod-Shift-8', preventDefault: true, run: toggleLinePrefix('- ', LIST_PREFIX) },
  { key: 'Mod-Shift-9', preventDefault: true, run: toggleLinePrefix('- [ ] ', LIST_PREFIX) },
  { key: 'Mod-Shift-.', preventDefault: true, run: toggleLinePrefix('> ', LIST_PREFIX) },
  { key: 'Mod-Enter', run: toggleTask }
]
