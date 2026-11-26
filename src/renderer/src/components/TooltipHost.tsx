import { useEffect } from 'react'
import { isMac } from '@/lib/util'

// Chú thích khi rê chuột, thay cho tooltip mặc định của hệ thống (hiện chậm, chữ nhỏ, không có phím tắt).
// Dùng luôn thuộc tính `title` sẵn có: khi rê vào, `title` được cất sang `data-tip` để hệ thống
// không hiện thêm tooltip của nó, rời chuột thì trả lại.
// Phím tắt ở cuối câu, trong ngoặc, ví dụ "Show outline (Cmd/Ctrl+Shift+O)", được tách ra
// và viết theo kiểu của hệ điều hành: ⌘⇧O trên macOS, Ctrl+Shift+O trên Windows/Linux.
// Hiện ngay, không mờ dần. Vừa xem một chú thích xong thì chú thích kế tiếp hiện liền, không phải chờ.

const DELAY = 450
const WARM = 600

const SHORTCUT = /\s*\(([^()]*(?:Cmd|Ctrl|Alt|Shift|⌘|⌥|⇧|⌃)[^()]*)\)\s*$/

export function formatShortcut(raw: string): string {
  const mac = isMac()
  const parts = raw.replace(/Cmd\/Ctrl/g, 'Mod').split('+')
  if (!mac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  const glyph: Record<string, string> = { Mod: '⌘', Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' }
  return parts.map((p) => glyph[p] ?? p.toUpperCase()).join('')
}

function split(text: string): { label: string; keys: string } {
  const m = SHORTCUT.exec(text)
  if (!m) return { label: text, keys: '' }
  return { label: text.slice(0, m.index), keys: formatShortcut(m[1].trim()) }
}

export function TooltipHost(): null {
  useEffect(() => {
    const tip = document.createElement('div')
    tip.className = 'tip'
    tip.setAttribute('role', 'tooltip')
    tip.hidden = true
    document.body.appendChild(tip)

    let owner: HTMLElement | null = null
    let timer = 0
    let lastHidden = 0

    const restore = (el: HTMLElement): void => {
      const text = el.dataset.tip
      if (text !== undefined) {
        if (!el.hasAttribute('title')) el.setAttribute('title', text)
        delete el.dataset.tip
      }
    }
    const hide = (): void => {
      window.clearTimeout(timer)
      if (!tip.hidden) lastHidden = performance.now()
      tip.hidden = true
      if (owner) restore(owner)
      owner = null
    }
    const show = (): void => {
      if (!owner?.isConnected) return hide()
      const text = owner.dataset.tip
      if (!text) return
      const { label, keys } = split(text)
      tip.textContent = label
      if (keys) {
        const k = document.createElement('kbd')
        k.textContent = keys
        tip.appendChild(k)
      }
      tip.hidden = false
      const r = owner.getBoundingClientRect()
      const w = tip.offsetWidth
      const h = tip.offsetHeight
      const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2))
      const below = r.bottom + 6 + h <= window.innerHeight - 6
      tip.style.left = `${Math.round(left)}px`
      tip.style.top = `${Math.round(below ? r.bottom + 6 : r.top - 6 - h)}px`
    }

    const onOver = (e: PointerEvent): void => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null
      if (el === owner) return
      const warm = !tip.hidden || performance.now() - lastHidden < WARM
      hide()
      if (!el || e.pointerType === 'touch') return
      const text = el.getAttribute('title') ?? el.dataset.tip ?? ''
      if (!text.trim()) return
      owner = el
      el.dataset.tip = text
      el.removeAttribute('title')
      if (warm) show()
      else timer = window.setTimeout(show, DELAY)
    }
    const onLeaveWindow = (e: PointerEvent): void => {
      if (!e.relatedTarget) hide()
    }

    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onLeaveWindow, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onLeaveWindow, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('wheel', hide, { capture: true })
      window.removeEventListener('blur', hide)
      tip.remove()
    }
  }, [])
  return null
}
