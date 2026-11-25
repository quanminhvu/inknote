import { useLayoutEffect, useRef } from 'react'

// Trượt cột khi đóng/mở sidebar hoặc vào/ra chế độ tập trung, theo kiểu FLIP:
// bố cục đổi ngay một lần, rồi các cột chỉ được dịch (transform) từ chỗ cũ về chỗ mới.
// Dịch chuyển do GPU vẽ, không bắt trình duyệt tính lại bố cục mỗi khung hình, nên mượt.
// Cột đang ẩn đi được giữ lại trên màn hình (đặt nổi đúng chỗ cũ) trong lúc trượt ra.

const DURATION = 320
const EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

interface Widths {
  side: number
  list: number
}

function reduceMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function slide(el: Element | null, from: number, to: number): void {
  if (!el || from === to) return
  ;(el as HTMLElement).animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], {
    duration: DURATION,
    easing: EASING
  })
}

/** Giữ một cột đang ẩn lại trên màn hình (nổi, đúng chỗ cũ) và trượt nó ra bên trái */
function slideOut(el: Element | null, left: number, width: number): void {
  if (!el || width <= 0) return
  const pane = el as HTMLElement
  Object.assign(pane.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: `${left}px`,
    width: `${width}px`,
    visibility: 'visible',
    zIndex: '0'
  })
  const anim = pane.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-(left + width)}px)` }], {
    duration: DURATION,
    easing: EASING
  })
  const done = (): void => {
    for (const k of ['position', 'top', 'bottom', 'left', 'width', 'visibility', 'zIndex'] as const) pane.style[k] = ''
  }
  anim.onfinish = done
  anim.oncancel = done
}

/**
 * Gắn vào cửa sổ chính. `root` là phần tử .app; sidebar, danh sách và khung ghi chú
 * được tìm theo class bên trong nó.
 */
export function usePaneSlide(root: React.RefObject<HTMLElement | null>, sidebarHidden: boolean, focus: boolean): void {
  const prev = useRef({ sidebarHidden, focus })
  const widths = useRef<Widths>({ side: 0, list: 0 })

  // Chạy trước khi trình duyệt vẽ bố cục mới: tính chỗ cũ, rồi cho các cột trượt từ đó về
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = { sidebarHidden, focus }
    if (before.sidebarHidden === sidebarHidden && before.focus === focus) return
    const app = root.current
    if (!app || reduceMotion()) return
    const sidebar = app.querySelector('.sidebar')
    const list = app.querySelector('.notelist')
    const pane = app.querySelector('.notepane, .today')
    const { side, list: listW } = widths.current

    const sideShownBefore = !before.sidebarHidden && !before.focus
    const sideShownAfter = !sidebarHidden && !focus
    const listShownBefore = !before.focus
    const listShownAfter = !focus
    const paneLeftBefore = (sideShownBefore ? side : 0) + (listShownBefore ? listW : 0)
    const paneLeftAfter = (sideShownAfter ? side : 0) + (listShownAfter ? listW : 0)
    const listLeftBefore = sideShownBefore ? side : 0
    const listLeftAfter = sideShownAfter ? side : 0

    // Khung ghi chú (hoặc trang Today): trượt từ chỗ cũ
    slide(pane, paneLeftBefore - paneLeftAfter, 0)

    // Danh sách ghi chú
    if (listShownBefore && listShownAfter) slide(list, listLeftBefore - listLeftAfter, 0)
    else if (listShownBefore && !listShownAfter) slideOut(list, listLeftBefore, listW)
    else if (!listShownBefore && listShownAfter) slide(list, -(listLeftAfter + listW), 0)

    // Sidebar
    if (sideShownBefore && !sideShownAfter) slideOut(sidebar, 0, side)
    else if (!sideShownBefore && sideShownAfter) slide(sidebar, -side, 0)
  }, [root, sidebarHidden, focus])

  // Sau mỗi lần vẽ: nhớ độ rộng thật của sidebar và danh sách (khi chúng đang hiện)
  useLayoutEffect(() => {
    const app = root.current
    if (!app) return
    const s = app.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0
    const l = app.querySelector('.notelist')?.getBoundingClientRect().width ?? 0
    if (s > 0) widths.current.side = s
    if (l > 0) widths.current.list = l
  })
}
