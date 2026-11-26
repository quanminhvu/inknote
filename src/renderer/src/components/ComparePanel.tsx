import { useEffect } from 'react'
import { ArrowLeftRight, GitCompare, X } from 'lucide-react'
import { create } from 'zustand'
import { useStore } from '@/lib/store'
import { relativeTime } from '@/lib/util'
import { Diff, diffStats } from './Diff'

// So sánh hai ghi chú: chọn hai ghi chú trong danh sách (⌘-click) rồi bấm Compare.

const useCompare = create<{ a: string | null; b: string | null }>(() => ({ a: null, b: null }))

export function openCompare(a: string, b: string): void {
  useCompare.setState({ a, b })
}
const close = (): void => useCompare.setState({ a: null, b: null })
export const isCompareOpen = (): boolean => useCompare.getState().a !== null

export function ComparePanel(): React.JSX.Element | null {
  const { a, b } = useCompare()
  const left = useStore((s) => (a ? s.notes[a] : undefined))
  const right = useStore((s) => (b ? s.notes[b] : undefined))

  useEffect(() => {
    if (!a) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [a])

  if (!a || !b || !left || !right) return null
  const from = `${left.title}\n\n${left.body}`
  const to = `${right.title}\n\n${right.body}`
  const { added, removed } = diffStats(from, to)

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="history compare" role="dialog" aria-label="Compare notes" onMouseDown={(e) => e.stopPropagation()}>
        <header className="history-header">
          <GitCompare size={16} />
          <h2>Compare</h2>
          <span className="compare-side removed" title={`Edited ${relativeTime(left.updatedAt)}`}>
            − {left.title || 'Untitled'}
          </span>
          <button className="icon-btn" title="Swap" aria-label="Swap the two notes" onClick={() => openCompare(b, a)}>
            <ArrowLeftRight size={14} />
          </button>
          <span className="compare-side added" title={`Edited ${relativeTime(right.updatedAt)}`}>
            + {right.title || 'Untitled'}
          </span>
          <span className="flex-1" />
          <span className="compare-stats">
            {added || removed ? `${added} added · ${removed} removed` : ''}
          </span>
          <button className="icon-btn" title="Close (Esc)" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="compare-body">
          <Diff from={from} to={to} same="These two notes are the same." />
        </div>
      </div>
    </div>
  )
}
