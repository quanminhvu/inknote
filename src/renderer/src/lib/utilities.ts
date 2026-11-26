import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import { getActiveEditor } from './editorCommands'
import { useStore } from './store'
import { isMac } from './util'

// Tiện ích chạy trên đoạn chữ đang bôi đen: dịch (Google Dịch), tra từ điển (macOS), tìm trên Google.
// Đoạn chữ lấy từ editor đang dùng, hoặc từ phần chữ bôi đen ở bản xem (preview).

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'vi', name: 'Vietnamese' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'th', name: 'Thai' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'id', name: 'Indonesian' }
]

export const languageName = (code: string): string => LANGUAGES.find((l) => l.code === code)?.name ?? code

// ── Ngôn ngữ đích: lưu trên máy (chỉ là tiện ích) ──
const KEY = 'inknote:translate'
interface TranslatePrefs {
  /** Ngôn ngữ dịch sang */
  target: string
  /** Khi đoạn chữ đã là ngôn ngữ đích thì dịch sang ngôn ngữ này */
  fallback: string
}
function readPrefs(): TranslatePrefs {
  const base = { target: 'vi', fallback: 'en' }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TranslatePrefs>
    const ok = (c: unknown): c is string => typeof c === 'string' && LANGUAGES.some((l) => l.code === c)
    return { target: ok(saved.target) ? saved.target : base.target, fallback: ok(saved.fallback) ? saved.fallback : base.fallback }
  } catch {
    return base
  }
}
export const useTranslatePrefs = create<TranslatePrefs & { set: (p: Partial<TranslatePrefs>) => void }>((set) => ({
  ...readPrefs(),
  set: (p) => set(p)
}))
useTranslatePrefs.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ target: s.target, fallback: s.fallback }))
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
})

// ── Đoạn chữ đang chọn ──
export interface Picked {
  text: string
  /** Có khi chữ được chọn trong editor: để thay thế / chèn bản dịch */
  view?: EditorView
  from?: number
  to?: number
  /** Vị trí trên màn hình để đặt bảng dịch */
  rect: { left: number; top: number; bottom: number }
}

export function pickSelection(): Picked | null {
  const view = getActiveEditor()
  if (view?.hasFocus) {
    const { from, to } = view.state.selection.main
    if (to > from) {
      const a = view.coordsAtPos(from)
      const b = view.coordsAtPos(to) ?? a
      if (a) {
        return {
          text: view.state.sliceDoc(from, to),
          view,
          from,
          to,
          rect: { left: Math.min(a.left, b?.left ?? a.left), top: a.top, bottom: b?.bottom ?? a.bottom }
        }
      }
    }
  }
  const sel = window.getSelection()
  const text = sel?.toString() ?? ''
  if (!sel || !text.trim() || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0).getBoundingClientRect()
  return { text, rect: { left: r.left, top: r.top, bottom: r.bottom } }
}

// ── Bảng dịch ──
interface PanelState {
  picked: Picked | null
}
export const useTranslatePanel = create<PanelState>(() => ({ picked: null }))

export function closeTranslate(): void {
  useTranslatePanel.setState({ picked: null })
}

const needSelection = (): void => useStore.getState().showNotice('Select some text first.')

export function translateSelection(): void {
  const picked = pickSelection()
  if (!picked) return needSelection()
  if (!window.inknote) {
    openGoogleTranslate(picked.text)
    return
  }
  useTranslatePanel.setState({ picked })
}

export function openGoogleTranslate(text: string, target = useTranslatePrefs.getState().target): void {
  const url = `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(target)}&op=translate&text=${encodeURIComponent(text.slice(0, 2000))}`
  openUrl(url)
}

export function searchGoogle(text?: string): void {
  const q = (text ?? pickSelection()?.text ?? '').replace(/\s+/g, ' ').trim()
  if (!q) return needSelection()
  openUrl(`https://www.google.com/search?q=${encodeURIComponent(q.slice(0, 500))}`)
}

/** Tra từ điển: macOS hiện bảng Look Up cho đoạn đang bôi đen; nơi khác thì tìm định nghĩa trên Google */
export function lookUpSelection(): void {
  const picked = pickSelection()
  if (!picked) return needSelection()
  if (isMac() && window.inknote) void window.inknote.utilities.lookUp()
  else searchGoogle(`define ${picked.text}`)
}

function openUrl(url: string): void {
  if (window.inknote) void window.inknote.utilities.open(url)
  else window.open(url, '_blank', 'noopener')
}
