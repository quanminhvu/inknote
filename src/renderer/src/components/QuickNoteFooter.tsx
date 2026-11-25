import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { ensureTodayNoteSilently } from '@/lib/dailyNote'
import { writesSettled } from '@/lib/db'
import { useStore } from '@/lib/store'
import { cx, isMac } from '@/lib/util'
import { noteWindowId } from '@/lib/windowMode'

// Chân cửa sổ Quick Note:
// - công tắc "thêm vào cuối ghi chú hôm nay": khi bật, bấm Xong sẽ chép nội dung vào ghi chú
//   hôm nay rồi bỏ ghi chú nháp, thay vì giữ thành một ghi chú riêng
// - "Mở trong app": đưa cửa sổ chính lên và mở ghi chú này
// - Xong (⌘↵) để lưu và đóng, Esc để đóng (ghi chú đã gõ vẫn được giữ, ghi chú trống bị bỏ)

const APPEND_KEY = 'nibmark:quick-append'

function readAppend(): boolean {
  try {
    return localStorage.getItem(APPEND_KEY) === '1'
  } catch {
    return false
  }
}

/** Chép tiêu đề và nội dung Quick Note vào cuối ghi chú hôm nay, rồi bỏ ghi chú nháp */
function appendToToday(id: string): void {
  const s = useStore.getState()
  const note = s.notes[id]
  if (!note) return
  const title = note.title.trim()
  const body = note.body.trim()
  if (!title && !body) return
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const block = [title ? `### ${title} · ${time}` : `### ${time}`, body].filter(Boolean).join('\n\n')
  // Lấy id trước rồi mới đọc store: ghi chú hôm nay có thể vừa được tạo
  const todayId = ensureTodayNoteSilently()
  const today = useStore.getState().notes[todayId]
  if (!today) return
  const base = today.body.replace(/\s+$/, '')
  useStore.getState().updateNote(todayId, { body: base ? `${base}\n\n${block}\n` : `${block}\n` })
  useStore.getState().flush()
  useStore.getState().deleteNoteForever(id)
}

export function QuickNoteFooter(): React.JSX.Element | null {
  const [append, setAppend] = useState(readAppend)
  const id = noteWindowId
  const mac = isMac()

  // Đóng sau khi mọi thay đổi đã ghi xong: đóng ngay thì lệnh ghi đang chạy bị huỷ
  const closeWhenSaved = async (): Promise<void> => {
    useStore.getState().flush()
    await writesSettled()
    window.close()
  }

  const done = (): void => {
    if (!id) return
    if (append) appendToToday(id)
    void closeWhenSaved()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        done()
      } else if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.cm-tooltip-autocomplete, .menu')) {
        void closeWhenSaved()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!id) return null
  return (
    <footer className="quick-footer">
      <label className={cx('quick-append', append && 'on')} title="Add this to the end of today's note instead of keeping a separate note">
        <CalendarDays size={14} />
        <span>Add to today</span>
        <button
          type="button"
          role="switch"
          aria-checked={append}
          aria-label="Add to today's note"
          className={cx('switch', append && 'on')}
          onClick={() => {
            setAppend(!append)
            try {
              localStorage.setItem(APPEND_KEY, append ? '0' : '1')
            } catch {
              // chỉ là tiện ích
            }
          }}
        >
          <span className="switch-knob" />
        </button>
      </label>
      <span className="flex-1" />
      <button
        className="text-btn"
        onClick={async () => {
          useStore.getState().flush()
          await writesSettled()
          window.inknote?.showInMain(id)
          window.close()
        }}
      >
        Open in App
      </button>
      <button className="btn primary quick-done" title={mac ? 'Done (⌘↵)' : 'Done (Ctrl+Enter)'} onClick={done}>
        Done
      </button>
    </footer>
  )
}
