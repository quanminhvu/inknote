import { Prec } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import { useEditorPrefs } from './editorPrefs'
import { useStore } from './store'
import { isMac } from './util'

// Đường dẫn file code trong ghi chú (src/app.ts:42, ./lib/db.go:10:5, ~/project/main.py, /Users/…/index.ts)
// bấm được để mở bằng VS Code / Cursor / Windsurf / Zed, đúng dòng và cột.
// Editor: ⌘-click (Ctrl-click). Bản xem: bấm thường.
// Đường dẫn tương đối tìm trong các thư mục dự án ở Preferences → Editor → Code files.

/** Có "/" hoặc có ":dòng"; phần cuối phải có đuôi file. Không bắt phần nằm trong URL (sau "://"). */
const PATH = /(?<![\w/.:~@%-])((?:~\/|\.{1,2}\/|\/)?(?:[\w@+-][\w@.+-]*\/)*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+)(?::(\d+))?)?(?![\w/])/g

export interface PathMatch {
  index: number
  length: number
  path: string
  line: number
  col: number
}

export function findPaths(text: string): PathMatch[] {
  const out: PathMatch[] = []
  for (const m of text.matchAll(PATH)) {
    const path = m[1]
    const line = Number(m[2] ?? 0)
    if (!path.includes('/') && !line) continue
    // Bỏ tên miền kiểu example.com/abc (phần đầu có dấu chấm, không bắt đầu bằng ./ ~/ /)
    if (/^[\w-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\//i.test(path) && !/^\.{0,2}\//.test(path)) continue
    out.push({ index: m.index, length: m[0].length, path, line, col: Number(m[3] ?? 0) })
  }
  return out
}

const EDITOR_NAMES = { vscode: 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', zed: 'Zed' } as const
export const codeEditorName = (): string => EDITOR_NAMES[useEditorPrefs.getState().codeEditor]

export async function openCodePath(path: string, line = 0, col = 0): Promise<void> {
  const bridge = window.inknote?.code
  if (!bridge) return
  const p = useEditorPrefs.getState()
  const error = await bridge.open(path, line, col, p.codeEditor, p.projectFolders)
  if (error) useStore.getState().showNotice(error, 'error')
}

// ── Editor ──
const mark = (m: PathMatch): Decoration =>
  Decoration.mark({
    class: 'cm-filepath',
    attributes: { 'data-path': m.path, 'data-line': String(m.line), 'data-col': String(m.col), title: `${isMac() ? '⌘' : 'Ctrl'}-click to open in ${codeEditorName()}` }
  })

function build(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      if (line.length < 2000) for (const m of findPaths(line.text)) out.push(mark(m).range(line.from + m.index, line.from + m.index + m.length))
      pos = line.to + 1
    }
  }
  return Decoration.set(out, true)
}

export const filePathLinks = Prec.high(
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = window.inknote?.code ? build(view) : Decoration.none
      }
      update(u: ViewUpdate): void {
        if (window.inknote?.code && (u.docChanged || u.viewportChanged)) this.decorations = build(u.view)
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event) {
          if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false
          const el = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('.cm-filepath')
          if (!el?.dataset.path) return false
          event.preventDefault()
          void openCodePath(el.dataset.path, Number(el.dataset.line), Number(el.dataset.col))
          return true
        }
      }
    }
  )
)

// ── Bản xem ──
/** Bọc các đường dẫn trong bản xem thành chỗ bấm được (bỏ qua link và sơ đồ) */
export function decorateFilePaths(root: HTMLElement): void {
  if (!window.inknote?.code) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.parentElement?.closest('a, .file-path, .mermaid-block, script, style, textarea, .katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  })
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/[/:]/.test(n.nodeValue ?? '')) nodes.push(n as Text)
  const title = `Open in ${codeEditorName()}`
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    const found = findPaths(text)
    if (!found.length) continue
    const frag = document.createDocumentFragment()
    let last = 0
    for (const m of found) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      const span = document.createElement('span')
      span.className = 'file-path'
      span.dataset.path = m.path
      span.dataset.line = String(m.line)
      span.dataset.col = String(m.col)
      span.title = title
      span.textContent = text.slice(m.index, m.index + m.length)
      frag.append(span)
      last = m.index + m.length
    }
    if (last < text.length) frag.append(text.slice(last))
    node.replaceWith(frag)
  }
}
