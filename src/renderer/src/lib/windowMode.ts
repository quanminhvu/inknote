/**
 * Cửa sổ này chỉ hiện một ghi chú (mở bằng ⌘⇧N)? Khi đó không chạy sao lưu,
 * lịch sử phiên bản hay lưu tùy chọn giao diện: những việc đó do cửa sổ chính lo.
 */
export const noteWindowId: string | null = new URLSearchParams(location.search).get('note')

/** Cửa sổ ghi chú này là Quick Note (cửa sổ nhỏ nổi, mở bằng phím tắt toàn cục) */
export const isQuickNoteWindow: boolean = !!noteWindowId && new URLSearchParams(location.search).get('quick') === '1'

export function openInNewWindow(id: string): void {
  window.inknote?.openNoteWindow(id)
}
