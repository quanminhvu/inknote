import { useLayoutEffect, useRef } from 'react'

// Trượt cột khi đóng/mở sidebar hoặc vào/ra chế độ tập trung, theo kiểu FLIP.
//
// Ba cột (sidebar | danh sách | khung ghi chú) luôn được coi như một dải liền nhau,
// dải này chỉ trượt ngang: cột nào bị ẩn thì nằm ngoài mép trái màn hình. Mỗi lần đổi,
// bố cục đổi ngay một lần, rồi CẢ dải được dịch (transform) từ chỗ đang thấy về chỗ mới.
// Mọi cột dịch cùng một đoạn, cùng nhịp, nên không bao giờ chồng lên nhau.
//
// Bấm liên tiếp khi hiệu ứng trước chưa xong: lấy vị trí đang thấy trên màn hình
// làm điểm xuất phát, nên dải trượt tiếp từ đó, không nhảy, không nháy.

const DURATION = 320
const EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'
const OVERLAY_KEYS = ['position', 'top', 'bottom', 'left', 'width', 'visibility', 'zIndex'] as const

interface Widths {
  side: number
  list: number
}

const overlays = new WeakMap<HTMLElement, () => void>()

function reduceMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Độ dịch ngang hiện tại của phần tử (do hiệu ứng đang chạy) */
function currentShift(el: HTMLElement | null): number {
  if (!el || el.getAnimations().length === 0) return 0
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  return new DOMMatrixReadOnly(t).m41
}

/** Dừng hiệu ứng cũ và trả phần tử về bố cục bình thường */
function stop(el: HTMLElement | null): void {
  if (!el) return
  for (const a of el.getAnimations()) if (!(a instanceof CSSTransition) && !(a instanceof CSSAnimation)) a.cancel()
  overlays.get(el)?.()
}

/** Bắt đầu tính giờ ngay từ khung hình này (không chờ thêm một nhịp, tránh một khung đứng hình) */
function run(el: HTMLElement, from: number): Animation {
  const anim = el.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], {
    duration: DURATION,
    easing: EASING
  })
  anim.startTime = document.timeline.currentTime
  return anim
}

function slide(el: HTMLElement | null, from: number): void {
  if (!el || Math.abs(from) < 0.5) return
  run(el, from)
}

/** Cột vừa bị ẩn: giữ lại trên màn hình (nổi, đúng chỗ của nó trong dải) trong lúc trượt ra */
function slideOut(el: HTMLElement | null, left: number, width: number, from: number): void {
  if (!el || width <= 0) return
  Object.assign(el.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: `${left}px`,
    width: `${width}px`,
    visibility: 'visible',
    zIndex: '0'
  })
  const clear = (): void => {
    overlays.delete(el)
    for (const k of OVERLAY_KEYS) el.style[k] = ''
  }
  overlays.set(el, clear)
  const anim = run(el, from)
  anim.onfinish = () => overlays.get(el) === clear && clear()
}

/**
 * Gắn vào cửa sổ chính. `root` là phần tử .app; sidebar, danh sách và khung ghi chú
 * được tìm theo class bên trong nó.
 */
export function usePaneSlide(root: React.RefObject<HTMLElement | null>, sidebarHidden: boolean, focus: boolean): void {
  const prev = useRef({ sidebarHidden, focus })
  const widths = useRef<Widths>({ side: 0, list: 0 })

  // Chạy trước khi trình duyệt vẽ bố cục mới: tính chỗ đang thấy, rồi cho cả dải trượt từ đó về
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = { sidebarHidden, focus }
    if (before.sidebarHidden === sidebarHidden && before.focus === focus) return
    const app = root.current
    if (!app || reduceMotion()) return
    const sidebar = app.querySelector<HTMLElement>('.sidebar')
    const list = app.querySelector<HTMLElement>('.notelist')
    const pane = app.querySelector<HTMLElement>('.notepane, .today')
    // Chỗ khung ghi chú đang hiện trên màn hình (kể cả khi đang trượt dở): đọc trước khi dừng hiệu ứng cũ
    const shift = currentShift(pane)
    for (const el of [sidebar, list, pane]) stop(el)

    // Độ rộng cột: đo lại cột nào đang nằm trong bố cục, nếu chưa từng đo thì không đoán
    const measure = (el: HTMLElement | null, key: keyof Widths): void => {
      const w = el?.getBoundingClientRect().width ?? 0
      if (w > 0) widths.current[key] = w
    }
    if (!focus && !sidebarHidden) measure(sidebar, 'side')
    if (!focus) measure(list, 'list')
    const side = widths.current.side
    // Trang Today chiếm cả chỗ của danh sách
    const listW = list ? widths.current.list : 0

    // Vị trí mép trái khung ghi chú (cũng là vị trí của cả dải)
    const leftOf = (hidden: boolean, f: boolean): number => (f ? 0 : (hidden ? 0 : side) + listW)
    const paneLeftBefore = leftOf(before.sidebarHidden, before.focus)
    const paneLeftAfter = leftOf(sidebarHidden, focus)

    const seen = paneLeftBefore + shift
    const from = seen - paneLeftAfter

    slide(pane, from)

    // Danh sách nằm ngay trước khung ghi chú, sidebar ngay trước danh sách
    const listLeft = paneLeftAfter - listW
    const sideLeft = listLeft - side
    if (focus) slideOut(list, listLeft, listW, from)
    else slide(list, from)
    if (focus || sidebarHidden) slideOut(sidebar, sideLeft, side, from)
    else slide(sidebar, from)
  }, [root, sidebarHidden, focus])

  // Sau mỗi lần vẽ: nhớ độ rộng thật của sidebar và danh sách (khi chúng đang hiện bình thường)
  useLayoutEffect(() => {
    const app = root.current
    if (!app) return
    const s = app.querySelector<HTMLElement>('.sidebar')
    const l = app.querySelector<HTMLElement>('.notelist')
    if (s && !overlays.has(s)) {
      const w = s.getBoundingClientRect().width
      if (w > 0) widths.current.side = w
    }
    if (l && !overlays.has(l)) {
      const w = l.getBoundingClientRect().width
      if (w > 0) widths.current.list = w
    }
  })
}
