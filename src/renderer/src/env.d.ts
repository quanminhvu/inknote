/// <reference types="vite/client" />

/** Phiên bản app, lấy từ package.json lúc build */
declare const __APP_VERSION__: string

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>
  export default plugin
}

declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

interface InknoteSettings {
  backupEnabled: boolean
  backupDir: string
  isDefaultDir: boolean
  lastBackupAt: number | null
  trayEnabled: boolean
  /** Khay hệ thống chỉ có trên Windows và Linux */
  traySupported: boolean
  mcpEnabled: boolean
  mcpAllowEdits: boolean
  mcpCommand: { command: string; args: string[]; env: Record<string, string> }
}

interface InknoteImportScan {
  label: string
  docs: {
    folders: string[]
    name: string
    ext: string
    text: string
    created: number | null
    modified: number | null
    assets: Record<string, { name: string; mime: string; data: Uint8Array }>
  }[]
  skipped: { path: string; reason: string }[]
}

interface InknoteShortcutStatus {
  accelerator: string
  registered: boolean
  error: string | null
  disabledForTesting: boolean
}

interface InknoteBridge {
  platform: string
  settings: {
    get(): Promise<InknoteSettings>
    setBackupEnabled(enabled: boolean): Promise<InknoteSettings>
    chooseBackupDir(): Promise<InknoteSettings>
    resetBackupDir(): Promise<InknoteSettings>
    setTray(enabled: boolean): Promise<InknoteSettings>
    setMcp(patch: { enabled?: boolean; allowEdits?: boolean }): Promise<InknoteSettings>
  }
  mcp: {
    /** Nhận yêu cầu của AI agent; trả về hàm hủy đăng ký */
    serve(handler: (op: string, tool: string, args: unknown, allowEdits: boolean, client: string) => Promise<unknown>): () => void
  }
  backup: {
    write(upserts: unknown[], deletes: string[]): Promise<{ ok: boolean; written: number; error?: string }>
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    open(): Promise<string | null>
    /** null = người dùng hủy */
    pickAndRead(): Promise<{ docs: unknown[]; files: { meta: unknown; data: Uint8Array }[]; error?: string } | null>
    missingFiles(ids: string[]): Promise<string[]>
    writeFile(meta: unknown, bytes: Uint8Array): Promise<{ ok: boolean; written: number; error?: string }>
  }
  exporter: {
    note(title: string, content: string, attachments?: { name: string; data: Uint8Array }[]): Promise<string | null>
    html(title: string, html: string): Promise<string | null>
    pdf(title: string, html: string): Promise<string | null>
    /** Ảnh PNG của ghi chú: 'save' hỏi chỗ lưu, 'copy' chép vào clipboard. cut = ghi chú quá dài, ảnh bị cắt */
    image(title: string, html: string, mode: 'save' | 'copy'): Promise<{ path: string | null; cut: boolean } | null>
    tree(
      label: string,
      files: { folders: string[]; name: string; content: string }[],
      attachments?: { name: string; data: Uint8Array }[]
    ): Promise<{ path: string; count: number } | null>
  }
  files: {
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    open(id: string, name: string, bytes: Uint8Array): Promise<string | null>
  }
  /** Mở một ghi chú trong cửa sổ riêng */
  openNoteWindow(id: string): void
  /** Mở ghi chú trong cửa sổ Quick Note nhỏ, nổi trên mọi app */
  openQuickNote(id: string, bookId: string): void
  /** Ghim cửa sổ hiện tại nổi trên mọi app (true) hoặc bỏ ghim; trả về trạng thái mới */
  setOnTop(onTop: boolean): Promise<boolean>
  /** Đưa cửa sổ chính lên trước và mở ghi chú này */
  showInMain(id: string): void
  utilities: {
    /** Dịch bằng Google Dịch; `from` là ngôn ngữ nguồn Google đoán ra */
    translate(text: string, target: string, source?: string): Promise<{ text: string; from: string } | { error: string }>
    /** Mở trang Google Dịch / Google tìm kiếm trên trình duyệt */
    open(url: string): Promise<boolean>
    /** macOS: bảng tra từ điển cho đoạn đang bôi đen */
    lookUp(): Promise<boolean>
    /** macOS: nhận dạng chữ trong ảnh (byte của ảnh, hoặc link http/https) */
    ocr(image: Uint8Array | string): Promise<{ text: string } | { error: string }>
  }
  web: {
    /** Tiêu đề trang web (og:title hoặc <title>), null nếu không lấy được */
    title(url: string): Promise<string | null>
    /** Đoạn code từ link GitHub có dải dòng (#L10-L25) */
    githubSnippet(url: string): Promise<{ code: string; path: string; start: number; end: number } | null>
  }
  themes: {
    list(): Promise<{ id: string; name: string; base: 'mist' | 'night' | 'paper' | 'ink' | 'indigo' | 'stone'; css: string }[]>
    /** Cho cửa sổ (lớp trong mờ) theo sáng/tối của theme; 'system' = theo macOS */
    setAppearance(mode: 'light' | 'dark' | 'system'): void
    /** Trả về thông báo lỗi, hoặc null nếu mở được */
    openFolder(): Promise<string | null>
    getUserStyles(): Promise<string>
    openUserStyles(): Promise<string | null>
  }
  shortcuts: {
    get(kind?: 'quickNote' | 'toggleWindow'): Promise<InknoteShortcutStatus>
    set(accelerator: string, kind?: 'quickNote' | 'toggleWindow'): Promise<InknoteShortcutStatus>
  }
  ready(): void
  /** Mở thư mục dữ liệu của app; trả về thông báo lỗi hoặc null */
  /** Chữ thuần trong clipboard (dùng cho ⌘⇧V dán chữ thuần) */
  readClipboardText(): Promise<string>
  openDataFolder(): Promise<string | null>
  importer: {
    /** null = người dùng hủy */
    pick(): Promise<InknoteImportScan | null>
    /** Đọc Apple Notes (macOS sẽ hỏi quyền ở lần đầu) */
    appleNotes(): Promise<InknoteImportScan | { error: string }>
    /** Chọn và đọc file "My Clippings.txt" */
    kindlePick(): Promise<{ text: string } | { error: string } | null>
  }
  onMenu(callback: (command: string) => void): () => void
}

interface Window {
  /** Không có khi chạy giao diện ngoài Electron (ví dụ bản xem thử trên trình duyệt) */
  inknote?: InknoteBridge
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'
  export const gfm: TurndownService.Plugin
  export const tables: TurndownService.Plugin
  export const strikethrough: TurndownService.Plugin
  export const taskListItems: TurndownService.Plugin
}
