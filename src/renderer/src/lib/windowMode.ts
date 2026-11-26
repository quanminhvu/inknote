/**
 * Cửa sổ này chỉ hiện một ghi chú (mở bằng ⌘⇧N)? Khi đó không chạy sao lưu,
 * lịch sử phiên bản hay lưu tùy chọn giao diện: những việc đó do cửa sổ chính lo.
 */
export const noteWindowId: string | null = new URLSearchParams(location.search).get('note')

/** Cửa sổ ghi chú này là Quick Note (cửa sổ nhỏ nổi, mở bằng phím tắt toàn cục) */
export const isQuickNoteWindow: boolean = !!noteWindowId && new URLSearchParams(location.search).get('quick') === '1'

// Ghi chú có khoá chỉ mở ở cửa sổ chính (hai cửa sổ cùng sửa có thể ghi đè nội dung đã mã hoá).
// lib/noteLock.ts đăng ký hàm kiểm tra (không import store ở đây, tránh import vòng).
let blockWindow: ((id: string) => boolean) | null = null
export function setWindowGuard(fn: (id: string) => boolean): void {
  blockWindow = fn
}

export function openInNewWindow(id: string): void {
  if (blockWindow?.(id)) return
  window.inknote?.openNoteWindow(id)
}
