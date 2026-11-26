import { syntaxTree } from '@codemirror/language'
import { MapMode, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { create } from 'zustand'
import { languageName, useTranslatePrefs } from './utilities'
import { useStore } from './store'

// Dịch khi đang gõ: bật chế độ này thì mỗi dòng vừa viết (ngừng gõ khoảng 0,6 giây) được dịch
// bằng Google Dịch và hiện ngay bên dưới, chữ nhạt. Dòng dịch chỉ để xem, không nằm trong ghi chú;
// muốn giữ thì bấm "Insert" trên dòng dịch. Chỉ gửi những dòng vừa sửa, mỗi lần một yêu cầu.

const IDLE_MS = 600

// ── Bật / tắt (nhớ trên máy) ──
const KEY = 'inknote:live-translate'
function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}
export const useLiveTranslate = create<{ on: boolean; toggle: () => void }>((set, get) => ({
  on: readOn(),
  toggle: () => {
    const on = !get().on
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      // chỉ là tiện ích
    }
    set({ on })
    const t = useTranslatePrefs.getState()
    useStore
      .getState()
      .showNotice(on ? `Live translate on: each line you write is translated to ${languageName(t.target)} (or ${languageName(t.fallback)}) below it.` : 'Live translate off.')
  }
}))

// ── Dịch (có bộ nhớ đệm để không gửi lại cùng một câu) ──
const cache = new Map<string, string>()
const remember = (key: string, value: string): void => {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > 600) cache.delete(cache.keys().next().value!)
}
/** Ngôn ngữ đoán được ở dòng trước: viết tiếng Việt liên tục thì gọi thẳng ngôn ngữ dự phòng, đỡ một lần gọi */
let lastFrom = ''

async function translateLine(text: string): Promise<string | null> {
  const bridge = window.inknote?.utilities
  if (!bridge) return null
  const { target, fallback } = useTranslatePrefs.getState()
  const first = lastFrom === target && fallback !== target ? fallback : target
  const key = `${first}\u0000${text}`
  const hit = cache.get(key) ?? cache.get(`${first === target ? fallback : target}\u0000${text}`)
  if (hit !== undefined) return hit
  let res = await bridge.translate(text, first)
  if ('error' in res) return null
  lastFrom = res.from
  // Đoán sai chiều (dòng này là ngôn ngữ khác dòng trước): dịch lại đúng chiều
  const want = res.from === target ? fallback : target
  if (want !== first && want !== res.from) {
    const again = await bridge.translate(text, want)
    if ('error' in again) return null
    res = again
  }
  if (res.from === want) return null // đã là ngôn ngữ đích, không cần dòng dịch
  remember(`${want}\u0000${text}`, res.text)
  return res.text
}

// ── Chọn phần chữ cần dịch của một dòng ──
const MARK = /^(\s*)((?:>\s*)*(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?)/

function inCode(state: EditorState, pos: number): boolean {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (/^(FencedCode|CodeBlock|HTMLBlock|CommentBlock)$/.test(node.name)) return true
  }
  return false
}

/** Phần chữ thuần cần dịch, hoặc null nếu dòng không đáng dịch (trống, code, bảng, link trơn, số…) */
function sourceOf(state: EditorState, lineFrom: number): string | null {
  const line = state.doc.lineAt(lineFrom)
  const text = line.text
  if (!text.trim() || text.trim().startsWith('|') || /^\s*(```|~~~|---\s*$)/.test(text)) return null
  if (inCode(state, line.from)) return null
  const body = text
    .replace(MARK, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim()
  // Cần có chữ (không chỉ số, ký hiệu, URL)
  if (!/\p{L}{2,}/u.test(body.replace(/https?:\/\/\S+/g, ''))) return null
  return body.length > 1000 ? body.slice(0, 1000) : body
}

// ── Trạng thái trong editor: dòng nào có bản dịch nào ──
interface Entry {
  pos: number // đầu dòng
  src: string
  out: string
}

const setEntry = StateEffect.define<Entry>()

class TranslationWidget extends WidgetType {
  constructor(readonly text: string, readonly indent: number, readonly stale: boolean) {
    super()
  }
  eq(other: TranslationWidget): boolean {
    return other.text === this.text && other.indent === this.indent && other.stale === this.stale
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('div')
    el.className = this.stale ? 'cm-live-translation stale' : 'cm-live-translation'
    el.style.paddingLeft = `${this.indent}ch`
    const span = document.createElement('span')
    span.textContent = this.text
    el.appendChild(span)
    const keep = document.createElement('button')
    keep.type = 'button'
    keep.textContent = 'Insert'
    keep.title = 'Add this translation to the note, below the line'
    keep.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(el)
      const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length))
      const insert = `\n${' '.repeat(this.indent)}${this.text}`
      view.dispatch({ changes: { from: line.to, insert }, userEvent: 'input' })
    })
    el.appendChild(keep)
    return el
  }
  ignoreEvent(): boolean {
    return true
  }
}

const entries = StateField.define<Entry[]>({
  create: () => [],
  update(value, tr) {
    let next = value
    if (tr.docChanged) {
      next = []
      for (const e of value) {
        const pos = tr.changes.mapPos(e.pos, 1, MapMode.TrackDel)
        if (pos === null) continue
        next.push({ ...e, pos: tr.state.doc.lineAt(pos).from })
      }
    }
    for (const eff of tr.effects) {
      if (!eff.is(setEntry)) continue
      const line = tr.state.doc.lineAt(Math.min(eff.value.pos, tr.state.doc.length))
      next = next.filter((e) => e.pos !== line.from)
      if (eff.value.out) next.push({ ...eff.value, pos: line.from })
    }
    // Hai bản dịch dồn về cùng một dòng (gộp dòng): giữ bản sau cùng
    const seen = new Set<number>()
    return next.reverse().filter((e) => (seen.has(e.pos) ? false : (seen.add(e.pos), true))).reverse()
  }
})

/** Dòng dịch là khối nằm dưới dòng gốc: phải lấy từ StateField (CodeMirror không cho plugin vẽ khối) */
const decorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_value, tr) {
    const list = tr.state.field(entries)
    const out: Range<Decoration>[] = []
    for (const e of [...list].sort((a, b) => a.pos - b.pos)) {
      if (e.pos > tr.state.doc.length) continue
      const line = tr.state.doc.lineAt(e.pos)
      const current = sourceOf(tr.state, line.from)
      if (current === null) continue
      const indent = (MARK.exec(line.text)?.[0].length ?? 0)
      out.push(Decoration.widget({ widget: new TranslationWidget(e.out, indent, current !== e.src), block: true, side: 1 }).range(line.to))
    }
    return Decoration.set(out, true)
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Theo dõi dòng vừa sửa; ngừng gõ một chút thì dịch, mỗi lần một yêu cầu */
const watcher = ViewPlugin.fromClass(
  class {
    pending = new Set<number>() // đầu dòng (vị trí) cần dịch
    timer = 0
    busy = false
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate): void {
      if (!u.docChanged) return
      // Vị trí cũ dời theo thay đổi
      const moved = new Set<number>()
      for (const p of this.pending) {
        const m = u.changes.mapPos(p, 1, MapMode.TrackDel)
        if (m !== null) moved.add(u.state.doc.lineAt(m).from)
      }
      this.pending = moved
      u.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
        const first = u.state.doc.lineAt(fromB).number
        const last = u.state.doc.lineAt(Math.min(toB, u.state.doc.length)).number
        for (let n = first; n <= last && n - first < 200; n++) this.pending.add(u.state.doc.line(n).from)
      })
      window.clearTimeout(this.timer)
      this.timer = window.setTimeout(() => void this.flush(), IDLE_MS)
    }
    async flush(): Promise<void> {
      if (this.busy) {
        this.timer = window.setTimeout(() => void this.flush(), IDLE_MS)
        return
      }
      this.busy = true
      try {
        while (this.pending.size) {
          const pos = this.pending.values().next().value!
          this.pending.delete(pos)
          const state = this.view.state
          if (pos > state.doc.length) continue
          const line = state.doc.lineAt(pos)
          const src = sourceOf(state, line.from)
          if (!src) {
            this.view.dispatch({ effects: setEntry.of({ pos: line.from, src: '', out: '' }) })
            continue
          }
          const out = await translateLine(src)
          if (!this.view.dom.isConnected) return
          // Dòng đã đổi trong lúc chờ: để lần dịch sau lo
          const now = this.view.state
          if (line.number > now.doc.lines) continue
          const same = now.doc.line(line.number)
          if (sourceOf(now, same.from) !== src) continue
          this.view.dispatch({ effects: setEntry.of({ pos: same.from, src, out: out ?? '' }) })
        }
      } finally {
        this.busy = false
      }
    }
    destroy(): void {
      window.clearTimeout(this.timer)
    }
  }
)

export const liveTranslate: Extension = [entries, decorations, watcher]
