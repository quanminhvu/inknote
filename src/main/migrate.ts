import { app, dialog } from 'electron'
import { cpSync, existsSync, readlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// App đổi tên Nibmark → Inknote: macOS cho app mới một thư mục dữ liệu mới
// (~/Library/Application Support/Inknote). Lần mở đầu tiên, chép dữ liệu từ thư mục
// Nibmark cũ sang để ghi chú, cài đặt, theme và lịch sử phiên bản vẫn còn nguyên.
// Chỉ chép, không xóa thư mục cũ: nó vẫn là một bản dự phòng.

const LEGACY_NAME = 'Nibmark'
/** Không chép: khóa của bản đang chạy, socket, và bộ nhớ đệm (Chromium tự tạo lại) */
const SKIP = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'mcp.sock', 'DevToolsActivePort', 'Cache', 'Code Cache', 'GPUCache', 'GPUPersistentCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GraphiteDawnCache', 'blob_storage', 'Crashpad'])

/** Bản Nibmark cũ có đang chạy không (khóa SingletonLock trỏ tới "tên-máy-pid" còn sống) */
function legacyRunning(dir: string): boolean {
  try {
    const pid = Number(readlinkSync(join(dir, 'SingletonLock')).split('-').pop())
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Gọi trước khi dùng thư mục dữ liệu (trước khóa một bản app). Trả về thông báo lỗi để hiện sau, nếu có. */
export function migrateLegacyUserData(): string | null {
  const target = app.getPath('userData')
  const legacy = join(app.getPath('appData'), LEGACY_NAME)
  if (target === legacy || !existsSync(join(legacy, 'IndexedDB'))) return null
  // Đã có dữ liệu ở thư mục mới (đã chuyển rồi, hoặc đã dùng Inknote): không đụng vào
  if (existsSync(join(target, 'IndexedDB'))) return null
  if (legacyRunning(legacy)) return 'Nibmark is still running. Quit Nibmark, then open Inknote again to bring your notes over.'
  try {
    cpSync(legacy, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) })
    writeFileSync(join(target, 'migrated-from-nibmark.txt'), `Copied from ${legacy} on ${new Date().toISOString()}.\nThe old folder was left in place as a backup.\n`)
    return null
  } catch (err) {
    return `Could not copy your notes from Nibmark: ${err instanceof Error ? err.message : String(err)}`
  }
}

export function reportMigrationError(message: string | null): void {
  if (message) void dialog.showMessageBox({ type: 'warning', message: 'Inknote', detail: message })
}
