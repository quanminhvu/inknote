import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// Dán văn bản có định dạng (từ trình duyệt, Google Docs, Notion, Word…) thành Markdown.
// Chỉ chuyển khi HTML thật sự có cấu trúc; HTML chỉ để tô màu (vd copy code từ VS Code)
// thì trả về null để dán chữ thuần như cũ.

/** Thẻ cho thấy HTML có định dạng đáng giữ */
const STRUCTURE = 'h1,h2,h3,h4,h5,h6,ul,ol,a[href],strong,b,em,i,table,img,blockquote,pre,hr,del,s'

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes))
}

function wrap(el: Element, tag: string): void {
  const outer = el.ownerDocument.createElement(tag)
  el.replaceWith(outer)
  outer.appendChild(el)
}

/** Dọn HTML trước khi chuyển: bỏ phần thừa và đổi kiểu đậm/nghiêng bằng style (Google Docs) thành thẻ */
function tidy(doc: Document): void {
  doc.querySelectorAll('script, style, meta, link, title, noscript, iframe, object, embed, template').forEach((el) => el.remove())
  // Google Docs bọc cả đoạn trong <b style="font-weight:normal" id="docs-internal-guid-…">
  doc.querySelectorAll('b[id^="docs-internal-guid"], b[style*="font-weight:normal"], b[style*="font-weight: normal"]').forEach(unwrap)
  doc.querySelectorAll<HTMLElement>('span[style]').forEach((span) => {
    const style = span.style
    const weight = style.fontWeight
    if (weight === 'bold' || Number(weight) >= 600) wrap(span, 'strong')
    if (style.fontStyle === 'italic') wrap(span, 'em')
    if (style.textDecoration.includes('line-through') || style.textDecorationLine.includes('line-through')) wrap(span, 'del')
  })
  // Ảnh dán vào chỉ giữ được khi có địa chỉ web; ảnh nhúng data: hay đường dẫn tương đối thì bỏ
  doc.querySelectorAll('img').forEach((img) => {
    if (!/^https?:\/\//i.test(img.getAttribute('src') ?? '')) img.remove()
  })
}

function service(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' })
  td.use(gfm)
  // Mục danh sách: một dấu cách sau "-" / "1." (turndown mặc định để 3 dấu cách)
  td.addRule('tightListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as Element | null
      let prefix = `${options.bulletListMarker} `
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1) || 1
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    }
  })
  // Link tương đối (vd "/docs/x" từ trang web) không mở được trong ghi chú: chỉ giữ chữ
  td.addRule('relativeLink', {
    filter: (node) => node.nodeName === 'A' && !/^(https?:|mailto:|nibmark:)/i.test(node.getAttribute('href') ?? ''),
    replacement: (content) => content
  })
  // Khối code của GitHub: <div class="highlight highlight-source-ts"><pre>…</pre></div>
  td.addRule('githubCode', {
    filter: (node) => node.nodeName === 'PRE' && /highlight-source-([\w+-]+)/.test((node.parentNode as Element | null)?.className ?? ''),
    replacement: (_content, node) => {
      const lang = /highlight-source-([\w+-]+)/.exec(((node as Element).parentNode as Element).className)?.[1] ?? ''
      const code = (node.textContent ?? '').replace(/\n$/, '')
      const fence = code.includes('```') ? '~~~' : '```'
      return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`
    }
  })
  return td
}

/** Markdown từ HTML trong clipboard, hoặc null nếu nên dán chữ thuần */
export function htmlToMarkdown(html: string): string | null {
  if (!html.trim()) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tidy(doc)
  const body = doc.body
  if (!body) return null
  const paragraphs = body.querySelectorAll('p, li, tr').length
  if (!body.querySelector(STRUCTURE) && paragraphs < 2) return null
  let markdown: string
  try {
    markdown = service().turndown(body)
  } catch {
    return null
  }
  markdown = markdown.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim()
  return markdown || null
}
