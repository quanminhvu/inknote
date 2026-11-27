import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

// Hạn chót cho task: viết "@2026-11-20" trong dòng task.
//   - quá hạn (chưa xong) → đỏ, hôm nay → cam, 7 ngày tới → xanh, xa hơn → xám, task đã xong → mờ
//   - gõ "@" trong dòng task để chọn nhanh: today, tomorrow, thứ trong tuần, next week

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'done'

// Giờ (tuỳ chọn) ngay sau ngày: "@2026-11-20 09:00" hoặc "@2026-11-20 9:30" → nhắc việc đúng giờ
const DUE = /(^|[\s(])@(\d{4}-\d{2}-\d{2})(?: ([01]?\d|2[0-3]):([0-5]\d))?(?=$|[\s.,;:!?)])/g
const TASK_LINE = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s/
const DAY = 86_400_000

const pad = (n: number): string => String(n).padStart(2, '0')
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parseDay(key: string): Date | null {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** Số ngày từ hôm nay tới ngày hạn (âm = đã qua) */
function daysFromToday(key: string, now = new Date()): number | null {
  const date = parseDay(key)
  if (!date) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((date.getTime() - today.getTime()) / DAY)
}

/** Ngày hạn đầu tiên hợp lệ trong chữ của task */
export function dueOf(text: string): string | null {
  for (const m of text.matchAll(DUE)) if (parseDay(m[2])) return m[2]
  return null
}

/** Hạn chót có giờ: thời điểm (ms) của "@ngày giờ" đầu tiên hợp lệ, null nếu task không ghi giờ */
export function dueTimeOf(text: string): number | null {
  for (const m of text.matchAll(DUE)) {
    const day = parseDay(m[2])
    if (!day) continue
    if (m[3] === undefined) return null
    day.setHours(Number(m[3]), Number(m[4]), 0, 0)
    return day.getTime()
  }
  return null
}

/** Chữ của task bỏ phần "@ngày" (để hiện gọn trong danh sách) */
export function withoutDue(text: string): string {
  return text.replace(DUE, (_all, lead: string) => lead).replace(/\s{2,}/g, ' ').trim()
}

export function dueState(key: string, done = false, now = new Date()): DueState {
  if (done) return 'done'
  const days = daysFromToday(key, now) ?? 0
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= 7 ? 'soon' : 'later'
}

/** Nhãn ngắn: "Today", "Tomorrow", "2 days overdue", "Mon, Nov 17" (task đã xong: chỉ ghi ngày) */
export function dueLabel(key: string, now = new Date(), done = false): string {
  const days = daysFromToday(key, now)
  const date = parseDay(key)
  if (days === null || !date) return key
  if (done && days < 0) return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${-days} days overdue`
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

// ── Editor: tô "@ngày" trong dòng task ──

function inCode(view: EditorView, pos: number): boolean {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(view.state).resolveInner(pos, 1); node; node = node.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode)$/.test(node.name)) return true
  }
  return false
}

const marks = new Map<DueState, Decoration>()
const markFor = (state: DueState): Decoration => {
  let mark = marks.get(state)
  if (!mark) marks.set(state, (mark = Decoration.mark({ class: `cm-due cm-due-${state}` })))
  return mark
}

function buildDue(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  const now = new Date()
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      const task = TASK_LINE.exec(line.text)
      if (task && line.text.includes('@')) {
        for (const m of line.text.matchAll(DUE)) {
          if (!parseDay(m[2])) continue
          const start = line.from + m.index + m[1].length
          if (inCode(view, start)) continue
          out.push(markFor(dueState(m[2], task[1] !== ' ', now)).range(start, start + m[0].length - m[1].length))
        }
      }
      pos = line.to + 1
    }
  }
  return Decoration.set(out, true)
}

export const dueDateHighlight: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDue(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = buildDue(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Editor: gõ "@" trong dòng task để chọn ngày ──

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function choices(now = new Date()): { label: string; date: Date }[] {
  const at = (days: number): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const list = [
    { label: 'today', date: at(0) },
    { label: 'tomorrow', date: at(1) }
  ]
  // Thứ trong tuần: lần tới của thứ đó (không tính hôm nay và ngày mai, đã có ở trên)
  for (let i = 2; i <= 7; i++) list.push({ label: WEEKDAYS[at(i).getDay()], date: at(i) })
  list.push({ label: 'next week', date: at(7) })
  list.push({ label: 'next month', date: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()) })
  return list
}

export function dueCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  if (!TASK_LINE.test(line.text)) return null
  const match = context.matchBefore(/(?:^|\s)@[\w -]{0,12}$/)
  if (!match) return null
  const at = match.from + match.text.indexOf('@')
  const typed = context.state.sliceDoc(at + 1, context.pos)
  // "@2026-…" đang gõ tay thì để yên
  if (/^\d/.test(typed)) return null
  const options: Completion[] = choices().map(({ label, date }) => ({
    label,
    detail: `${dueLabel(dayKey(date))} · ${dayKey(date)}`,
    type: 'keyword',
    apply: (view, _c, _from, to) => {
      const insert = `@${dayKey(date)}`
      view.dispatch({ changes: { from: at, to, insert }, selection: { anchor: at + insert.length }, userEvent: 'input.complete' })
    }
  }))
  // Mở lịch để chọn ngày giờ (components/DuePicker.tsx nghe sự kiện này)
  options.push({
    label: 'pick a date…',
    detail: 'calendar and time',
    type: 'keyword',
    boost: -1,
    apply: (view, _c, _from, to) => {
      view.dispatch({ changes: { from: at, to, insert: '' }, selection: { anchor: at } })
      window.dispatchEvent(new CustomEvent('inknote-due-picker'))
    }
  })
  // Hạn có giờ (để nhắc việc): một tiếng nữa, tối nay, sáng mai
  const now = new Date()
  const stamp = (d: Date): string => `${dayKey(d)} ${clock(d)}`
  const timed: { label: string; date: Date }[] = [
    { label: 'in 1 hour', date: new Date(now.getTime() + 3_600_000) },
    { label: 'tonight', date: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0) },
    { label: 'tomorrow morning', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0) }
  ]
  for (const t of timed) {
    if (t.date.getTime() <= now.getTime()) continue
    options.push({
      label: t.label,
      detail: `remind · ${stamp(t.date)}`,
      type: 'keyword',
      apply: (view, _c, _from, to) => {
        const insert = `@${stamp(t.date)}`
        view.dispatch({ changes: { from: at, to, insert }, selection: { anchor: at + insert.length }, userEvent: 'input.complete' })
      }
    })
  }
  return { from: at + 1, options, validFor: /^[\w -]*$/ }
}

const clock = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * Ngoài dòng task: gõ "@" để chèn nhanh ngày giờ dạng chữ (không phải hạn chót):
 * @today 2026-11-27 · @now 2026-11-27 14:05 · @time 14:05 · @tomorrow · @yesterday · thứ trong tuần · @date ngày viết đầy đủ
 */
export function dateCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  if (TASK_LINE.test(line.text)) return null
  const match = context.matchBefore(/(?:^|[\s(])@[\w -]{0,12}$/)
  if (!match) return null
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(context.state).resolveInner(context.pos, -1); node; node = node.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode)$/.test(node.name)) return null
  }
  const at = match.from + match.text.indexOf('@')
  if (/^\d/.test(context.state.sliceDoc(at + 1, context.pos))) return null
  const now = new Date()
  const day = (n: number): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
  const long = (d: Date): string => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const items: { label: string; text: string }[] = [
    { label: 'today', text: dayKey(now) },
    { label: 'now', text: `${dayKey(now)} ${clock(now)}` },
    { label: 'time', text: clock(now) },
    { label: 'date', text: long(now) },
    { label: 'tomorrow', text: dayKey(day(1)) },
    { label: 'yesterday', text: dayKey(day(-1)) }
  ]
  for (let i = 2; i <= 7; i++) items.push({ label: WEEKDAYS[day(i).getDay()], text: dayKey(day(i)) })
  items.push({ label: 'next week', text: dayKey(day(7)) })
  const options: Completion[] = items.map(({ label, text }, i) => ({
    label,
    detail: text,
    type: 'text',
    boost: 50 - i,
    apply: (view, _c, _from, to) => {
      view.dispatch({ changes: { from: at, to, insert: text }, selection: { anchor: at + text.length }, userEvent: 'input.complete' })
    }
  }))
  return { from: at + 1, options, validFor: /^[\w -]*$/ }
}

// ── Preview: thay "@ngày" trong task bằng nhãn màu ──

export function decorateDueDates(root: HTMLElement): void {
  const now = new Date()
  for (const item of root.querySelectorAll<HTMLElement>('li.task-list-item')) {
    if (item.dataset.dueDone) continue
    item.dataset.dueDone = '1'
    const box = item.querySelector<HTMLInputElement>(':scope > input.task-list-item-checkbox, :scope > p > input.task-list-item-checkbox')
    const done = !!box?.checked
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, {
      // Bỏ qua chữ trong code, link và trong task con (task con tự xử lý)
      acceptNode: (node) =>
        (node.parentElement?.closest('code, pre, a, li.task-list-item') ?? item) === item && /@\d{4}-\d{2}-\d{2}/.test(node.textContent ?? '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
    })
    const nodes: Text[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
    for (const node of nodes) {
      const text = node.textContent ?? ''
      const frag = document.createDocumentFragment()
      let last = 0
      for (const m of text.matchAll(DUE)) {
        if (!parseDay(m[2])) continue
        const start = m.index + m[1].length
        frag.append(text.slice(last, start))
        const badge = document.createElement('span')
        badge.className = `due due-${dueState(m[2], done, now)}`
        const time = m[3] !== undefined ? `${m[3].padStart(2, '0')}:${m[4]}` : ''
        badge.textContent = time ? `${dueLabel(m[2], now, done)} ${time}` : dueLabel(m[2], now, done)
        badge.title = time ? `Due ${m[2]} at ${time}` : `Due ${m[2]}`
        frag.append(badge)
        last = start + m[0].length - m[1].length
      }
      if (last === 0) continue
      frag.append(text.slice(last))
      node.replaceWith(frag)
    }
  }
}
