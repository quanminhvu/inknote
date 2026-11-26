import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './lib/theme'
import { useEditorPrefs } from './lib/editorPrefs'
import { setLineBreaks } from './lib/markdown'
import './themes.css'
import './styles.css'

// Áp theme trước khi vẽ lần đầu (cửa sổ chỉ hiện khi ready-to-show)
initTheme()

// macOS: cửa sổ dùng vibrancy, sidebar trong mờ
if (window.inknote?.platform === 'darwin') document.documentElement.classList.add('vibrant')

// Gạch ngang task đã xong trong preview theo tùy chọn editor
const syncStrike = (on: boolean): void => void document.documentElement.classList.toggle('strike-done', on)
syncStrike(useEditorPrefs.getState().strikeDone)
const syncCodeLn = (on: boolean): void => void document.documentElement.classList.toggle('no-code-ln', !on)
syncCodeLn(useEditorPrefs.getState().codeLineNumbers)
// Xuống dòng thật ở bản xem; danh sách ghi chú gọn
setLineBreaks(useEditorPrefs.getState().breaks)
const syncCompact = (on: boolean): void => void document.documentElement.classList.toggle('compact-list', on)
syncCompact(useEditorPrefs.getState().compactList)
useEditorPrefs.subscribe((s) => {
  syncStrike(s.strikeDone)
  syncCodeLn(s.codeLineNumbers)
  setLineBreaks(s.breaks)
  syncCompact(s.compactList)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
