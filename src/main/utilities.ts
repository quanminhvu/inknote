import { BrowserWindow, ipcMain, net, shell } from 'electron'

// Tiện ích: dịch (Google Dịch), tra từ điển macOS, mở trang tìm kiếm / dịch trên trình duyệt.
// Chỉ gửi đi đúng đoạn chữ người dùng chọn, và chỉ khi họ bấm dịch.

const MAX_CHARS = 5000
const LANG = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/

export interface TranslateResult {
  text: string
  /** Ngôn ngữ nguồn Google đoán ra, ví dụ "en" */
  from: string
}

type Attempt = TranslateResult | { error: string; busy?: boolean }

async function post(url: string, text: string, parse: (data: unknown) => { text: string; from?: string } | null, sl: string): Promise<Attempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    // Gửi chữ trong thân yêu cầu (POST), không đưa vào URL
    const res = await net.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ q: text }).toString(),
      signal: controller.signal
    })
    if (res.status === 429) return { error: 'Google Translate is busy. Try again in a moment.', busy: true }
    if (!res.ok) return { error: `Google Translate answered ${res.status}.`, busy: true }
    const out = parse(await res.json())
    if (!out) return { error: 'Unexpected answer from Google Translate.', busy: true }
    return { text: out.text, from: out.from ?? sl }
  } catch {
    return { error: controller.signal.aborted ? 'Google Translate did not answer in time.' : 'Could not reach Google Translate. Check your connection.' }
  } finally {
    clearTimeout(timer)
  }
}

/** Kiểu trả về của cổng "gtx": [[["bản dịch","gốc",…],…], null, "en", …] */
function parseGtx(data: unknown): { text: string; from?: string } | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null
  const text = (data[0] as unknown[]).map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : '')).join('')
  return { text, from: typeof data[2] === 'string' ? data[2] : undefined }
}

/** Kiểu trả về của cổng "dict-chrome-ex": [["bản dịch","en"]] (tự nhận ngôn ngữ) hoặc ["bản dịch"] */
function parseDict(data: unknown): { text: string; from?: string } | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const first = data[0] as unknown
  if (typeof first === 'string') return { text: first }
  if (Array.isArray(first) && typeof first[0] === 'string') return { text: first[0], from: typeof first[1] === 'string' ? first[1] : undefined }
  return null
}

/**
 * Dịch qua cổng dịch miễn phí của Google (không cần khoá API). Cổng này không chính thức và đôi khi
 * từ chối khi bị gọi nhiều (429), nên thử lần lượt hai cổng.
 */
export async function translate(raw: unknown, target: unknown, source: unknown = 'auto'): Promise<TranslateResult | { error: string }> {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Nothing to translate.' }
  if (typeof target !== 'string' || !LANG.test(target)) return { error: 'Unknown target language.' }
  const sl = typeof source === 'string' && (source === 'auto' || LANG.test(source)) ? source : 'auto'
  const text = raw.slice(0, MAX_CHARS)
  const q = `sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(target)}`
  const first = await post(`https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&${q}`, text, parseGtx, sl)
  if ('text' in first || !first.busy) return 'text' in first ? first : { error: first.error }
  const second = await post(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&${q}`, text, parseDict, sl)
  return 'text' in second ? second : { error: second.error }
}

/** Chỉ mở các trang của tiện ích (dịch, tìm kiếm), không mở địa chỉ bất kỳ do renderer gửi */
const ALLOWED = [/^https:\/\/translate\.google\.com\//, /^https:\/\/www\.google\.com\/search\?/]

export function registerUtilities(): void {
  ipcMain.handle('util:translate', (_e, text: unknown, target: unknown, source: unknown) => translate(text, target, source))
  ipcMain.handle('util:open', (_e, url: unknown) => {
    if (typeof url !== 'string' || url.length > 8000 || !ALLOWED.some((r) => r.test(url))) return false
    void shell.openExternal(url)
    return true
  })
  // Tra từ điển: macOS hiện bảng Look Up cho đoạn đang bôi đen trong cửa sổ
  ipcMain.handle('util:lookUp', (event) => {
    if (process.platform !== 'darwin') return false
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    win.webContents.showDefinitionForSelection()
    return true
  })
}
