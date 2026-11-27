import { isMac } from './util'

// Danh sách phím tắt để hiện trong Preferences → Shortcuts (một nguồn duy nhất cho bảng hướng dẫn).
// Phím viết kiểu "Cmd/Ctrl+Shift+O"; khi hiện ra sẽ đổi thành ⌘⇧O trên macOS, Ctrl+Shift+O ở nơi khác.
// `mac` / `other`: khi hai hệ điều hành dùng tổ hợp khác nhau.

export interface ShortcutEntry {
  label: string
  keys: string
  mac?: string
  other?: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutEntry[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { label: 'Command palette', keys: 'Cmd/Ctrl+K' },
      { label: 'Note actions', keys: 'Cmd/Ctrl+J' },
      { label: 'New note', keys: 'Cmd/Ctrl+N' },
      { label: 'New note from a template', keys: 'Cmd/Ctrl+T' },
      { label: "Open today's note", keys: 'Cmd/Ctrl+Shift+T' },
      { label: 'Preferences', keys: 'Cmd/Ctrl+,' },
      { label: 'Keyboard shortcuts', keys: 'Cmd/Ctrl+Shift+/', mac: '⌘?' }
    ]
  },
  {
    title: 'Navigate',
    items: [
      { label: 'Search notes in the list', keys: 'Cmd/Ctrl+Shift+F' },
      { label: 'Next note in the list', keys: '', mac: '⌃⌘↓', other: 'Ctrl+PageDown' },
      { label: 'Previous note in the list', keys: '', mac: '⌃⌘↑', other: 'Ctrl+PageUp' },
      { label: 'Back', keys: '', mac: '⌘⌥←  or  ⌘[', other: 'Ctrl+Alt+←' },
      { label: 'Forward', keys: '', mac: '⌘⌥→  or  ⌘]', other: 'Ctrl+Alt+→' },
      { label: 'Next tab / previous tab', keys: '', mac: '⌃Tab  /  ⌃⇧Tab', other: 'Ctrl+Tab / Ctrl+Shift+Tab' },
      { label: 'Go to tab 1–9', keys: '', mac: '⌘1 – ⌘9', other: 'Ctrl+1 – Ctrl+9' },
      { label: 'Graph of linked notes', keys: 'Cmd/Ctrl+Shift+G' }
    ]
  },
  {
    title: 'Layout and view',
    items: [
      { label: 'Show or hide the sidebar', keys: 'Cmd/Ctrl+\\' },
      { label: 'Distraction-free mode', keys: 'Cmd/Ctrl+Shift+D' },
      { label: 'Typewriter mode (line stays centered, other paragraphs dimmed)', keys: 'Cmd/Ctrl+Alt+T' },
      { label: 'Leave distraction-free mode', keys: 'Esc' },
      { label: 'On this page (outline)', keys: 'Cmd/Ctrl+Shift+O' },
      { label: 'Read view', keys: 'Cmd/Ctrl+E' },
      { label: 'Side by side', keys: 'Cmd/Ctrl+P' },
      { label: 'Live view', keys: 'Cmd/Ctrl+Shift+L' }
    ]
  },
  {
    title: 'Note',
    items: [
      { label: 'Pin or unpin', keys: 'Cmd/Ctrl+Shift+P' },
      { label: 'Duplicate (outside the editor)', keys: 'Cmd/Ctrl+D' },
      { label: 'Move to Trash (outside the editor)', keys: '', mac: '⌘⌫', other: 'Ctrl+Backspace' },
      { label: 'Open in a new window', keys: 'Cmd/Ctrl+Shift+N' },
      { label: 'Version history', keys: 'Cmd/Ctrl+Shift+H' },
      { label: 'Format document (inside a json/sql/xml… code block: that block)', keys: 'Alt+Shift+F' }
    ]
  },
  {
    title: 'Selected text',
    items: [
      { label: 'Translate with Google Translate', keys: 'Cmd/Ctrl+Shift+Y' },
      { label: 'Translate as you type (on / off)', keys: 'Cmd/Ctrl+Alt+Y' },
      { label: 'Look up in the dictionary', keys: '', mac: '⌃⌘D', other: 'Right-click → Look Up' },
      { label: 'Search with Google', keys: '', mac: 'Right-click → Search with Google', other: 'Right-click → Search with Google' },
      { label: 'Base64, URL encode/decode, decode JWT', keys: '', mac: 'Right-click the selection', other: 'Right-click the selection' },
      { label: 'Insert UUID, password or random string', keys: '', mac: 'Right-click in the editor', other: 'Right-click in the editor' },
      { label: 'Text from an image (macOS)', keys: '', mac: 'Right-click the image', other: '—' }
    ]
  },
  {
    title: 'Tools',
    items: [
      { label: 'Board: notes by status, drag to change the status', keys: '', mac: 'Sidebar → Board', other: 'Sidebar → Board' },
      { label: 'Attachments: images and files, clean up unused ones', keys: '', mac: 'Sidebar → Attachments', other: 'Sidebar → Attachments' },
      { label: 'Run a JavaScript or Python code block', keys: '', mac: 'Read view → Run', other: 'Read view → Run' },
      { label: 'Import Markdown / HTML files or a folder', keys: '', mac: 'Drop them on the window', other: 'Drop them on the window' },
      { label: 'Teleprompter: start / speed / size / mirror', keys: '', mac: 'Space  ↑↓  +−  M', other: 'Space ↑↓ +− M' }
    ]
  },
  {
    title: 'Writing',
    items: [
      { label: 'Bold', keys: 'Cmd/Ctrl+B' },
      { label: 'Italic', keys: 'Cmd/Ctrl+I' },
      { label: 'Strikethrough', keys: 'Cmd/Ctrl+Shift+X' },
      { label: 'Inline code', keys: 'Cmd/Ctrl+Shift+C' },
      { label: 'Link', keys: 'Cmd/Ctrl+Alt+K' },
      { label: 'Heading 1–6', keys: '', mac: '⌘⌥1 – ⌘⌥6', other: 'Ctrl+Alt+1 – Ctrl+Alt+6' },
      { label: 'Plain paragraph', keys: 'Cmd/Ctrl+Alt+0' },
      { label: 'Numbered list', keys: 'Cmd/Ctrl+Shift+7' },
      { label: 'Bulleted list', keys: 'Cmd/Ctrl+Shift+8' },
      { label: 'Task list', keys: 'Cmd/Ctrl+Shift+9' },
      { label: 'Quote', keys: 'Cmd/Ctrl+Shift+.' },
      { label: 'Tick or untick a task', keys: 'Cmd/Ctrl+Enter' },
      { label: 'Paste as plain text', keys: 'Cmd/Ctrl+Shift+V' },
      { label: 'Find in note', keys: 'Cmd/Ctrl+F' },
      { label: 'Select next match', keys: 'Cmd/Ctrl+D' },
      { label: 'Move line up / down', keys: '', mac: '⌥↑  /  ⌥↓', other: 'Alt+↑ / Alt+↓' },
      { label: 'Next cell in a table', keys: 'Tab' },
      { label: 'Fold / unfold the section or code block at the cursor', keys: '', mac: '⌘⌥[  /  ⌘⌥]', other: 'Ctrl+Shift+[ / Ctrl+Shift+]' },
      { label: 'Fold all / unfold all', keys: '', mac: '⌃⌥[  /  ⌃⌥]', other: 'Ctrl+Alt+[ / Ctrl+Alt+]' },
      { label: 'Table of contents: write [[toc]] on its own line', keys: '', mac: '⌘K → Insert Table of Contents', other: 'Ctrl+K → Insert Table of Contents' },
      { label: 'Vim keybindings (Preferences → Editor): leave insert mode', keys: '', mac: 'Esc  or  jk', other: 'Esc or jk' },
      { label: 'Calculate: type “= 12*3” or “12*3 =”, then', keys: 'Enter' },
      { label: 'Insert a date or time: type @today, @now, @time, @date, @monday…', keys: 'Enter' },
      { label: 'Flashcard: write “Question :: Answer” on one line; review with', keys: '', mac: '⌘K → Review Flashcards', other: 'Ctrl+K → Review Flashcards' },
      { label: 'Flashcard review: show answer / Again · Hard · Good · Easy', keys: '', mac: 'Space / 1 · 2 · 3 · 4', other: 'Space / 1 · 2 · 3 · 4' },
      { label: 'Due time for a reminder: “@2026-12-01 09:00”', keys: '', mac: '@ date time', other: '@ date time' }
    ]
  }
]

/** Phím tắt viết kiểu "Cmd/Ctrl+Shift+O" → ⌘⇧O (macOS) hoặc Ctrl+Shift+O */
export function formatShortcut(raw: string): string {
  const mac = isMac()
  const parts = raw.replace(/Cmd\/Ctrl/g, 'Mod').split('+')
  if (!mac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  const glyph: Record<string, string> = { Mod: '⌘', Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Enter: '↩', Esc: 'esc', Tab: '⇥' }
  return parts.map((p) => glyph[p] ?? (p.length === 1 ? p.toUpperCase() : p)).join('')
}

export function shortcutText(entry: ShortcutEntry): string {
  if (isMac() && entry.mac) return entry.mac
  if (!isMac() && entry.other) return entry.other
  return formatShortcut(entry.keys)
}
