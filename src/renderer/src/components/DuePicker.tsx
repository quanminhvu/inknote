import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { getActiveEditor } from '@/lib/editorCommands'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

// Hộp chọn ngày giờ cho task (giống plugin reminder, kiểu TickTick): lịch tháng, nút nhanh
// (Hôm nay, Ngày mai, Thứ Hai tới, Tuần sau), ô giờ (để trống = không giờ). Ghi "@2026-12-01 09:00" vào dòng task;
// có giờ thì Inknote nhắc đúng giờ. Mở bằng: bấm vào ngày hạn trong editor, "Set Due Date…" trong bảng lệnh,
// hoặc mục "pick a date…" khi gõ "@" trong task.

const DUE = /(^|[\s(])@(\d{4}-\d{2}-\d{2})(?: ([01]?\d|2[0-3]):([0-5]\d))?(?=$|[\s.,;:!?)])/

interface PickerState {
  view: EditorView | null
  line: number
  x: number
  y: number
}
const usePicker = create<PickerState>(() => ({ view: null, line: 0, x: 0, y: 0 }))
export const isDuePickerOpen = (): boolean => usePicker.getState().view !== null
const close = (): void => usePicker.setState({ view: null })

/** Mở hộp chọn cho dòng chứa vị trí `pos` (mặc định: dòng có con trỏ của editor đang mở) */
export function openDuePicker(view: EditorView | null = getActiveEditor(), pos?: number): void {
  if (!view || view.state.readOnly) {
    useStore.getState().showNotice('Put the cursor on a task in Write or Live view first.')
    return
  }
  const at = pos ?? view.state.selection.main.head
  const line = view.state.doc.lineAt(at)
  const c = view.coordsAtPos(at) ?? view.coordsAtPos(line.from)
  usePicker.setState({ view, line: line.number, x: c?.left ?? 200, y: c?.bottom ?? 200 })
}

window.addEventListener('inknote-due-picker', () => openDuePicker())

const pad = (n: number): string => String(n).padStart(2, '0')
const key = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function DuePicker(): React.JSX.Element | null {
  const { view, line, x, y } = usePicker()
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const today = useMemo(() => new Date(), [view])
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState('')
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  // Mở: đọc ngày giờ đang có trong dòng
  useEffect(() => {
    if (!view) return
    const text = view.state.doc.line(Math.min(line, view.state.doc.lines)).text
    const m = DUE.exec(text)
    const d = m ? m[2] : null
    setDay(d)
    setTime(m && m[3] !== undefined ? `${pad(Number(m[3]))}:${m[4]}` : '')
    const base = d ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1)
    setMonth(base)
  }, [view, line, today])

  useLayoutEffect(() => {
    if (!view || !box.current) return setPos(null)
    const w = box.current.offsetWidth
    const h = box.current.offsetHeight
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, x))
    const top = y + 6 + h <= window.innerHeight - 8 ? y + 6 : Math.max(8, y - h - 24)
    setPos({ left, top })
  }, [view, x, y])

  useEffect(() => {
    if (!view) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
        view.focus()
      }
    }
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [view])

  if (!view) return null

  /** Ghi (hoặc xoá, khi d = null) ngày hạn vào dòng */
  const apply = (d: string | null, t: string): void => {
    if (!view.dom.isConnected) return close()
    const ln = view.state.doc.line(Math.min(line, view.state.doc.lines))
    const m = DUE.exec(ln.text)
    const stamp = d ? `@${d}${t ? ` ${t}` : ''}` : ''
    let from: number
    let to: number
    let insert: string
    if (m) {
      from = ln.from + m.index + m[1].length
      to = ln.from + m.index + m[0].length
      insert = stamp
      // Xoá hạn: bỏ luôn khoảng trắng phía trước
      if (!stamp && from > ln.from && ln.text[from - ln.from - 1] === ' ') from--
    } else {
      if (!stamp) return close()
      from = to = ln.to
      insert = `${ln.text.endsWith(' ') || !ln.text ? '' : ' '}${stamp}`
    }
    view.dispatch({ changes: { from, to, insert }, userEvent: 'input' })
    close()
    view.focus()
  }

  const first = month
  const offset = (first.getDay() + 6) % 7
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: offset + days }, (_, i) => (i < offset ? null : new Date(first.getFullYear(), first.getMonth(), i - offset + 1)))
  const at = (n: number): string => key(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n))
  const nextMonday = ((8 - today.getDay()) % 7) || 7

  return (
    <div ref={box} className="due-picker" role="dialog" aria-label="Due date" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}>
      <div className="due-quick">
        <button className={cx(day === at(0) && 'on')} onClick={() => apply(at(0), time)}>
          Today
        </button>
        <button className={cx(day === at(1) && 'on')} onClick={() => apply(at(1), time)}>
          Tomorrow
        </button>
        <button onClick={() => apply(at(nextMonday), time)}>Next Monday</button>
        <button onClick={() => apply(at(7), time)}>In a week</button>
      </div>
      <div className="due-month">
        <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft size={14} />
        </button>
        <span>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="due-grid">
        {WEEK.map((w) => (
          <small key={w}>{w}</small>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button key={i} className={cx('due-day', key(d) === day && 'on', key(d) === key(today) && 'is-today', key(d) < key(today) && 'past')} onClick={() => setDay(key(d))} onDoubleClick={() => apply(key(d), time)}>
              {d.getDate()}
            </button>
          ) : (
            <span key={i} />
          )
        )}
      </div>
      <div className="due-time">
        <label>
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        {time && (
          <button className="icon-btn" title="No time" aria-label="No time" onClick={() => setTime('')}>
            <X size={13} />
          </button>
        )}
        <span className="due-hint">{time ? 'You will get a reminder' : 'Add a time to get a reminder'}</span>
      </div>
      <div className="due-actions">
        <button className="text-btn danger" onClick={() => apply(null, '')}>
          Remove
        </button>
        <span className="flex-1" />
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary" disabled={!day} onClick={() => apply(day, time)}>
          Set
        </button>
      </div>
    </div>
  )
}
