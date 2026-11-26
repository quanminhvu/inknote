import { useEffect, useMemo, useRef, useState } from 'react'
import { FlipHorizontal2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import { create } from 'zustand'
import { resolveFileUrls, useFileTick } from '@/lib/attachments'
import { renderMarkdown } from '@/lib/markdown'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

// Máy nhắc chữ (giống plugin teleprompter): ghi chú hiện chữ lớn trên nền tối và tự cuộn để đọc khi quay video
// hay thuyết trình. Space: chạy/dừng · ↑/↓: nhanh/chậm · +/−: cỡ chữ · M: lật gương · Home: về đầu · Esc: thoát.

const usePrompter = create<{ noteId: string | null }>(() => ({ noteId: null }))
export const openTeleprompter = (noteId: string | null = useStore.getState().selectedNoteId): void => {
  const note = noteId ? useStore.getState().notes[noteId] : undefined
  if (!note) return
  if (note.locked && !note.body) {
    useStore.getState().showNotice('Unlock this note first.')
    return
  }
  usePrompter.setState({ noteId })
}
const close = (): void => usePrompter.setState({ noteId: null })
export const isTeleprompterOpen = (): boolean => usePrompter.getState().noteId !== null

const PREF = 'inknote:teleprompter'
function readPref(): { speed: number; size: number; mirror: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) ?? '{}') as Partial<{ speed: number; size: number; mirror: boolean }>
    return { speed: p.speed ?? 40, size: p.size ?? 44, mirror: p.mirror ?? false }
  } catch {
    return { speed: 40, size: 44, mirror: false }
  }
}

export function Teleprompter(): React.JSX.Element | null {
  const noteId = usePrompter((s) => s.noteId)
  const note = useStore((s) => (noteId ? s.notes[noteId] : undefined))
  const tick = useFileTick((s) => s.tick)
  const [pref, setPref] = useState(readPref)
  const [playing, setPlaying] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const html = useMemo(() => (note ? resolveFileUrls(renderMarkdown(note.body)) : ''), [note, tick])

  useEffect(() => {
    try {
      localStorage.setItem(PREF, JSON.stringify(pref))
    } catch {
      // chỉ là tiện ích
    }
  }, [pref])

  useEffect(() => {
    setPlaying(false)
    scroller.current?.scrollTo({ top: 0 })
  }, [noteId])

  // Cuộn đều theo tốc độ (px/giây), tính theo thời gian thật nên không phụ thuộc tốc độ khung hình
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let carry = 0
    const step = (t: number): void => {
      const el = scroller.current
      if (!el) return
      carry += ((t - last) / 1000) * pref.speed
      last = t
      const whole = Math.floor(carry)
      if (whole) {
        el.scrollTop += whole
        carry -= whole
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false)
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, pref.speed])

  useEffect(() => {
    if (!noteId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === 'Escape') close()
      else if (k === ' ') setPlaying((p) => !p)
      else if (k === 'ArrowUp') setPref((p) => ({ ...p, speed: Math.min(300, p.speed + 10) }))
      else if (k === 'ArrowDown') setPref((p) => ({ ...p, speed: Math.max(10, p.speed - 10) }))
      else if (k === '+' || k === '=') setPref((p) => ({ ...p, size: Math.min(96, p.size + 4) }))
      else if (k === '-') setPref((p) => ({ ...p, size: Math.max(20, p.size - 4) }))
      else if (k.toLowerCase() === 'm') setPref((p) => ({ ...p, mirror: !p.mirror }))
      else if (k === 'Home') scroller.current?.scrollTo({ top: 0 })
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [noteId])

  if (!noteId || !note) return null
  return (
    <div className="prompter" role="dialog" aria-label="Teleprompter">
      <div className="prompter-scroll" ref={scroller} onClick={() => setPlaying((p) => !p)}>
        <div className={cx('prompter-text markdown-body', pref.mirror && 'mirror')} style={{ fontSize: pref.size }}>
          <h1>{note.title || 'Untitled'}</h1>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <div className="prompter-guide" aria-hidden="true" />
      <footer className="prompter-bar">
        <button className="icon-btn" title="Back to the top (Home)" onClick={() => scroller.current?.scrollTo({ top: 0 })}>
          <RotateCcw size={15} />
        </button>
        <button className="icon-btn" title={playing ? 'Pause (Space)' : 'Start (Space)'} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="prompter-label">Speed</span>
        <button className="icon-btn" title="Slower (↓)" onClick={() => setPref((p) => ({ ...p, speed: Math.max(10, p.speed - 10) }))}>
          <Minus size={14} />
        </button>
        <span className="prompter-value">{pref.speed}</span>
        <button className="icon-btn" title="Faster (↑)" onClick={() => setPref((p) => ({ ...p, speed: Math.min(300, p.speed + 10) }))}>
          <Plus size={14} />
        </button>
        <span className="prompter-label">Size</span>
        <button className="icon-btn" title="Smaller (−)" onClick={() => setPref((p) => ({ ...p, size: Math.max(20, p.size - 4) }))}>
          <Minus size={14} />
        </button>
        <span className="prompter-value">{pref.size}</span>
        <button className="icon-btn" title="Larger (+)" onClick={() => setPref((p) => ({ ...p, size: Math.min(96, p.size + 4) }))}>
          <Plus size={14} />
        </button>
        <button className={cx('icon-btn', pref.mirror && 'on')} title="Mirror for a teleprompter glass (M)" onClick={() => setPref((p) => ({ ...p, mirror: !p.mirror }))}>
          <FlipHorizontal2 size={15} />
        </button>
        <span className="flex-1" />
        <button className="icon-btn" title="Close (Esc)" onClick={close}>
          <X size={16} />
        </button>
      </footer>
    </div>
  )
}
