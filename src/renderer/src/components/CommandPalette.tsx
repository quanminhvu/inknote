import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FileText, Hash, Heading, LayoutTemplate, ListChecks, Notebook, Palette, Search, Square, TerminalSquare } from 'lucide-react'
import { collectTasks } from '@/lib/tasks'
import { dueLabel, dueState, withoutDue } from '@/lib/dueDates'
import type { DueState } from '@/lib/dueDates'
import { toggleTask } from '@/lib/markdown'
import { backupNow, exportNote, exportNotes, restoreFromBackup } from '@/lib/actions'
import { runAppleNotesImport, runImport } from '@/lib/importer'
import { runKindleImport } from '@/lib/kindle'
import { exportImage, exportNoteHtml, exportNotePdf } from '@/lib/exportHtml'
import { fuzzyMatch } from '@/lib/fuzzy'
import { useStore } from '@/lib/store'
import { allTemplates, applyTemplate, fillPlaceholders } from '@/lib/templates'
import { Preview } from './Preview'
import { openPreferences } from './Preferences'
import { openCompare } from './ComparePanel'
import { openReview } from './FlashcardReview'
import { openLockDialog } from './LockViews'
import { lockAll } from '@/lib/noteLock'
import { insertText, password, randomString, transformSelection, uuid } from '@/lib/textTools'
import { lookUpSelection, searchGoogle, translateSelection } from '@/lib/utilities'
import { convertSelectionToTable } from '@/lib/editorKeys'
import { useLiveTranslate } from '@/lib/liveTranslate'
import { toggleFocus, useFocusTimer } from '@/lib/focusTimer'
import { KanbanBoard } from './KanbanBoard'
import { isKanban } from '@/lib/kanban'
import { BUILTIN_THEMES, useTheme } from '@/lib/theme'
import { getStatuses } from '@/lib/statuses'
import type { NoteStatus } from '@/lib/types'
import { cx, isMac, relativeTime } from '@/lib/util'
import { StatusIcon } from './StatusIcon'
import { openHistory } from './HistoryPanel'
import { openActivity } from './ActivityPanel'
import { copyId, copyNoteLink } from '@/lib/clipboard'
import { gotoHeading, headingsOf, toggleOutline } from '@/lib/outline'
import { openTodayNote } from '@/lib/dailyNote'
import { presentNote } from '@/lib/slides'
import { formatAtCursor, formatNote } from '@/lib/formatNote'
import { openGraph } from '@/lib/graph'
import { closeOtherTabs, reopenClosedTab, tabsEnabled } from '@/lib/tabs'
import { noteWindowId, openInNewWindow } from '@/lib/windowMode'
import {
  duplicateLine,
  getActiveEditor,
  joinLines,
  lowerCase,
  reverseLines,
  runEditorCommand,
  selectAllOccurrences,
  sortLines,
  sortLinesDesc,
  titleCase,
  uniqueLines,
  upperCase
} from '@/lib/editorCommands'

type Section = 'Commands' | 'Notes' | 'Notebooks' | 'Tags' | 'Status' | 'Themes' | 'Headings' | 'Templates' | 'Open Tasks'

interface Item {
  id: string
  section: Section
  label: string
  detail?: string
  shortcut?: string
  icon: React.ReactNode
  /** Từ khóa phụ để tìm, không hiển thị */
  keywords?: string
  run: () => void
  /** Xem thử khi đang chọn (dùng cho theme) */
  preview?: () => void
  /** ⌘↵: hành động phụ, palette vẫn mở (ví dụ đánh dấu task xong) */
  altRun?: () => void
  /** Nội dung xem trước bên phải (template) */
  template?: { title: string; body: string; book?: string }
  /** Nhãn hạn chót của task */
  due?: { text: string; state: DueState }
  /** Ghi chú để xem trước ở cột phải (ghi chú, task) */
  noteId?: string
}

/** Bộ lọc nhanh ở đầu bảng lệnh: mỗi bộ lọc là một tiền tố gõ tắt */
const FILTERS: { label: string; prefix: string }[] = [
  { label: 'All', prefix: '' },
  { label: 'Commands', prefix: '>' },
  { label: 'Notebooks', prefix: '@' },
  { label: 'Tags', prefix: '#' },
  { label: 'Headings', prefix: ':' },
  { label: 'Tasks', prefix: '[' }
]
const prefixOf = (raw: string): string => (['>', '@', '#', ':', '['].includes(raw[0]) ? raw[0] : '')

/** Cột xem trước ghi chú đang chọn trong bảng lệnh */
function NotePreview({ noteId }: { noteId: string }): React.JSX.Element | null {
  const note = useStore((s) => s.notes[noteId])
  const books = useStore((s) => s.books)
  const tags = useStore((s) => s.tags)
  if (!note) return null
  // Ghi chú rất dài: chỉ hiển thị phần đầu cho nhanh
  const body = note.body.length > 6000 ? note.body.slice(0, 6000) + '\n\n…' : note.body
  return (
    <div className="pal-preview pal-note-preview">
      <div className="pal-preview-book">
        {books[note.bookId]?.name ?? 'No notebook'} · edited {relativeTime(note.updatedAt)}
      </div>
      <div className="pal-preview-title">{note.title || 'Untitled'}</div>
      {note.tags.length > 0 && (
        <div className="pal-preview-tags">
          {note.tags.map((id) => tags[id] && (
            <span key={id} className="tag-chip small" style={{ '--tag': tags[id].color } as React.CSSProperties}>
              {tags[id].name}
            </span>
          ))}
        </div>
      )}
      {body.trim() ? isKanban(body) ? <KanbanBoard source={body} /> : <Preview source={body} /> : <p className="pal-empty">This note is empty.</p>}
    </div>
  )
}

function taskItems(): Item[] {
  const s = useStore.getState()
  // Task có hạn lên đầu, hạn sớm nhất trước (quá hạn → hôm nay → sắp tới); task không hạn giữ thứ tự cũ
  return collectTasks(s.notes)
    .filter((t) => !t.done)
    .map((t, order) => ({ t, order }))
    .sort((a, b) => (a.t.due && b.t.due ? a.t.due.localeCompare(b.t.due) : a.t.due ? -1 : b.t.due ? 1 : 0) || a.order - b.order)
    .map<Item>(({ t }) => ({
      id: `task:${t.noteId}:${t.line}`,
      section: 'Open Tasks',
      label: t.due ? withoutDue(t.text) || t.text : t.text,
      detail: t.noteTitle,
      noteId: t.noteId,
      keywords: t.due ? `${t.noteTitle} ${t.due} ${dueLabel(t.due)} ${dueState(t.due)} due` : t.noteTitle,
      ...(t.due ? { due: { text: dueLabel(t.due), state: dueState(t.due) } } : {}),
      icon: <Square size={15} />,
      run: () => {
        if (!s.openNote(t.noteId)) return
        // Chờ editor của ghi chú mở xong rồi nhảy tới dòng của task
        setTimeout(() => gotoHeading(t.line, -1), 60)
      },
      altRun: () => {
        const note = useStore.getState().notes[t.noteId]
        if (note) useStore.getState().updateNote(t.noteId, { body: toggleTask(note.body, t.index) })
      }
    }))
}

const mod = (): string => (isMac() ? '⌘' : 'Ctrl+')
const shift = (): string => (isMac() ? '⇧' : 'Shift+')

/** Các hành động trên một ghi chú: dùng trong palette chung và menu ⌘J. */
function noteActionItems(id: string, withTargets = false): Item[] {
  const s = useStore.getState()
  const note = s.notes[id]
  if (!note || note.trashed) return []
  const cmd = (key: string, label: string, run: () => void, shortcut?: string, keywords?: string): Item => ({
    id: `note:${key}`,
    section: 'Commands',
    label,
    shortcut,
    keywords,
    icon: <TerminalSquare size={15} />,
    run
  })
  const items: Item[] = [
    cmd('pin', note.pinned ? 'Unpin Note' : 'Pin Note to Top', () => s.updateNote(id, { pinned: !note.pinned }), undefined, 'favorite'),
    cmd('duplicate', 'Duplicate Note', () => s.duplicateNote(id), `${mod()}D`, 'copy'),
    ...(window.inknote && !noteWindowId ? [cmd('window', 'Open in New Window', () => openInNewWindow(id), `${mod()}${shift()}N`, 'separate window detach')] : []),
    cmd('save-template', 'Save Note as Template', () => {
      if (s.saveTemplate(id)) s.showNotice(`Saved "${note.title || 'Untitled'}" as a template.`)
    }),
    ...(noteWindowId ? [] : [cmd('local-graph', 'Show Note in Graph', () => openGraph('local', id), undefined, 'links network map connections local')]),
    cmd('format', 'Format Document', () => void formatNote(id), isMac() ? '⌥⇧F' : 'Alt+Shift+F', 'prettier markdown tidy clean beautify'),
    cmd('uuid', 'Insert UUID', () => insertText(uuid(), 'UUID'), '', 'guid id random generate'),
    cmd('password', 'Insert Random Password', () => insertText(password(), 'Password'), '', 'generate secret random strong'),
    cmd('random', 'Insert Random String', () => insertText(randomString(), 'Random string'), '', 'token key generate'),
    cmd('b64e', 'Base64 Encode Selection', () => transformSelection('base64-encode'), '', 'encode base64'),
    cmd('b64d', 'Base64 Decode Selection', () => transformSelection('base64-decode'), '', 'decode base64'),
    cmd('urle', 'URL Encode Selection', () => transformSelection('url-encode'), '', 'percent encode uri'),
    cmd('urld', 'URL Decode Selection', () => transformSelection('url-decode'), '', 'percent decode uri'),
    cmd('jwt', 'Decode JWT', () => transformSelection('jwt'), '', 'token bearer json web token inspect'),
    cmd('compare', 'Compare Two Selected Notes', () => {
      const ids = useStore.getState().multi
      if (ids.length === 2) openCompare(ids[0], ids[1])
      else useStore.getState().showNotice('Select exactly two notes in the list (⌘-click), then compare.')
    }, '', 'diff difference versions'),
    cmd('image-save', 'Export Note as Image…', () => void exportImage('note', 'save'), '', 'png picture screenshot share'),
    cmd('image-copy', 'Copy Note as Image', () => void exportImage('note', 'copy'), '', 'png picture screenshot share chat clipboard'),
    cmd('image-selection', 'Copy Selection as Image', () => void exportImage('selection', 'copy'), '', 'png picture screenshot share chat clipboard'),
    cmd('format-code', 'Format Code Block', () => void formatAtCursor('pretty'), isMac() ? '⌥⇧F' : 'Alt+Shift+F', 'json sql xml html css javascript typescript yaml graphql beautify pretty indent'),
    cmd('minify-code', 'Minify Code Block', () => void formatAtCursor('minify'), '', 'json sql xml html css compact one line'),
    cmd('present', 'Start Presentation', () => presentNote(id), undefined, 'slides slideshow present deck'),
    cmd('export-note', 'Export Note as Markdown…', () => void exportNote(id)),
    cmd('export-html', 'Export Note as HTML…', () => void exportNoteHtml(id), undefined, 'web page save share'),
    ...(window.inknote ? [cmd('export-pdf', 'Export Note as PDF…', () => void exportNotePdf(id), undefined, 'print document share')] : []),
    cmd('copy-link', 'Copy Note Link', () => copyNoteLink(id), undefined, 'markdown reference'),
    cmd('copy-id', 'Copy Note ID', () => copyId(id)),
    cmd('history', 'Show Version History…', () => openHistory(id), undefined, 'revisions versions restore undo diff'),
    cmd('trash', 'Move Note to Trash', () => s.trashNote(id), undefined, 'delete remove'),
    cmd('status-none', 'Set Status: None', () => s.updateNote(id, { status: 'none' }), undefined, 'clear'),
    ...getStatuses().map((st) => cmd(`status-${st.id}`, `Set Status: ${st.label}`, () => s.updateNote(id, { status: st.id })))
  ]
  if (!withTargets) return items
  // Menu ⌘J: thêm chuyển notebook và gắn/bỏ tag
  const books = Object.values(s.books)
    .filter((b) => b._id !== note.bookId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((b) => ({
      id: `move:${b._id}`,
      section: 'Notebooks',
      label: `Move to ${b.name}`,
      detail: b.parentId && s.books[b.parentId] ? `in ${s.books[b.parentId].name}` : undefined,
      icon: <Notebook size={15} />,
      run: () => s.updateNote(id, { bookId: b._id })
    }))
  const tags = Object.values(s.tags)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((t) => {
      const has = note.tags.includes(t._id)
      return {
        id: `tag:${t._id}`,
        section: 'Tags',
        label: `${has ? 'Remove' : 'Add'} Tag: ${t.name}`,
        icon: <Hash size={15} style={{ color: t.color }} />,
        run: () => s.updateNote(id, { tags: has ? note.tags.filter((x) => x !== t._id) : [...note.tags, t._id] })
      }
    })
  return [...items, ...books, ...tags]
}

function commandItems(): Item[] {
  const s = useStore.getState()
  const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
  const cmd = (id: string, label: string, run: () => void, shortcut?: string, keywords?: string): Item => ({
    id: `cmd:${id}`,
    section: 'Commands',
    label,
    shortcut,
    keywords,
    icon: <TerminalSquare size={15} />,
    run
  })
  const items: Item[] = [
    cmd('new-note', 'New Note', () => s.createNote(), `${mod()}N`, 'create add'),
    ...(noteWindowId ? [] : [cmd('today', "Open Today's Note", () => openTodayNote(), `${mod()}${shift()}T`, 'daily journal log date')]),
    ...(tabsEnabled() ? [
      cmd('reopen-tab', 'Reopen Closed Tab', () => {
        if (!reopenClosedTab()) s.showNotice('No closed tabs to reopen.')
      }, undefined, 'undo close restore'),
      ...(s.selectedNoteId ? [cmd('close-other-tabs', 'Close Other Tabs', () => closeOtherTabs(s.selectedNoteId!), undefined, 'tabs')] : [])
    ] : []),
    ...(noteWindowId ? [] : [cmd('graph', 'Open Graph View', () => openGraph(), `${mod()}${shift()}G`, 'links network map connections')]),
    cmd('outline', 'Toggle Outline', () => toggleOutline(), `${mod()}${shift()}O`, 'table of contents headings toc'),
    cmd('template', 'New Note from Template…', () => s.setPalette('templates'), `${mod()}T`, 'template'),
    cmd('search', 'Search Notes', () => document.querySelector<HTMLInputElement>('.search-box input')?.focus(), `${mod()}${shift()}F`, 'find filter'),
    cmd('live', 'Toggle Live Mode', () => s.setViewMode(useStore.getState().viewMode === 'live' ? 'edit' : 'live'), `${mod()}${shift()}L`, 'wysiwyg write formatted rich'),
    cmd('preview', 'Toggle Preview', () => s.setViewMode(useStore.getState().viewMode === 'preview' ? 'edit' : 'preview'), `${mod()}E`),
    cmd('split', 'Toggle Side-by-Side View', () => s.setViewMode(useStore.getState().viewMode === 'split' ? 'edit' : 'split'), `${mod()}P`, 'split'),
    cmd('csv-table', 'Convert Selection to Table', () => {
      const v = getActiveEditor()
      if (!v || !convertSelectionToTable(v)) useStore.getState().showNotice('Select lines of CSV or spreadsheet data first.')
    }, '', 'csv tsv excel sheets spreadsheet markdown table'),
    cmd('lock-note', 'Lock Note…', () => {
      const n = useStore.getState().selectedNoteId
      if (n) openLockDialog(n)
    }, '', 'password encrypt protect secret private'),
    cmd('lock-all', 'Lock All Notes Now', () => void lockAll().then((n) => useStore.getState().showNotice(n ? 'Locked.' : 'No locked note is open.')), '', 'password encrypt lock close'),
    cmd('review', 'Review Flashcards', () => openReview(), '', 'flashcards anki spaced repetition study learn cards'),
    cmd('focus-start', 'Start Focus Timer', () => useFocusTimer.getState().start(), '', 'pomodoro timer focus work session 25'),
    cmd('focus-pause', 'Pause or Resume Focus Timer', () => toggleFocus(), '', 'pomodoro timer'),
    cmd('focus-stop', 'Stop Focus Timer', () => useFocusTimer.getState().stop(), '', 'pomodoro timer'),
    cmd('live-translate', 'Toggle Live Translate', () => useLiveTranslate.getState().toggle(), isMac() ? '⌘⌥Y' : 'Ctrl+Alt+Y', 'translate as you type dịch google line below'),
    cmd('translate', 'Translate Selection', () => translateSelection(), isMac() ? '⌘⇧Y' : 'Ctrl+Shift+Y', 'google translate language dịch'),
    cmd('lookup', 'Look Up Selection in Dictionary', () => lookUpSelection(), isMac() ? '⌃⌘D' : '', 'define dictionary meaning word'),
    cmd('google', 'Search Selection with Google', () => searchGoogle(), '', 'web search google'),
    cmd('shortcuts', 'Keyboard Shortcuts', () => openPreferences('shortcuts'), isMac() ? '⌘?' : 'Ctrl+Shift+/', 'keys hotkeys help cheat sheet'),
    cmd('sidebar', 'Toggle Sidebar', () => s.toggleSidebar(), `${mod()}\\`, 'navigation panel hide show'),
    cmd('focus', 'Toggle Distraction-Free Mode', () => s.toggleDistractionFree(), `${mod()}${shift()}D`, 'focus zen fullscreen'),
    cmd('activity', 'Show Activity', () => openActivity(), undefined, 'statistics stats streak heatmap calendar words'),
    cmd('tasks', 'Show Open Tasks…', () => s.setPalette('tasks'), undefined, 'todo to-do checklist checkbox'),
    cmd('prefs', 'Open Preferences', () => s.setPrefsOpen(true), `${mod()},`, 'settings options'),
    cmd('import', 'Import Notes…', () => void runImport(), undefined, 'markdown html evernote enex notion bear obsidian'),
    ...(window.inknote?.platform === 'darwin' ? [cmd('import-apple', 'Import from Apple Notes…', () => void runAppleNotesImport(), undefined, 'icloud notes')] : []),
    cmd('import-kindle', 'Import Kindle Highlights…', () => void runKindleImport(), undefined, 'my clippings books reading'),
    cmd('export-all', 'Export All Notes as Markdown…', () => void exportNotes(null), undefined, 'save download'),
    cmd('backup', 'Back Up Now', () => void backupNow(), undefined, 'save'),
    cmd('restore', 'Restore from Backup…', () => void restoreFromBackup())
  ]
  if (note && !note.trashed) items.push(...noteActionItems(note._id))
  // Lệnh soạn thảo: chỉ khi đang có editor (không ở chế độ preview hay ghi chú trong thùng rác)
  if (getActiveEditor()) {
    const ed = (id: string, label: string, run: Parameters<typeof runEditorCommand>[0], shortcut?: string, keywords?: string): Item =>
      cmd(`editor-${id}`, label, () => runEditorCommand(run), shortcut, `editor ${keywords ?? ''}`)
    items.push(
      ed('sort', 'Sort Lines', sortLines, undefined, 'order alphabetical'),
      ed('sort-desc', 'Sort Lines Descending', sortLinesDesc, undefined, 'order reverse'),
      ed('reverse', 'Reverse Lines', reverseLines),
      ed('unique', 'Remove Duplicate Lines', uniqueLines, undefined, 'unique dedupe'),
      ed('join', 'Join Lines', joinLines, undefined, 'merge'),
      ed('duplicate', 'Duplicate Line', duplicateLine, `${shift()}⌥↓`, 'copy'),
      ed('upper', 'Transform to Uppercase', upperCase, undefined, 'case capital'),
      ed('lower', 'Transform to Lowercase', lowerCase, undefined, 'case small'),
      ed('title', 'Transform to Title Case', titleCase, undefined, 'case capitalize'),
      ed('occurrences', 'Select All Occurrences', selectAllOccurrences, `${mod()}${shift()}L`, 'multiple cursors')
    )
  }
  return items
}

function themeItems(): Item[] {
  const { userThemes, setChoice, preview } = useTheme.getState()
  return [
    { id: 'system', name: 'System' },
    ...BUILTIN_THEMES,
    ...userThemes
  ].map((t) => ({
    id: `theme:${t.id}`,
    section: 'Themes' as const,
    label: `Theme: ${t.name}`,
    detail: t.id === 'system' ? 'Match macOS appearance' : undefined,
    keywords: 'appearance color dark light',
    icon: <Palette size={15} />,
    run: () => setChoice(t.id),
    preview: () => preview(t.id)
  }))
}

function buildItems(mode: 'commands' | 'templates' | 'actions' | 'tasks', raw: string): { items: Item[]; query: string } {
  const s = useStore.getState()

  if (mode === 'tasks') return { items: taskItems(), query: raw }
  if (raw.startsWith('[')) return { items: taskItems(), query: raw.replace(/^\[\s?\]?\s*/, '') }

  if (mode === 'actions') {
    return { items: s.selectedNoteId ? noteActionItems(s.selectedNoteId, true) : [], query: raw }
  }

  if (mode === 'templates') {
    const note = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
    const items: Item[] = allTemplates().map((t) => ({
      id: t.id,
      section: 'Templates',
      label: t.name,
      detail: t.builtin ? 'Built-in' : 'Your template',
      icon: <LayoutTemplate size={15} />,
      run: () => applyTemplate(t),
      template: { title: fillPlaceholders(t.title), body: fillPlaceholders(t.body), book: t.bookId ? s.books[t.bookId]?.name : undefined }
    }))
    if (note && !note.trashed && (note.title || note.body)) {
      items.push({
        id: 'cmd:save-template',
        section: 'Commands',
        label: 'Save Current Note as Template',
        icon: <TerminalSquare size={15} />,
        run: () => {
          if (s.saveTemplate(note._id)) s.showNotice(`Saved "${note.title || 'Untitled'}" as a template.`)
        }
      })
    }
    return { items, query: raw }
  }

  const prefix = raw[0]
  const query = ['>', '@', '#', ':'].includes(prefix) ? raw.slice(1) : raw
  const notes = Object.values(s.notes)
    .filter((n) => !n.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<Item>((n) => ({
      id: n._id,
      section: 'Notes',
      label: n.title || 'Untitled',
      detail: `${s.books[n.bookId]?.name ?? ''} · ${relativeTime(n.updatedAt)}`,
      icon: n.status !== 'none' ? <StatusIcon status={n.status} size={15} /> : <FileText size={15} />,
      noteId: n._id,
      run: () => s.openNote(n._id),
      // ⌘↵: mở ghi chú ở cửa sổ riêng
      altRun: () => {
        openInNewWindow(n._id)
        s.setPalette(null)
      }
    }))
  const books = Object.values(s.books)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((b) => ({
      id: b._id,
      section: 'Notebooks',
      label: b.name,
      detail: b.parentId && s.books[b.parentId] ? `in ${s.books[b.parentId].name}` : undefined,
      icon: <Notebook size={15} />,
      run: () => s.select({ kind: 'book', id: b._id })
    }))
  const tags = Object.values(s.tags)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<Item>((t) => ({
      id: t._id,
      section: 'Tags',
      label: t.name,
      icon: <Hash size={15} style={{ color: t.color }} />,
      run: () => s.select({ kind: 'tag', id: t._id })
    }))
  const statuses = getStatuses().map<Item>((st) => ({
    id: `status:${st.id}`,
    section: 'Status',
    label: st.label,
    icon: <StatusIcon status={st.id as NoteStatus} size={15} />,
    run: () => s.select({ kind: 'status', status: st.id })
  }))
  const current = s.selectedNoteId ? s.notes[s.selectedNoteId] : undefined
  const headings = current
    ? headingsOf(current.body).map<Item>((h, index) => ({
        id: `heading:${h.line}`,
        section: 'Headings',
        label: `${'  '.repeat(h.level - 1)}${h.text}`,
        detail: `H${h.level}`,
        icon: <Heading size={15} />,
        run: () => gotoHeading(h.line, index)
      }))
    : []

  if (prefix === '>') return { items: [...commandItems(), ...themeItems()], query }
  if (prefix === '@') return { items: books, query }
  if (prefix === '#') return { items: tags, query }
  if (prefix === ':') return { items: headings, query }
  if (!query.trim()) {
    // Chưa gõ gì: ghi chú gần đây trước, rồi tới các lệnh hay dùng
    return { items: [...notes.slice(0, 8), ...commandItems().slice(0, 6)], query }
  }
  return { items: [...notes, ...commandItems(), ...books, ...tags, ...statuses, ...headings, ...themeItems()], query }
}

function Highlighted({ text, indices }: { text: string; indices: number[] }): React.JSX.Element {
  if (!indices.length) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="pal-hit">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}

export function CommandPalette(): React.JSX.Element | null {
  const mode = useStore((s) => s.palette)
  if (!mode) return null
  // key = mode để đổi chế độ thì làm mới toàn bộ ô nhập
  return <PaletteBody key={mode} mode={mode} />
}

function PaletteBody({ mode }: { mode: 'commands' | 'templates' | 'actions' | 'tasks' }): React.JSX.Element {
  const statusDefinitions = useStore((s) => s.statuses)
  const [raw, setRaw] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<Element | null>(document.activeElement)
  const picked = useRef(false)

  // Đổi khi hành động phụ (⌘↵) sửa dữ liệu, để danh sách được tính lại
  const [tick, setTick] = useState(0)
  const results = useMemo(() => {
    void tick
    const { items, query } = buildItems(mode, raw)
    if (!query.trim()) return items.slice(0, 80).map((item) => ({ item, indices: [] as number[] }))
    return items
      .map((item) => {
        const m = fuzzyMatch(query, item.label) ?? (item.keywords && fuzzyMatch(query, item.keywords) ? { score: -5, indices: [] } : null)
        return m ? { item, indices: m.indices, score: m.score } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
  }, [mode, raw, tick, statusDefinitions])

  const close = (): void => {
    useStore.getState().setPalette(null)
  }

  // Khi đóng: bỏ xem thử theme (nếu chưa chọn) và trả lại con trỏ cho chỗ cũ
  useEffect(() => {
    return () => {
      if (!picked.current) useTheme.getState().preview(null)
      // setTimeout thay vì requestAnimationFrame: rAF không chạy khi cửa sổ đang ở nền
      setTimeout(() => {
        const prev = returnFocus.current as HTMLElement | null
        if (useStore.getState().palette) return
        if (prev && document.contains(prev) && prev !== document.body) prev.focus()
        else document.querySelector<HTMLElement>('.cm-content')?.focus()
      }, 0)
    }
  }, [])

  useEffect(() => setActive(0), [raw])

  const current = results[active]?.item
  useEffect(() => {
    if (current?.preview) current.preview()
    else useTheme.getState().preview(null)
  }, [current])

  useLayoutEffect(() => {
    listRef.current?.querySelector('.pal-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item: Item | undefined): void => {
    if (!item) return
    picked.current = true
    close()
    // Chạy sau khi palette đóng để lệnh có thể mở palette khác (ví dụ chọn template)
    setTimeout(() => item.run(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && current?.altRun) {
      e.preventDefault()
      current.altRun()
      setTick((t) => t + 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(current)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  let lastSection: Section | null = null
  const showFilters = mode === 'commands'
  const activePrefix = prefixOf(raw)
  const setFilter = (prefix: string): void => setRaw(prefix + raw.slice(activePrefix.length).replace(/^\s*\]?\s*/, ''))
  const notePreview = (mode === 'commands' || mode === 'tasks') && current?.noteId ? current.noteId : null

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className={cx('palette', mode !== 'actions' && 'with-preview')} role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          {mode === 'templates' ? <LayoutTemplate size={16} /> : mode === 'tasks' ? <ListChecks size={16} /> : <Search size={16} />}
          <input
            autoFocus
            value={raw}
            spellCheck={false}
            placeholder={
              mode === 'templates'
                ? 'Choose a template…'
                : mode === 'tasks'
                  ? 'Find an open task…'
                  : mode === 'actions'
                  ? `Actions for “${useStore.getState().notes[useStore.getState().selectedNoteId ?? '']?.title || 'Untitled'}”…`
                  : 'Search notes, commands, notebooks, tags…'
            }
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              // Tab / ⇧Tab: đổi bộ lọc
              if (showFilters && e.key === 'Tab') {
                e.preventDefault()
                const i = FILTERS.findIndex((f) => f.prefix === activePrefix)
                setFilter(FILTERS[(i + (e.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length].prefix)
                return
              }
              onKeyDown(e)
            }}
          />
        </div>
        {showFilters && (
          <div className="pal-filters" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={f.prefix === activePrefix}
                className={cx('pal-filter', f.prefix === activePrefix && 'on')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setFilter(f.prefix)}
              >
                {f.label}
                {f.prefix && <kbd>{f.prefix}</kbd>}
              </button>
            ))}
          </div>
        )}
        <div className="pal-body">
        <div className="pal-list" ref={listRef}>
          {results.length === 0 && <div className="pal-empty">No matches</div>}
          {results.map(({ item, indices }, i) => {
            const header = item.section !== lastSection ? item.section : null
            lastSection = item.section
            return (
              <div key={item.id}>
                {header && <div className="pal-section">{header}</div>}
                <div
                  className={cx('pal-item', i === active && 'active')}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(item)}
                >
                  <span className="pal-icon">{item.icon}</span>
                  <span className="pal-label">
                    <Highlighted text={item.label} indices={indices} />
                  </span>
                  {item.due && <span className={cx('due', `due-${item.due.state}`)}>{item.due.text}</span>}
                  {item.detail && <span className="pal-detail">{item.detail}</span>}
                  {item.shortcut && <kbd className="pal-kbd">{item.shortcut}</kbd>}
                </div>
              </div>
            )
          })}
        </div>
        {notePreview && <NotePreview noteId={notePreview} />}
        {!notePreview && mode !== 'templates' && mode !== 'actions' && (
          <div className="pal-preview pal-preview-empty">
            {current ? (
              <>
                <span className="pal-preview-icon">{current.icon}</span>
                <div className="pal-preview-title">{current.label.trim()}</div>
                {current.detail && <div className="pal-preview-book">{current.detail}</div>}
                {current.shortcut && <kbd className="pal-kbd">{current.shortcut}</kbd>}
                <p>Press ↵ to {current.section === 'Commands' || current.section === 'Themes' ? 'run it' : 'open it'}.</p>
              </>
            ) : (
              <p>No matches. Try fewer letters, or another filter.</p>
            )}
          </div>
        )}
        {mode === 'templates' && current?.template && (
          <div className="pal-preview">
            <div className="pal-preview-title">{current.template.title || 'Untitled'}</div>
            {current.template.book && <div className="pal-preview-book">Goes into “{current.template.book}”</div>}
            {isKanban(current.template.body) ? <KanbanBoard source={current.template.body} /> : <Preview source={current.template.body} />}
          </div>
        )}
        </div>
        {(mode === 'tasks' || (mode === 'commands' && raw.startsWith('['))) && (
          <div className="pal-footer">
            <span>
              <kbd>↵</kbd> open note
            </span>
            <span>
              <kbd>{isMac() ? '⌘↵' : 'Ctrl+↵'}</kbd> mark done
            </span>
            <span className="flex-1" />
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        )}
        {mode === 'commands' && !raw.startsWith('[') && (
          <div className="pal-footer">
            <span>
              <kbd>↑↓</kbd> move
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            {current?.noteId && (
              <span>
                <kbd>{isMac() ? '⌘↵' : 'Ctrl+↵'}</kbd> open in new window
              </span>
            )}
            <span>
              <kbd>tab</kbd> filter
            </span>
            <span className="flex-1" />
            <span>
              <kbd>esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
