import { BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

// Chạy khối code trong ghi chú (giống plugin code-runner), chỉ khi người dùng bấm Run.
// - JavaScript: trong một cửa sổ ẩn riêng (sandbox, không preload, không Node, trang trắng): không đụng được
//   ghi chú hay dữ liệu của app. Quá 5 giây thì dừng.
// - Python: chạy python3 có sẵn trên máy ở chế độ cô lập (-I), trong thư mục tạm. Quá 10 giây thì dừng.

const MAX_CODE = 100_000
const MAX_OUT = 64 * 1024

export interface RunResult {
  ok: boolean
  output: string
  ms: number
}

const clip = (s: string): string => (s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n… (output cut)` : s)

async function runJs(code: string): Promise<RunResult> {
  const started = Date.now()
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true } })
  const lines: string[] = []
  let failed = false
  win.webContents.on('console-message', (e) => {
    const { message, level } = e as unknown as { message: string; level: string | number }
    // Cảnh báo của chính Electron (chỉ có khi chạy bản dev), không phải output của code
    if (/^Electron Security Warning/.test(String(message))) return
    const isError = level === 'error' || level === 3
    if (isError) failed = true
    lines.push(String(message))
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await win.loadURL('about:blank')
    const prelude = `const __fmt = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x + 'n' : x, 2) ?? String(v) } catch { return String(v) } })();
for (const k of ['log', 'info', 'warn', 'error', 'debug']) { const o = console[k].bind(console); console[k] = (...a) => o(a.map(__fmt).join(' ')) }`
    const script = `${prelude}
(async () => { try { const __r = await (async () => {
${code}
})(); if (__r !== undefined) console.log(__r) } catch (e) { console.error(e && e.stack ? String(e.stack).split('\\n').slice(0, 4).join('\\n') : String(e)) } })()`
    await Promise.race([
      win.webContents.executeJavaScript(script, true),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    // Cho console kịp đẩy các dòng cuối
    await new Promise((r) => setTimeout(r, 30))
    return { ok: !failed, output: clip(lines.join('\n')), ms: Date.now() - started }
  } catch (err) {
    const timeout = err instanceof Error && err.message === 'timeout'
    return { ok: false, output: clip([...lines, timeout ? 'Stopped: the code ran for more than 5 seconds.' : String(err)].join('\n')), ms: Date.now() - started }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

function pythonPath(): string | null {
  for (const p of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3']) if (existsSync(p)) return p
  return process.platform === 'win32' ? 'python' : null
}

function runPython(code: string): Promise<RunResult> {
  const started = Date.now()
  const python = pythonPath()
  if (!python) return Promise.resolve({ ok: false, output: 'Python 3 was not found on this computer.', ms: 0 })
  return new Promise((resolve) => {
    execFile(
      python,
      ['-I', '-c', code],
      { timeout: 10_000, maxBuffer: 1024 * 1024, cwd: tmpdir(), env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', PYTHONIOENCODING: 'utf-8', HOME: tmpdir() } },
      (err, stdout, stderr) => {
        const timedOut = !!err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed
        const out = [stdout, stderr].filter(Boolean).join(stdout && stderr ? '\n' : '').replace(/\n$/, '')
        resolve({
          ok: !err,
          output: clip(timedOut ? `${out}\nStopped: the code ran for more than 10 seconds.`.trim() : out || (err ? String(err.message) : '')),
          ms: Date.now() - started
        })
      }
    )
  })
}

export function registerCodeRunner(): void {
  ipcMain.handle('util:runCode', (_e, lang: unknown, code: unknown) => {
    if (typeof code !== 'string' || code.length > MAX_CODE) return { ok: false, output: 'This code block is too large to run.', ms: 0 }
    if (lang === 'js') return runJs(code)
    if (lang === 'python') return runPython(code)
    return { ok: false, output: 'Only JavaScript and Python can run.', ms: 0 }
  })
}
