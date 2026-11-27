import { useState } from 'react'
import { Bell, BellOff, CalendarDays, CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react'
import { dayOf, streak, useHabits, weekCount } from '@/lib/habits'
import { cx } from '@/lib/util'
import { mi, openMenu } from './ContextMenu'

// Thẻ "Habits" trên trang Today: tick thói quen theo ngày (7 ngày gần nhất), chuỗi ngày liên tiếp.

export function HabitsCard(): React.JSX.Element {
  const { habits, done, add, remove, rename, toggle, setGoal, setRemind } = useHabits()
  const [timeFor, setTimeFor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i))

  const submit = (): void => {
    const n = name.trim()
    if (!n) return
    add(n)
    setName('')
  }

  return (
    <section className="today-card today-habits" aria-label="Habits">
      <div className="today-card-head">
        <h2>Habits</h2>
      </div>
      {habits.length > 0 && (
        <div className="habit-grid" role="table">
          <div className="habit-row habit-days" role="row">
            <span />
            {days.map((d) => (
              <small key={dayOf(d)} className={cx(dayOf(d) === dayOf(now) && 'is-today')}>
                {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
              </small>
            ))}
            <span />
          </div>
          {habits.map((h) => {
            const n = streak(done[h.id], now)
            return (
              <div
                key={h.id}
                className="habit-row"
                role="row"
                onContextMenu={(e) =>
                  openMenu(e, [
                    { label: 'Every day', icon: mi(CalendarDays), checked: !h.perWeek, onClick: () => setGoal(h.id, undefined) },
                    ...[1, 2, 3, 4, 5].map((n) => ({ label: `${n} time${n === 1 ? '' : 's'} a week`, icon: mi(CalendarRange), checked: h.perWeek === n, onClick: () => setGoal(h.id, n) })),
                    { separator: true as const },
                    { label: h.remind ? `Remind at ${h.remind}…` : 'Remind Me…', icon: mi(Bell), onClick: () => setTimeFor(h.id) },
                    ...(h.remind ? [{ label: 'No Reminder', icon: mi(BellOff), onClick: () => setRemind(h.id, undefined) }] : []),
                    { separator: true as const },
                    { label: 'Rename', icon: mi(Pencil), onClick: () => setEditing(h.id) },
                    { label: 'Delete Habit', icon: mi(Trash2), danger: true, onClick: () => window.confirm(`Delete the habit “${h.name}”?`) && remove(h.id) }
                  ])
                }
              >
                {editing === h.id ? (
                  <input
                    className="habit-name-input"
                    defaultValue={h.name}
                    autoFocus
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v) rename(h.id, v)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span className="habit-name" title="Right-click for goal, reminder, rename or delete">
                    {h.name}
                    {h.remind && (
                      <small className="habit-remind" title={`Reminder at ${h.remind}`}>
                        <Bell size={10} /> {h.remind}
                      </small>
                    )}
                  </span>
                )}
                {days.map((d) => {
                  const key = dayOf(d)
                  const on = done[h.id]?.includes(key) ?? false
                  return (
                    <button
                      key={key}
                      className={cx('habit-cell', on && 'on')}
                      aria-pressed={on}
                      title={`${h.name} · ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
                      onClick={() => toggle(h.id, key)}
                    />
                  )
                })}
                <span className="habit-streak" title={h.perWeek ? 'Done this week' : 'Days in a row'}>
                  {h.perWeek ? `${weekCount(done[h.id], now)}/${h.perWeek}` : n ? `${n}d` : ''}
                </span>
                {timeFor === h.id && (
                  <span className="habit-remind-edit">
                    <Bell size={12} />
                    <input
                      type="time"
                      autoFocus
                      defaultValue={h.remind ?? '20:00'}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setRemind(h.id, (e.target as HTMLInputElement).value || undefined)
                          setTimeFor(null)
                        }
                        if (e.key === 'Escape') setTimeFor(null)
                      }}
                      onBlur={(e) => {
                        setRemind(h.id, e.target.value || undefined)
                        setTimeFor(null)
                      }}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <form
        className="habit-add"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Plus size={14} />
        <input value={name} placeholder={habits.length ? 'Add a habit' : 'Add a habit to track, e.g. Read 20 minutes'} onChange={(e) => setName(e.target.value)} />
      </form>
    </section>
  )
}
