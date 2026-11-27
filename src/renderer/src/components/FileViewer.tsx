import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { create } from 'zustand'
import { openExternally, readFile } from '@/lib/attachments'
import type { FileDoc } from '@/lib/types'
import { isKanban } from '@/lib/kanban'
import { KanbanBoard } from './KanbanBoard'
import { Preview } from './Preview'

// Xem file đính kèm ngay trong Inknote: ảnh (bấm để xem cỡ thật), PDF, Markdown (hiện như một ghi chú),
// văn bản / mã nguồn, âm thanh, video.
// Loại khác (zip, docx…) thì không xem được ở đây, có nút mở bằng app mặc định của máy.
// Mở từ Attachments thì dùng ← → để xem file trước / sau.

interface ViewerState {
  ids: string[]
  index: number
}
const useViewer = create<ViewerState>(() => ({ ids: [], index: 0 }))
export const isFileViewerOpen = (): boolean => useViewer.getState().ids.length > 0
const close = (): void => useViewer.setState({ ids: [], index: 0 })

/** Mở trình xem cho một file, hoặc cho cả danh sách (bắt đầu ở `start`) */
export function viewFile(id: string | string[], start = 0): void {
  const ids = Array.isArray(id) ? id : [id]
  if (ids.length) useViewer.setState({ ids, index: Math.max(0, Math.min(start, ids.length - 1)) })
}

window.addEventListener('inknote-view-file', (e) => viewFile((e as CustomEvent<string>).detail))

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-sh|x-yaml|yaml|toml|sql|x-httpd-php))/
const TEXT_EXT = /\.(md|markdown|txt|csv|tsv|json|ya?ml|toml|xml|html?|css|scss|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|sql|ini|conf|log|env|gitignore)$/i
const MAX_TEXT = 2 * 1024 * 1024

type Kind = 'image' | 'pdf' | 'markdown' | 'text' | 'audio' | 'video' | 'other'
export function viewKind(d: Pick<FileDoc, 'contentType' | 'name'>): Kind {
  const t = d.contentType || ''
  if (t.startsWith('image/')) return 'image'
  if (t === 'application/pdf' || /\.pdf$/i.test(d.name)) return 'pdf'
  if (/\.(md|markdown|mdown|mkd)$/i.test(d.name) || t === 'text/markdown' || t === 'text/x-markdown') return 'markdown'
  if (t.startsWith('audio/')) return 'audio'
  if (t.startsWith('video/')) return 'video'
  if (TEXT_TYPES.test(t) || TEXT_EXT.test(d.name)) return 'text'
  return 'other'
}

const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)

export function FileViewer(): React.JSX.Element | null {
  const { ids, index } = useViewer()
  const id = ids[index]
  const [file, setFile] = useState<{ doc: FileDoc; url: string; text?: string } | null | 'missing'>(null)
  const [actual, setActual] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    let url = ''
    setFile(null)
    setActual(false)
    void readFile(id).then(async (res) => {
      if (!alive) return
      if (!res) return setFile('missing')
      const kind = viewKind(res.doc)
      // PDF: đặt đúng kiểu để trình xem PDF có sẵn của Chromium nhận
      const blob = kind === 'pdf' && res.blob.type !== 'application/pdf' ? new Blob([res.blob], { type: 'application/pdf' }) : res.blob
      url = URL.createObjectURL(blob)
      const text = kind === 'text' || kind === 'markdown' ? (res.blob.size > MAX_TEXT ? (await res.blob.slice(0, MAX_TEXT).text()) + '\n…' : await res.blob.text()) : undefined
      if (alive) setFile({ doc: res.doc, url, text })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent): void => {
      const s = useViewer.getState()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && s.ids.length > 1 && !(e.target as HTMLElement)?.closest?.('input, textarea, video, audio')) {
        e.preventDefault()
        e.stopPropagation()
        const step = e.key === 'ArrowLeft' ? -1 : 1
        useViewer.setState({ index: (s.index + step + s.ids.length) % s.ids.length })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [id])

  if (!id) return null
  const go = (step: number): void => useViewer.setState({ index: (index + step + ids.length) % ids.length })
  const doc = file && file !== 'missing' ? file.doc : null
  const kind = doc ? viewKind(doc) : null

  return (
    <div className="modal-backdrop viewer-backdrop" onMouseDown={close}>
      <div className="modal file-viewer" role="dialog" aria-label="File" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-header board-head viewer-head">
          <h2 title={doc?.name}>{doc?.name ?? (file === 'missing' ? 'Missing file' : 'Loading…')}</h2>
          {doc && <span className="library-meta">{size(doc.size)}</span>}
          {ids.length > 1 && (
            <span className="viewer-count">
              {index + 1} / {ids.length}
            </span>
          )}
          <span className="flex-1" />
          {ids.length > 1 && (
            <>
              <button className="icon-btn" title="Previous (←)" onClick={() => go(-1)}>
                <ChevronLeft size={16} />
              </button>
              <button className="icon-btn" title="Next (→)" onClick={() => go(1)}>
                <ChevronRight size={16} />
              </button>
            </>
          )}
          {doc && (
            <button className="btn" onClick={() => void openExternally(id)}>
              <ExternalLink size={13} /> Open in Default App
            </button>
          )}
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className={`viewer-body viewer-${kind ?? 'loading'}`}>
          {file === 'missing' && <p className="board-empty">This attachment no longer exists.</p>}
          {file && file !== 'missing' && kind === 'image' && (
            <img
              className={actual ? 'actual' : ''}
              src={file.url}
              alt={file.doc.name}
              title={actual ? 'Fit to window' : 'Actual size'}
              onClick={() => setActual((a) => !a)}
            />
          )}
          {file && file !== 'missing' && kind === 'pdf' && <iframe src={file.url} title={file.doc.name} />}
          {file && file !== 'missing' && kind === 'text' && <pre>{file.text}</pre>}
          {file && file !== 'missing' && kind === 'markdown' && (
            <div className={`note-preview viewer-note${isKanban(file.text ?? '') ? ' is-kanban' : ''}`}>
              {isKanban(file.text ?? '') ? <KanbanBoard source={file.text ?? ''} /> : <Preview source={file.text ?? ''} />}
            </div>
          )}
          {file && file !== 'missing' && kind === 'audio' && <audio src={file.url} controls autoPlay={false} />}
          {file && file !== 'missing' && kind === 'video' && <video src={file.url} controls />}
          {file && file !== 'missing' && kind === 'other' && (
            <div className="viewer-other">
              <p>Inknote can’t show this kind of file.</p>
              <button className="btn primary" onClick={() => void openExternally(id)}>
                <ExternalLink size={13} /> Open in Default App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
