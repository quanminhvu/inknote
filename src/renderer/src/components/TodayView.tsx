import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, PanelLeft, Plus } from 'lucide-react'
import { ensureTodayNoteSilently, findTodayNote, openTodayNote } from '@/lib/dailyNote'
import { dayKey, dueLabel, dueState, withoutDue } from '@/lib/dueDates'
import { toggleTask } from '@/lib/markdown'
import { useStore } from '@/lib/store'
import { collectTasks } from '@/lib/tasks'
import type { TaskItem } from '@/lib/tasks'
import { cx, relativeTime, snippet } from '@/lib/util'
import { collectCards, dueCards } from '@/lib/flashcards'
import { openReview } from './FlashcardReview'

// Trang "Today": việc cần làm có hạn chót (gom từ mọi ghi chú), ô ghi nhanh vào ghi chú hôm nay,
// lịch tháng (ngày có ghi chú hằng ngày / có hạn chót), ghi chú vừa sửa và hoạt động trong tuần.

const DAY = 86_400_000
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAILY_TITLE = /^(\d{4}-\d{2}-\d{2})\b/

/** Đổi "@tomorrow", "@fri", "@next week", "@2026-12-01" trong chữ ghi nhanh thành ngày */
export function parseCapture(text: string, now = new Date()): { task: string; due: string | null } {
  const at = (days: number): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  let due: string | null = null
  const task = text
    .replace(/(^|\s)@(today|tomorrow|next week|mon|tue|wed|thu|fri|sat|sun|\d{4}-\d{2}-\d{2})\b/gi, (_all, lead: string, word: string) => {
      const w = word.toLowerCase()
      if (/^\d/.test(w)) due = w
      else if (w === 'today') due = dayKey(at(0))
      else if (w === 'tomorrow') due = dayKey(at(1))
      else if (w === 'next week') due = dayKey(at(7))
      else {
        const target = WEEKDAYS.indexOf(w)
        const diff = ((target - now.getDay() + 7) % 7) || 7
        due = dayKey(at(diff))
      }
      return lead
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { task, due }
}

/** Mở một ghi chú từ trang Today: quay về danh sách ghi chú rồi chọn nó */
function openFromToday(id: string, line?: number): void {
  const s = useStore.getState()
  s.select({ kind: 'all' })
  s.openNote(id)
  if (line !== undefined) {
    setTimeout(() => window.dispatchEvent(new CustomEvent('inknote-goto', { detail: { line, index: 0, focusEditor: true } })), 120)
  }
}

const fromNotes = (n: number): string => `from ${n} ${n === 1 ? 'note' : 'notes'}`

export function TodayView(): React.JSX.Element {
  const notes = useStore((s) => s.notes)
  const sidebarHidden = useStore((s) => s.sidebarHidden)
  const cards = useMemo(() => {
    const all = collectCards(notes)
    return { total: all.length, due: dueCards(all).length }
  }, [notes])
  const [capture, setCapture] = useState('')
  // Hướng trượt của lịch khi đổi tháng
  const [slide, setSlide] = useState<'next' | 'prev' | ''>('')
  const [month, setMonthState] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const setMonth = (next: Date): void => {
    setSlide(next > month ? 'next' : 'prev')
    setMonthState(next)
  }
  const now = new Date()
  const todayKey = dayKey(now)

  const tasks = useMemo(() => collectTasks(notes), [notes])
  // Việc chưa xong có hạn tới 7 ngày nữa (và mọi việc quá hạn), gấp nhất lên trước
  const upcoming = useMemo(() => {
    const limit = dayKey(new Date(now.getTime() + 7 * DAY))
    return tasks
      .filter((t) => !t.done && t.due && t.due <= limit)
      .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : b.updatedAt - a.updatedAt))
      .slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, todayKey])
  const overdue = upcoming.filter((t) => t.due! < todayKey).length
  const dueToday = upcoming.filter((t) => t.due === todayKey).length

  // Lịch: ngày có ghi chú hằng ngày, ngày có hạn chót
  const { dailyDays, dueDays } = useMemo(() => {
    const daily = new Map<string, string>()
    for (const n of Object.values(notes)) {
      if (n.trashed) continue
      const m = DAILY_TITLE.exec(n.title.trim())
      if (m) daily.set(m[1], n._id)
    }
    const dues = new Set(tasks.filter((t) => !t.done && t.due).map((t) => t.due!))
    return { dailyDays: daily, dueDays: dues }
  }, [notes, tasks])

  const recent = useMemo(
    () =>
      Object.values(notes)
        .filter((n) => !n.trashed && !DAILY_TITLE.test(n.title.trim()))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [notes]
  )

  // Hoạt động 7 ngày: số ghi chú được sửa mỗi ngày (theo lần sửa cuối) và số ghi chú tạo mới
  const week = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime()
    const days = Array.from({ length: 7 }, (_, i) => ({ date: new Date(start + i * DAY), edited: 0 }))
    let created = 0
    for (const n of Object.values(notes)) {
      if (n.trashed) continue
      if (n.updatedAt >= start) days[Math.min(6, Math.floor((n.updatedAt - start) / DAY))].edited++
      if (n.createdAt >= start) created++
    }
    return { days, created, max: Math.max(1, ...days.map((d) => d.edited)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, todayKey])

  const parsed = parseCapture(capture, now)

  const addCapture = (): void => {
    if (!parsed.task) return
    const id = ensureTodayNoteSilently()
    const note = useStore.getState().notes[id]
    if (!note) return
    const line = `- [ ] ${parsed.task}${parsed.due ? ` @${parsed.due}` : ''}`
    const base = note.body.replace(/\s+$/, '')
    useStore.getState().updateNote(id, { body: base ? `${base}\n${line}\n` : `${line}\n` })
    setCapture('')
  }

  const toggle = (t: TaskItem): void => {
    const note = useStore.getState().notes[t.noteId]
    if (note) useStore.getState().updateNote(t.noteId, { body: toggleTask(note.body, t.index) })
  }

  const summary =
    overdue || dueToday
      ? [dueToday && `${dueToday} due today`, overdue && `${overdue} overdue`].filter(Boolean).join(', ')
      : upcoming.length
        ? `Nothing due today. ${upcoming.length} coming up this week.`
        : 'Nothing due this week.'

  // Lưới tháng bắt đầu từ thứ Hai
  const first = month
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1
    return n >= 1 && n <= daysInMonth ? new Date(first.getFullYear(), first.getMonth(), n) : null
  })

  return (
    <section className="today" aria-label="Today">
      {sidebarHidden && (
        <button className="icon-btn today-sidebar" title="Show sidebar (Cmd/Ctrl+\)" aria-label="Show sidebar" onClick={() => useStore.getState().toggleSidebar()}>
          <PanelLeft size={16} />
        </button>
      )}
      <header className="today-header">
        <div className="today-heading">
          <h1>
            Today <span className="today-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </h1>
          <p>{summary}</p>
        </div>
        <button className="btn today-open" onClick={() => {
          useStore.getState().select({ kind: 'all' })
          openTodayNote()
        }}>
          <CalendarDays size={15} /> Open today&rsquo;s note
        </button>
      </header>

      <form
        className="today-capture"
        onSubmit={(e) => {
          e.preventDefault()
          addCapture()
        }}
      >
        <Plus size={18} />
        <input
          aria-label="Add a task to today's note"
          value={capture}
          placeholder="Add a task to today’s note (@tomorrow, @fri, @2026-12-01 for a due date)"
          onChange={(e) => setCapture(e.target.value)}
        />
        {parsed.due && <span className={cx('due', `due-${dueState(parsed.due, false, now)}`)}>{dueLabel(parsed.due, now)}</span>}
        <kbd>↵</kbd>
      </form>

      <div className="today-grid">
        <div className="today-col">
          <section className="today-card today-tasks" aria-label="Tasks due">
            <div className="today-card-head">
              <h2>Due soon</h2>
              <span>{upcoming.length ? fromNotes(new Set(upcoming.map((t) => t.noteId)).size) : ''}</span>
              <span className="flex-1" />
              <button className="text-btn" onClick={() => useStore.getState().setPalette('tasks')}>
                All tasks
              </button>
            </div>
            {upcoming.length === 0 ? (
              <p className="today-empty">No tasks with a due date in the next 7 days. Add one above, or write <code>@tomorrow</code> after a task in any note.</p>
            ) : (
              <ul>
                {upcoming.map((t) => (
                  <li key={`${t.noteId}:${t.index}`}>
                    <input type="checkbox" aria-label={withoutDue(t.text)} checked={t.done} onChange={() => toggle(t)} />
                    <button className="today-task-text" onClick={() => openFromToday(t.noteId, t.line)}>
                      <span>{withoutDue(t.text) || 'Untitled task'}</span>
                      <small>{t.noteTitle || 'Untitled'}</small>
                    </button>
                    <span className={cx('due', `due-${dueState(t.due!, false, now)}`)}>{dueLabel(t.due!, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="today-card today-recent" aria-label="Continue writing">
            <div className="today-card-head">
              <h2>Continue writing</h2>
            </div>
            <div className="today-recent-grid">
              {recent.map((n) => (
                <button key={n._id} className="today-recent-item" onClick={() => openFromToday(n._id)}>
                  <small>{relativeTime(n.updatedAt)}</small>
                  <strong>{n.title || 'Untitled'}</strong>
                  <span>{snippet(n.body, 180)}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="today-col today-side">
          <section className="today-card today-calendar" aria-label="Calendar">
            <div className="today-card-head">
              <h2>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <span className="flex-1" />
              <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft size={15} />
              </button>
              <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="cal-grid cal-weekdays" aria-hidden="true">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className={cx('cal-grid', slide && `cal-slide-${slide}`)} key={`${month.getFullYear()}-${month.getMonth()}`}>
              {cells.map((d, i) => {
                if (!d) return <span key={i} />
                const key = dayKey(d)
                const daily = dailyDays.get(key)
                return (
                  <button
                    key={i}
                    className={cx('cal-day', key === todayKey && 'is-today', daily && 'has-note', dueDays.has(key) && 'has-due')}
                    title={[daily && 'Daily note', dueDays.has(key) && 'Tasks due'].filter(Boolean).join(' · ') || 'Create a daily note for this day'}
                    onClick={() => {
                      useStore.getState().select({ kind: 'all' })
                      if (daily) useStore.getState().openNote(daily)
                      else openTodayNote(d)
                    }}
                  >
                    {d.getDate()}
                    <span className="cal-dot" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
            <div className="cal-legend">
              <span><i className="lg-note" />Daily note</span>
              <span><i className="lg-due" />Due date</span>
            </div>
          </section>
          <section className="today-card today-week" aria-label="This week">
            <div className="today-card-head">
              <h2>This week</h2>
              <span className="flex-1" />
              <strong className="today-week-total">{week.days.reduce((n, d) => n + d.edited, 0)}</strong>
              <span>notes edited</span>
            </div>
            <div className="week-bars" role="img" aria-label="Notes edited per day over the last 7 days">
              {week.days.map((d, i) => (
                <span key={i} className="week-bar">
                  <span className={cx('week-fill', i === 6 && 'now')} style={{ height: `${Math.max(4, Math.round((d.edited / week.max) * 72))}px` }} title={`${d.edited} edited`} />
                  <small>{d.date.toLocaleDateString('en-US', { weekday: 'narrow' })}</small>
                </span>
              ))}
            </div>
            <span className="today-week-note">
              {week.created} new {week.created === 1 ? 'note' : 'notes'} · {tasks.filter((t) => t.done).length} tasks done in all notes
            </span>
          </section>
          {cards.total > 0 && (
            <section className="today-card today-cards" aria-label="Flashcards">
              <div className="today-card-head">
                <h2>Flashcards</h2>
                <span className="flex-1" />
                <button className="btn" onClick={openReview}>
                  {cards.due ? `Review ${cards.due}` : 'Open'}
                </button>
              </div>
              <span className="today-week-note">
                {cards.due ? `${cards.due} of ${cards.total} due` : `All ${cards.total} reviewed for now`}
              </span>
            </section>
          )}
        </div>
      </div>
      {findTodayNote() === null && <p className="today-foot">Today&rsquo;s note doesn&rsquo;t exist yet; adding a task creates it from your daily template.</p>}
    </section>
  )
}
