import { BrowserWindow } from 'electron'
import type { NativeImage } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Chụp một trang HTML (ghi chú đã dựng sẵn, tự chứa) thành ảnh PNG trong một cửa sổ ẩn.
// Trang không được chạy script của nó (CSP chặn hết) và không được điều hướng đi đâu;
// main chỉ đo chiều cao trang rồi chụp.

const WIDTH = 860
// Giới hạn chiều cao (px CSS): ảnh Retina gấp đôi, quá lớn thì trình duyệt không chụp được
const MAX_HEIGHT = 7000
const LOAD_TIMEOUT_MS = 20_000

export async function htmlToImage(html: string): Promise<{ image: NativeImage; cut: boolean }> {
  const dir = await mkdtemp(join(tmpdir(), 'inknote-image-'))
  const file = join(dir, 'note.html')
  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    // Bắt đầu thấp để chiều cao đo được là của nội dung, không phải của cửa sổ
    height: 120,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true }
  })
  try {
    const locked = html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`)
    await writeFile(file, locked, 'utf8')
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await Promise.race([
      win.loadFile(file),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading the page')), LOAD_TIMEOUT_MS))
    ])
    // Đo trong một "thế giới" riêng, không phụ thuộc trang (CSP của trang không áp vào đây)
    const height = Number(await win.webContents.executeJavaScriptInIsolatedWorld(1, [{ code: 'Math.ceil(document.documentElement.scrollHeight)' }]))
    const h = Math.max(100, Math.min(MAX_HEIGHT, Number.isFinite(height) ? height : 800))
    win.setContentSize(WIDTH, h)
    await new Promise((r) => setTimeout(r, 250))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: h })
    return { image, cut: height > MAX_HEIGHT }
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}
