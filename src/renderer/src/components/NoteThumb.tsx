import { useEffect, useRef, useState } from 'react'
import { readFile } from '@/lib/attachments'

// Ảnh thu nhỏ trong danh sách ghi chú (giống plugin thumbnail-list): ảnh đính kèm đầu tiên của ghi chú.
// Chỉ ảnh trong máy (không tải ảnh từ web). Nạp khi ô ghi chú cuộn tới, có bộ nhớ đệm riêng.

const IMG = /!\[[^\]]*\]\((?:inknote|nibmark):\/\/file\/([A-Za-z0-9_-]{1,64})/

export const firstImageId = (body: string): string | null => {
  const m = IMG.exec(body)
  return m ? `file:${m[1]}` : null
}

const cache = new Map<string, string>()
const MAX = 200
function remember(id: string, url: string): void {
  cache.delete(id)
  cache.set(id, url)
  while (cache.size > MAX) {
    const [old, oldUrl] = cache.entries().next().value!
    cache.delete(old)
    URL.revokeObjectURL(oldUrl)
  }
}

export function NoteThumb({ fileId }: { fileId: string }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(cache.get(fileId) ?? null)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (cache.has(fileId)) {
      setUrl(cache.get(fileId)!)
      return
    }
    setUrl(null)
    const el = ref.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void readFile(fileId).then((res) => {
        if (!alive || !res || !/^image\//.test(res.doc.contentType)) return
        const u = URL.createObjectURL(res.blob)
        remember(fileId, u)
        setUrl(u)
      })
    })
    io.observe(el)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [fileId])

  return <span ref={ref} className="note-item-thumb">{url && <img src={url} alt="" draggable={false} />}</span>
}
