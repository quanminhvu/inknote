import { hoverTooltip } from '@codemirror/view'
import { fromNow, localStamp, timestampMs } from './devTools'

// Rê chuột vào một Unix timestamp (10 chữ số = giây, 13 chữ số = mili giây) để xem ngày giờ:
// theo giờ máy, theo UTC, và cách đây bao lâu. Muốn đổi hẳn: chọn số → chuột phải → Convert.

export const timestampHover = hoverTooltip(
  (view, pos) => {
    const line = view.state.doc.lineAt(pos)
    for (const m of line.text.matchAll(/(?<![\w.-])(\d{13}|\d{10})(?![\w.])/g)) {
      const from = line.from + m.index
      const to = from + m[0].length
      if (pos < from || pos > to) continue
      const ms = timestampMs(m[0])
      if (ms === null) return null
      return {
        pos: from,
        end: to,
        above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'cm-timestamp-tip'
          const rows: [string, string][] = [
            ['Local', localStamp(ms)],
            ['UTC', new Date(ms).toISOString().replace('T', ' ').replace(/\.000Z$/, 'Z')],
            ['', `${fromNow(ms)} · ${m[0].length === 13 ? 'milliseconds' : 'seconds'}`]
          ]
          for (const [k, v] of rows) {
            const row = document.createElement('div')
            if (k) {
              const b = document.createElement('b')
              b.textContent = k
              row.append(b, ' ', v)
            } else {
              row.className = 'cm-timestamp-sub'
              row.textContent = v
            }
            dom.appendChild(row)
          }
          return { dom }
        }
      }
    }
    return null
  },
  { hoverTime: 350 }
)
