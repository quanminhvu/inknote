// Gập mục ở bản xem (giống plugin toggle-section): rê chuột vào tiêu đề thấy mũi tên, bấm để gập/mở
// mọi thứ bên dưới cho tới tiêu đề cùng cấp hoặc cấp cao hơn. Mục con đã gập vẫn gập khi mở mục cha.
// Trạng thái gập giữ trong lúc sửa ghi chú (theo cấp + chữ của tiêu đề).

const HEADING = /^H([1-6])$/

function keyOf(h: HTMLElement, seen: Map<string, number>): string {
  const base = `${h.tagName}:${(h.textContent ?? '').trim()}`
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return `${base}#${n}`
}

function applyFold(root: HTMLElement, collapsed: Set<string>): void {
  const seen = new Map<string, number>()
  const stack: number[] = []
  for (const el of [...root.children] as HTMLElement[]) {
    const m = HEADING.exec(el.tagName)
    if (m) {
      const level = Number(m[1])
      while (stack.length && stack[stack.length - 1] >= level) stack.pop()
      el.classList.toggle('fold-hidden', stack.length > 0)
      const key = keyOf(el, seen)
      el.dataset.foldKey = key
      const closed = collapsed.has(key)
      el.classList.toggle('folded', closed)
      el.querySelector(':scope > .heading-fold')?.setAttribute('aria-expanded', String(!closed))
      if (closed) stack.push(level)
    } else el.classList.toggle('fold-hidden', stack.length > 0)
  }
}

/** Gắn nút gập vào các tiêu đề (gọi sau mỗi lần dựng lại bản xem) */
export function decorateFolding(root: HTMLElement, collapsed: Set<string>): void {
  for (const h of root.querySelectorAll<HTMLElement>(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')) {
    if (h.querySelector(':scope > .heading-fold')) continue
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'heading-fold'
    btn.title = 'Fold or unfold this section'
    btn.setAttribute('aria-expanded', 'true')
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const key = h.dataset.foldKey
      if (!key) return
      if (collapsed.has(key)) collapsed.delete(key)
      else collapsed.add(key)
      applyFold(root, collapsed)
    })
    h.prepend(btn)
  }
  applyFold(root, collapsed)
}
