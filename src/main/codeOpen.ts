import { dialog, shell, BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize, sep } from 'node:path'

// Mở một file code (đường dẫn viết trong ghi chú, ví dụ `src/app.ts:42`) bằng app soạn code, đúng dòng, đúng cột.
// Đường dẫn tương đối được tìm trong các thư mục dự án người dùng chọn ở Preferences. Không đọc nội dung file.

export type CodeEditor = 'vscode' | 'cursor' | 'windsurf' | 'zed'
const SCHEMES: Record<CodeEditor, string> = { vscode: 'vscode', cursor: 'cursor', windsurf: 'windsurf', zed: 'zed' }
const NAMES: Record<CodeEditor, string> = { vscode: 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', zed: 'Zed' }

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Đường dẫn trong ghi chú → đường dẫn tuyệt đối của file có thật, hoặc null */
export function resolveCodePath(raw: string, roots: string[]): string | null {
  const path = raw.trim()
  if (!path || path.length > 1024 || path.includes('\0')) return null
  const candidates: string[] = []
  if (path.startsWith('~/')) candidates.push(join(homedir(), path.slice(2)))
  else if (isAbsolute(path)) candidates.push(path)
  else {
    for (const root of roots) {
      if (typeof root !== 'string' || !isAbsolute(root) || !isDir(root)) continue
      const base = normalize(root).replace(/[\\/]+$/, '')
      const full = normalize(join(base, path))
      // Không cho "../" đi ra ngoài thư mục dự án
      if (full.startsWith(base + sep)) candidates.push(full)
    }
  }
  return candidates.find((c) => existsSync(c)) ?? null
}

export async function openCode(raw: unknown, line: unknown, col: unknown, editor: unknown, roots: unknown): Promise<string | null> {
  if (typeof raw !== 'string') return 'Not a file path.'
  const ed: CodeEditor = typeof editor === 'string' && editor in SCHEMES ? (editor as CodeEditor) : 'vscode'
  const list = Array.isArray(roots) ? roots.filter((r): r is string => typeof r === 'string').slice(0, 50) : []
  const file = resolveCodePath(raw, list)
  if (!file) {
    return isAbsolute(raw) || raw.startsWith('~/')
      ? `Can’t find ${raw} on this Mac.`
      : list.length
        ? `Can’t find ${raw} in your project folders.`
        : `Add your project folder in Preferences → Editor → Code files to open ${raw}.`
  }
  const ln = Number.isInteger(line) && (line as number) > 0 ? `:${line as number}` : ''
  const cl = ln && Number.isInteger(col) && (col as number) > 0 ? `:${col as number}` : ''
  const url = `${SCHEMES[ed]}://file${encodeURI(file).replace(/#/g, '%23').replace(/\?/g, '%3F')}${ln}${cl}`
  try {
    await shell.openExternal(url)
    return null
  } catch {
    return `Couldn’t open ${NAMES[ed]}. Is it installed?`
  }
}

export async function pickProjectFolder(win: BrowserWindow | null): Promise<string | null> {
  const opts = { title: 'Choose a project folder', properties: ['openDirectory' as const] }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
}
