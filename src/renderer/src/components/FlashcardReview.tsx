import { useEffect, useMemo, useState } from 'react'
import { Layers, X } from 'lucide-react'
import { create } from 'zustand'
import { collectCards, dueCards, loadStates, nextLabel, saveState, schedule } from '@/lib/flashcards'
import type { Card, Grade } from '@/lib/flashcards'
import { renderInlineMarkdown } from '@/lib/markdown'
import { useStore } from '@/lib/store'

// Ôn thẻ ghi nhớ: xem câu hỏi → Space để lật → chấm 1 Quên · 2 Khó · 3 Được · 4 Dễ.

const useReview = create<{ open: boolean }>(() => ({ open: false }))
export const openReview = (): void => useReview.setState({ open: true })
const close = (): void => useReview.setState({ open: false })
export const isReviewOpen = (): boolean => useReview.getState().open

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' }
]

/** Câu hỏi và trả lời viết bằng Markdown một dòng (đậm, code, link…) */
const inline = (text: string): { __html: string } => ({ __html: renderInlineMarkdown(text) })

export function FlashcardReview(): React.JSX.Element | null {
  const open = useReview((s) => s.open)
  const notes = useStore((s) => s.notes)
  const [queue, setQueue] = useState<Card[]>([])
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const total = useMemo(() => (open ? collectCards(notes).length : 0), [open, notes])

  // Mở: lấy các thẻ đến hạn (không cập nhật lại giữa chừng để thứ tự không nhảy)
  useEffect(() => {
    if (!open) return
    setQueue(dueCards(collectCards(useStore.getState().notes)))
    setFlipped(false)
    setReviewed(0)
  }, [open])

  const card = queue[0]
  const state = card ? loadStates()[card.id] : undefined

  const grade = (g: Grade): void => {
    if (!card) return
    const next = schedule(state, g)
    saveState(card.id, next)
    setReviewed((n) => n + 1)
    setFlipped(false)
    // Quên: đưa xuống cuối hàng để hỏi lại trong lượt này
    setQueue((q) => (g === 1 ? [...q.slice(1), q[0]] : q.slice(1)))
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') close()
      else if (e.key === ' ' || e.key === 'Enter') {
        if (!flipped) setFlipped(true)
        else if (e.key === 'Enter') grade(3)
      } else if (flipped && /^[1-4]$/.test(e.key)) grade(Number(e.key) as Grade)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="review" role="dialog" aria-label="Review flashcards" onMouseDown={(e) => e.stopPropagation()}>
        <header className="history-header">
          <Layers size={16} />
          <h2>Flashcards</h2>
          <span className="history-note">
            {card ? `${queue.length} to review` : `${total} card${total === 1 ? '' : 's'}`}
            {reviewed ? ` · ${reviewed} done` : ''}
          </span>
          <span className="flex-1" />
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        {card ? (
          <div className="review-body">
            <button
              className="review-source"
              title="Open the note this card comes from"
              onClick={() => {
                close()
                useStore.getState().selectNote(card.noteId)
              }}
            >
              {card.noteTitle}
            </button>
            <div className="review-front" dangerouslySetInnerHTML={inline(card.front)} />
            {flipped ? (
              <>
                <div className="review-back" dangerouslySetInnerHTML={inline(card.back)} />
                <div className="review-grades">
                  {GRADES.map((g) => (
                    <button key={g.grade} className={`btn review-grade g${g.grade}`} onClick={() => grade(g.grade)}>
                      <span>{g.label}</span>
                      <small>
                        {g.grade} · {nextLabel(state, g.grade)}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button className="btn primary review-flip" onClick={() => setFlipped(true)}>
                Show Answer <small>Space</small>
              </button>
            )}
          </div>
        ) : (
          <div className="review-empty">
            {total === 0 ? (
              <>
                <p>No flashcards yet.</p>
                <p className="review-hint">
                  Write a line like <code>Question :: Answer</code> in any note (with a space on both sides of <code>::</code>). Each such line becomes a card.
                </p>
              </>
            ) : (
              <>
                <p>{reviewed ? `All done for now. You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}.` : 'Nothing to review right now.'}</p>
                <p className="review-hint">Cards come back when they are due, based on how well you knew them.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
