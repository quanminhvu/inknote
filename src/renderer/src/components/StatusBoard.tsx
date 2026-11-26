import { useEffect, useMemo, useState } from 'react'
import { CircleDashed, Lock, Pin, Search, X } from 'lucide-react'
import { create } from 'zustand'
import { getStatuses } from '@/lib/statuses'
import { useStore } from '@/lib/store'
import type { Note, NoteStatus } from '@/lib/types'
import { cx, relativeTime } from '@/lib/util'
import { StatusIcon } from './StatusIcon'

// Bảng trạng thái (giống plugin status-kanban): mọi ghi chú xếp thành cột theo trạng thái.
// Kéo thẻ sang cột khác để đổi trạng thái; bấm thẻ để mở ghi chú.

const useBoard = create<{ open: boolean }>(() => ({ open: false }))
export const openBoard = (): void => useBoard.setState({ open: true })
const close = (): void => useBoard.setState({ open: false })
export const isBoardOpen = (): boolean => useBoard.getState().open

const CARD_MIME = 'application/x-inknote-board-card'
const PER_COLUMN = 300

export function StatusBoard(): React.JSX.Element | null {
  const open = useBoard((s) => s.open)
  const notes = useStore((s) => s.notes)
  const books = useStore((s) => s.books)
  useStore((s) => s.statuses)
  const [query, setQuery] = useState('')
  const [bookId, setBookId] = useState('')
  const [showNone, setShowNone] = useState(false)
  const [over, setOver] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const columns = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    const list = Object.values(notes)
      .filter((n) => !n.trashed && (!bookId || n.bookId === bookId) && (!q || n.title.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
    const cols: { id: NoteStatus; label: string; notes: Note[] }[] = [
      { id: 'none', label: 'No status', notes: [] },
      ...getStatuses().map((s) => ({ id: s.id, label: s.label, notes: [] as Note[] }))
    ]
    const byId = new Map(cols.map((c) => [c.id, c]))
    for (const n of list) (byId.get(n.status) ?? cols[0]).notes.push(n)
    return cols
  }, [open, notes, query, bookId])

  if (!open) return null
  // Mặc định chỉ hiện các cột trạng thái; ghi chú chưa có trạng thái nằm ở cột riêng khi bật
  const shown = showNone ? columns : columns.filter((c) => c.id !== 'none')
  const move = (ids: string[], status: NoteStatus): void => {
    const s = useStore.getState()
    for (const id of ids) if (s.notes[id] && s.notes[id].status !== status) s.updateNote(id, { status })
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal board-modal" role="dialog" aria-label="Status board" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header board-head">
          <h2>Board</h2>
          <label className="board-search">
            <Search size={13} />
            <input value={query} placeholder="Filter by title" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="settings-select" value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Notebook">
            <option value="">All notebooks</option>
            {Object.values(books)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
          </select>
          <label className="board-check">
            <input type="checkbox" checked={showNone} onChange={(e) => setShowNone(e.target.checked)} /> Notes without a status
          </label>
          <span className="flex-1" />
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="board-columns">
          {shown.map((col) => (
            <section
              key={col.id}
              className={cx('board-column', over === col.id && 'drop')}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(CARD_MIME)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setOver(col.id)
              }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const id = e.dataTransfer.getData(CARD_MIME)
                if (id) move([id], col.id)
              }}
            >
              <div className="board-column-head">
                {col.id === 'none' ? <CircleDashed size={14} className="status-none" /> : <StatusIcon status={col.id} size={14} />}
                <span>{col.label}</span>
                <span className="board-count">{col.notes.length}</span>
              </div>
              <div className="board-cards">
                {col.notes.slice(0, PER_COLUMN).map((n) => (
                  <button
                    key={n._id}
                    className="board-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(CARD_MIME, n._id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => {
                      close()
                      const s = useStore.getState()
                      s.select({ kind: 'all' })
                      s.selectNote(n._id)
                    }}
                  >
                    <span className="board-card-title">
                      {n.pinned && <Pin size={11} />}
                      {n.locked && <Lock size={11} />}
                      {n.title || 'Untitled'}
                    </span>
                    <span className="board-card-meta">
                      {books[n.bookId]?.name ?? ''} · {relativeTime(n.updatedAt)}
                    </span>
                  </button>
                ))}
                {col.notes.length > PER_COLUMN && <p className="board-more">+{col.notes.length - PER_COLUMN} more</p>}
                {col.notes.length === 0 && <p className="board-empty">Drop notes here</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
