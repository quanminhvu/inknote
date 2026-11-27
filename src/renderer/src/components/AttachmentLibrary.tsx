import { useEffect, useMemo, useState } from 'react'
import { FileText, Trash2, X } from 'lucide-react'
import { create } from 'zustand'
import { db, removeDoc } from '@/lib/db'
import { markdownFor, openAttachment, readFile } from '@/lib/attachments'
import { isRevealed } from '@/lib/noteLock'
import { getActiveEditor } from '@/lib/editorCommands'
import { useStore } from '@/lib/store'
import type { FileDoc } from '@/lib/types'
import { cx, relativeTime } from '@/lib/util'

// Thư viện ảnh và file đính kèm (giống plugin qlimg): xem mọi file trong các ghi chú, mở ghi chú đang dùng nó,
// chèn lại vào ghi chú đang mở, và dọn những file không còn ghi chú nào dùng (cho nhẹ dữ liệu).

const useLibrary = create<{ open: boolean }>(() => ({ open: false }))
export const openLibrary = (): void => useLibrary.setState({ open: true })
const close = (): void => useLibrary.setState({ open: false })
export const isLibraryOpen = (): boolean => useLibrary.getState().open

const REF = /(?:inknote|nibmark):\/\/file\/([A-Za-z0-9_-]{1,64})/g
const isImage = (d: FileDoc): boolean => /^image\//.test(d.contentType)
const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

type Filter = 'all' | 'images' | 'unused'

export function AttachmentLibrary(): React.JSX.Element | null {
  const open = useLibrary((s) => s.open)
  const notes = useStore((s) => s.notes)
  const templates = useStore((s) => s.templates)
  const [files, setFiles] = useState<FileDoc[] | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [reload, setReload] = useState(0)

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

  // Nạp danh sách file khi mở
  useEffect(() => {
    if (!open) return
    let alive = true
    setFiles(null)
    void db.allDocs({ startkey: 'file:', endkey: 'file:￿', include_docs: true }).then((res) => {
      if (!alive) return
      setFiles(res.rows.map((r) => r.doc as unknown as FileDoc).filter((d) => d?.type === 'file').sort((a, b) => b.createdAt - a.createdAt))
    })
    return () => {
      alive = false
    }
  }, [open, reload])

  // Ảnh thu nhỏ: nạp dần, thu hồi khi đóng
  useEffect(() => {
    if (!open || !files) return
    let alive = true
    const made: string[] = []
    void (async () => {
      for (const f of files.filter(isImage).slice(0, 400)) {
        const res = await readFile(f._id)
        if (!alive || !res) continue
        const url = URL.createObjectURL(res.blob)
        made.push(url)
        setThumbs((t) => ({ ...t, [f._id]: url }))
      }
    })()
    return () => {
      alive = false
      for (const u of made) URL.revokeObjectURL(u)
      setThumbs({})
    }
  }, [open, files])

  // File nào đang được ghi chú nào dùng (kể cả ghi chú trong Thùng rác và template)
  const usage = useMemo(() => {
    const map = new Map<string, string[]>()
    const add = (body: string, owner: string): void => {
      for (const m of body.matchAll(REF)) {
        const id = `file:${m[1]}`
        const list = map.get(id) ?? []
        if (!list.includes(owner)) list.push(owner)
        map.set(id, list)
      }
    }
    for (const n of Object.values(notes)) add(n.body, n._id)
    for (const t of Object.values(templates)) add(t.body, t._id)
    return map
  }, [notes, templates])

  // Ghi chú có khoá đang đóng: không đọc được nội dung, nên không biết nó dùng file nào
  const sealed = useMemo(() => Object.values(notes).filter((n) => n.locked && !isRevealed(n._id)).length, [notes])

  if (!open) return null
  const unused = (files ?? []).filter((f) => !usage.has(f._id))
  const shown = (files ?? []).filter((f) => (filter === 'images' ? isImage(f) : filter === 'unused' ? !usage.has(f._id) : true))
  const canClean = sealed === 0

  const remove = async (list: FileDoc[]): Promise<void> => {
    if (!list.length || !canClean) return
    const total = list.reduce((n, f) => n + f.size, 0)
    const msg =
      list.length === 1
        ? `Delete “${list[0].name}” (${size(total)})? No note uses it. This can’t be undone in Inknote.`
        : `Delete ${list.length} files that no note uses (${size(total)})? This can’t be undone in Inknote.`
    if (!window.confirm(msg)) return
    for (const f of list) await removeDoc(f._id)
    useStore.getState().showNotice(`Deleted ${list.length} file${list.length === 1 ? '' : 's'}, freed ${size(total)}.`)
    setReload((n) => n + 1)
  }

  const openOwner = (id: string): void => {
    const owner = usage.get(id)?.find((o) => o.startsWith('note:'))
    if (!owner) return
    close()
    const s = useStore.getState()
    s.select({ kind: 'all' })
    s.selectNote(owner)
  }

  const insert = (f: FileDoc): void => {
    const view = getActiveEditor()
    if (!view || view.state.readOnly) {
      useStore.getState().showNotice('Open a note in Write or Live view first.')
      return
    }
    const { from, to } = view.state.selection.main
    const text = markdownFor(f)
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input' })
    close()
    view.focus()
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal library-modal" role="dialog" aria-label="Attachments" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header board-head">
          <h2>Attachments</h2>
          <div className="segmented text" role="group" aria-label="Show">
            {(['all', 'images', 'unused'] as Filter[]).map((f) => (
              <button key={f} className={cx(filter === f && 'on')} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'images' ? 'Images' : `Unused${files ? ` (${unused.length})` : ''}`}
              </button>
            ))}
          </div>
          <span className="library-meta">{files ? `${files.length} files · ${size(files.reduce((n, f) => n + f.size, 0))}` : 'Loading…'}</span>
          <span className="flex-1" />
          {filter === 'unused' && unused.length > 0 && (
            <button className="btn danger" disabled={!canClean} onClick={() => void remove(unused)}>
              <Trash2 size={13} /> Delete All Unused
            </button>
          )}
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        {!canClean && filter === 'unused' && (
          <p className="library-warning">
            {sealed} locked note{sealed === 1 ? ' is' : 's are'} closed, so Inknote can’t see which files {sealed === 1 ? 'it uses' : 'they use'}. Unlock them (or remove their lock) before cleaning up.
          </p>
        )}
        <div className="library-grid">
          {files && shown.length === 0 && <p className="board-empty">{filter === 'unused' ? 'Every file is used by a note.' : 'No attachments yet. Paste or drop an image into a note.'}</p>}
          {shown.map((f) => {
            const used = usage.get(f._id) ?? []
            const owners = used.filter((o) => o.startsWith('note:'))
            return (
              <figure key={f._id} className={cx('library-item', !used.length && 'unused')}>
                <button className="library-thumb" title={owners.length ? 'Open the note that uses it' : 'Open the file'} onClick={() => (owners.length ? openOwner(f._id) : void openAttachment(f._id))}>
                  {isImage(f) && thumbs[f._id] ? <img src={thumbs[f._id]} alt="" /> : <FileText size={28} strokeWidth={1.4} />}
                </button>
                <figcaption>
                  <span className="library-name" title={f.name}>
                    {f.name}
                  </span>
                  <span className="library-sub">
                    {size(f.size)} · {used.length ? `${owners.length || used.length} note${(owners.length || used.length) === 1 ? '' : 's'}` : 'unused'} · {relativeTime(f.createdAt)}
                  </span>
                  <span className="library-actions">
                    <button className="text-btn" onClick={() => insert(f)} title="Insert into the open note">
                      Insert
                    </button>
                    {!used.length && canClean && (
                      <button className="text-btn danger" onClick={() => void remove([f])}>
                        Delete
                      </button>
                    )}
                  </span>
                </figcaption>
              </figure>
            )
          })}
        </div>
      </div>
    </div>
  )
}
