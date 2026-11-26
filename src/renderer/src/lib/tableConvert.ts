// Biến dữ liệu dạng bảng (copy từ Excel, Google Sheets, Numbers; hoặc CSV) thành bảng Markdown.
// Dòng đầu là tiêu đề. Ô có "|" được thoát, ô nhiều dòng nối bằng <br>.

/** Tách văn bản có dấu phân cách, hiểu ô trong ngoặc kép (có thể chứa dấu phân cách, xuống dòng, "") */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // Bỏ dòng trống ở cuối
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop()
  return rows
}

const cellText = (c: string): string => c.trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>')

export function rowsToMarkdown(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length))
  const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => cellText(r[i] ?? '')))
  const width = Array.from({ length: cols }, (_, i) => Math.max(3, ...grid.map((r) => r[i].length)))
  const line = (r: string[]): string => `| ${r.map((c, i) => c.padEnd(width[i])).join(' | ')} |`
  return [line(grid[0]), `| ${width.map((w) => '-'.repeat(w)).join(' | ')} |`, ...grid.slice(1).map(line)].join('\n')
}

/** Dữ liệu dán từ bảng tính: mỗi dòng có tab, ít nhất 2 dòng và 2 cột. Trả về bảng Markdown hoặc null. */
export function tsvToTable(text: string): string | null {
  const trimmed = text.replace(/\n+$/, '')
  if (!trimmed.includes('\t') || !trimmed.includes('\n')) return null
  const rows = parseDelimited(trimmed, '\t')
  if (rows.length < 2) return null
  const cols = rows[0].length
  if (cols < 2 || rows.some((r) => r.length !== cols)) return null
  return rowsToMarkdown(rows)
}

/** CSV (dấu phẩy, chấm phẩy hoặc tab): chọn dấu phân cách cho số cột đều nhau ở mọi dòng */
export function csvToTable(text: string): string | null {
  for (const delim of ['\t', ';', ',']) {
    const rows = parseDelimited(text.replace(/\n+$/, ''), delim)
    if (rows.length < 1) continue
    const cols = rows[0].length
    if (cols >= 2 && rows.every((r) => r.length === cols)) return rowsToMarkdown(rows)
  }
  return null
}
