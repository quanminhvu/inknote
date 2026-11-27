import { create } from 'zustand'

/**
 * Tùy chọn hiển thị của editor. Lưu riêng trong localStorage (chỉ là tiện ích
 * trên máy này, không nằm trong backup).
 *
 * wrap: 'all'   = ngắt mọi dòng dài
 *       'prose' = ngắt văn bản, giữ nguyên dòng của khối code và bảng (cuộn ngang)
 *       'none'  = không ngắt dòng nào
 */
export type WrapMode = 'all' | 'prose' | 'none'
/** Dán một URL: lấy tiêu đề trang làm chữ link, dùng chính URL làm chữ link, hoặc giữ nguyên URL */
export type PasteLink = 'title' | 'url' | 'plain'

export interface EditorPrefs {
  lineNumbers: boolean
  /** Giới hạn độ rộng dòng cho dễ đọc */
  readableWidth: boolean
  spellcheck: boolean
  /** Gạch ngang task đã xong, trong editor và preview */
  strikeDone: boolean
  wrap: WrapMode
  pasteLink: PasteLink
  /** Số dòng trong khối code ở preview */
  codeLineNumbers: boolean
  /** Mở ghi chú thành tab phía trên khung ghi chú */
  tabs: boolean
  /** Tự format Markdown của ghi chú vừa sửa khi chuyển sang ghi chú khác */
  formatOnLeave: boolean
  /** Phím tắt kiểu Vim trong editor */
  vim: boolean
  /** Xuống dòng trong editor là xuống dòng ở bản xem (không cần hai dấu cách cuối dòng) */
  breaks: boolean
  /** Danh sách ghi chú gọn: chỉ tiêu đề và ngày, không có đoạn trích */
  compactList: boolean
  /** Ảnh thu nhỏ (ảnh đầu tiên của ghi chú) trong danh sách ghi chú */
  thumbnails: boolean
  /** Cỡ chữ editor / bản xem (px); 0 = mặc định của theme */
  editorFontSize: number
  previewFontSize: number
  /** Vạch dọc ở cột này trong editor (chế độ Write); 0 = tắt */
  ruler: number
  /** Chế độ máy đánh chữ: dòng đang gõ luôn ở giữa màn hình */
  typewriter: boolean
  /** Làm nhạt phần không đang viết */
  dim: 'off' | 'paragraph' | 'sentence'
  /** Rút gọn địa chỉ link dài ở chế độ Write */
  compactLinks: boolean
  /** Bấm vào file đính kèm: xem ngay trong Inknote, hay mở bằng app mặc định của máy */
  openFiles: 'inknote' | 'default'
}

const KEY = 'nibmark:editor'

const defaults: EditorPrefs = {
  lineNumbers: true,
  readableWidth: false,
  spellcheck: true,
  strikeDone: true,
  wrap: 'all',
  pasteLink: 'title',
  codeLineNumbers: true,
  tabs: true,
  formatOnLeave: false,
  vim: false,
  breaks: false,
  compactList: false,
  thumbnails: true,
  editorFontSize: 0,
  previewFontSize: 0,
  ruler: 0,
  typewriter: false,
  dim: 'off',
  compactLinks: true,
  openFiles: 'inknote'
}

function read(): EditorPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<EditorPrefs>
    const merged = { ...defaults, ...saved }
    if (!['all', 'prose', 'none'].includes(merged.wrap)) merged.wrap = 'all'
    if (!['title', 'url', 'plain'].includes(merged.pasteLink)) merged.pasteLink = 'title'
    const px = (v: unknown): number => (typeof v === 'number' && v >= 10 && v <= 32 ? Math.round(v) : 0)
    merged.editorFontSize = px(merged.editorFontSize)
    merged.previewFontSize = px(merged.previewFontSize)
    merged.ruler = [0, 72, 80, 100, 120].includes(merged.ruler as number) ? merged.ruler : 0
    if (!['off', 'paragraph', 'sentence'].includes(merged.dim)) merged.dim = 'off'
    if (!['inknote', 'default'].includes(merged.openFiles)) merged.openFiles = 'inknote'
    return merged
  } catch {
    return defaults
  }
}

interface State extends EditorPrefs {
  set: (patch: Partial<EditorPrefs>) => void
}

export const useEditorPrefs = create<State>((set) => ({
  ...read(),
  set: (patch) => set(patch)
}))

useEditorPrefs.subscribe((s) => {
  const prefs: EditorPrefs = {
    lineNumbers: s.lineNumbers,
    readableWidth: s.readableWidth,
    spellcheck: s.spellcheck,
    strikeDone: s.strikeDone,
    wrap: s.wrap,
    pasteLink: s.pasteLink,
    codeLineNumbers: s.codeLineNumbers,
    tabs: s.tabs,
    formatOnLeave: s.formatOnLeave,
    vim: s.vim,
    breaks: s.breaks,
    compactList: s.compactList,
    thumbnails: s.thumbnails,
    editorFontSize: s.editorFontSize,
    previewFontSize: s.previewFontSize,
    ruler: s.ruler,
    typewriter: s.typewriter,
    dim: s.dim,
    compactLinks: s.compactLinks,
    openFiles: s.openFiles
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
})

/** Bật/tắt chế độ máy đánh chữ (giữ dòng ở giữa + làm nhạt đoạn khác) */
export function toggleTypewriter(): boolean {
  const p = useEditorPrefs.getState()
  const on = !(p.typewriter || p.dim !== 'off')
  p.set({ typewriter: on, dim: on ? 'paragraph' : 'off' })
  return on
}
