import { useMemo } from 'react'
import { diffLines, diffWordsWithSpace } from 'diff'
import { cx } from '@/lib/util'

// So sánh hai đoạn chữ theo từng dòng. Dòng bị sửa (một dòng bỏ đi, một dòng thêm vào ngay sau)
// được tô thêm đúng những chữ khác nhau, để thấy ngay sửa ở đâu.
// Đoạn không đổi dài được rút gọn, chỉ giữ vài dòng hai đầu.

interface Row {
  kind: 'same' | 'added' | 'removed' | 'skip'
  text: string
  /** Chữ thay đổi trong dòng (khi dòng được ghép cặp với dòng bên kia) */
  words?: { text: string; changed: boolean }[]
}

function pairWords(oldLine: string, newLine: string): [Row['words'], Row['words']] {
  const parts = diffWordsWithSpace(oldLine, newLine)
  const left: { text: string; changed: boolean }[] = []
  const right: { text: string; changed: boolean }[] = []
  for (const p of parts) {
    if (!p.added) left.push({ text: p.value, changed: !!p.removed })
    if (!p.removed) right.push({ text: p.value, changed: !!p.added })
  }
  return [left, right]
}

function buildRows(from: string, to: string): { rows: Row[]; added: number; removed: number } {
  const parts = diffLines(from, to, { ignoreNewlineAtEof: true })
  const rows: Row[] = []
  let added = 0
  let removed = 0
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.removed && parts[i + 1]?.added) {
      // Cặp "bỏ đi" + "thêm vào": ghép từng dòng để tô chữ thay đổi
      const next = parts[i + 1].value.replace(/\n$/, '').split('\n')
      removed += lines.length
      added += next.length
      const pairs = Math.min(lines.length, next.length)
      const words = Array.from({ length: pairs }, (_, k) => pairWords(lines[k], next[k]))
      lines.forEach((l, k) => rows.push({ kind: 'removed', text: l, words: words[k]?.[0] }))
      next.forEach((l, k) => rows.push({ kind: 'added', text: l, words: words[k]?.[1] }))
      i++
      continue
    }
    if (part.added || part.removed) {
      if (part.added) added += lines.length
      else removed += lines.length
      for (const l of lines) rows.push({ kind: part.added ? 'added' : 'removed', text: l })
      continue
    }
    if (lines.length > 8) {
      const head = i === 0 ? [] : lines.slice(0, 3)
      const tail = i === parts.length - 1 ? [] : lines.slice(-3)
      for (const l of head) rows.push({ kind: 'same', text: l })
      rows.push({ kind: 'skip', text: `⋯ ${lines.length - head.length - tail.length} unchanged lines` })
      for (const l of tail) rows.push({ kind: 'same', text: l })
    } else for (const l of lines) rows.push({ kind: 'same', text: l })
  }
  return { rows, added, removed }
}

export function diffStats(from: string, to: string): { added: number; removed: number } {
  const { added, removed } = buildRows(from, to)
  return { added, removed }
}

export function Diff({ from, to, same = 'No differences.' }: { from: string; to: string; same?: string }): React.JSX.Element {
  const { rows, added, removed } = useMemo(() => buildRows(from, to), [from, to])
  if (!added && !removed) return <div className="diff-same">{same}</div>
  return (
    <pre className="diff">
      {rows.map((r, i) =>
        r.kind === 'skip' ? (
          <span key={i} className="diff-skip">{`  ${r.text}\n`}</span>
        ) : (
          <span key={i} className={cx('diff-line', r.kind === 'added' && 'added', r.kind === 'removed' && 'removed')}>
            {r.kind === 'added' ? '+ ' : r.kind === 'removed' ? '− ' : '  '}
            {r.words ? r.words.map((w, j) => (w.changed ? <mark key={j} className="diff-word">{w.text}</mark> : w.text)) : r.text}
            {'\n'}
          </span>
        )
      )}
    </pre>
  )
}
