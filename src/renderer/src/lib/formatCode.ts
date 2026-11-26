import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// Định dạng (căn chỉnh cho dễ đọc) hoặc thu gọn nội dung một khối code theo ngôn ngữ của khối:
//   JSON, JS/TS, CSS, HTML, YAML, GraphQL: Prettier (nạp khi dùng lần đầu)
//   SQL, XML: bộ định dạng viết riêng ở đây (không cần thư viện)

type Kind = 'json' | 'babel' | 'typescript' | 'css' | 'html' | 'yaml' | 'graphql' | 'sql' | 'xml'

const LANGS: Record<string, Kind> = {
  json: 'json', jsonc: 'json', json5: 'json', geojson: 'json',
  js: 'babel', javascript: 'babel', jsx: 'babel', mjs: 'babel', cjs: 'babel',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', vue: 'html',
  yaml: 'yaml', yml: 'yaml',
  graphql: 'graphql', gql: 'graphql',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql', psql: 'sql', sqlite: 'sql', plsql: 'sql', tsql: 'sql', mssql: 'sql',
  xml: 'xml', svg: 'xml', plist: 'xml', xsd: 'xml', xsl: 'xml', rss: 'xml'
}

export const kindOf = (lang: string): Kind | null => LANGS[lang.trim().toLowerCase().split(/\s/)[0]] ?? null
export const canMinify = (kind: Kind): boolean => kind === 'json' || kind === 'sql' || kind === 'xml' || kind === 'css' || kind === 'html'

// ── Prettier ──
type Prettier = typeof import('prettier/standalone')
let prettierP: Promise<Prettier> | null = null
const loaders: Record<string, () => Promise<unknown>> = {
  json: () => Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]),
  babel: () => Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]),
  typescript: () => Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')]),
  css: () => import('prettier/plugins/postcss').then((p) => [p]),
  html: () => Promise.all([import('prettier/plugins/html'), import('prettier/plugins/postcss'), import('prettier/plugins/babel'), import('prettier/plugins/estree')]),
  yaml: () => import('prettier/plugins/yaml').then((p) => [p]),
  graphql: () => import('prettier/plugins/graphql').then((p) => [p])
}
const PARSER: Record<string, string> = { json: 'json', babel: 'babel', typescript: 'typescript', css: 'css', html: 'html', yaml: 'yaml', graphql: 'graphql' }

async function withPrettier(kind: Kind, code: string): Promise<string> {
  prettierP ??= import('prettier/standalone')
  const [prettier, plugins] = await Promise.all([prettierP, loaders[kind]()])
  const out = await prettier.format(code, { parser: PARSER[kind], plugins: plugins as never[], printWidth: 100, tabWidth: 2 })
  return out.replace(/\n+$/, '')
}

// ── SQL ──
const CLAUSES = [
  'SELECT DISTINCT', 'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION ALL', 'UNION', 'INTERSECT', 'EXCEPT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'RETURNING', 'WITH', 'ON CONFLICT', 'WINDOW',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN'
]
const KEYWORDS = new Set(
  ('select distinct from where group by order having limit offset union all intersect except insert into values update set delete returning with on conflict ' +
    'left right inner outer full cross join as and or not in is null like ilike between exists case when then else end asc desc count sum avg min max ' +
    'create table alter drop index primary key foreign references default unique constraint if view begin commit rollback over partition distinct coalesce cast true false')
    .split(' ')
)

const FUNCS = new Set('count sum avg min max coalesce cast over'.split(' '))

type SqlTok = { t: 'str' | 'comment' | 'word' | 'num' | 'punct' | 'ws'; v: string }

function sqlTokens(sql: string): SqlTok[] {
  const out: SqlTok[] = []
  const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\])|(\s+)|(\d+(?:\.\d+)?)|([A-Za-z_][\w$]*|[@:$]\w+)|(<>|<=|>=|!=|\|\||::|[(),;.*=<>+\-/%])|(.)/g
  for (const m of sql.matchAll(re)) {
    if (m[1]) out.push({ t: 'comment', v: m[1] })
    else if (m[2]) out.push({ t: 'str', v: m[2] })
    else if (m[3]) out.push({ t: 'ws', v: m[3] })
    else if (m[4]) out.push({ t: 'num', v: m[4] })
    else if (m[5]) out.push({ t: 'word', v: m[5] })
    else out.push({ t: 'punct', v: m[6] ?? m[7] })
  }
  return out
}

export function formatSql(sql: string): string {
  const toks = sqlTokens(sql).filter((t) => t.t !== 'ws')
  const lines: string[] = []
  let line = ''
  let depth = 0
  const stack: boolean[] = [] // true = ngoặc mở một câu truy vấn con
  let clause = ''
  const indent = (): string => '  '.repeat(depth)
  const newline = (extra = 0): void => {
    if (line.trim()) lines.push(line.replace(/\s+$/, ''))
    line = indent() + '  '.repeat(extra)
  }
  const push = (s: string, space = true): void => {
    if (space && line.trim() && !/[(.]$/.test(line)) line += ' '
    else if (!line.trim()) line = line || indent()
    line += s
  }
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]
    if (tok.t === 'word') {
      // Ghép từ khoá nhiều chữ ("GROUP BY", "LEFT OUTER JOIN")
      const hit = CLAUSES.find((c) => {
        const words = c.split(' ')
        return words.every((w, k) => toks[i + k]?.t === 'word' && toks[i + k].v.toUpperCase() === w)
      })
      if (hit) {
        newline()
        push(hit)
        clause = hit
        i += hit.split(' ').length - 1
        if (/^(SELECT|SELECT DISTINCT|SET|VALUES)$/.test(hit)) newline(1)
        continue
      }
      const upper = tok.v.toUpperCase()
      const inParens = stack.length > 0 && !stack[stack.length - 1]
      if ((upper === 'AND' || upper === 'OR') && !inParens && /WHERE|HAVING|JOIN|ON/.test(clause)) {
        // AND trong BETWEEN … AND … giữ trên cùng dòng
        const prev = lines.length ? line : line
        if (!/\bBETWEEN\s+\S+\s*$/i.test(prev)) {
          newline(1)
          push(upper)
          continue
        }
      }
      push(KEYWORDS.has(tok.v.toLowerCase()) ? upper : tok.v)
      continue
    }
    if (tok.t === 'punct') {
      if (tok.v === ',') {
        line += ','
        if (stack.length === 0 || stack[stack.length - 1]) {
          if (/^(SELECT|SELECT DISTINCT|SET|VALUES)$/.test(clause)) newline(1)
        }
        continue
      }
      if (tok.v === '(') {
        const sub = toks[i + 1]?.t === 'word' && /^(select|with)$/i.test(toks[i + 1].v)
        // Gọi hàm ("COUNT(", "my_fn(") thì dính liền; sau từ khoá ("IN (", "AND (") hay tên bảng của INSERT INTO thì cách
        const prev = toks[i - 1]
        const call = prev?.t === 'word' && (!KEYWORDS.has(prev.v.toLowerCase()) || FUNCS.has(prev.v.toLowerCase())) && clause !== 'INSERT INTO'
        push('(', !call)
        stack.push(sub)
        if (sub) depth++
        continue
      }
      if (tok.v === ')') {
        const sub = stack.pop()
        if (sub) {
          depth = Math.max(0, depth - 1)
          newline()
          line += ')'
        } else line += ')'
        continue
      }
      if (tok.v === ';') {
        line += ';'
        newline()
        lines.push('')
        clause = ''
        continue
      }
      if (tok.v === '.') {
        line += '.'
        continue
      }
      push(tok.v)
      continue
    }
    if (tok.t === 'comment' && tok.v.startsWith('--')) {
      push(tok.v)
      newline()
      continue
    }
    // Chữ ngay sau dấu chấm (bảng.cột) không cách
    push(tok.v, !/\.$/.test(line))
  }
  newline()
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function minifySql(sql: string): string {
  return sqlTokens(sql)
    .filter((t) => t.t !== 'comment' || t.v.startsWith('/*!'))
    .map((t) => (t.t === 'ws' ? ' ' : t.v))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;=<>])\s*/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,/g, ', ')
    .trim()
}

// ── XML ──
function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error((err.textContent ?? 'Invalid XML').split('\n')[0])
  return doc
}

const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string): string => escText(s).replace(/"/g, '&quot;')

function serialize(node: Node, depth: number, pretty: boolean): string {
  const pad = pretty ? '  '.repeat(depth) : ''
  const nl = pretty ? '\n' : ''
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent ?? ''
    return t.trim() ? pad + escText(pretty ? t.trim() : t.trim()) + nl : ''
  }
  if (node.nodeType === Node.CDATA_SECTION_NODE) return `${pad}<![CDATA[${node.textContent}]]>${nl}`
  if (node.nodeType === Node.COMMENT_NODE) return pretty ? `${pad}<!--${node.textContent}-->${nl}` : ''
  if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    const pi = node as ProcessingInstruction
    return `${pad}<?${pi.target} ${pi.data}?>${nl}`
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const attrs = [...el.attributes].map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('')
  const kids = [...el.childNodes].filter((c) => c.nodeType !== Node.TEXT_NODE || (c.textContent ?? '').trim())
  if (!kids.length) return `${pad}<${el.tagName}${attrs}/>${nl}`
  // Chỉ có một đoạn chữ ngắn: giữ trên một dòng
  if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) {
    return `${pad}<${el.tagName}${attrs}>${escText((kids[0].textContent ?? '').trim())}</${el.tagName}>${nl}`
  }
  return `${pad}<${el.tagName}${attrs}>${nl}${kids.map((k) => serialize(k, depth + 1, pretty)).join('')}${pad}</${el.tagName}>${nl}`
}

export function formatXml(xml: string, pretty = true): string {
  const decl = /^\s*(<\?xml[^?]*\?>)/.exec(xml)?.[1] ?? ''
  const doc = parseXml(xml)
  const body = [...doc.childNodes].map((n) => serialize(n, 0, pretty)).join('')
  return ((decl ? decl + (pretty ? '\n' : '') : '') + body).trim()
}

/** Định dạng hoặc thu gọn một đoạn code. Ném lỗi (có thông báo dễ hiểu) nếu code không hợp lệ. */
export async function formatCode(kind: Kind, code: string, mode: 'pretty' | 'minify'): Promise<string> {
  if (kind === 'sql') return mode === 'pretty' ? formatSql(code) : minifySql(code)
  if (kind === 'xml') return formatXml(code, mode === 'pretty')
  if (mode === 'minify') {
    if (kind === 'json') return JSON.stringify(JSON.parse(code))
    if (kind === 'css') return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim()
    if (kind === 'html') return code.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim()
    throw new Error('This language can only be formatted, not minified.')
  }
  if (kind === 'json') {
    // JSON chuẩn: luôn mỗi khoá một dòng. Có chú thích (JSONC) thì để Prettier giữ chú thích
    try {
      return JSON.stringify(JSON.parse(code), null, 2)
    } catch {
      // không phải JSON thuần: thử Prettier bên dưới (nó báo lỗi rõ ràng nếu code sai)
    }
  }
  return withPrettier(kind, code)
}

// ── Editor: khối code đang chứa con trỏ ──
export interface CodeBlockAt {
  lang: string
  kind: Kind | null
  from: number
  to: number
  code: string
}

export function codeBlockAt(state: EditorState, pos: number): CodeBlockAt | null {
  for (let node: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name !== 'FencedCode') continue
    const info = node.getChild('CodeInfo')
    const text = node.getChild('CodeText')
    const lang = info ? state.sliceDoc(info.from, info.to) : ''
    if (!text) return { lang, kind: kindOf(lang), from: state.doc.lineAt(node.from).to + 1, to: state.doc.lineAt(node.from).to + 1, code: '' }
    return { lang, kind: kindOf(lang), from: text.from, to: text.to, code: state.sliceDoc(text.from, text.to) }
  }
  return null
}

/** Định dạng khối code ở con trỏ. Trả về thông báo cho người dùng (lỗi hay đã xong), hoặc null nếu không có khối code. */
export async function formatCodeBlockAt(view: EditorView, mode: 'pretty' | 'minify'): Promise<string | null> {
  const block = codeBlockAt(view.state, view.state.selection.main.head)
  if (!block) return null
  if (!block.kind) {
    // Định dạng thường (⌥⇧F) trong khối không rõ ngôn ngữ: để format cả ghi chú như cũ
    if (mode === 'pretty') return null
    return block.lang ? `Minifying ${block.lang} isn't supported.` : 'Add a language after ``` (json, sql, xml…) first.'
  }
  if (mode === 'minify' && !canMinify(block.kind)) return `Minifying ${block.lang} isn't supported.`
  let out: string
  try {
    out = await formatCode(block.kind, block.code, mode)
  } catch (err) {
    return `Could not format: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`
  }
  // Người dùng sửa khối trong lúc đang định dạng: bỏ qua
  if (view.state.sliceDoc(block.from, block.to) !== block.code) return null
  if (out === block.code) return mode === 'pretty' ? 'This block is already formatted.' : 'This block is already minified.'
  view.dispatch({ changes: { from: block.from, to: block.to, insert: out }, userEvent: 'input' })
  return mode === 'pretty' ? `Formatted ${block.lang}.` : `Minified ${block.lang}.`
}
