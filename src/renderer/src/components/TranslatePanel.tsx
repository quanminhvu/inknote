import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Copy, ExternalLink, Replace, TextCursorInput, X } from 'lucide-react'
import { closeTranslate, LANGUAGES, languageName, openGoogleTranslate, useTranslatePanel, useTranslatePrefs } from '@/lib/utilities'
import { useStore } from '@/lib/store'

// Bảng dịch nổi ngay dưới đoạn chữ đang chọn. Chỉ gửi đoạn chữ đó lên Google Dịch.
// Thay thế / chèn bên dưới chỉ có khi chữ được chọn trong editor (không phải bản xem).

type Result = { text: string; from: string } | { error: string } | null

export function TranslatePanel(): React.JSX.Element | null {
  const picked = useTranslatePanel((s) => s.picked)
  const target = useTranslatePrefs((s) => s.target)
  const fallback = useTranslatePrefs((s) => s.fallback)
  const [lang, setLang] = useState(target)
  const [result, setResult] = useState<Result>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Mỗi lần mở: dịch sang ngôn ngữ đích; nếu chữ đã là ngôn ngữ đích thì dịch sang ngôn ngữ dự phòng
  useEffect(() => {
    if (!picked || !window.inknote) return
    let alive = true
    setResult(null)
    setLang(target)
    void (async () => {
      let res = await window.inknote!.utilities.translate(picked.text, target)
      if ('text' in res && res.from === target && fallback !== target) {
        res = await window.inknote!.utilities.translate(picked.text, fallback, target)
        if (alive) setLang(fallback)
      }
      if (alive) setResult(res)
    })()
    return () => {
      alive = false
    }
  }, [picked, target, fallback])

  const retranslate = async (code: string): Promise<void> => {
    if (!picked || !window.inknote) return
    setLang(code)
    setResult(null)
    setResult(await window.inknote.utilities.translate(picked.text, code))
  }

  // Đặt bảng ngay dưới đoạn chữ; không đủ chỗ thì đặt lên trên
  useLayoutEffect(() => {
    if (!picked || !box.current) return setPos(null)
    const w = box.current.offsetWidth
    const h = box.current.offsetHeight
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, picked.rect.left))
    const below = picked.rect.bottom + 8
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, picked.rect.top - 8 - h)
    setPos({ left, top })
  }, [picked, result])

  useEffect(() => {
    if (!picked) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeTranslate()
        picked.view?.focus()
      }
    }
    const onDown = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) closeTranslate()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [picked])

  if (!picked) return null
  const text = result && 'text' in result ? result.text : ''
  const editable = !!picked.view && !picked.view.state.readOnly && picked.from !== undefined

  const replace = (): void => {
    const v = picked.view!
    v.dispatch({ changes: { from: picked.from!, to: picked.to!, insert: text }, selection: { anchor: picked.from!, head: picked.from! + text.length }, userEvent: 'input' })
    closeTranslate()
    v.focus()
  }
  const insertBelow = (): void => {
    const v = picked.view!
    const line = v.state.doc.lineAt(picked.to!)
    const insert = `\n\n${text}`
    v.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length }, userEvent: 'input' })
    closeTranslate()
    v.focus()
  }
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      useStore.getState().showNotice('Translation copied.')
    } catch {
      useStore.getState().showNotice('Could not copy the translation.', 'error')
    }
    closeTranslate()
  }

  return (
    <div
      ref={box}
      className="translate-panel"
      role="dialog"
      aria-label="Translation"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      <header className="translate-head">
        <span className="translate-from">{result && 'from' in result ? languageName(result.from) : 'Detecting…'}</span>
        <ArrowRight size={13} />
        <select aria-label="Translate to" value={lang} onChange={(e) => void retranslate(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={closeTranslate}>
          <X size={14} />
        </button>
      </header>
      <div className="translate-body">
        {!result && <p className="translate-wait">Translating…</p>}
        {result && 'error' in result && <p className="translate-error">{result.error}</p>}
        {text && <p className="translate-text">{text}</p>}
      </div>
      <footer className="translate-actions">
        {editable && (
          <>
            <button className="text-btn" disabled={!text} onClick={replace}>
              <Replace size={14} /> Replace
            </button>
            <button className="text-btn" disabled={!text} onClick={insertBelow}>
              <TextCursorInput size={14} /> Insert below
            </button>
          </>
        )}
        <button className="text-btn" disabled={!text} onClick={() => void copy()}>
          <Copy size={14} /> Copy
        </button>
        <span className="flex-1" />
        <button className="text-btn" title="Open in Google Translate" onClick={() => openGoogleTranslate(picked.text, lang)}>
          <ExternalLink size={14} /> Google Translate
        </button>
      </footer>
    </div>
  )
}
