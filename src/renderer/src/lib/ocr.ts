import type { EditorView } from '@codemirror/view'
import { fileIdFromUrl, readFile } from './attachments'
import { useStore } from './store'
import { isMac } from './util'

// Lấy chữ từ ảnh trong ghi chú (macOS, chạy trên máy bằng bộ nhận dạng của hệ thống).

export const canRecognizeText = (): boolean => isMac() && !!window.inknote

/** Byte của ảnh: file đính kèm trong ghi chú, blob/data URL; link web thì để main tự tải */
async function source(src: string): Promise<Uint8Array | string | null> {
  const id = fileIdFromUrl(src)
  if (id) {
    const file = await readFile(id)
    return file ? new Uint8Array(await file.blob.arrayBuffer()) : null
  }
  if (/^(blob|data):/.test(src)) return new Uint8Array(await (await fetch(src)).arrayBuffer())
  if (/^https?:\/\//.test(src)) return src
  return null
}

let busy = false

export async function recognizeImage(src: string): Promise<string | null> {
  const notice = useStore.getState().showNotice
  if (!canRecognizeText()) {
    notice('Reading text from images needs Inknote for macOS.', 'error')
    return null
  }
  if (busy) return null
  busy = true
  const slow = window.setTimeout(() => notice('Reading text… the first time can take up to a minute.'), 1500)
  try {
    const input = await source(src)
    if (!input) {
      notice('Could not load this image.', 'error')
      return null
    }
    const res = await window.inknote!.utilities.ocr(input)
    if ('error' in res) {
      notice(res.error, 'error')
      return null
    }
    if (!res.text.trim()) {
      notice('No text found in this image.')
      return null
    }
    return res.text
  } finally {
    window.clearTimeout(slow)
    busy = false
  }
}

export async function copyTextFromImage(src: string): Promise<void> {
  const text = await recognizeImage(src)
  if (text === null) return
  try {
    await navigator.clipboard.writeText(text)
    useStore.getState().showNotice(`Copied ${text.split('\n').length} line${text.includes('\n') ? 's' : ''} of text from the image.`)
  } catch {
    useStore.getState().showNotice('Could not copy the text.', 'error')
  }
}

/** Chèn chữ đọc được xuống dưới dòng chứa ảnh (vị trí `pos` trong editor) */
export async function insertTextFromImage(view: EditorView, pos: number, src: string): Promise<void> {
  const text = await recognizeImage(src)
  if (text === null || !view.dom.isConnected) return
  const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length))
  const insert = `\n\n${text}`
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length }, userEvent: 'input', scrollIntoView: true })
  useStore.getState().showNotice('Text from the image added below it.')
}
