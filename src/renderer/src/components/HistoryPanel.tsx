import { useEffect, useState } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import { create } from 'zustand'
import { flushHistory, listRevisions, restoreRevision } from '@/lib/history'
import type { Revision } from '@/lib/history'
import { useStore } from '@/lib/store'
import { cx, relativeTime } from '@/lib/util'
import { Diff } from './Diff'

const useHistoryPanel = create<{ noteId: string | null }>(() => ({ noteId: null }))

export function openHistory(noteId: string): void {
  flushHistory()
  useHistoryPanel.setState({ noteId })
}

const close = (): void => useHistoryPanel.setState({ noteId: null })

export const isHistoryOpen = (): boolean => useHistoryPanel.getState().noteId !== null

export function HistoryPanel(): React.JSX.Element | null {
  const noteId = useHistoryPanel((s) => s.noteId)
  const note = useStore((s) => (noteId ? s.notes[noteId] : undefined))
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [active, setActive] = useState(0)
  // So với: -1 = bản hiện tại, còn lại = một phiên bản khác trong danh sách
  const [against, setAgainst] = useState(-1)

  useEffect(() => {
    if (!noteId) return
    setRevisions(null)
    setActive(0)
    setAgainst(-1)
    // chờ một nhịp để những phiên bản vừa flush kịp ghi xong
    const timer = setTimeout(() => void listRevisions(noteId).then(setRevisions), 150)
    return () => clearTimeout(timer)
  }, [noteId])

  useEffect(() => {
    if (!noteId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, Math.min((revisions?.length ?? 1) - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [noteId, revisions])

  if (!noteId || !note) return null
  const rev = revisions?.[active]
  const current = `${note.title}\n\n${note.body}`

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="history" role="dialog" aria-label="Version history" onMouseDown={(e) => e.stopPropagation()}>
        <header className="history-header">
          <History size={16} />
          <h2>Version History</h2>
          <span className="history-note">{note.title || 'Untitled'}</span>
          <span className="flex-1" />
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="history-body">
          <ul className="history-list">
            {revisions === null && <li className="history-empty">Loading…</li>}
            {revisions?.length === 0 && (
              <li className="history-empty">No earlier versions yet. Versions are saved a few seconds after you stop typing.</li>
            )}
            {revisions?.map((r, i) => (
              <li key={r._id} className={cx(i === active && 'active')} onClick={() => {
                setActive(i)
                if (against === i) setAgainst(-1)
              }}>
                <span className="history-when">{relativeTime(r.createdAt)}</span>
                <span className="history-date">{new Date(r.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <div className="history-diff">
            {rev ? (
              <>
                <div className="history-diff-head">
                  <span className="history-against">
                    Changes from this version to{' '}
                    <select aria-label="Compare with" value={against} onChange={(e) => setAgainst(Number(e.target.value))}>
                      <option value={-1}>the current note</option>
                      {revisions?.map((r, i) =>
                        i === active ? null : (
                          <option key={r._id} value={i}>
                            the version from {new Date(r.createdAt).toLocaleString()}
                          </option>
                        )
                      )}
                    </select>{' '}
                    <span className="diff-legend removed">− removed</span> <span className="diff-legend added">+ added</span>
                  </span>
                  <button
                    className="btn primary"
                    disabled={rev.title === note.title && rev.body === note.body}
                    onClick={async () => {
                      await restoreRevision(rev)
                      close()
                      useStore.getState().showNotice('Version restored. The previous text was saved in the history, so you can undo this.')
                    }}
                  >
                    <RotateCcw size={13} /> Restore This Version
                  </button>
                </div>
                <Diff
                  from={`${rev.title}\n\n${rev.body}`}
                  to={against >= 0 && revisions?.[against] ? `${revisions[against].title}\n\n${revisions[against].body}` : current}
                  same={against >= 0 ? 'These two versions are the same.' : 'This version is the same as the current note.'}
                />
              </>
            ) : (
              <div className="history-empty">Select a version on the left.</div>
            )}
          </div>
        </div>
        <footer className="history-footer">Versions are kept on this computer only. They are not synced or included in backups.</footer>
      </div>
    </div>
  )
}
