import { sourceScrollAnchors } from '@/lib/scrollAnchors'
import { Backlinks } from './Backlinks'
import type { CSSProperties } from 'react'
import { ResizeHandle, usePaneSize } from './ResizeHandle'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { previewSpot, savePreviewSpot } from '@/lib/viewMemory'
import { syncScroll } from '@/lib/scrollSync'
import { ArrowLeft, ArrowRight, Columns2, EllipsisVertical, Eye, LayoutTemplate, Maximize2, Minimize2, PenLine, Pencil, PictureInPicture2, Pin, RotateCcw, TableOfContents, Trash2 } from 'lucide-react'
import { toggleOutline, useOutline } from '@/lib/outline'
import { Outline } from './Outline'
import { NoteTabs } from './NoteTabs'
import { useStore } from '@/lib/store'
import { toggleTask } from '@/lib/markdown'
import type { ViewMode } from '@/lib/types'
import { cx, isMac, relativeTime } from '@/lib/util'
import { noteWindowId } from '@/lib/windowMode'
import type { Book } from '@/lib/types'
import { countWords, useCursor } from '@/lib/noteStats'
import { onBackupStatus } from '@/lib/backup'
import type { BackupStatus } from '@/lib/backup'
import { goBack, goForward, useNav } from '@/lib/navigation'
import { BulkPanel } from './BulkPanel'
import { openMenu } from './ContextMenu'
import { EditorView } from '@codemirror/view'
import { canRecognizeText, copyTextFromImage, insertTextFromImage } from '@/lib/ocr'
import { exportImage } from '@/lib/exportHtml'
import { insertText, password, randomString, transformSelection, transformsFor, uuid } from '@/lib/textTools'
import { lookUpSelection, pickSelection, searchGoogle, translateSelection } from '@/lib/utilities'
import { MarkdownEditor } from './MarkdownEditor'
import { noteMenu } from './NoteList'
import { Preview } from './Preview'
import { NotebookPicker } from './NotebookPicker'
import { StatusPicker } from './StatusPicker'
import { KanbanBoard } from './KanbanBoard'
import { isKanban } from '@/lib/kanban'
import { TagInput } from './TagInput'

const VIEW_MODES: { mode: ViewMode; label: string; title: string; icon: React.ReactNode }[] = [
  { mode: 'edit', label: 'Write', title: 'Write: plain Markdown', icon: <Pencil size={14} /> },
  { mode: 'live', label: 'Live', title: 'Live: write on the formatted text (Cmd/Ctrl+Shift+L)', icon: <PenLine size={14} /> },
  { mode: 'split', label: 'Split', title: 'Side by side (Cmd/Ctrl+P)', icon: <Columns2 size={14} /> },
  { mode: 'preview', label: 'Read', title: 'Read (Cmd/Ctrl+E)', icon: <Eye size={14} /> }
]


/** Chuột phải lên chữ đang bôi đen (trong editor hoặc bản xem): dịch, tra từ điển, tìm trên Google */
function selectionMenu(e: React.MouseEvent): void {
  const img = (e.target as HTMLElement).closest('img')
  if (img && canRecognizeText()) {
    // Ảnh trong editor (chế độ Live): chèn được chữ xuống dưới ảnh; ở bản xem thì chép ra
    const view = EditorView.findFromDOM(img)
    const src = img.currentSrc || img.src
    openMenu(e, [
      { label: 'Copy Text from Image', onClick: () => void copyTextFromImage(src) },
      ...(view && !view.state.readOnly ? [{ label: 'Insert Text Below Image', onClick: () => void insertTextFromImage(view, view.posAtDOM(img), src) }] : [])
    ])
    return
  }
  if ((e.target as HTMLElement).closest('a, img, input, textarea, .cm-live-check')) return
  const picked = pickSelection()
  const inEditor = !!(e.target as HTMLElement).closest('.cm-editor')
  if (!picked || !picked.text.trim()) {
    // Không chọn gì, trong editor: chèn nhanh UUID / mật khẩu / chuỗi ngẫu nhiên
    if (!inEditor) return
    openMenu(e, [
      { label: 'Insert UUID', onClick: () => insertText(uuid(), 'UUID') },
      { label: 'Insert Random Password', onClick: () => insertText(password(), 'Password') },
      { label: 'Insert Random String', onClick: () => insertText(randomString(), 'Random string') }
    ])
    return
  }
  const transforms = picked.view && !picked.view.state.readOnly ? transformsFor(picked.text) : []
  const short = picked.text.replace(/\s+/g, ' ').trim()
  const quoted = short.length > 24 ? `${short.slice(0, 24)}…` : short
  openMenu(e, [
    { label: 'Translate', hint: isMac() ? '⌘⇧Y' : 'Ctrl+Shift+Y', onClick: () => translateSelection() },
    { label: `Look Up “${quoted}”`, hint: isMac() ? '⌃⌘D' : undefined, onClick: () => lookUpSelection() },
    { label: `Search with Google`, onClick: () => searchGoogle(picked.text) },
    ...(transforms.length ? [{ separator: true as const }, ...transforms.map((t) => ({ label: t.label, onClick: () => transformSelection(t.kind) }))] : []),
    ...(window.inknote ? [{ separator: true as const }, { label: 'Copy Selection as Image', onClick: () => void exportImage('selection', 'copy') }] : [])
  ])
}

export function NotePane(): React.JSX.Element {
  const [split, setSplit] = usePaneSize('nibmark:editor-split', 50)
  useStore((s) => s.statuses)
  const note = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined))
  const books = useStore((s) => s.books)
  const viewMode = useStore((s) => s.viewMode)
  const distractionFree = useStore((s) => s.distractionFree)
  const { updateNote, setViewMode, toggleDistractionFree, restoreNote, deleteNoteForever } = useStore.getState()
  const multiCount = useStore((s) => s.multi.length)

  const bodyRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const outlineOpen = useOutline((s) => s.open)
  const syncEnabled = !!note && !note.trashed && viewMode === 'split' && !isKanban(note.body) && multiCount <= 1
  useEffect(() => {
    if (!syncEnabled) return
    const editor = bodyRef.current?.querySelector<HTMLElement>('.cm-scroller')
    const preview = bodyRef.current?.querySelector<HTMLElement>('.note-preview')
    if (editor && preview) return syncScroll(editor, preview, () => sourceScrollAnchors(editor, preview))
  }, [note?._id, syncEnabled])

  // Chế độ chỉ xem preview: nhớ vị trí cuộn của từng ghi chú (ghi lại mỗi lần cuộn)
  const noteId = note?._id
  useLayoutEffect(() => {
    if (!noteId || viewMode !== 'preview') return
    const preview = bodyRef.current?.querySelector<HTMLElement>('.note-preview')
    if (!preview) return
    const top = previewSpot(noteId)
    if (top !== undefined) requestAnimationFrame(() => (preview.scrollTop = top))
    const onScroll = (): void => savePreviewSpot(noteId, preview.scrollTop)
    preview.addEventListener('scroll', onScroll, { passive: true })
    return () => preview.removeEventListener('scroll', onScroll)
  }, [noteId, viewMode])

  if (multiCount > 1) return <BulkPanel />

  if (!note) {
    return (
      <main className="notepane empty">
        <div className="titlebar-drag notepane-drag" />
        <div className="empty-state">
          <p>No note selected</p>
          <span>Press Cmd/Ctrl+N to create one.</span>
        </div>
      </main>
    )
  }

  const readOnly = note.trashed
  const mode: ViewMode = readOnly ? 'preview' : viewMode
  const kanban = isKanban(note.body)

  return (
    <main className="notepane">
      <header className="notepane-header titlebar-drag">
        <button
          className="icon-btn"
          title={distractionFree ? 'Exit distraction-free mode' : 'Distraction-free mode (Cmd/Ctrl+Shift+D)'}
          onClick={toggleDistractionFree}
        >
          {distractionFree ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <NavButtons />
        <span className="flex-1" />
        {!readOnly && (
          <div className="segmented view-switch" role="group" aria-label="View mode">
            {/* Ô đánh dấu trượt sang nút đang chọn */}
            <span className="seg-indicator" aria-hidden="true" style={{ transform: `translateX(${Math.max(0, VIEW_MODES.findIndex((v) => v.mode === mode)) * 38}px)` }} />
            {VIEW_MODES.map((v) => (
              <button key={v.mode} title={v.title} aria-label={v.label} aria-pressed={mode === v.mode} className={cx(mode === v.mode && 'on')} onClick={() => setViewMode(v.mode)}>
                {v.icon}
              </button>
            ))}
          </div>
        )}
        {!readOnly && (
          <button
            className={cx('icon-btn', note.pinned && 'on')}
            title={note.pinned ? 'Unpin from top' : 'Pin to top'}
            onClick={() => updateNote(note._id, { pinned: !note.pinned })}
          >
            <Pin size={15} />
          </button>
        )}
        <button
          className={cx('icon-btn', outlineOpen && 'on')}
          title={outlineOpen ? 'Hide outline (Cmd/Ctrl+Shift+O)' : 'Show outline (Cmd/Ctrl+Shift+O)'}
          aria-pressed={outlineOpen}
          onClick={toggleOutline}
        >
          <TableOfContents size={16} />
        </button>
        {noteWindowId && <OnTopButton />}
        <button className="icon-btn" title="More actions" onClick={(e) => openMenu(e, noteMenu(note), true)}>
          <EllipsisVertical size={16} />
        </button>
      </header>
      {!distractionFree && <NoteTabs />}

<div className="note-head">
      {readOnly ? (
        <div className="trash-banner">
          <Trash2 size={14} />
          <span>This note is in the Trash.</span>
          <span className="flex-1" />
          <button className="text-btn" onClick={() => restoreNote(note._id)}>
            <RotateCcw size={13} /> Restore
          </button>
          <button
            className="text-btn danger"
            onClick={() => {
              if (window.confirm(`Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`)) deleteNoteForever(note._id)
            }}
          >
            Delete Permanently
          </button>
        </div>
      ) : (
        <div className="note-meta">
          <NotebookPicker value={books[note.bookId] ? note.bookId : ''} placeholder="No notebook" onPick={(bookId) => updateNote(note._id, { bookId })} />
          <StatusPicker value={note.status} onPick={(status) => updateNote(note._id, { status })} />
          <TagInput noteId={note._id} tagIds={note.tags} />
        </div>
      )}

      <div className="note-title-row">
        <input
          className="note-title"
          title={note.title || 'Untitled'}
          value={note.title}
          placeholder="Untitled"
          readOnly={readOnly}
          spellCheck
          onChange={(e) => updateNote(note._id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              document.querySelector<HTMLElement>('.cm-content')?.focus()
            }
          }}
        />
      </div>

      </div>

      {!readOnly && !note.title && !note.body && (
        <div className="template-hint">
          <button onClick={() => useStore.getState().setPalette('templates')}>
            <LayoutTemplate size={13} /> Choose a template
          </button>
          <span>{isMac() ? '⌘T' : 'Ctrl+T'}</span>
        </div>
      )}

      <div className="note-main" ref={mainRef}>
      <div ref={bodyRef} style={{ '--editor-split': `${Math.max(20, Math.min(80, split))}%` } as CSSProperties} className={cx('note-body', `mode-${mode}`)} onContextMenu={selectionMenu}>
        {mode !== 'preview' && (
          <div className="note-editor">
            <MarkdownEditor key={note._id} docId={note._id} value={note.body} live={mode === 'live'} onChange={(body) => {
                // Bỏ qua khi nội dung không đổi (ví dụ editor vừa nhận nội dung từ bên ngoài)
                if (body !== useStore.getState().notes[note._id]?.body) updateNote(note._id, { body })
              }}
            />
          </div>
        )}
        {mode === 'split' && <ResizeHandle className="resize-editor" label="Editor width" value={split} min={20} max={80} reset={50} percent onChange={setSplit} />}
        {(mode === 'split' || mode === 'preview') && (
          <div className={cx('note-preview', kanban && 'is-kanban')}>
            {kanban ? (
              <KanbanBoard source={note.body} onChange={readOnly ? undefined : (body) => updateNote(note._id, { body })} />
            ) : (
              <Preview
                findable
                source={note.body}
                onToggleTask={readOnly ? undefined : (index) => updateNote(note._id, { body: toggleTask(note.body, index) })}
              />
            )}
          </div>
        )}
      </div>
      {/* "On this page": dựng sẵn, ẩn ngoài mép phải; mở ra chỉ là trượt vào (không dựng lại, không giật) */}
      <div className={cx('outline-dock', outlineOpen && 'open')} aria-hidden={!outlineOpen}>
        <Outline body={note.body} scope={mainRef} preferPreview={mode === 'preview'} noteId={note._id} paused={!outlineOpen} />
      </div>
      </div>
      {!readOnly && <Backlinks key={note._id} noteId={note._id} />}
      <StatusBar body={note.body} updatedAt={note.updatedAt} showCursor={mode !== 'preview'} />
    </main>
  )
}

function NavButtons(): React.JSX.Element {
  const canBack = useNav((s) => s.back.length > 0)
  const canForward = useNav((s) => s.forward.length > 0)
  const mac = isMac()
  return (
    <div className="nav-buttons">
      <button className="icon-btn" disabled={!canBack} title={mac ? 'Back (⌘⌥←)' : 'Back (Ctrl+Alt+←)'} onClick={() => goBack()}>
        <ArrowLeft size={17} />
      </button>
      <button className="icon-btn" disabled={!canForward} title={mac ? 'Forward (⌘⌥→)' : 'Forward (Ctrl+Alt+→)'} onClick={() => goForward()}>
        <ArrowRight size={17} />
      </button>
    </div>
  )
}

/** Cửa sổ ghi chú riêng (Quick Note, ⌘⇧N): ghim nổi trên mọi app, hoặc để như cửa sổ thường */
function OnTopButton(): React.JSX.Element | null {
  const [onTop, setOnTop] = useState(false)
  if (!window.inknote?.setOnTop) return null
  return (
    <button
      className={cx('icon-btn', 'window-ontop', onTop && 'on')}
      title={onTop ? 'Stop keeping this window on top' : 'Keep this window on top of other apps'}
      aria-pressed={onTop}
      onClick={async () => setOnTop((await window.inknote?.setOnTop(!onTop)) ?? false)}
    >
      <PictureInPicture2 size={15} />
    </button>
  )
}

/** Thanh trạng thái dưới ghi chú: đã lưu và sao lưu, vị trí con trỏ, số từ */
function StatusBar({ body, updatedAt, showCursor }: { body: string; updatedAt: number; showCursor: boolean }): React.JSX.Element {
  const cursor = useCursor()
  const [backup, setBackup] = useState<BackupStatus>({ lastBackupAt: null, error: null })
  useEffect(() => onBackupStatus(setBackup), [])
  const words = useMemo(() => countWords(body), [body])
  const saved = backup.error ? `Backup failed: ${backup.error}` : backup.lastBackupAt ? `Saved · backed up ${relativeTime(backup.lastBackupAt)}` : 'Saved'
  return (
    <footer className="status-bar">
      <span className={cx('status-dot', backup.error && 'error')} aria-hidden="true" />
      <span className="status-text" title={`Edited ${new Date(updatedAt).toLocaleString()}`}>
        {saved}
      </span>
      <span className="flex-1" />
      {showCursor && cursor && <span className="status-num">Ln {cursor.line}, Col {cursor.col}</span>}
      <span className="status-num">
        {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
      </span>
      <span>Markdown</span>
    </footer>
  )
}
