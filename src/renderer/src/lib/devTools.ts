import SparkMD5 from 'spark-md5'
import yaml from 'js-yaml'
import { getActiveEditor } from './editorCommands'
import { useStore } from './store'

// Chuyển đổi nhanh cho đoạn chữ đang chọn (menu chuột phải → Convert): kiểu tên biến, hệ số, JSON ↔ YAML,
// escape / unescape, sắp xếp dòng, timestamp ↔ ngày giờ, và copy mã hash. Tất cả chạy trên máy.

export interface Conversion {
  label: string
  /** Đổi đoạn chọn thành chữ mới (bỏ trống = không đổi chữ, chỉ chạy `run`) */
  apply?: (text: string) => string
  /** Việc khác thay vì đổi chữ (ví dụ copy hash) */
  run?: (text: string) => void | Promise<void>
  group: 'case' | 'number' | 'data' | 'escape' | 'lines' | 'time' | 'hash'
}

// ── Kiểu tên ──
/** Tách thành các từ: theo khoảng trắng, _, -, ., /, và chỗ chữ thường → chữ hoa (camelCase) */
export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-./]+/)
    .filter(Boolean)
}
const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
export const toCamel = (t: string): string => words(t).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')
export const toPascal = (t: string): string => words(t).map(cap).join('')
export const toSnake = (t: string): string => words(t).map((w) => w.toLowerCase()).join('_')
export const toKebab = (t: string): string => words(t).map((w) => w.toLowerCase()).join('-')
export const toConstant = (t: string): string => words(t).map((w) => w.toUpperCase()).join('_')
export const toTitle = (t: string): string => t.replace(/\S+/g, (w) => cap(w))

// ── Số ──
const NUMBER = /^\s*(-?)(0x[0-9a-f_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*)\s*$/i
export function parseInteger(text: string): bigint | null {
  const m = NUMBER.exec(text)
  if (!m) return null
  try {
    const v = BigInt(m[2].replace(/_/g, ''))
    return m[1] ? -v : v
  } catch {
    return null
  }
}
const withSign = (v: bigint, base: number, prefix: string): string => (v < 0n ? '-' : '') + prefix + (v < 0n ? -v : v).toString(base)

// ── Thời gian ──
/** Số giây (10 chữ số) hoặc mili giây (13 chữ số) trong khoảng 2001–2286 → mili giây */
export function timestampMs(text: string): number | null {
  const t = text.trim()
  if (/^\d{10}$/.test(t)) return Number(t) * 1000
  if (/^\d{13}$/.test(t)) return Number(t)
  return null
}
const pad = (n: number): string => String(n).padStart(2, '0')
/** Ngày giờ theo giờ máy, kiểu 2026-11-27 14:05:09 */
export function localStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** Còn bao lâu / đã bao lâu, kiểu "3 days ago", "in 2 hours" */
export function fromNow(ms: number, now = Date.now()): string {
  const diff = ms - now
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [365 * 86_400_000, 'year'],
    [30 * 86_400_000, 'month'],
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute']
  ]
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size)
      const span = `${n} ${name}${n === 1 ? '' : 's'}`
      return diff < 0 ? `${span} ago` : `in ${span}`
    }
  }
  return 'just now'
}
/** Chữ ngày giờ đọc được (ISO, "2026-11-27 09:00", "Nov 27, 2026"…) → mili giây */
function parseDate(text: string): number | null {
  const t = text.trim()
  if (t.length < 8 || t.length > 40 || /^\d+$/.test(t)) return null
  if (!/\d{4}|\b\d{1,2}[/.-]\d{1,2}\b/.test(t)) return null
  const ms = Date.parse(t.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'))
  return Number.isNaN(ms) ? null : ms
}

// ── Escape ──
const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const htmlEscape = (t: string): string => t.replace(/[&<>"']/g, (c) => HTML_ESC[c])
export function htmlUnescape(t: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = t
  return el.value
}
export const jsonEscape = (t: string): string => JSON.stringify(t).slice(1, -1)
export function jsonUnescape(t: string): string {
  const body = /^\s*"([\s\S]*)"\s*$/.exec(t)?.[1] ?? t
  try {
    return JSON.parse(`"${body}"`) as string
  } catch {
    throw new Error('This is not an escaped JSON string.')
  }
}

// ── JSON / YAML ──
function asJson(text: string): unknown {
  const t = text.trim()
  if (!/^[[{]/.test(t)) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}
function asYaml(text: string): unknown {
  if (!/^\s*[\w"'-][^\n]*:\s|^\s*- /m.test(text)) return undefined
  try {
    const v = yaml.load(text)
    return v && typeof v === 'object' ? v : undefined
  } catch {
    return undefined
  }
}
export const jsonToYaml = (text: string): string => yaml.dump(JSON.parse(text.trim()), { lineWidth: 120, noRefs: true }).trimEnd()
export const yamlToJson = (text: string): string => JSON.stringify(yaml.load(text), null, 2)

// ── Hash ──
async function digest(algo: 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const md5 = (text: string): string => SparkMD5.hash(unescape(encodeURIComponent(text)))
export async function hash(algo: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> {
  return algo === 'MD5' ? md5(text) : digest(algo, text)
}

async function copyHash(algo: 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<void> {
  const value = await hash(algo, text)
  await navigator.clipboard.writeText(value)
  useStore.getState().showNotice(`${algo} copied: ${value.slice(0, 16)}…`)
}

const sortLines = (t: string, dir: 1 | -1): string => {
  const trail = t.endsWith('\n') ? '\n' : ''
  const lines = t.replace(/\n$/, '').split('\n')
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return lines.sort((a, b) => dir * collator.compare(a, b)).join('\n') + trail
}

/** Các phép đổi hợp với đoạn đang chọn */
export function conversionsFor(text: string): Conversion[] {
  const out: Conversion[] = []
  const t = text.trim()
  const multiline = /\n./.test(text.replace(/\n$/, ''))

  // Kiểu tên: đoạn ngắn, một dòng, có chữ
  if (!multiline && t.length <= 120 && /[A-Za-z]/.test(t) && words(t).length > 0) {
    const cases: [string, (s: string) => string][] = [
      ['camelCase', toCamel],
      ['PascalCase', toPascal],
      ['snake_case', toSnake],
      ['kebab-case', toKebab],
      ['CONSTANT_CASE', toConstant],
      ['Title Case', toTitle],
      ['lowercase', (s) => s.toLowerCase()],
      ['UPPERCASE', (s) => s.toUpperCase()]
    ]
    for (const [label, fn] of cases) if (fn(t) !== t) out.push({ label: `To ${label}`, apply: (s) => s.replace(t, fn(t)), group: 'case' })
  }

  // Số nguyên: đổi hệ
  const n = parseInteger(t)
  if (n !== null) {
    const low = t.toLowerCase().replace(/^-/, '')
    if (!/^\d/.test(low) || low.startsWith('0x') || low.startsWith('0b') || low.startsWith('0o')) out.push({ label: `To Decimal (${n.toString()})`, apply: () => n.toString(), group: 'number' })
    if (!low.startsWith('0x')) out.push({ label: `To Hex (${withSign(n, 16, '0x')})`, apply: () => withSign(n, 16, '0x'), group: 'number' })
    if (!low.startsWith('0b')) out.push({ label: 'To Binary', apply: () => withSign(n, 2, '0b'), group: 'number' })
    if (!low.startsWith('0o')) out.push({ label: 'To Octal', apply: () => withSign(n, 8, '0o'), group: 'number' })
  }

  // Timestamp ↔ ngày giờ
  const ms = timestampMs(t)
  if (ms !== null) {
    out.push({ label: `To Date (${localStamp(ms)})`, apply: () => localStamp(ms), group: 'time' })
    out.push({ label: 'To ISO Date (UTC)', apply: () => new Date(ms).toISOString(), group: 'time' })
  } else {
    const at = parseDate(t)
    if (at !== null) {
      out.push({ label: `To Unix Timestamp (${Math.floor(at / 1000)})`, apply: () => String(Math.floor(at / 1000)), group: 'time' })
      out.push({ label: 'To Timestamp in Milliseconds', apply: () => String(at), group: 'time' })
    }
  }

  // JSON ↔ YAML
  if (asJson(text) !== undefined) out.push({ label: 'JSON to YAML', apply: jsonToYaml, group: 'data' })
  else if (asYaml(text) !== undefined) out.push({ label: 'YAML to JSON', apply: yamlToJson, group: 'data' })

  // Escape
  if (/\\[nrt"\\u]/.test(text)) out.push({ label: 'Unescape JSON String', apply: jsonUnescape, group: 'escape' })
  else if (/["\\\n\t]/.test(text)) out.push({ label: 'Escape as JSON String', apply: jsonEscape, group: 'escape' })
  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(text)) out.push({ label: 'Unescape HTML', apply: htmlUnescape, group: 'escape' })
  else if (/[<>&"]/.test(text)) out.push({ label: 'Escape HTML', apply: htmlEscape, group: 'escape' })

  // Dòng
  if (multiline) {
    out.push({ label: 'Sort Lines A → Z', apply: (s) => sortLines(s, 1), group: 'lines' })
    out.push({ label: 'Sort Lines Z → A', apply: (s) => sortLines(s, -1), group: 'lines' })
    out.push({ label: 'Reverse Lines', apply: (s) => s.replace(/\n$/, '').split('\n').reverse().join('\n') + (s.endsWith('\n') ? '\n' : ''), group: 'lines' })
    const lines = text.split('\n')
    if (new Set(lines).size < lines.length) out.push({ label: 'Remove Duplicate Lines', apply: (s) => [...new Set(s.split('\n'))].join('\n'), group: 'lines' })
    if (/[ \t]+$/m.test(text)) out.push({ label: 'Trim Trailing Spaces', apply: (s) => s.replace(/[ \t]+$/gm, ''), group: 'lines' })
  }

  // Hash: copy, không đổi chữ
  for (const algo of ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const) out.push({ label: `Copy ${algo} Hash`, run: (s) => copyHash(algo, s), group: 'hash' })
  return out
}

/** Áp một phép đổi vào đoạn đang chọn của editor đang mở */
export async function applyConversion(c: Conversion): Promise<void> {
  const view = getActiveEditor()
  const sel = view?.state.selection.main
  const notice = useStore.getState().showNotice
  if (!view || !sel || sel.empty) return notice('Select some text in the editor first.')
  const text = view.state.sliceDoc(sel.from, sel.to)
  try {
    if (c.run) return await c.run(text)
    if (!c.apply || view.state.readOnly) return
    const out = c.apply(text)
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: out }, selection: { anchor: sel.from, head: sel.from + out.length }, userEvent: 'input' })
    view.focus()
  } catch (err) {
    notice(err instanceof Error ? err.message : String(err), 'error')
  }
}
