// Mục lục trong ghi chú (giống plugin "toc" của Inkdrop): một dòng riêng "[[toc]]" (hoặc "[TOC]")
// hiện thành mục lục các tiêu đề ở bản xem, bấm để cuộn tới. Mục lục luôn theo tiêu đề hiện tại,
// không phải chép tay hay cập nhật lại.

const MARKER = /^\s*(?:\[\[toc\]\]|\[toc\])\s*$/i

export const TOC_MARKER = '[[toc]]'

export function decorateToc(root: HTMLElement): void {
  const spots = [...root.querySelectorAll<HTMLParagraphElement>(':scope > p')].filter((p) => MARKER.test(p.textContent ?? ''))
  if (!spots.length) return
  const headings = [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
  for (const spot of spots) {
    const nav = document.createElement('nav')
    nav.className = 'note-toc'
    nav.setAttribute('aria-label', 'Table of contents')
    const title = document.createElement('div')
    title.className = 'note-toc-title'
    title.textContent = 'Contents'
    nav.appendChild(title)
    if (!headings.length) {
      const empty = document.createElement('div')
      empty.className = 'note-toc-empty'
      empty.textContent = 'Add headings (# Title) and they show up here.'
      nav.appendChild(empty)
    }
    const top = Math.min(...headings.map((h) => Number(h.tagName[1])))
    for (const h of headings) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'note-toc-item'
      item.style.paddingLeft = `${(Number(h.tagName[1]) - top) * 14 + 2}px`
      item.textContent = h.textContent ?? ''
      item.addEventListener('click', () => h.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      nav.appendChild(item)
    }
    // Giữ dòng nguồn để đồng bộ cuộn editor ↔ bản xem vẫn đúng
    if (spot.dataset.sourceLine) nav.dataset.sourceLine = spot.dataset.sourceLine
    spot.replaceWith(nav)
  }
}
