import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron'
import { isAbsolute, join, resolve } from 'node:path'
import { registerIpc, settingsView } from './ipc'
import { getMainWindow, setMainWindow } from './windows'
import { buildMenu } from './menu'
import { registerShortcuts } from './shortcuts'
import { applyTray, hideOnClose, setupTray } from './tray'
import { updateSettings } from './settings'
import { applyMcp, registerMcpIpc, stopMcp } from './mcp'
import { migrateLegacyUserData, reportMigrationError } from './migrate'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

// Cho phép chạy với một hồ sơ dữ liệu riêng (dùng khi thử nghiệm),
// để không bao giờ đụng vào ghi chú thật trong ~/Library/Application Support/Inknote.
// Hồ sơ dữ liệu riêng (dùng khi test). Đường dẫn tương đối được đổi thành tuyệt đối:
// bỏ qua nó thì app sẽ lặng lẽ chạy trên dữ liệu thật của người dùng.
const customUserData = process.env['INKNOTE_USER_DATA']
if (customUserData) app.setPath('userData', isAbsolute(customUserData) ? customUserData : resolve(customUserData))

// Đổi tên Nibmark → Inknote: chép dữ liệu cũ sang thư mục mới trước khi app dùng tới nó
const migrationError = customUserData ? null : migrateLegacyUserData()

// Chỉ một bản app cho mỗi thư mục dữ liệu: hai bản cùng ghi một cơ sở dữ liệu (và cùng mở
// socket MCP) sẽ hỏng dữ liệu. Mở lần hai thì đưa cửa sổ của bản đang chạy lên trước.
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

/** Cửa sổ của từng ghi chú mở riêng (⌘⇧N), theo id ghi chú */
const noteWindows = new Map<string, BrowserWindow>()

export function openNoteWindow(noteId: string, quick?: { bookId?: string }): void {
  const existing = noteWindows.get(noteId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const win = createWindow(noteId, quick)
  noteWindows.set(noteId, win)
  win.on('closed', () => {
    noteWindows.delete(noteId)
    // Quick Note đóng mà chưa viết gì thì cửa sổ chính xóa ghi chú rỗng đó (như Apple Notes)
    if (quick) getMainWindow()?.webContents.send('menu', `quick-note-closed:${noteId}`)
  })
}

/** Vị trí Quick Note: góc dưới bên phải của màn hình đang có con trỏ chuột */
function quickNoteBounds(): Electron.Rectangle {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = 420
  const height = 460
  return { x: workArea.x + workArea.width - width - 24, y: workArea.y + workArea.height - height - 24, width, height }
}

function createWindow(noteId?: string, quick?: { bookId?: string }, hidden = false): BrowserWindow {
  const win = new BrowserWindow({
    width: noteId ? 820 : 1280,
    height: noteId ? 760 : 800,
    minWidth: noteId ? 420 : 880,
    minHeight: noteId ? 360 : 520,
    // Quick Note: cửa sổ nhỏ ở góc màn hình. Là cửa sổ thường (bấm ra ngoài thì nó lùi xuống),
    // chỉ nổi trên cùng khi người dùng bấm nút ghim.
    ...(quick ? { ...quickNoteBounds(), minWidth: 320, minHeight: 260, fullscreenable: false } : {}),
    show: false,
    title: 'Inknote',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'),
    // macOS: sidebar trong mờ (vibrancy) cần nền cửa sổ trong suốt
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' }
      : { backgroundColor: '#F4EFE6' }),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  win.once('ready-to-show', () => {
    if (quick) {
      // Hiện cửa sổ này trước rồi mới đưa app lên: macOS chỉ kéo cửa sổ đang được chọn lên trước,
      // cửa sổ chính đang nằm sau app khác vẫn ở nguyên chỗ
      win.show()
      win.focus()
      app.focus({ steal: true })
      return
    }
    if (!hidden) win.show()
  })

  // Link ngoài mở bằng trình duyệt mặc định, không mở trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  if (isDev) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'] as string)
    if (noteId) url.searchParams.set('note', noteId)
    if (quick) url.searchParams.set('quick', '1')
    if (quick?.bookId) url.searchParams.set('book', quick.bookId)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), noteId ? { query: { note: noteId, ...(quick ? { quick: '1', ...(quick.bookId ? { book: quick.bookId } : {}) } : {}) } } : undefined)
  }
  if (!noteId) {
    setMainWindow(win)
    hideOnClose(win)
    // macOS: vuốt ba ngón (nếu bật trong cài đặt trackpad) để back/forward
    win.on('swipe', (_e, direction) => {
      if (direction === 'left' || direction === 'right') win.webContents.send('menu', direction === 'right' ? 'back' : 'forward')
    })
  }
  return win
}

/** Cửa sổ chính; trên macOS app có thể đang chạy mà không còn cửa sổ nào */
function getOrCreateWindow(): BrowserWindow {
  return getMainWindow() ?? createWindow()
}

/** Cửa sổ chính để làm việc ngầm (Quick Note): nếu chưa có thì tạo mà không hiện lên */
function getOrCreateHiddenWindow(): BrowserWindow {
  return getMainWindow() ?? createWindow(undefined, undefined, true)
}

app.whenReady().then(() => {
  // Bản đóng gói đã có icon .icns; chỉ cần đặt icon Dock khi chạy dev
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }
  reportMigrationError(migrationError)
  registerIpc(openNoteWindow)
  buildMenu()
  createWindow()
  const shortcutActions = registerShortcuts(getOrCreateWindow, getOrCreateHiddenWindow)
  const trayActions = {
    show: () => {
      const win = getOrCreateWindow()
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    },
    quickNote: shortcutActions.quickNote
  }
  setupTray(trayActions)
  ipcMain.handle('settings:setTray', (_e, enabled: unknown) => {
    if (typeof enabled === 'boolean') updateSettings({ trayEnabled: enabled })
    applyTray(trayActions)
    return settingsView()
  })
  app.on('activate', () => {
    if (!getMainWindow()) createWindow()
  })
  app.on('second-instance', () => trayActions.show())
  registerMcpIpc()
  applyMcp(getOrCreateWindow)
  ipcMain.handle('settings:setMcp', (_e, patch: unknown) => {
    const p = (patch ?? {}) as { enabled?: unknown; allowEdits?: unknown }
    updateSettings({
      ...(typeof p.enabled === 'boolean' ? { mcpEnabled: p.enabled } : {}),
      ...(typeof p.allowEdits === 'boolean' ? { mcpAllowEdits: p.allowEdits } : {})
    })
    applyMcp(getOrCreateWindow)
    return settingsView()
  })
})

app.on('will-quit', stopMcp)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
