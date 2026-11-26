import { useEffect, useRef, useState } from 'react'
import { Lock, X } from 'lucide-react'
import { create } from 'zustand'
import { lockNote, tryRememberedPasswords, unlockNote } from '@/lib/noteLock'
import { useStore } from '@/lib/store'
import type { Note } from '@/lib/types'

// Màn hình mở khoá (thay cho editor khi ghi chú đang đóng) và hộp đặt mật khẩu khi khoá ghi chú.

export function LockedNote({ note }: { note: Note }): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Đã nhập đúng mật khẩu trong phiên này (cho ghi chú khác): thử mở luôn
  useEffect(() => {
    setPassword('')
    setError(false)
    void tryRememberedPasswords(note._id).then((ok) => {
      if (!ok) input.current?.focus()
    })
  }, [note._id])

  const submit = async (): Promise<void> => {
    if (!password || busy) return
    setBusy(true)
    const ok = await unlockNote(note._id, password)
    setBusy(false)
    if (!ok) {
      setError(true)
      input.current?.select()
    }
  }

  return (
    <div className="locked-note">
      <Lock size={28} strokeWidth={1.6} />
      <h2>This note is locked</h2>
      <p>Enter the password to view it.</p>
      <form
        className="locked-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          ref={input}
          type="password"
          value={password}
          autoComplete="off"
          placeholder="Password"
          aria-label="Password"
          aria-invalid={error}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(false)
          }}
        />
        <button className="btn primary" type="submit" disabled={!password || busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
      {error && <p className="locked-error">That password is not right.</p>}
    </div>
  )
}

// ── Hộp đặt khoá ──
const useLockDialog = create<{ noteId: string | null }>(() => ({ noteId: null }))
export const openLockDialog = (noteId: string): void => {
  const note = useStore.getState().notes[noteId]
  if (note?.locked) {
    useStore.getState().showNotice('This note is already locked.')
    return
  }
  useLockDialog.setState({ noteId })
}
const close = (): void => useLockDialog.setState({ noteId: null })
export const isLockDialogOpen = (): boolean => useLockDialog.getState().noteId !== null

export function LockDialog(): React.JSX.Element | null {
  const noteId = useLockDialog((s) => s.noteId)
  const note = useStore((s) => (noteId ? s.notes[noteId] : undefined))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPassword('')
    setConfirm('')
    setBusy(false)
  }, [noteId])

  useEffect(() => {
    if (!noteId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [noteId])

  if (!noteId || !note) return null
  const short = password.length > 0 && password.length < 6
  const mismatch = confirm.length > 0 && confirm !== password
  const ready = password.length >= 6 && confirm === password && !busy

  const submit = async (): Promise<void> => {
    if (!ready) return
    setBusy(true)
    await lockNote(note._id, password)
    close()
    useStore.getState().showNotice('Note locked. It stays open until you press Lock Now or quit Inknote.')
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="modal lock-dialog"
        role="dialog"
        aria-label="Lock note"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <header className="lock-dialog-head">
          <Lock size={16} />
          <h2>Lock “{note.title || 'Untitled'}”</h2>
          <span className="flex-1" />
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <p className="lock-dialog-text">The text of this note is encrypted with this password, on this computer and in backups. The title, notebook and tags stay visible. Images and attachments are not encrypted.</p>
        <label className="lock-field">
          <span>Password</span>
          <input type="password" value={password} autoFocus autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="lock-field">
          <span>Confirm</span>
          <input type="password" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <p className={short || mismatch ? 'lock-hint error' : 'lock-hint'}>
          {short ? 'Use at least 6 characters.' : mismatch ? 'The two passwords are different.' : 'If you forget this password, the note can’t be recovered. Nobody can reset it.'}
        </p>
        <footer className="lock-dialog-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ready}>
            {busy ? 'Locking…' : 'Lock Note'}
          </button>
        </footer>
      </form>
    </div>
  )
}
