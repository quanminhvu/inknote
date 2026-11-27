import { useEffect, useState } from 'react'
import { Bot, HardDrive, Info, Keyboard, LayoutTemplate, Palette, Search, SquarePen, X } from 'lucide-react'
import brandIcon from '../../../../assets/icon/inknote-icon.svg'
import { backupNow, exportNotes, restoreFromBackup } from '@/lib/actions'
import { onBackupStatus } from '@/lib/backup'
import type { BackupStatus } from '@/lib/backup'
import { useStore } from '@/lib/store'
import { BUILTIN_THEMES, useTheme } from '@/lib/theme'
import type { ThemeInfo } from '@/lib/theme'
import { cx } from '@/lib/util'
import { SHORTCUT_GROUPS, shortcutText } from '@/lib/shortcuts'
import { LANGUAGES, useTranslatePrefs } from '@/lib/utilities'
import { useReminderPrefs } from '@/lib/reminders'
import { useLiveTranslate } from '@/lib/liveTranslate'
import { relativeTime } from '@/lib/util'
import { runImport } from '@/lib/importer'
import { useEditorPrefs } from '@/lib/editorPrefs'
import { NotebookPicker } from './NotebookPicker'
import type { PasteLink, WrapMode } from '@/lib/editorPrefs'

type PageId = 'appearance' | 'editor' | 'shortcuts' | 'templates' | 'agents' | 'data' | 'about'

interface PageInfo {
  id: PageId
  label: string
  /** Một câu dưới tiêu đề trang */
  description: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  /** Màu ô icon ở thanh bên */
  tint: string
  /** Từ khoá để ô tìm kiếm tìm ra trang này */
  keywords: string
  desktopOnly?: boolean
}

const PAGES: PageInfo[] = [
  { id: 'appearance', label: 'Appearance', description: 'Theme, colours and your own styles.', icon: Palette, tint: '#e0567a', keywords: 'theme dark light colour color css styles font' },
  { id: 'editor', label: 'Editor', description: 'How notes look and behave while you write.', icon: SquarePen, tint: '#2f6fe4', keywords: 'line numbers wrap spelling width tabs format paste url tasks strike translate language google reminder notification time due vim keybindings modal breaks newline compact list thumbnails font size ruler column typewriter focus dim center ia writer' },
  { id: 'shortcuts', label: 'Shortcuts', description: 'Every keyboard shortcut, and global keys that work from any app.', icon: Keyboard, tint: '#64748b', keywords: 'quick note hotkey keyboard keys shortcut cheat sheet tray show hide' },
  { id: 'templates', label: 'Templates', description: 'Starting points for new notes.', icon: LayoutTemplate, tint: '#f08c1a', keywords: 'template daily date notebook' },
  { id: 'agents', label: 'AI Agents', description: 'Let Claude and other agents work with your notes.', icon: Bot, tint: '#8b5cf6', keywords: 'mcp claude cursor ai agent' },
  { id: 'data', label: 'Backup & Data', description: 'Backups, restore, import and export.', icon: HardDrive, tint: '#16a34a', keywords: 'backup restore import export folder icloud data', desktopOnly: true },
  { id: 'about', label: 'About', description: 'Version, data location and credits.', icon: Info, tint: '#6b7280', keywords: 'about version licence license github release' }
]
const PAGE_KEY = 'nibmark:prefs-page'
const PAGE_EVENT = 'inknote:prefs-page'

/** Mở Preferences ở một trang (ví dụ bảng phím tắt) */
export function openPreferences(page?: PageId): void {
  if (page) {
    try {
      localStorage.setItem(PAGE_KEY, page)
    } catch {
      // chỉ là tiện ích
    }
    window.dispatchEvent(new CustomEvent(PAGE_EVENT, { detail: page }))
  }
  useStore.getState().setPrefsOpen(true)
}

function readPage(): PageId {
  try {
    const saved = localStorage.getItem(PAGE_KEY) as PageId | null
    return saved && PAGES.some((p) => p.id === saved) ? saved : 'appearance'
  } catch {
    return 'appearance'
  }
}

/** Ô icon màu ở thanh bên và đầu trang (kiểu System Settings của macOS) */
function Tile({ page, size = 'small' }: { page: PageInfo; size?: 'small' | 'large' }): React.JSX.Element {
  const Icon = page.icon
  return (
    <span className={cx('settings-tile', size)} style={{ '--tile': page.tint } as React.CSSProperties} aria-hidden="true">
      <Icon size={size === 'large' ? 20 : 14} strokeWidth={2} />
    </span>
  )
}

export function Preferences(): React.JSX.Element | null {
  const open = useStore((s) => s.prefsOpen)
  const setOpen = useStore((s) => s.setPrefsOpen)
  const [page, setPageState] = useState<PageId>(readPage)
  const [query, setQuery] = useState('')
  const bridge = window.inknote
  const available = PAGES.filter((p) => !p.desktopOnly || bridge)
  const q = query.trim().toLowerCase()
  const pages = q ? available.filter((p) => `${p.label} ${p.keywords}`.toLowerCase().includes(q)) : available
  const setPage = (id: PageId): void => {
    setPageState(id)
    try {
      localStorage.setItem(PAGE_KEY, id)
    } catch {
      // chỉ là tiện ích
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const onPage = (e: Event): void => {
      const id = (e as CustomEvent<PageId>).detail
      if (PAGES.some((p) => p.id === id)) setPageState(id)
    }
    window.addEventListener(PAGE_EVENT, onPage)
    return () => window.removeEventListener(PAGE_EVENT, onPage)
  }, [])

  if (!open) return null
  // Đang tìm: hiện trang đầu tiên khớp; không thì trang đã chọn
  const current = (q ? pages[0] : available.find((p) => p.id === page)) ?? available[0]

  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="settings" role="dialog" aria-label="Preferences" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings-nav" aria-label="Preference sections">
          <div className="settings-nav-title">Preferences</div>
          <label className="settings-search">
            <Search size={14} />
            <input
              value={query}
              placeholder="Search settings"
              aria-label="Search settings"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pages[0]) {
                  setPage(pages[0].id)
                  setQuery('')
                }
              }}
            />
          </label>
          <div className="settings-nav-list">
            {pages.map((p) => (
              <button
                key={p.id}
                className={cx('settings-nav-item', p.id === current?.id && 'selected')}
                aria-current={p.id === current?.id ? 'page' : undefined}
                onClick={() => {
                  setPage(p.id)
                  setQuery('')
                }}
              >
                <Tile page={p} />
                <span>{p.label}</span>
              </button>
            ))}
            {pages.length === 0 && <p className="settings-nav-empty">No settings match “{query}”.</p>}
          </div>
        </nav>
        {current && (
          <section className="settings-main">
            <header className="settings-header">
              <div className="settings-header-text">
                <h2>{current.label}</h2>
              </div>
              <button className="icon-btn" title="Close (Esc)" aria-label="Close preferences" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <div className="settings-body" key={current.id}>
              {current.id === 'appearance' && <Appearance />}
              {current.id === 'editor' && <EditorSection />}
              {current.id === 'shortcuts' && (
                <>
                  <KeyboardGuide />
                  <QuickNote />
                </>
              )}
              {current.id === 'templates' && <Templates />}
              {current.id === 'agents' && <AgentsSection />}
              {current.id === 'data' && <DataSection />}
              {current.id === 'about' && <AboutSection />}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function AboutSection(): React.JSX.Element {
  const bridge = window.inknote
  const notes = useStore((s) => Object.values(s.notes).filter((n) => !n.trashed).length)
  const books = useStore((s) => Object.keys(s.books).length)
  const report = (error: string | null): void => {
    if (error) useStore.getState().showNotice(error, 'error')
  }
  return (
    <>
      <div className="about-hero">
        <img src={brandIcon} alt="Inknote" />
        <div>
          <h3>Inknote {__APP_VERSION__}</h3>
          <p>A local-first Markdown notebook.</p>
        </div>
      </div>
      <Group title="Your library">
        <Row label="Notes" detail="Not counting the Trash">
          <span className="settings-value">{notes.toLocaleString()}</span>
        </Row>
        <Row label="Notebooks">
          <span className="settings-value">{books.toLocaleString()}</span>
        </Row>
        {bridge && (
          <Row label="Data folder" detail="Database, version history, themes and settings">
            <button className="btn" onClick={async () => report(await bridge.openDataFolder())}>
              Open Folder
            </button>
          </Row>
        )}
      </Group>
      <Group title="Project" note="Inknote is open source under the MIT License.">
        <Row label="Release notes" detail="What changed in each version">
          <a className="btn" href="https://github.com/quanminhvu/inknote/releases" target="_blank" rel="noreferrer">
            Open on GitHub
          </a>
        </Row>
        <Row label="Report a problem" detail="Opens a new issue on GitHub">
          <a className="btn" href="https://github.com/quanminhvu/inknote/issues/new" target="_blank" rel="noreferrer">
            New Issue
          </a>
        </Row>
      </Group>
    </>
  )
}

// ── Khối dựng giao diện: nhóm thẻ, dòng cài đặt, công tắc ──

function Group({ title, note, children }: { title?: string; note?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="settings-group">
      {title && <h3 className="settings-group-title">{title}</h3>}
      <div className="settings-card">{children}</div>
      {note && <p className="settings-group-note">{note}</p>}
    </div>
  )
}

function Row({ label, detail, children, disabled, stack }: { label: React.ReactNode; detail?: React.ReactNode; children?: React.ReactNode; disabled?: boolean; stack?: boolean }): React.JSX.Element {
  return (
    <div className={cx('settings-row', disabled && 'disabled', stack && 'stack')}>
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {detail && <span className="settings-row-detail">{detail}</span>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('switch', checked && 'on')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

function DataSection(): React.JSX.Element | null {
  const bridge = window.inknote
  const [settings, setSettings] = useState<InknoteSettings | null>(null)
  const [status, setStatus] = useState<BackupStatus>({ lastBackupAt: null, error: null })
  useEffect(() => {
    if (!bridge) return
    void bridge.settings.get().then(setSettings)
    return onBackupStatus(setStatus)
  }, [bridge])
  if (!bridge) return null
  const report = (error: string | null): void => {
    if (error) useStore.getState().showNotice(error, 'error')
  }
  const lastBackup = status.lastBackupAt ?? settings?.lastBackupAt ?? null
  return (
    <>
      <Group
        title="Backup"
        note={<>Every note, notebook and tag is saved as a JSON file while you work. Deleted items are moved to a &ldquo;deleted&rdquo; subfolder, never removed.</>}
      >
        <Row label="Back up continuously" detail="Keep a copy of every change in the backup folder">
          <Switch label="Back up continuously" checked={settings?.backupEnabled ?? false} onChange={async (v) => setSettings(await bridge.settings.setBackupEnabled(v))} />
        </Row>
        <Row label="Folder" detail={<code className="settings-path" title={settings?.backupDir}>{settings?.backupDir ?? '…'}</code>} stack>
          <button className="btn" onClick={async () => setSettings(await bridge.settings.chooseBackupDir())}>
            Change…
          </button>
          {settings && !settings.isDefaultDir && (
            <button className="btn" onClick={async () => setSettings(await bridge.settings.resetBackupDir())}>
              Use Default
            </button>
          )}
          <button className="btn" onClick={async () => report(await bridge.backup.open())}>
            Show in Finder
          </button>
        </Row>
        <Row
          label="Last backup"
          detail={
            <span className={status.error ? 'settings-error' : undefined}>
              {status.error ? `Failed: ${status.error}` : lastBackup ? relativeTime(lastBackup) : 'No backup yet'}
            </span>
          }
        >
          <button className="btn primary" disabled={!settings?.backupEnabled} onClick={() => void backupNow()}>
            Back Up Now
          </button>
        </Row>
      </Group>

      <Group title="Restore and move notes">
        <Row label="Restore from a backup" detail="Notes that are newer in Inknote are kept as they are">
          <button className="btn" onClick={() => void restoreFromBackup()}>
            Restore…
          </button>
        </Row>
        <Row label="Import notes" detail="Markdown, HTML and Evernote files, or a folder of them">
          <button className="btn" onClick={() => void runImport()}>
            Import…
          </button>
        </Row>
        <Row label="Export all notes" detail="Markdown files in folders that mirror your notebooks; the Trash is left out">
          <button className="btn" onClick={() => void exportNotes(null)}>
            Export…
          </button>
        </Row>
      </Group>

      <Group title="Data folder">
        <Row label="Database, version history, themes and settings" detail="Stored only on this computer">
          <button className="btn" onClick={async () => report(await bridge.openDataFolder())}>
            Open Folder
          </button>
        </Row>
      </Group>
    </>
  )
}

function ThemeSwatch({ theme, selected, onPick }: { theme: ThemeInfo | null; selected: boolean; onPick: () => void }): React.JSX.Element {
  // null = "System": nửa Mist, nửa Night
  const base = theme?.base ?? 'mist'
  return (
    <button className={cx('theme-swatch', selected && 'selected')} onClick={onPick} title={theme ? theme.name : 'Match macOS appearance'}>
      <span className="theme-sample" data-theme={base} data-theme-id={theme && !theme.id.startsWith('user:') ? theme.id : undefined} data-user-theme={theme?.id.startsWith('user:') ? theme.id.slice(5) : undefined}>
        <span className="ts-side" />
        <span className="ts-list" />
        <span className="ts-body">
          <span className="ts-line strong" />
          <span className="ts-line" />
          <span className="ts-line accent" />
        </span>
        {!theme && (
          <span className="ts-half" data-theme="night">
            <span className="ts-side" />
            <span className="ts-list" />
            <span className="ts-body">
              <span className="ts-line strong" />
              <span className="ts-line" />
              <span className="ts-line accent" />
            </span>
          </span>
        )}
      </span>
      <span className="theme-name">{theme ? theme.name : 'System'}</span>
    </button>
  )
}

function Appearance(): React.JSX.Element {
  const choice = useTheme((s) => s.choice)
  const userThemes = useTheme((s) => s.userThemes)
  const setChoice = useTheme((s) => s.setChoice)
  const bridge = window.inknote
  const report = (error: string | null): void => {
    if (error) useStore.getState().showNotice(error, 'error')
  }
  return (
    <>
      <Group title="Theme">
        <div className="settings-themes">
          <ThemeSwatch theme={null} selected={choice === 'system'} onPick={() => setChoice('system')} />
          {[...BUILTIN_THEMES, ...userThemes].map((t) => (
            <ThemeSwatch key={t.id} theme={t} selected={choice === t.id} onPick={() => setChoice(t.id)} />
          ))}
        </div>
      </Group>
      {bridge && (
        <Group title="Customize" note="Changes to theme files and styles.css show up when you come back to Inknote.">
          <Row label="Your own themes" detail="Add .css files to the themes folder">
            <button className="btn" onClick={async () => report(await bridge.themes.openFolder())}>
              Open Folder
            </button>
          </Row>
          <Row label="Custom styles" detail="Tweak any theme with your own styles.css">
            <button className="btn" onClick={async () => report(await bridge.themes.openUserStyles())}>
              Edit styles.css
            </button>
            <button className="btn" onClick={() => void useTheme.getState().reloadUserFiles()}>
              Reload
            </button>
          </Row>
        </Group>
      )}
    </>
  )
}

function ReminderSettings(): React.JSX.Element {
  const r = useReminderPrefs()
  return (
    <Group title="Reminders" note="Add a time after a task's due date, for example “- [ ] Call the bank @2026-12-01 09:00”. Inknote shows a notification at that time while it is running, or when it opens if it was closed then (up to 6 hours late).">
      <Row label="Remind me about tasks with a time">
        <Switch label="Remind me about tasks with a time" checked={r.enabled} onChange={r.setEnabled} />
      </Row>
    </Group>
  )
}

function TranslateSettings(): React.JSX.Element {
  const t = useTranslatePrefs()
  const live = useLiveTranslate()
  const options = LANGUAGES.map((l) => (
    <option key={l.code} value={l.code}>
      {l.name}
    </option>
  ))
  return (
    <Group title="Translate" note="Select text, then press ⌘⇧Y (Ctrl+Shift+Y) or choose Translate from the right-click menu. Only the selected text is sent to Google Translate, and only when you ask.">
      <Row label="Translate to">
        <select className="settings-select" value={t.target} onChange={(e) => t.set({ target: e.target.value })}>
          {options}
        </select>
      </Row>
      <Row label="Translate as you type" detail="Each line you write is translated below it, a moment after you stop typing. ⌘⌥Y (Ctrl+Alt+Y) turns it on or off">
        <Switch label="Translate as you type" checked={live.on} onChange={() => live.toggle()} />
      </Row>
      <Row label="When the text is already in that language" detail="Translate it to this language instead">
        <select className="settings-select" value={t.fallback} onChange={(e) => t.set({ fallback: e.target.value })}>
          {options}
        </select>
      </Row>
    </Group>
  )
}

function EditorSection(): React.JSX.Element {
  const p = useEditorPrefs()
  type Key = 'lineNumbers' | 'readableWidth' | 'spellcheck' | 'strikeDone' | 'codeLineNumbers' | 'tabs' | 'formatOnLeave' | 'vim' | 'breaks' | 'compactList' | 'thumbnails' | 'typewriter' | 'compactLinks'
  const sizes = [
    <option key={0} value={0}>
      Default
    </option>,
    ...[12, 13, 14, 15, 16, 17, 18, 20, 22, 24].map((n) => (
      <option key={n} value={n}>
        {n} px
      </option>
    ))
  ]
  const toggle = (key: Key, label: string, detail?: string): React.JSX.Element => (
    <Row label={label} detail={detail}>
      <Switch label={label} checked={p[key]} onChange={(v) => p.set({ [key]: v })} />
    </Row>
  )
  return (
    <>
      <Group title="Display">
        {toggle('lineNumbers', 'Line numbers')}
        {toggle('readableWidth', 'Readable line width', 'Keep lines short enough to read comfortably')}
        <Row label="Line wrapping">
          <select className="settings-select" value={p.wrap} onChange={(e) => p.set({ wrap: e.target.value as WrapMode })}>
            <option value="all">Wrap all lines</option>
            <option value="prose">Wrap text, not code or tables</option>
            <option value="none">Don&rsquo;t wrap</option>
          </select>
        </Row>
        {toggle('codeLineNumbers', 'Line numbers in preview code blocks')}
        {toggle('tabs', 'Open notes in tabs', 'Double-click a note in the list to keep it open in a tab')}
        {toggle('compactList', 'Compact note list', 'Show only the title and date of each note, no preview text')}
        {toggle('thumbnails', 'Image thumbnails in the note list', 'Show the first image of a note next to it in the list')}
        <Row label="Editor font size">
          <select className="settings-select" value={p.editorFontSize} onChange={(e) => p.set({ editorFontSize: Number(e.target.value) })}>
            {sizes}
          </select>
        </Row>
        <Row label="Preview font size">
          <select className="settings-select" value={p.previewFontSize} onChange={(e) => p.set({ previewFontSize: Number(e.target.value) })}>
            {sizes}
          </select>
        </Row>
        <Row label="Column ruler" detail="A thin line at this column in Write view, to keep lines short">
          <select className="settings-select" value={p.ruler} onChange={(e) => p.set({ ruler: Number(e.target.value) })}>
            <option value={0}>Off</option>
            {[72, 80, 100, 120].map((c) => (
              <option key={c} value={c}>
                Column {c}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group title="Writing">
        {toggle('spellcheck', 'Check spelling')}
        {toggle('strikeDone', 'Strike through completed tasks')}
        {toggle('compactLinks', 'Compact long links', 'In Write view, show long link addresses as “…” except on the line you are editing')}
        {toggle('typewriter', 'Typewriter scrolling', 'Keep the line you are writing in the middle of the screen. ⌘⌥T (Ctrl+Alt+T) turns it on with focus dimming')}
        <Row label="Focus dimming" detail="Show only what you are writing in full color">
          <select className="settings-select" value={p.dim} onChange={(e) => p.set({ dim: e.target.value as 'off' | 'paragraph' | 'sentence' })}>
            <option value="off">Off</option>
            <option value="paragraph">Current paragraph</option>
            <option value="sentence">Current sentence</option>
          </select>
        </Row>
        {toggle('vim', 'Vim keybindings', 'Normal, insert and visual modes, :w to save. The mode shows below the editor')}
        {toggle('breaks', 'Keep line breaks', 'A new line in the editor is a new line in the preview, without two spaces at the end')}
        {toggle('formatOnLeave', 'Format when leaving a note', `Tidy the Markdown of a note you edited. ${isMacFormat()}.`)}
        <Row label="Pasting a URL" detail={p.pasteLink === 'title' ? 'Inknote fetches the page once to read its title' : undefined}>
          <select className="settings-select" value={p.pasteLink} onChange={(e) => p.set({ pasteLink: e.target.value as PasteLink })}>
            <option value="title">Link with the page title</option>
            <option value="url">Link with the URL as text</option>
            <option value="plain">Paste the URL as is</option>
          </select>
        </Row>
      </Group>
      <ReminderSettings />
      <TranslateSettings />
    </>
  )
}

function Templates(): React.JSX.Element {
  const templates = useStore((s) => s.templates)
  const { renameTemplate, deleteTemplate, setTemplateBook } = useStore.getState()
  const books = useStore((s) => s.books)
  const list = Object.values(templates).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Group
      title="Your templates"
      note={
        <>
          Press {isMacKey()}T to start a note from a template. Save any note as a template from the command palette ({isMacKey()}K, &ldquo;Save
          Note as Template&rdquo;). Use {'{{date}}'}, {'{{time}}'} or {'{{weekday}}'} in a template&rsquo;s title or body.
        </>
      }
    >
      {list.length === 0 ? (
        <Row label="No templates of your own yet" detail="Five built-in templates are always available" />
      ) : (
        <ul className="pref-templates">
          {list.map((t) => (
            <li key={t._id}>
              <input
                defaultValue={t.name}
                onBlur={(e) => renameTemplate(t._id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="pref-tpl-book" title="Notes from this template go into this notebook">
                <NotebookPicker
                  value={t.bookId && books[t.bookId] ? t.bookId : ''}
                  placeholder="Current notebook"
                  showIcon={false}
                  onPick={(bookId) => setTemplateBook(t._id, bookId)}
                />
                {t.bookId && books[t.bookId] && (
                  <button className="icon-btn small" title="Use the current notebook" onClick={() => setTemplateBook(t._id, null)}>
                    <X size={12} />
                  </button>
                )}
              </span>
              <button
                className="text-btn danger"
                onClick={() => {
                  if (window.confirm(`Delete the template "${t.name}"? Notes made from it are not affected.`)) deleteTemplate(t._id)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Group>
  )
}

const isMacKey = (): string => (window.inknote?.platform === 'darwin' ? '⌘' : 'Ctrl+')

/** Đổi chuỗi phím tắt kiểu Electron thành ký hiệu dễ đọc, ví dụ ⌘⌥N */
function prettyAccelerator(acc: string): string {
  if (!acc) return 'Off'
  const mac = window.inknote?.platform === 'darwin'
  const map: Record<string, string> = mac
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Space: 'Space' }
    : { CommandOrControl: 'Ctrl', Command: 'Win', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Space' }
  const parts = acc.split('+').map((p) => map[p] ?? p)
  return mac ? parts.join('') : parts.join('+')
}

/** Ghi lại tổ hợp phím người dùng bấm thành chuỗi Electron (cần ít nhất một phím bổ trợ) */
function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  const mac = window.inknote?.platform === 'darwin'
  const mods: string[] = []
  if (e.metaKey) mods.push(mac ? 'CommandOrControl' : 'Super')
  if (e.ctrlKey) mods.push(mac ? 'Control' : 'CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const code = e.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^F\d{1,2}$/.test(code)) key = code
  else if (code === 'Space') key = 'Space'
  else if (code === 'Period') key = '.'
  else if (code === 'Comma') key = ','
  else if (code === 'Slash') key = '/'
  if (!key || (!mods.length && !/^F\d/.test(key))) return null
  return [...mods, key].join('+')
}

function KeyboardGuide(): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const f = filter.trim().toLowerCase()
  const groups = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !f || `${g.title} ${i.label} ${shortcutText(i)}`.toLowerCase().includes(f))
  })).filter((g) => g.items.length)
  return (
    <>
      <label className="settings-search keys-filter">
        <Search size={14} />
        <input value={filter} placeholder="Find a shortcut" aria-label="Find a shortcut" spellCheck={false} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {groups.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.items.map((i) => (
            <div key={i.label} className="settings-row keys-row">
              <span className="settings-row-label">{i.label}</span>
              <kbd className="keys">{shortcutText(i)}</kbd>
            </div>
          ))}
        </Group>
      ))}
      {!groups.length && <p className="settings-group-note">No shortcut matches “{filter}”.</p>}
    </>
  )
}

function QuickNote(): React.JSX.Element | null {
  const bridge = window.inknote
  const [settings, setSettings] = useState<InknoteSettings | null>(null)
  useEffect(() => {
    if (bridge) void bridge.settings.get().then(setSettings)
  }, [bridge])
  if (!bridge) return null
  return (
    <Group title="Global shortcuts" note="These work from any app while Inknote is running, even with its window closed. Click a shortcut, then press the new keys.">
      <ShortcutField kind="quickNote" label="Quick Note" note="Opens a small floating window for a new note" fallback="CommandOrControl+Alt+N" />
      <ShortcutField kind="toggleWindow" label="Show or hide Inknote" note="Brings Inknote to the front, or hides it when it is in front" />
      {settings?.traySupported && (
        <Row label="Keep running in the system tray" detail="Closing the window leaves Inknote in the tray">
          <Switch label="Keep running in the system tray" checked={settings.trayEnabled} onChange={async (v) => setSettings(await bridge.settings.setTray(v))} />
        </Row>
      )}
    </Group>
  )
}

function ShortcutField({
  kind,
  label,
  note,
  fallback
}: {
  kind: 'quickNote' | 'toggleWindow'
  label: string
  note: string
  /** Phím tắt mặc định (nếu có), để hiện nút "Use Default" */
  fallback?: string
}): React.JSX.Element | null {
  const bridge = window.inknote
  const [status, setStatus] = useState<InknoteShortcutStatus | null>(null)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (bridge) void bridge.shortcuts.get(kind).then(setStatus)
  }, [bridge, kind])

  if (!bridge) return null
  const save = async (acc: string): Promise<void> => {
    setRecording(false)
    setStatus(await bridge.shortcuts.set(acc, kind))
  }

  const state = status?.disabledForTesting
    ? 'Off in this test profile'
    : status?.error
      ? `${prettyAccelerator(status.accelerator)}: ${status.error}`
      : null
  return (
    <Row label={label} detail={state ? <span className={status?.error ? 'settings-error' : undefined}>{state}</span> : note}>
        {fallback && status?.accelerator !== fallback && (
          <button className="text-btn" onClick={() => void save(fallback)}>
            Use Default
          </button>
        )}
        {status?.accelerator && (
          <button className="text-btn" onClick={() => void save('')}>
            Turn Off
          </button>
        )}
        <button
          className={cx('shortcut-key', recording && 'recording', !status?.accelerator && !recording && 'off')}
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            e.preventDefault()
            e.stopPropagation()
            if (e.key === 'Escape') {
              setRecording(false)
              return
            }
            const acc = acceleratorFromEvent(e)
            if (acc) void save(acc)
          }}
        >
          {recording ? 'Press keys…' : prettyAccelerator(status?.accelerator ?? '')}
        </button>
    </Row>
  )
}

/** Đặt trong dấu nháy nếu đường dẫn có khoảng trắng hoặc ký tự đặc biệt của shell */
const shellQuote = (s: string): string => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

function AgentsSection(): React.JSX.Element | null {
  const bridge = window.inknote
  const [settings, setSettings] = useState<InknoteSettings | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (bridge) void bridge.settings.get().then(setSettings)
  }, [bridge])
  if (!bridge || !settings) return null
  const { command, args, env } = settings.mcpCommand
  const claudeCode = ['claude mcp add inknote', ...Object.entries(env).map(([k, v]) => `-e ${k}=${shellQuote(v)}`), '--', shellQuote(command), ...args.map(shellQuote)].join(' ')
  const desktopJson = JSON.stringify({ mcpServers: { inknote: { command, args, env } } }, null, 2)
  const copy = (key: string, value: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    })
  }
  return (
    <>
      <Group
        title="Model Context Protocol (MCP)"
        note={<>Agents can only reach Inknote from this computer and this user account. Deleted notes go to the Trash, and every edit is kept in the note&apos;s version history, so you can always undo.</>}
      >
        <Row label="Let AI agents use your notes" detail="Claude Code, Claude Desktop, Cursor and other MCP clients">
          <Switch label="Let AI agents use your notes" checked={settings.mcpEnabled} onChange={async (v) => setSettings(await bridge.settings.setMcp({ enabled: v }))} />
        </Row>
        <Row label="Allow changes" detail="Agents may create, edit and delete notes" disabled={!settings.mcpEnabled}>
          <Switch
            label="Allow changes"
            disabled={!settings.mcpEnabled}
            checked={settings.mcpAllowEdits}
            onChange={async (v) => setSettings(await bridge.settings.setMcp({ allowEdits: v }))}
          />
        </Row>
      </Group>
      {settings.mcpEnabled && (
        <Group title="Connect an agent">
          <Row label="Claude Code" detail="Run this in a terminal">
            <button className="text-btn" onClick={() => copy('code', claudeCode)}>
              {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </Row>
          <pre className="settings-snippet">{claudeCode}</pre>
          <Row label="Claude Desktop, Cursor" detail="Add this to the MCP config file">
            <button className="text-btn" onClick={() => copy('json', desktopJson)}>
              {copied === 'json' ? 'Copied' : 'Copy'}
            </button>
          </Row>
          <pre className="settings-snippet">{desktopJson}</pre>
        </Group>
      )}
    </>
  )
}

const isMacFormat = (): string => (window.inknote?.platform === 'darwin' ? '⌥⇧F formats any time' : 'Alt+Shift+F formats any time')
