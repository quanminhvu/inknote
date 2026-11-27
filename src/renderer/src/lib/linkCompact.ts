import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'

// Rút gọn link (giống plugin link-compact): ở chế độ Write, phần địa chỉ dài của [chữ](https://…) và ![ảnh](…)
// hiện thành "…" cho dễ đọc; dòng đang sửa thì hiện đầy đủ. Rê chuột vào "…" để xem địa chỉ.
// Chế độ Live đã tự ẩn địa chỉ nên không cần.

const MIN_LENGTH = 24

class Ellipsis extends WidgetType {
  constructor(readonly url: string) {
    super()
  }
  eq(other: Ellipsis): boolean {
    return other.url === this.url
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-link-compact'
    el.textContent = '…'
    el.title = this.url
    return el
  }
}

function build(view: EditorView): DecorationSet {
  if (view.dom.classList.contains('cm-live')) return Decoration.none
  const { state } = view
  const active = new Set<number>()
  if (view.hasFocus) for (const r of state.selection.ranges) for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) active.add(n)
  const out: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'URL') return
        const parent = node.node.parent?.name
        if (parent !== 'Link' && parent !== 'Image') return
        if (node.to - node.from < MIN_LENGTH) return
        if (active.has(state.doc.lineAt(node.from).number)) return
        out.push(Decoration.replace({ widget: new Ellipsis(state.sliceDoc(node.from, node.to)) }).range(node.from, node.to))
      }
    })
  }
  return Decoration.set(out, true)
}

export const linkCompact: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    live: boolean
    constructor(view: EditorView) {
      this.live = view.dom.classList.contains('cm-live')
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      const live = u.view.dom.classList.contains('cm-live')
      const reconfigured = u.transactions.some((tr) => tr.reconfigured)
      if (live !== this.live || u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.live = live
        this.decorations = build(u.view)
      }
      // Đổi Write ↔ Live: lớp "cm-live" được gắn sau lần cập nhật này, nên kiểm tra lại ở khung hình sau
      if (reconfigured) requestAnimationFrame(() => u.view.dom.isConnected && u.view.dispatch({}))
    }
  },
  { decorations: (v) => v.decorations }
)
