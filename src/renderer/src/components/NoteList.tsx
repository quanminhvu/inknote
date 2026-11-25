import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, CircleDashed, ListChecks, ListFilter, PanelLeft, Pin, SquarePen, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { visibleNotes } from '@/lib/selectors'
import { highlightWords, parseQuery } from '@/lib/search'
import { countTasks } from '@/lib/markdown'
import { dayKey } from '@/lib/dueDates'
import { getStatuses } from '@/lib/statuses'
import type { Note, SortKey } from '@/lib/types'
import { cx, isMac, relativeTime, snippet } from '@/lib/util'
import { openInNewWindow } from '@/lib/windowMode'
import { openInTab, tabsEnabled } from '@/lib/tabs'
import { presentNote } from '@/lib/slides'
import { formatNote } from '@/lib/formatNote'
import { openGraph } from '@/lib/graph'
import { exportNoteHtml, exportNotePdf } from '@/lib/exportHtml'
import { exportNote } from '@/lib/actions'
import { openHistory } from './HistoryPanel'
import { copyId, copyNoteLink, noteLinkMarkdown } from '@/lib/clipboard'
import { openMenu } from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { NOTE_MIME } from './Sidebar'
import { bulkMenu } from './BulkPanel'
import { StatusIcon } from './StatusIcon'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updatedAt', label: 'Date Updated' },
  { key: 'createdAt', label: 'Date Created' },
  { key: 'title', label: 'Title' }
]

function Highlight({ text, words }: { text: string; words: string[] }): React.JSX.Element {
  if (!words.length || !text) return <>{text}</>
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </>
  )
}

export function noteMenu(note: Note): MenuItem[] {
  const a = useStore.getState()
  if (note.trashed) {
    return [
      { label: 'Restore', onClick: () => a.restoreNote(note._id) },
      { separator: true },
      {
        label: 'Delete Permanently',
        danger: true,
        onClick: () => {
          if (window.confirm(`Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`)) a.deleteNoteForever(note._id)
        }
      }
    ]
  }
  return [
    { label: note.pinned ? 'Unpin from Top' : 'Pin to Top', onClick: () => a.updateNote(note._id, { pinned: !note.pinned }) },
    { label: 'Duplicate', onClick: () => a.duplicateNote(note._id) },
    ...(tabsEnabled() ? [{ label: 'Open in New Tab', onClick: () => openInTab(note._id) }] : []),
    ...(window.inknote ? [{ label: 'Open in New Window', onClick: () => openInNewWindow(note._id) }] : []),
    { label: 'Format Document', hint: isMac() ? '⌥⇧F' : 'Alt+Shift+F', onClick: () => void formatNote(note._id) },
    { label: 'Present', onClick: () => presentNote(note._id) },
    { label: 'Show in Graph', onClick: () => openGraph('local', note._id) },
    { label: 'Export as Markdown…', onClick: () => void exportNote(note._id) },
    { label: 'Export as HTML…', onClick: () => void exportNoteHtml(note._id) },
    ...(window.inknote ? [{ label: 'Export as PDF…', onClick: () => void exportNotePdf(note._id) }] : []),
    { label: 'Version History…', onClick: () => openHistory(note._id) },
    { label: 'Copy Link', onClick: () => copyNoteLink(note._id) },
    { label: 'Copy Note ID', onClick: () => copyId(note._id) },
    { separator: true },
    { label: 'No Status', icon: <CircleDashed size={14} className="status-none" />, checked: note.status === 'none', onClick: () => a.updateNote(note._id, { status: 'none' }) },
    ...getStatuses().map((s) => ({
      label: s.label,
      icon: <StatusIcon status={s.id} size={14} />,
      checked: note.status === s.id,
      onClick: () => a.updateNote(note._id, { status: s.id })
    })),
    { separator: true },
    { label: 'Move to Trash', danger: true, onClick: () => a.trashNote(note._id) }
  ]
}

type QuickFilter = 'all' | 'pinned' | 'tasks' | 'due'

const OPEN_TASK = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[ \]\s/m
const DUE_TASK = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[ \]\s.*@(\d{4}-\d{2}-\d{2})/gm

/** Ghi chú có task chưa xong, hạn trong 7 ngày tới (hoặc đã quá hạn) */
function hasDueSoon(body: string): boolean {
  if (!body.includes('@')) return false
  const now = new Date()
  const limit = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
  for (const m of body.matchAll(DUE_TASK)) if (m[1] <= limit) return true
  return false
}

const QUICK_FILTERS: { id: QuickFilter; label: string; test: (n: Note) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'pinned', label: 'Pinned', test: (n) => n.pinned },
  { id: 'tasks', label: 'Open tasks', test: (n) => OPEN_TASK.test(n.body) },
  { id: 'due', label: 'Due soon', test: (n) => hasDueSoon(n.body) }
]

/** Nhóm ngày cho danh sách: Today, Yesterday, This week, This month, rồi "November 2026" */
function dateGroup(time: number): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  if (time >= today) return 'Today'
  if (time >= today - day) return 'Yesterday'
  if (time >= today - 6 * day) return 'This week'
  const d = new Date(time)
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function NoteList({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }): React.JSX.Element {
  useStore((s) => s.statuses)
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)
  const selection = useStore((s) => s.selection)
  const query = useStore((s) => s.query)
  const sort = useStore((s) => s.sort)
  const collapsedBooks = useStore((s) => s.collapsedBooks)
  const workspace = useStore((s) => s.workspace)
  const selectedNoteId = useStore((s) => s.selectedNoteId)
  const { selectNote, setQuery, setSort, createNote, emptyTrash } = useStore.getState()
  const listRef = useRef<HTMLDivElement>(null)

  const [quick, setQuick] = useState<QuickFilter>('all')
  const all = useMemo(
    () => visibleNotes({ notes, books, tags, selection, query, sort, collapsedBooks, workspace }),
    [notes, books, tags, selection, query, sort, collapsedBooks, workspace]
  )
  const list = useMemo(() => (quick === 'all' ? all : all.filter(QUICK_FILTERS.find((f) => f.id === quick)!.test)), [all, quick])
  // Nhóm theo ngày (khi xếp theo thời gian): Pinned, Today, Yesterday, This week, This month, rồi theo tháng
  const groupOf = (note: (typeof list)[number]): string => {
    if (note.pinned && selection.kind !== 'trash') return 'Pinned'
    if (sort === 'title') return ''
    return dateGroup(note[sort])
  }
  const words = useMemo(() => highlightWords(parseQuery(query)), [query])

  const multi = useStore((s) => s.multi)
  const multiSet = useMemo(() => new Set(multi), [multi])

  // Luôn có một ghi chú được chọn nếu danh sách không rỗng
  useEffect(() => {
    if (!list.some((n) => n._id === selectedNoteId)) selectNote(list[0]?._id ?? null)
  }, [list, selectedNoteId, selectNote])

  // Bỏ khỏi vùng chọn những ghi chú không còn trong danh sách (ví dụ vừa chuyển vào thùng rác)
  useEffect(() => {
    if (!multi.length) return
    const visible = new Set(list.map((n) => n._id))
    const kept = multi.filter((id) => visible.has(id))
    if (kept.length !== multi.length) useStore.getState().setMulti(kept.length > 1 ? kept : [])
  }, [list, multi])

  const clickNote = (e: React.MouseEvent, id: string): void => {
    const s = useStore.getState()
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: thêm hoặc bỏ một ghi chú khỏi vùng chọn
      const base = s.multi.length ? s.multi : s.selectedNoteId ? [s.selectedNoteId] : []
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
      s.setMulti(next.length > 1 ? next : [])
      if (next.length === 1) selectNote(next[0])
      else if (!next.includes(s.selectedNoteId ?? '')) selectNote(next[next.length - 1] ?? null)
      return
    }
    if (e.shiftKey && s.selectedNoteId) {
      // Shift+click: chọn một dải liền nhau
      const a = list.findIndex((n) => n._id === s.selectedNoteId)
      const b = list.findIndex((n) => n._id === id)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const range = list.slice(from, to + 1).map((n) => n._id)
        s.setMulti(range.length > 1 ? range : [])
        return
      }
    }
    s.setMulti([])
    selectNote(id)
  }

  useEffect(() => {
    listRef.current?.querySelector('.note-item.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedNoteId])

  const heading =
    selection.kind === 'all'
      ? workspace && books[workspace]
        ? books[workspace].name
        : 'All Notes'
      : selection.kind === 'trash'
        ? 'Trash'
        : selection.kind === 'book'
          ? (books[selection.id]?.name ?? 'Notebook')
          : selection.kind === 'tag'
            ? (tags[selection.id]?.name ?? '')
            : selection.kind === 'status'
              ? (getStatuses().find((s) => s.id === selection.status)?.label ?? '')
              : 'Today'

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      useStore.getState().setMulti(list.length > 1 ? list.map((n) => n._id) : [])
      return
    }
    if (e.key === 'Escape' && multi.length) {
      e.preventDefault()
      useStore.getState().setMulti([])
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    useStore.getState().setMulti([])
    e.preventDefault()
    const index = list.findIndex((n) => n._id === selectedNoteId)
    const next = list[Math.max(0, Math.min(list.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) selectNote(next._id)
  }

  return (
    <section className="notelist">
      <header className="notelist-header titlebar-drag">
        <div className="notelist-title">
          <button className="icon-btn" title="Show or hide the sidebar" onClick={() => useStore.getState().toggleSidebar()}>
            <PanelLeft size={16} />
          </button>
          <h2 title={heading}>
            {selection.kind === 'tag' && tags[selection.id] && (
              <span className="heading-dot" style={{ background: tags[selection.id].color }} />
            )}
            {selection.kind === 'status' && <StatusIcon status={selection.status} size={15} />}
            <span className="notelist-heading-text">{heading}</span>
            <span className="notelist-count">{list.length}</span>
          </h2>
          <button
            className="icon-btn"
            title="Sort"
            onClick={(e) =>
              openMenu(
                e,
                SORTS.map((s) => ({ label: s.label, checked: sort === s.key, onClick: () => setSort(s.key) })),
                true
              )
            }
          >
            <ArrowUpDown size={15} />
          </button>
          {selection.kind === 'trash' ? (
            <button
              className="text-btn danger"
              disabled={list.length === 0}
              onClick={() => {
                if (window.confirm('Permanently delete all notes in the Trash? This cannot be undone.')) emptyTrash()
              }}
            >
              Empty
            </button>
          ) : (
            <button className="icon-btn accent" title="New note (Cmd/Ctrl+N)" onClick={() => createNote()}>
              <SquarePen size={16} />
            </button>
          )}
        </div>
        {selection.kind !== 'trash' && (
          <div className="quick-filters" role="tablist" aria-label="Quick filter">
            {QUICK_FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={quick === f.id} className={cx('quick-filter', quick === f.id && 'on')} onClick={() => setQuick(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className="search-box">
          <ListFilter size={14} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Filter notes…"
            aria-label="Filter notes"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                listRef.current?.focus()
              }
            }}
          />
          {query && (
            <button className="search-clear" title="Clear filter" aria-label="Clear filter" onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      <div className="notelist-items" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
        {list.length === 0 && (
          <div className="empty-hint">{query ? 'No notes match your search.' : selection.kind === 'trash' ? 'Trash is empty.' : 'No notes here yet.'}</div>
        )}
        {list.map((note, i) => {
          const tasks = countTasks(note.body)
          const book = books[note.bookId]
          const group = groupOf(note)
          const showGroup = group && (i === 0 || groupOf(list[i - 1]) !== group)
          return (
            <Fragment key={note._id}>
            {showGroup && <div className="note-group">{group}</div>}
            <div
              className={cx(
                'note-item',
                (multi.length > 1 ? multiSet.has(note._id) : note._id === selectedNoteId) && 'selected'
              )}
              draggable
              onDragStart={(e) => {
                const ids = multiSet.has(note._id) && multi.length > 1 ? multi : [note._id]
                e.dataTransfer.setData(NOTE_MIME, JSON.stringify(ids))
                // Thả sang editor khác, terminal hoặc vào một ghi chú: dán link Markdown của ghi chú
                e.dataTransfer.setData('text/plain', ids.map(noteLinkMarkdown).join('\n'))
                e.dataTransfer.effectAllowed = 'copyMove'
              }}
              onClick={(e) => clickNote(e, note._id)}
              onDoubleClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && tabsEnabled()) openInTab(note._id)
              }}
              onMouseDown={(e) => {
                if (e.button === 1 && tabsEnabled()) e.preventDefault()
              }}
              onAuxClick={(e) => {
                // Chuột giữa: mở ở tab mới phía sau, giữ nguyên ghi chú đang xem
                if (e.button === 1 && tabsEnabled()) openInTab(note._id, true)
              }}
              onContextMenu={(e) => {
                if (multi.length > 1 && multiSet.has(note._id)) {
                  openMenu(e, bulkMenu(multi))
                  return
                }
                useStore.getState().setMulti([])
                selectNote(note._id)
                openMenu(e, noteMenu(note))
              }}
            >
              <div className="note-item-title">
                <StatusIcon status={note.status} />
                <span className={cx('note-item-name', !note.title && 'untitled')}>
                  <Highlight text={note.title || 'Untitled'} words={words} />
                </span>
                {note.pinned && <Pin size={12} className="pin-mark" />}
              </div>
              <div className="note-item-snippet">
                <Highlight text={snippet(note.body)} words={words} />
              </div>
              <div className="note-item-meta">
                <span className="note-item-time">{relativeTime(sort === 'createdAt' ? note.createdAt : note.updatedAt)}</span>
                {selection.kind !== 'book' && book && <span className="note-item-book">{book.name}</span>}
                {tasks.total > 0 && (
                  <span
                    className={cx('note-item-tasks', tasks.done === tasks.total && 'done')}
                    title={`${tasks.done} of ${tasks.total} tasks done`}
                  >
                    <ListChecks size={13} />
                    <span className="task-bar">
                      <span style={{ width: `${Math.round((tasks.done / tasks.total) * 100)}%` }} />
                    </span>
                    {tasks.done} of {tasks.total}
                  </span>
                )}
                {note.tags.slice(0, 3).map((id) =>
                  tags[id] ? (
                    <span key={id} className="tag-chip small" style={{ '--tag': tags[id].color } as React.CSSProperties}>
                      {tags[id].name}
                    </span>
                  ) : null
                )}
              </div>
            </div>
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}
