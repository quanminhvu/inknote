import { Vim, vim } from '@replit/codemirror-vim'
import type { Extension } from '@codemirror/state'
import { useStore } from './store'
import { closeTab, tabsEnabled, useTabs } from './tabs'
import { noteWindowId } from './windowMode'

// Chế độ Vim (Preferences → Editor → Vim keybindings), dùng @replit/codemirror-vim.
// Thanh nhỏ dưới editor cho biết chế độ (NORMAL / INSERT / VISUAL) và dòng lệnh ":".
// Lệnh thêm: :w lưu ngay (Inknote vốn tự lưu), :q / :wq đóng tab ghi chú đang mở.

let defined = false
function defineCommands(): void {
  if (defined) return
  defined = true
  Vim.defineEx('write', 'w', () => {
    useStore.getState().flush()
    useStore.getState().showNotice('Saved.')
  })
  // Đóng tab của ghi chú đang mở (cửa sổ ghi chú riêng thì đóng cửa sổ), giống ⌘W
  const close = (): void => {
    const s = useStore.getState()
    s.flush()
    const id = s.selectedNoteId
    if (noteWindowId) window.close()
    else if (tabsEnabled() && id && useTabs.getState().tabs.some((t) => t.id === id)) closeTab(id)
  }
  Vim.defineEx('quit', 'q', close)
  Vim.defineEx('wq', 'wq', close)
  Vim.defineEx('xit', 'x', close)
  // jk / jj để thoát chế độ insert, như nhiều người hay cài
  Vim.map('jk', '<Esc>', 'insert')
}

defineCommands()

export const vimMode: Extension = vim({ status: true })
