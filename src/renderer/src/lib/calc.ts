// Máy tính nhanh trong editor (không dùng eval):
//   1200*3.5 + 15%        → 4,830        (cộng 15% của số bên trái)
//   15% of 200            → 30
//   sqrt(2)^2, round(3.7), 2pi, (1+2)*3
//   5 km to mi, 100 f to c, 2 GB in MB, 90 min to h
//   today + 45 days, 2026-12-01 - 2 weeks → ngày; 2026-12-31 - today → số ngày

const NUM = /^(\d+(?:[.,]\d{3})*(?:\.\d+)?|\.\d+)/

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = NUM.exec(src.slice(i))
    if (num) {
      // "1,200.5" → 1200.5 (dấu phẩy là phân cách hàng nghìn); "1.200.000" → 1200000 (kiểu Việt)
      const raw = num[1]
      const clean = (raw.match(/\./g) ?? []).length > 1 ? raw.replace(/[.,]/g, '') : raw.replace(/,/g, '')
      out.push({ t: 'num', v: Number(clean) })
      i += num[1].length
      continue
    }
    if ('+-*/^%()×÷'.includes(c)) {
      out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
      continue
    }
    const id = /^[a-zA-Z_]+/.exec(src.slice(i))
    if (id) {
      out.push({ t: 'id', v: id[0].toLowerCase() })
      i += id[0].length
      continue
    }
    return null
  }
  return out
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/** Giá trị có thể là phần trăm (để "a + 15%" hiểu là a * 1.15) */
interface Val {
  v: number
  pct?: boolean
}

function parseArithmetic(tokens: Tok[]): number | null {
  let i = 0
  const peek = (): Tok | undefined => tokens[i]
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()!.v === v

  const primary = (): Val | null => {
    const tok = peek()
    if (!tok) return null
    if (tok.t === 'num') {
      i++
      // "2pi", "3(4+1)": nhân ngầm
      const next = peek()
      if (next && ((next.t === 'id' && next.v in CONSTS) || (next.t === 'op' && next.v === '('))) {
        const rhs = postfix()
        return rhs ? { v: tok.v * rhs.v } : null
      }
      return { v: tok.v }
    }
    if (tok.t === 'op' && tok.v === '(') {
      i++
      const inner = additive()
      if (!inner || !isOp(')')) return null
      i++
      return { v: inner.v }
    }
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      i++
      const inner = postfix()
      return inner ? { v: tok.v === '-' ? -inner.v : inner.v, pct: inner.pct } : null
    }
    if (tok.t === 'id') {
      i++
      if (tok.v in CONSTS) return { v: CONSTS[tok.v] }
      const fn = FUNCS[tok.v]
      if (fn && isOp('(')) {
        const arg = primary()
        return arg ? { v: fn(arg.v) } : null
      }
    }
    return null
  }

  const postfix = (): Val | null => {
    let base = primary()
    if (!base) return null
    while (isOp('%')) {
      i++
      base = { v: base.v / 100, pct: true }
    }
    // "15% of 200"
    if (base.pct && peek()?.t === 'id' && peek()!.v === 'of') {
      i++
      const whole = power()
      return whole ? { v: base.v * whole.v } : null
    }
    return base
  }

  const power = (): Val | null => {
    const base = postfix()
    if (!base) return null
    if (isOp('^')) {
      i++
      const exp = power()
      return exp ? { v: Math.pow(base.v, exp.v) } : null
    }
    return base
  }

  const multiplicative = (): Val | null => {
    let left = power()
    while (left && (isOp('*') || isOp('/'))) {
      const op = (tokens[i++] as { v: string }).v
      const right = power()
      if (!right) return null
      left = { v: op === '*' ? left.v * right.v : left.v / right.v }
    }
    return left
  }

  const additive = (): Val | null => {
    let left = multiplicative()
    while (left && (isOp('+') || isOp('-'))) {
      const op = (tokens[i++] as { v: string }).v
      const right = multiplicative()
      if (!right) return null
      // "a + 15%" = a * 1.15, "a - 15%" = a * 0.85
      const delta = right.pct ? left.v * right.v : right.v
      left = { v: op === '+' ? left.v + delta : left.v - delta }
    }
    return left
  }

  const result = additive()
  if (!result || i !== tokens.length || !Number.isFinite(result.v)) return null
  return result.v
}

// ── Đơn vị ──
type Unit = { kind: string; factor: number }
const UNITS: Record<string, Unit> = {}
const add = (kind: string, factor: number, ...names: string[]): void => {
  for (const n of names) UNITS[n] = { kind, factor }
}
add('length', 0.001, 'mm', 'millimeter', 'millimeters')
add('length', 0.01, 'cm', 'centimeter', 'centimeters')
add('length', 1, 'm', 'meter', 'meters', 'metre', 'metres')
add('length', 1000, 'km', 'kilometer', 'kilometers')
add('length', 0.0254, 'in', 'inch', 'inches')
add('length', 0.3048, 'ft', 'foot', 'feet')
add('length', 0.9144, 'yd', 'yard', 'yards')
add('length', 1609.344, 'mi', 'mile', 'miles')
add('mass', 0.001, 'mg')
add('mass', 1, 'g', 'gram', 'grams')
add('mass', 1000, 'kg', 'kilogram', 'kilograms')
add('mass', 1_000_000, 't', 'tonne', 'tonnes', 'ton', 'tons')
add('mass', 453.59237, 'lb', 'lbs', 'pound', 'pounds')
add('mass', 28.349523125, 'oz', 'ounce', 'ounces')
add('time', 0.001, 'ms')
add('time', 1, 's', 'sec', 'second', 'seconds')
add('time', 60, 'min', 'minute', 'minutes')
add('time', 3600, 'h', 'hr', 'hour', 'hours')
add('time', 86400, 'd', 'day', 'days')
add('time', 604800, 'week', 'weeks')
add('data', 1, 'b', 'byte', 'bytes')
add('data', 1024, 'kb')
add('data', 1024 ** 2, 'mb')
add('data', 1024 ** 3, 'gb')
add('data', 1024 ** 4, 'tb')
add('volume', 0.001, 'ml')
add('volume', 1, 'l', 'liter', 'liters', 'litre', 'litres')
add('volume', 3.785411784, 'gal', 'gallon', 'gallons')
add('area', 1, 'm2', 'sqm')
add('area', 1_000_000, 'km2')
add('area', 10_000, 'ha', 'hectare', 'hectares')
add('area', 0.09290304, 'ft2', 'sqft')
add('area', 4046.8564224, 'acre', 'acres')
const TEMPS: Record<string, string> = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' }

function toKelvin(v: number, u: string): number {
  return u === 'c' ? v + 273.15 : u === 'f' ? ((v - 32) * 5) / 9 + 273.15 : v
}
function fromKelvin(k: number, u: string): number {
  return u === 'c' ? k - 273.15 : u === 'f' ? ((k - 273.15) * 9) / 5 + 32 : k
}

function convert(expr: string): string | null {
  const m = /^(.+?)\s*([a-zA-Z][a-zA-Z0-9]*)\s+(?:to|in|->|=>)\s+([a-zA-Z][a-zA-Z0-9]*)$/.exec(expr.trim())
  if (!m) return null
  const tokens = tokenize(m[1])
  const value = tokens ? parseArithmetic(tokens) : null
  if (value === null) return null
  const from = m[2].toLowerCase()
  const to = m[3].toLowerCase()
  if (TEMPS[from] && TEMPS[to]) return `${formatNumber(fromKelvin(toKelvin(value, TEMPS[from]), TEMPS[to]))} °${TEMPS[to].toUpperCase()}`
  const a = UNITS[from]
  const b = UNITS[to]
  if (!a || !b || a.kind !== b.kind) return null
  return `${formatNumber((value * a.factor) / b.factor)} ${m[3]}`
}

// ── Ngày ──
const DAY = 86_400_000
const pad = (n: number): string => String(n).padStart(2, '0')
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function parseDate(word: string, now: Date): Date | null {
  const w = word.trim().toLowerCase()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (w === 'today') return base
  if (w === 'tomorrow') return new Date(base.getTime() + DAY)
  if (w === 'yesterday') return new Date(base.getTime() - DAY)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getMonth() === Number(m[2]) - 1 ? d : null
}

function dateMath(expr: string, now: Date): string | null {
  const shift = /^(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})\s*([+-])\s*(\d+)\s*(days?|d|weeks?|w|months?|years?|y)$/i.exec(expr.trim())
  if (shift) {
    const d = parseDate(shift[1], now)
    if (!d) return null
    const n = Number(shift[3]) * (shift[2] === '-' ? -1 : 1)
    const unit = shift[4].toLowerCase()
    if (unit.startsWith('d')) d.setDate(d.getDate() + n)
    else if (unit.startsWith('w')) d.setDate(d.getDate() + n * 7)
    else if (unit.startsWith('m')) d.setMonth(d.getMonth() + n)
    else d.setFullYear(d.getFullYear() + n)
    return `${dayKey(d)} (${d.toLocaleDateString('en-US', { weekday: 'short' })})`
  }
  const diff = /^(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})\s*-\s*(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})$/i.exec(expr.trim())
  if (diff) {
    const a = parseDate(diff[1], now)
    const b = parseDate(diff[2], now)
    if (!a || !b) return null
    const days = Math.round((a.getTime() - b.getTime()) / DAY)
    return `${days} day${Math.abs(days) === 1 ? '' : 's'}`
  }
  return null
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toLocaleString('en-US')
  const abs = Math.abs(v)
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) return v.toPrecision(8).replace(/\.?0+e/, 'e')
  return v.toLocaleString('en-US', { maximumFractionDigits: 8 })
}

/** Kết quả của một biểu thức, hoặc null nếu không phải phép tính hợp lệ */
export function calculate(expr: string, now = new Date()): string | null {
  const text = expr.trim()
  if (!text || text.length > 300) return null
  const date = dateMath(text, now)
  if (date) return date
  const unit = convert(text)
  if (unit) return unit
  const tokens = tokenize(text)
  if (!tokens || tokens.length === 0) return null
  // Chỉ là một con số trơn thì không coi là phép tính
  if (tokens.length === 1 && tokens[0].t === 'num') return null
  const value = parseArithmetic(tokens)
  return value === null ? null : formatNumber(value)
}
