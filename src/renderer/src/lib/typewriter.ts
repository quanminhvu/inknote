import { EditorState } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

// Chế độ máy đánh chữ (giống iA Writer, Ulysses):
// - Giữ dòng đang gõ ở giữa màn hình: gõ hay di chuyển bằng bàn phím thì cuộn để dòng con trỏ nằm giữa
//   (bấm chuột thì không cuộn, cho khỏi giật). Có khoảng trống trên và dưới để dòng đầu, dòng cuối cũng giữa được.
// - Làm nhạt phần còn lại: chỉ đoạn (hoặc câu) đang viết rõ màu, chữ khác nhạt đi. Chỉ đổi màu chữ,
//   không có hiệu ứng mờ dần. Khi editor không được chọn thì hiện bình thường.

export type DimMode = 'off' | 'paragraph' | 'sentence'

function centerOnTyping(): Extension {
  return [
    EditorState.transactionExtender.of((tr) => {
      const byKeyboard = tr.selection && (tr.isUserEvent('select') || tr.isUserEvent('move')) && !tr.isUserEvent('select.pointer')
      if (!tr.docChanged && !byKeyboard) return null
      if (!tr.isUserEvent('input') && !tr.isUserEvent('delete') && !byKeyboard && !tr.isUserEvent('undo') && !tr.isUserEvent('redo')) return null
      return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' }) }
    }),
    EditorView.contentAttributes.of({ class: 'cm-typewriter' })
  ]
}

/** Khoảng [from, to) đang viết: đoạn (các dòng liền nhau không trống) hoặc câu trong đoạn đó */
function activeRange(state: EditorState, mode: DimMode): { from: number; to: number } {
  const head = state.selection.main.head
  const doc = state.doc
  let first = doc.lineAt(head).number
  let last = first
  if (!doc.line(first).text.trim()) return { from: doc.line(first).from, to: doc.line(first).to }
  while (first > 1 && doc.line(first - 1).text.trim()) first--
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++
  const from = doc.line(first).from
  const to = doc.line(last).to
  if (mode === 'paragraph') return { from, to }
  // Câu: tách theo dấu kết câu (. ! ? …) theo sau là khoảng trắng, trong phạm vi đoạn
  const text = doc.sliceString(from, to)
  const at = head - from
  let start = 0
  for (const m of text.matchAll(/[.!?…。]+["'”’)\]]*\s+/g)) {
    const end = m.index + m[0].length
    if (end <= at) start = end
    else return { from: from + start, to: from + m.index + m[0].trimEnd().length }
  }
  return { from: from + start, to }
}

const dimMark = Decoration.mark({ class: 'cm-dimmed' })

function dimOthers(mode: DimMode): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = this.build(u.view)
      }
      build(view: EditorView): DecorationSet {
        if (!view.hasFocus) return Decoration.none
        const { from, to } = activeRange(view.state, mode)
        const out: Range<Decoration>[] = []
        for (const r of view.visibleRanges) {
          if (r.from < from) out.push(dimMark.range(r.from, Math.min(r.to, from)))
          if (r.to > to) out.push(dimMark.range(Math.max(r.from, to), r.to))
        }
        return Decoration.set(out.filter((d) => d.to > d.from), true)
      }
    },
    { decorations: (v) => v.decorations }
  )
}

export function typewriter(center: boolean, dim: DimMode): Extension {
  return [center ? centerOnTyping() : [], dim !== 'off' ? dimOthers(dim) : []]
}
