import type { CSSProperties } from 'react'
import { ResizeHandle, usePaneSize } from './components/ResizeHandle'
import { useEffect, useRef, useState } from 'react'
import { newNoteId, useStore } from '@/lib/store'
import { cx, isMac } from '@/lib/util'
import { backupNow, exportNote, exportNotes, restoreFromBackup } from '@/lib/actions'
import { flushBackup, startBackup } from '@/lib/backup'
import { runAppleNotesImport, runImport } from '@/lib/importer'
import { runKindleImport } from '@/lib/kindle'
import { exportNoteHtml, exportNotePdf } from '@/lib/exportHtml'
import { toggleOutline } from '@/lib/outline'
import { openTodayNote } from '@/lib/dailyNote'
import { startMcpBridge } from '@/lib/mcpTools'
import { formatAtCursor, startFormatOnLeave } from '@/lib/formatNote'
import { usePresentation } from '@/lib/slides'
import { isGraphOpen, openGraph } from '@/lib/graph'
import { GraphView } from './components/GraphView'
import { Presentation } from './components/Presentation'
import { closeTab, cycleTab, gotoTab, tabsEnabled, useTabs } from '@/lib/tabs'
import { goBack, goForward } from '@/lib/navigation'
import { startSwipeNavigation } from '@/lib/swipe'
import { startHistory } from '@/lib/history'
import { HistoryPanel, isHistoryOpen, openHistory } from './components/HistoryPanel'
import { ActivityPanel, isActivityOpen } from './components/ActivityPanel'
import { IconPicker } from './components/BookIcon'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenuHost } from './components/ContextMenu'
import { TooltipHost } from './components/TooltipHost'
import { startReminders } from './lib/reminders'
import { useEditorPrefs } from './lib/editorPrefs'
import { startFocusClock } from './lib/focusTimer'
import { startScratchpadSweep } from './lib/scratchpad'
import { TranslatePanel } from './components/TranslatePanel'
import { ComparePanel, isCompareOpen } from './components/ComparePanel'
import { FlashcardReview, isReviewOpen } from './components/FlashcardReview'
import { isLockDialogOpen, LockDialog } from './components/LockViews'
import './lib/noteLock'
import { lookUpSelection, translateSelection } from './lib/utilities'
import { useLiveTranslate } from './lib/liveTranslate'
import { NoteList, stepNoteList } from './components/NoteList'
import { NotePane } from './components/NotePane'
import { Notice } from './components/Notice'
import { openPreferences, Preferences } from './components/Preferences'
import { Sidebar } from './components/Sidebar'
import { isQuickNoteWindow, noteWindowId, openInNewWindow } from './lib/windowMode'
import { QuickNoteFooter } from './components/QuickNoteFooter'
import { TodayView } from './components/TodayView'
import { usePaneSlide } from './lib/paneSlide'

/** Tiêu đề cửa sổ ghi chú riêng = tiêu đề ghi chú */
function NoteWindowTitle(): null {
  const title = useStore((s) => (noteWindowId ? s.notes[noteWindowId]?.title : undefined))
  useEffect(() => {
    document.title = title ? `${title} — Inknote` : 'Inknote'
  }, [title])
  return null
}

/** Quick Note vừa mở: đặt con trỏ vào ô tiêu đề để gõ ngay */
function QuickNoteFocus(): null {
  useEffect(() => {
    const t = setTimeout(() => document.querySelector<HTMLInputElement>('.note-title')?.focus(), 50)
    // Quick Note là panel, app có thể không ở trước nên menu không nhận ⌘W: tự đóng cửa sổ
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyW') {
        e.preventDefault()
        window.close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])
  return null
}

let started = false

export function App(): React.JSX.Element {
  const [sidebarWidth, setSidebarWidth] = usePaneSize('nibmark:sidebar-width', 228)
  const [listWidth, setListWidth] = usePaneSize('nibmark:list-width', 300)
  const ready = useStore((s) => s.ready)
  const distractionFree = useStore((s) => s.distractionFree)
  const sidebarHidden = useStore((s) => s.sidebarHidden)
  const selection = useStore((s) => s.selection)
  // Đóng/mở sidebar, chế độ tập trung: các cột trượt mượt (chỉ dịch vị trí, không tính lại bố cục)
  const appRef = useRef<HTMLDivElement>(null)
  usePaneSlide(appRef, sidebarHidden, distractionFree)
  // Nhắc việc theo giờ của task: chỉ chạy ở cửa sổ chính (tránh nhắc trùng từ cửa sổ ghi chú riêng)
  useEffect(() => (noteWindowId ? undefined : startReminders()), [])
  useEffect(() => (noteWindowId ? undefined : startFocusClock()), [])
  useEffect(() => (noteWindowId ? undefined : startScratchpadSweep()), [])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // StrictMode gọi effect hai lần khi dev; chỉ khởi tạo DB một lần
    if (!started) {
      started = true
      void useStore
        .getState()
        .init()
        .then(() => {
          if (noteWindowId) {
            // Quick Note: ghi chú chưa có trong dữ liệu, chỉ tạo bản nháp (lưu khi bắt đầu viết)
            if (isQuickNoteWindow) useStore.getState().addDraftNote(noteWindowId, new URLSearchParams(location.search).get('book'))
            useStore.setState({ selectedNoteId: noteWindowId, distractionFree: false })
            return
          }
          startBackup()
          startHistory()
          startSwipeNavigation()
          // Báo cho main là đã sẵn sàng nhận lệnh (ví dụ phím tắt ghi nhanh)
          window.inknote?.ready()
        })
    }
    const flush = (): void => {
      useStore.getState().flush()
      void flushBackup()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('blur', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('blur', flush)
    }
  }, [])

  // AI agent (MCP): chỉ cửa sổ chính nhận yêu cầu
  useEffect(() => startMcpBridge(), [])
  // Tùy chọn tự format khi rời ghi chú vừa sửa
  useEffect(() => startFormatOnLeave(), [])

  // Lệnh từ menu ứng dụng (File, Preferences)
  useEffect(() => {
    return window.inknote?.onMenu((command) => {
      const s = useStore.getState()
      if (command === 'preferences') s.setPrefsOpen(true)
      else if (command === 'new-note') s.createNote()
      else if (command === 'shortcuts') openPreferences('shortcuts')
      else if (command === 'toggle-sidebar') {
        if (s.distractionFree) s.toggleDistractionFree()
        else s.toggleSidebar()
      }
      else if (command === 'quick-note') {
        // Ghi chú mới mở trong cửa sổ Quick Note nhỏ, nổi trên app đang dùng (kiểu Apple Notes).
        // Chưa tạo ghi chú ở đây: cửa sổ Quick Note chỉ lưu khi người dùng bắt đầu viết.
        window.inknote?.openQuickNote(newNoteId(), s.bookForNewNote())
      } else if (command.startsWith('open-note:')) {
        const id = command.slice('open-note:'.length)
        if (s.notes[id]) s.openNote(id)
      } else if (command.startsWith('quick-note-closed:')) {
        // Đóng Quick Note mà chưa viết gì: xóa luôn ghi chú rỗng. Chờ một chút để
        // nội dung vừa gõ trong cửa sổ đó kịp lưu và đồng bộ sang đây.
        const id = command.slice('quick-note-closed:'.length)
        setTimeout(() => {
          const note = useStore.getState().notes[id]
          if (note && !note.title.trim() && !note.body.trim()) useStore.getState().deleteNoteForever(id)
        }, 1500)
      }
      else if (command === 'import') void runImport()
      else if (command === 'export-note') void exportNote()
      else if (command === 'export-all') void exportNotes(null)
      else if (command === 'backup-now') void backupNow()
      else if (command === 'restore') void restoreFromBackup()
      else if (command === 'import-apple-notes') void runAppleNotesImport()
      else if (command === 'import-kindle') void runKindleImport()
      else if (command === 'export-html') void exportNoteHtml()
      else if (command === 'export-pdf') void exportNotePdf()
      else if (command === 'back') goBack()
      else if (command === 'forward') goForward()
      else if (command === 'close-tab') {
        // Đang mở hộp thoại thì Cmd+W đóng hộp thoại trước
        if (s.prefsOpen) return s.setPrefsOpen(false)
        if (s.palette) return s.setPalette(null)
        const id = s.selectedNoteId
        if (tabsEnabled() && id && useTabs.getState().tabs.some((t) => t.id === id)) closeTab(id)
        else window.close()
      }
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.prefsOpen || s.palette || isHistoryOpen() || isCompareOpen() || isReviewOpen() || isLockDialogOpen() || isActivityOpen() || isGraphOpen() || usePresentation.getState().noteId) return
      // Esc trong một ô chọn/ô nhập nổi (notebook, status, tag…) chỉ đóng ô đó, không thoát chế độ tập trung
      const inPopover = !!(document.activeElement as HTMLElement | null)?.closest?.('.nbp-pop, .stp-pop, .tag-field, .kanban-input, .preview-find')
      const vimInEditor = useEditorPrefs.getState().vim && !!(document.activeElement as HTMLElement | null)?.closest?.('.cm-editor')
      if (e.key === 'Escape' && s.distractionFree && !e.defaultPrevented && !inPopover && !vimInEditor) {
        s.toggleDistractionFree()
        return
      }
      // ⌥⇧F / Alt+Shift+F: format Markdown của ghi chú đang mở (giống VS Code).
      // Bắt theo vị trí phím (e.code): trên Mac tổ hợp này gõ ra "Ï", editor sẽ chèn chữ đó nếu để lọt
      if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyF' && !(document.activeElement as HTMLElement | null)?.closest?.('input, textarea')) {
        e.preventDefault()
        e.stopPropagation()
        void formatAtCursor()
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      // macOS: phím tắt của app dùng ⌘; Ctrl để cho editor (Vim: Ctrl-d, Ctrl-u, Ctrl-v…; phím soạn thảo kiểu Emacs của macOS)
      if (isMac() && !e.metaKey && e.key !== 'Tab') return
      // Ctrl+Tab / Ctrl+Shift+Tab: chuyển tab; Cmd/Ctrl+1…9: nhảy tới tab
      if (tabsEnabled() && !e.altKey) {
        if (e.ctrlKey && e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          cycleTab(e.shiftKey ? -1 : 1)
          return
        }
        if (!e.shiftKey && /^[1-9]$/.test(e.key) && (isMac() ? e.metaKey : e.ctrlKey)) {
          if (gotoTab(Number(e.key))) {
            e.preventDefault()
            e.stopPropagation()
          }
          return
        }
      }
      // Back/forward: Cmd+Alt+←/→ ở mọi nơi; Cmd+[ / Cmd+] khi không gõ trong editor
      // (trong editor, CodeMirror dùng Cmd+[ / Cmd+] để thụt lề)
      const inEditor = !!(document.activeElement as HTMLElement | null)?.closest?.('.cm-editor')
      if ((e.altKey && e.key === 'ArrowLeft') || (!e.altKey && !inEditor && e.key === '[')) {
        e.preventDefault()
        goBack()
        return
      }
      if ((e.altKey && e.key === 'ArrowRight') || (!e.altKey && !inEditor && e.key === ']')) {
        e.preventDefault()
        goForward()
        return
      }
      // Ghi chú kế tiếp / trước đó trong danh sách: ⌃⌘↓/↑ (macOS), Ctrl+PageDown/PageUp (nơi khác)
      const step = isMac()
        ? e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0)
        : e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'PageDown' ? 1 : e.key === 'PageUp' ? -1 : 0)
      if (step && !noteWindowId) {
        e.preventDefault()
        e.stopPropagation()
        stepNoteList(step)
        return
      }
      // ⌃⌘D (macOS): tra từ điển cho đoạn đang bôi đen (chuẩn của macOS)
      if (isMac() && e.ctrlKey && e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyD') {
        e.preventDefault()
        e.stopPropagation()
        lookUpSelection()
        return
      }
      // ⌘⌥Y / Ctrl+Alt+Y: bật/tắt dịch khi đang gõ
      if (e.altKey && !e.shiftKey && e.code === 'KeyY') {
        e.preventDefault()
        e.stopPropagation()
        useLiveTranslate.getState().toggle()
        return
      }
      if (e.altKey) return
      const key = e.key.toLowerCase()
      const inField = !!(document.activeElement as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
      const current = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
      // ⌘⌫ / Ctrl+Backspace (ngoài editor và ô nhập): chuyển ghi chú vào Thùng rác
      if (key === 'backspace' && !e.shiftKey && !inEditor && !inField) {
        if (!current || current.trashed || noteWindowId) return
        e.preventDefault()
        e.stopPropagation()
        s.trashNote(current._id)
        return
      }
      // ⌘? / Ctrl+Shift+/: bảng phím tắt
      if (e.shiftKey && (key === '?' || e.code === 'Slash')) {
        e.preventDefault()
        e.stopPropagation()
        openPreferences('shortcuts')
        return
      }
      if (e.shiftKey) {
        if (key === 'n') {
          const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
          if (!note || note.trashed || noteWindowId) return
          openInNewWindow(note._id)
        } else if (key === 'd') s.toggleDistractionFree()
        else if (key === 'g') {
          if (noteWindowId) return
          openGraph()
        } else if (key === 't') {
          if (noteWindowId) return
          openTodayNote()
        } else if (key === 'o') {
          if (!s.selectedNoteId) return
          toggleOutline()
        } else if (key === 'p') {
          if (!current || current.trashed) return
          s.updateNote(current._id, { pinned: !current.pinned })
        } else if (key === 'h') {
          if (!current || current.trashed) return
          openHistory(current._id)
        } else if (key === 'y') {
          translateSelection()
        } else if (key === 'l') s.setViewMode(s.viewMode === 'live' ? 'edit' : 'live')
        else if (key === 'f') {
          if (s.distractionFree) s.toggleDistractionFree()
          requestAnimationFrame(() => searchRef.current?.focus())
        } else return
      } else if (key === 'k') {
        s.setPalette('commands')
      } else if (key === 't') {
        s.setPalette('templates')
      } else if (key === 'j') {
        const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
        if (!note || note.trashed) return
        s.setPalette('actions')
      } else if (key === 'd') {
        // ⌘D trong editor là "chọn chữ giống tiếp theo" của CodeMirror; ngoài editor thì nhân bản ghi chú
        const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
        if (inEditor || !note || note.trashed) return
        s.duplicateNote(note._id)
      } else if (key === 'n') {
        s.createNote()
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.note-title')?.focus())
      } else if (key === 'e') {
        s.setViewMode(s.viewMode === 'preview' ? 'edit' : 'preview')
      } else if (key === 'p') {
        s.setViewMode(s.viewMode === 'split' ? 'edit' : 'split')
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    // Thả file ra ngoài editor: chặn trình duyệt mở file đó thay cho app
    const blockFileDrop = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files') && !e.defaultPrevented) e.preventDefault()
    }
    window.addEventListener('dragover', blockFileDrop)
    window.addEventListener('drop', blockFileDrop)
    // Nút back/forward phụ trên chuột
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button === 3) goBack()
      else if (e.button === 4) goForward()
    }
    // capture để phím tắt toàn app chạy trước keymap của editor
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('dragover', blockFileDrop)
      window.removeEventListener('drop', blockFileDrop)
    }
  }, [])

  if (!ready) return <div className="boot" />

  if (noteWindowId) {
    return (
      <div className={cx('app', 'note-window', isQuickNoteWindow && 'quick-note', isMac() && 'mac')}>
        <NoteWindowTitle />
        {isQuickNoteWindow && <QuickNoteFocus />}
        <NotePane />
        {isQuickNoteWindow && <QuickNoteFooter />}
        <ContextMenuHost />
        <TooltipHost />
        <TranslatePanel />
        <CommandPalette />
        <HistoryPanel />
        <Notice />
      </div>
    )
  }

  return (
    <div ref={appRef} style={{ '--sidebar-size': `${sidebarWidth}px`, '--list-size': `${listWidth}px` } as CSSProperties} className={cx('app', isMac() && 'mac', distractionFree && 'distraction-free', sidebarHidden && 'sidebar-hidden')}>
      <Sidebar />
      {!distractionFree && !sidebarHidden && <ResizeHandle className="resize-sidebar" label="Sidebar width" value={sidebarWidth} min={160} max={420} reset={228} onChange={setSidebarWidth} />}
      {selection.kind === 'today' && !distractionFree ? (
        <TodayView />
      ) : (
        <>
          <NoteList searchRef={searchRef} />
          {!distractionFree && <ResizeHandle className="resize-notelist" label="Note list width" value={listWidth} min={200} max={600} reset={300} onChange={setListWidth} />}
          <NotePane />
        </>
      )}
      <ContextMenuHost />
      <TooltipHost />
      <TranslatePanel />
      <ComparePanel />
      <FlashcardReview />
      <LockDialog />
      <CommandPalette />
      <HistoryPanel />
      <ActivityPanel />
      <Presentation />
      <GraphView />
      <IconPicker />
      <Preferences />
      <Notice />
    </div>
  )
}
