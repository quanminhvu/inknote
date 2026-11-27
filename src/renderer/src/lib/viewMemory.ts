// Nhớ con trỏ và vị trí cuộn của từng ghi chú trong phiên làm việc,
// để chuyển qua lại giữa các tab (hoặc ghi chú) thì quay về đúng chỗ đang đọc.

export interface EditorSpot {
  anchor: number
  head: number
  scrollTop: number
}

const LIMIT = 200
const editorSpots = new Map<string, EditorSpot>()
const previewSpots = new Map<string, number>()

function put<V>(map: Map<string, V>, id: string, value: V): void {
  map.delete(id)
  map.set(id, value)
  if (map.size > LIMIT) map.delete(map.keys().next().value as string)
}

export const saveEditorSpot = (id: string, spot: EditorSpot): void => put(editorSpots, id, spot)
export const editorSpot = (id: string): EditorSpot | undefined => editorSpots.get(id)
export const savePreviewSpot = (id: string, top: number): void => put(previewSpots, id, top)
export const previewSpot = (id: string): number | undefined => previewSpots.get(id)

// Dòng nguồn (0-based) của đoạn đang ở đầu khung đọc: rời chế độ đọc thì đặt con trỏ ở đó
const readingLines = new Map<string, number>()
export const saveReadingLine = (id: string, line: number): void => put(readingLines, id, line)
export const readingLine = (id: string): number | undefined => readingLines.get(id)
