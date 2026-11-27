import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, showPanel } from '@codemirror/view'
import type { DecorationSet, Panel, ViewUpdate } from '@codemirror/view'

// Cảnh báo lộ khoá bí mật: khi dán hoặc gõ thứ trông như token / khoá (GitHub, OpenAI, Anthropic, AWS,
// Slack, Google, Stripe, GitLab, npm, private key, mật khẩu trong URL), editor hiện một thanh cảnh báo
// với nút che đi (Mask) hoặc khoá ghi chú bằng mật khẩu. Khoá đang có trong ghi chú được gạch chân đỏ.
// Chỉ nhận diện trên máy, không gửi đi đâu.

interface Kind {
  name: string
  re: RegExp
  /** Phần giữ lại khi che (để còn biết đó là loại gì) */
  keep: (s: string) => string
}

const prefix = (n: number) => (s: string): string => s.slice(0, n)
const KINDS: Kind[] = [
  { name: 'private key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g, keep: () => '-----BEGIN PRIVATE KEY----- ' },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g, keep: (s) => s.slice(0, s.indexOf('_') + 1) },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, keep: prefix(7) },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g, keep: (s) => /^sk-(?:proj-|svcacct-|admin-)?/.exec(s)?.[0] ?? 'sk-' },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, keep: prefix(4) },
  { name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, keep: prefix(5) },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, keep: prefix(4) },
  { name: 'Stripe secret key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g, keep: prefix(8) },
  { name: 'GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, keep: prefix(6) },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g, keep: prefix(4) },
  { name: 'password in a URL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s/@]{3,})@/gi, keep: () => '' }
]

export interface Secret {
  from: number
  to: number
  kind: string
  /** Chữ thay thế khi che */
  masked: string
}

const MASK = '••••••••'

/** Tìm khoá bí mật trong một đoạn chữ; vị trí tính từ `offset` */
export function findSecrets(text: string, offset = 0): Secret[] {
  const out: Secret[] = []
  for (const k of KINDS) {
    for (const m of text.matchAll(k.re)) {
      let from = offset + m.index
      let to = from + m[0].length
      let masked = k.keep(m[0]) + MASK
      if (k.name === 'password in a URL') {
        // Chỉ che phần mật khẩu
        const pw = m[1]
        from = offset + m.index + m[0].length - 1 - pw.length
        to = from + pw.length
        masked = MASK
      }
      if (out.some((s) => from < s.to && to > s.from)) continue
      out.push({ from, to, kind: k.name, masked })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}
export const hasSecret = (text: string): boolean => findSecrets(text).length > 0

/** Che mọi khoá trong editor (một bước, ⌘Z để hoàn tác) */
export function maskSecrets(view: EditorView): number {
  const found = findSecrets(view.state.doc.toString())
  if (!found.length) return 0
  view.dispatch({ changes: found.map((s) => ({ from: s.from, to: s.to, insert: s.masked })), userEvent: 'input' })
  return found.length
}

// ── Gạch chân khoá trong editor ──
function underline(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    // Lấy rộng ra một chút để bắt được private key nhiều dòng
    const start = view.state.doc.lineAt(from).from
    const end = view.state.doc.lineAt(to).to
    for (const s of findSecrets(view.state.sliceDoc(start, end), start)) {
      out.push(Decoration.mark({ class: 'cm-secret', attributes: { title: `Looks like a ${s.kind}. ⌘K → Mask Secrets in This Note` } }).range(s.from, s.to))
    }
  }
  return Decoration.set(out, true)
}

const highlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = underline(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = underline(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Thanh cảnh báo khi vừa dán / gõ khoá ──
const setWarning = StateEffect.define<string[] | null>()

/** Khoá mới xuất hiện ở chỗ vừa sửa (so với trước khi sửa) */
function added(before: EditorState, after: EditorState, ranges: [number, number][]): string[] {
  const kinds = new Set<string>()
  const old = new Set(findSecrets(before.doc.toString()).map((s) => before.sliceDoc(s.from, s.to)))
  for (const [a, b] of ranges) {
    const start = after.doc.lineAt(a).from
    const end = after.doc.lineAt(Math.min(b, after.doc.length)).to
    for (const s of findSecrets(after.sliceDoc(start, end), start)) {
      if (s.to >= a && s.from <= b && !old.has(after.sliceDoc(s.from, s.to))) kinds.add(s.kind)
    }
  }
  return [...kinds]
}

export function secretGuard(onLock: () => void): Extension {
  const warning = StateField.define<string[] | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setWarning)) return e.value
      if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('drop'))) return value
      const ranges: [number, number][] = []
      tr.changes.iterChangedRanges((_fa, _ta, fb, tb) => ranges.push([fb, tb]))
      const kinds = added(tr.startState, tr.state, ranges)
      return kinds.length ? kinds : value
    },
    provide: (f) =>
      showPanel.from(f, (kinds) =>
        kinds
          ? (view): Panel => {
              const dom = document.createElement('div')
              dom.className = 'cm-secret-panel'
              const text = document.createElement('span')
              const what = kinds.length === 1 ? `a ${kinds[0]}` : 'secret keys'
              text.textContent = `This looks like ${what}. Anyone who reads, syncs or receives this note can use it.`
              const btn = (label: string, primary: boolean, run: () => void): HTMLButtonElement => {
                const b = document.createElement('button')
                b.className = primary ? 'btn primary' : 'btn'
                b.textContent = label
                b.onmousedown = (e) => e.preventDefault()
                b.onclick = run
                return b
              }
              dom.append(
                text,
                btn('Mask It', true, () => {
                  maskSecrets(view)
                  view.dispatch({ effects: setWarning.of(null) })
                  view.focus()
                }),
                btn('Lock Note…', false, () => {
                  view.dispatch({ effects: setWarning.of(null) })
                  onLock()
                }),
                btn('Keep', false, () => {
                  view.dispatch({ effects: setWarning.of(null) })
                  view.focus()
                })
              )
              return { dom, top: true }
            }
          : null
      )
  })
  return [highlight, warning]
}
