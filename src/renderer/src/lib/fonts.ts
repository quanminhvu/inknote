// Font chữ toàn app: font giao diện (thanh bên, danh sách, menu, bản xem ghi chú) và font của editor.
// Chỉ dùng font đã có trên máy (không tải gì). Danh sách gợi ý chỉ hiện font máy đang có;
// muốn font khác thì gõ tên ở mục "Other…".

export interface FontOption {
  /** Giá trị lưu lại; '' = mặc định */
  value: string
  label: string
  /** Chuỗi font-family dùng trong CSS */
  css: string
}

export const UI_FONTS: FontOption[] = [
  { value: '', label: 'System (San Francisco)', css: '' },
  { value: 'Helvetica Neue', label: 'Helvetica Neue', css: "'Helvetica Neue', sans-serif" },
  { value: 'Avenir Next', label: 'Avenir Next', css: "'Avenir Next', sans-serif" },
  { value: 'Inter', label: 'Inter', css: "Inter, sans-serif" },
  { value: 'Gill Sans', label: 'Gill Sans', css: "'Gill Sans', sans-serif" },
  { value: 'Verdana', label: 'Verdana', css: 'Verdana, sans-serif' },
  { value: 'ui-rounded', label: 'SF Pro Rounded', css: 'ui-rounded, -apple-system, sans-serif' },
  { value: 'ui-serif', label: 'New York (serif)', css: 'ui-serif, Georgia, serif' },
  { value: 'Charter', label: 'Charter', css: 'Charter, Georgia, serif' },
  { value: 'Iowan Old Style', label: 'Iowan Old Style', css: "'Iowan Old Style', Georgia, serif" },
  { value: 'Georgia', label: 'Georgia', css: 'Georgia, serif' },
  { value: 'Palatino', label: 'Palatino', css: 'Palatino, Georgia, serif' },
  { value: 'Baskerville', label: 'Baskerville', css: 'Baskerville, Georgia, serif' }
]

export const EDITOR_FONTS: FontOption[] = [
  { value: '', label: 'Monospace (SF Mono)', css: '' },
  { value: 'app', label: 'Same as the app font', css: 'var(--font-ui)' },
  { value: 'Menlo', label: 'Menlo', css: 'Menlo, monospace' },
  { value: 'Monaco', label: 'Monaco', css: 'Monaco, monospace' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', css: "'JetBrains Mono', monospace" },
  { value: 'Fira Code', label: 'Fira Code', css: "'Fira Code', monospace" },
  { value: 'Courier New', label: 'Courier New', css: "'Courier New', monospace" },
  { value: 'iA Writer Duo S', label: 'iA Writer Duo', css: "'iA Writer Duo S', 'iA Writer Duo V', monospace" },
  { value: 'ui-serif', label: 'New York (serif)', css: 'ui-serif, Georgia, serif' },
  { value: 'Charter', label: 'Charter', css: 'Charter, Georgia, serif' }
]

/** Tên font người dùng gõ: bỏ ký tự có thể phá CSS */
export const cleanFontName = (name: string): string => name.replace(/["';{}()<>\\]/g, '').trim().slice(0, 60)

/** Chuỗi CSS cho một giá trị đã lưu (trong danh sách, hoặc tên font tự gõ) */
export function fontCss(value: string, list: FontOption[], fallback: string): string {
  if (!value) return ''
  const known = list.find((f) => f.value === value)
  if (known) return known.css
  const name = cleanFontName(value)
  return name ? `"${name}", ${fallback}` : ''
}

const cache = new Map<string, boolean>()
/** Máy có font này không: so độ rộng chữ mẫu với font dự phòng */
export function fontInstalled(name: string): boolean {
  if (!name || name.startsWith('ui-') || name === 'app') return true
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return true
  const sample = 'mmmmmmmmmmlli1WQ@#'
  const ok = ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `72px ${base}`
    const a = ctx.measureText(sample).width
    ctx.font = `72px "${name}", ${base}`
    return ctx.measureText(sample).width !== a
  })
  cache.set(name, ok)
  return ok
}

/** Gắn font đã chọn vào trang */
export function applyFonts(ui: string, editor: string): void {
  const root = document.documentElement
  const uiCss = fontCss(ui, UI_FONTS, '-apple-system, sans-serif')
  const edCss = fontCss(editor, EDITOR_FONTS, 'monospace')
  if (uiCss) root.style.setProperty('--font-ui', uiCss)
  else root.style.removeProperty('--font-ui')
  if (edCss) root.style.setProperty('--font-editor', edCss)
  else root.style.removeProperty('--font-editor')
  window.dispatchEvent(new Event('inknote-theme'))
}
