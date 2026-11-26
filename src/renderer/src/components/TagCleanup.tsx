import { useEffect, useMemo, useState } from 'react'
import { Tags, X } from 'lucide-react'
import { create } from 'zustand'
import { useStore } from '@/lib/store'
import { cx } from '@/lib/util'

// Dọn tag hàng loạt (giống plugin multi-tag-delete): chọn nhiều tag để xoá một lần,
// hoặc chọn nhanh các tag không còn ghi chú / template nào dùng. Ghi chú giữ nguyên nội dung.

const useCleanup = create<{ open: boolean }>(() => ({ open: false }))
export const openTagCleanup = (): void => useCleanup.setState({ open: true })
const close = (): void => useCleanup.setState({ open: false })
export const isTagCleanupOpen = (): boolean => useCleanup.getState().open

export function TagCleanup(): React.JSX.Element | null {
  const open = useCleanup((s) => s.open)
  const tags = useStore((s) => s.tags)
  const notes = useStore((s) => s.notes)
  const templates = useStore((s) => s.templates)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setPicked(new Set())
  }, [open])

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

  const rows = useMemo(() => {
    const live = new Map<string, number>()
    const trash = new Map<string, number>()
    const tmpl = new Map<string, number>()
    for (const n of Object.values(notes)) for (const t of n.tags) (n.trashed ? trash : live).set(t, ((n.trashed ? trash : live).get(t) ?? 0) + 1)
    for (const t of Object.values(templates)) for (const id of t.tags) tmpl.set(id, (tmpl.get(id) ?? 0) + 1)
    return Object.values(tags)
      .map((t) => ({ tag: t, live: live.get(t._id) ?? 0, trash: trash.get(t._id) ?? 0, templates: tmpl.get(t._id) ?? 0 }))
      .sort((a, b) => a.tag.name.localeCompare(b.tag.name))
  }, [tags, notes, templates])

  if (!open) return null
  const unused = rows.filter((r) => !r.live && !r.trash && !r.templates)
  const toggle = (id: string): void =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remove = (): void => {
    const list = rows.filter((r) => picked.has(r.tag._id))
    if (!list.length) return
    const used = list.reduce((n, r) => n + r.live + r.trash, 0)
    const msg = `Delete ${list.length} tag${list.length === 1 ? '' : 's'}?${used ? ` They are removed from ${used} note${used === 1 ? '' : 's'}; the notes keep their content.` : ''}`
    if (!window.confirm(msg)) return
    const s = useStore.getState()
    for (const r of list) s.deleteTag(r.tag._id)
    s.showNotice(`Deleted ${list.length} tag${list.length === 1 ? '' : 's'}.`)
    setPicked(new Set())
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal tag-cleanup" role="dialog" aria-label="Clean up tags" onMouseDown={(e) => e.stopPropagation()}>
        <header className="lock-dialog-head">
          <Tags size={16} />
          <h2>Clean Up Tags</h2>
          <span className="flex-1" />
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="tag-cleanup-tools">
          <button className="text-btn" disabled={!unused.length} onClick={() => setPicked(new Set(unused.map((r) => r.tag._id)))}>
            Select unused ({unused.length})
          </button>
          <button className="text-btn" disabled={!picked.size} onClick={() => setPicked(new Set())}>
            Clear selection
          </button>
        </div>
        <div className="tag-cleanup-list">
          {rows.length === 0 && <p className="board-empty">No tags yet.</p>}
          {rows.map((r) => (
            <label key={r.tag._id} className={cx('tag-cleanup-row', picked.has(r.tag._id) && 'picked')}>
              <input type="checkbox" checked={picked.has(r.tag._id)} onChange={() => toggle(r.tag._id)} />
              <span className="tag-dot" style={{ background: r.tag.color }} />
              <span className="tag-cleanup-name">{r.tag.name}</span>
              <span className="tag-cleanup-count">
                {r.live || r.trash || r.templates
                  ? [r.live && `${r.live} note${r.live === 1 ? '' : 's'}`, r.trash && `${r.trash} in Trash`, r.templates && `${r.templates} template${r.templates === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
                  : 'unused'}
              </span>
            </label>
          ))}
        </div>
        <footer className="lock-dialog-actions">
          <button className="btn" onClick={close}>
            Done
          </button>
          <button className="btn danger" disabled={!picked.size} onClick={remove}>
            Delete {picked.size || ''} Tag{picked.size === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  )
}
