import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

// Chế độ Live: viết thẳng trên bản hiển thị.
// Ký hiệu Markdown (#, **, `, [](…), >, - [ ]) được ẩn trên mọi dòng trừ dòng đang sửa
// (dòng có con trỏ hoặc vùng chọn), nên chữ trông như bản đọc mà vẫn sửa trực tiếp được.
// Tiêu đề hiện đúng cỡ, checkbox của task bấm được, gạch đầu dòng thành chấm tròn,
// khối code dùng font mono và nền riêng. Nội dung văn bản không bị đổi.

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-live-check'
    box.checked = this.checked
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done')
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      // "[ ]" ↔ "[x]": thay đúng ký tự giữa hai ngoặc
      const at = this.pos + 1
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.checked ? ' ' : 'x' }, userEvent: 'input.toggle' })
    })
    return box
  }
  ignoreEvent(): boolean {
    return false
  }
}

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const dot = document.createElement('span')
    dot.className = 'cm-live-bullet'
    dot.textContent = '•'
    return dot
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const hr = document.createElement('span')
    hr.className = 'cm-live-hr'
    return hr
  }
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const rule = Decoration.replace({ widget: new RuleWidget() })
const linkText = Decoration.mark({ class: 'cm-live-link' })
const fence = Decoration.mark({ class: 'cm-live-fence' })
const comment = Decoration.mark({ class: 'cm-live-comment' })
const headingLine = [1, 2, 3, 4, 5, 6].map((n) => Decoration.line({ class: `cm-live-h cm-live-h${n}` }))
const quoteLine = Decoration.line({ class: 'cm-live-quote' })
const codeLine = Decoration.line({ class: 'cm-live-code' })
const codeFirst = Decoration.line({ class: 'cm-live-code cm-live-code-first' })
const codeLast = Decoration.line({ class: 'cm-live-code cm-live-code-last' })

/** Số dòng đang được sửa (có con trỏ hoặc vùng chọn chạm tới) */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  if (!view.hasFocus) return lines
  const { doc } = view.state
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number
    const b = doc.lineAt(r.to).number
    for (let n = a; n <= b && n - a < 500; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const doc = state.doc
  const active = activeLines(view)
  const out: Range<Decoration>[] = []
  const isActive = (pos: number): boolean => active.has(doc.lineAt(pos).number)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        // Khối code: chỉ trang trí dòng, không ẩn gì bên trong
        if (name === 'FencedCode' || name === 'CodeBlock') {
          const first = doc.lineAt(node.from).number
          const last = doc.lineAt(node.to).number
          for (let n = first; n <= last; n++) {
            const line = doc.line(n)
            out.push((n === first ? codeFirst : n === last ? codeLast : codeLine).range(line.from))
          }
          // Dấu ``` và tên ngôn ngữ: làm mờ khi không sửa dòng đó
          for (const child of [...node.node.getChildren('CodeMark'), ...node.node.getChildren('CodeInfo')]) {
            if (!isActive(child.from) && child.to > child.from) out.push(fence.range(child.from, child.to))
          }
          return false
        }
        const heading = /^ATXHeading([1-6])$/.exec(name)
        if (heading) {
          out.push(headingLine[Number(heading[1]) - 1].range(doc.lineAt(node.from).from))
          return
        }
        if (name === 'Blockquote') {
          const first = doc.lineAt(node.from).number
          const last = doc.lineAt(node.to).number
          for (let n = first; n <= last; n++) out.push(quoteLine.range(doc.line(n).from))
          return
        }
        // Chú thích HTML (<!-- … -->): giữ nguyên chữ nhưng làm nhạt, trừ dòng đang sửa
        if (name === 'CommentBlock' || name === 'Comment') {
          if (!isActive(node.from) && node.to > node.from) out.push(comment.range(node.from, node.to))
          return false
        }
        if (isActive(node.from)) return
        switch (name) {
          case 'HeaderMark': {
            // "## " → ẩn cả dấu cách theo sau
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            out.push(hide.range(node.from, end))
            break
          }
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'CodeMark':
            if (node.node.parent?.name !== 'FencedCode') out.push(hide.range(node.from, node.to))
            break
          case 'QuoteMark': {
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            out.push(hide.range(node.from, end))
            break
          }
          case 'Link': {
            // [chữ](url): chỉ hiện chữ, tô như link
            const marks = node.node.getChildren('LinkMark')
            if (marks.length >= 2) {
              const textFrom = marks[0].to
              const textTo = marks[1].from
              if (textTo > textFrom) {
                out.push(hide.range(marks[0].from, marks[0].to))
                out.push(linkText.range(textFrom, textTo))
                out.push(hide.range(marks[1].from, node.to))
              }
            }
            return false
          }
          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(node.from, node.to))
            out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to))
            break
          }
          case 'ListMark': {
            // Gạch đầu dòng (không phải số, không phải task) → chấm tròn
            const mark = doc.sliceString(node.from, node.to)
            const item = node.node.parent
            const isTask = !!item?.getChild('Task')
            if (/^[-*+]$/.test(mark) && !isTask) out.push(bullet.range(node.from, node.to))
            else if (isTask) {
              const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
              out.push(hide.range(node.from, end))
            }
            break
          }
          case 'HorizontalRule':
            out.push(rule.range(node.from, node.to))
            break
        }
      }
    })
  }
  return Decoration.set(out, true)
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

/** Bật chế độ Live cho editor (thêm class để CSS đổi font, cỡ chữ) */
export const livePreview: Extension = [plugin, EditorView.editorAttributes.of({ class: 'cm-live' })]
