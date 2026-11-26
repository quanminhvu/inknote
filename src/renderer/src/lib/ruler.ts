import type { Extension } from '@codemirror/state'
import { ViewPlugin } from '@codemirror/view'
import type { EditorView, ViewUpdate } from '@codemirror/view'

// Vạch cột (giống plugin rulers): vạch dọc mảnh ở cột N trong editor, để giữ dòng không quá dài.
// Chỉ có nghĩa với chữ đều khổ (chế độ Write), nên ẩn ở chế độ Live.

export function ruler(column: number): Extension {
  if (!column) return []
  return ViewPlugin.fromClass(
    class {
      el: HTMLDivElement
      constructor(readonly view: EditorView) {
        this.el = document.createElement('div')
        this.el.className = 'cm-column-ruler'
        this.el.setAttribute('aria-hidden', 'true')
        view.scrollDOM.appendChild(this.el)
        this.measure()
      }
      update(u: ViewUpdate): void {
        if (u.geometryChanged || u.viewportChanged || u.docChanged) this.measure()
      }
      measure(): void {
        this.view.requestMeasure({
          read: (view) => {
            const content = view.contentDOM
            const pad = parseFloat(getComputedStyle(content).paddingLeft) || 0
            return {
              left: content.offsetLeft + pad + column * view.defaultCharacterWidth,
              height: view.scrollDOM.scrollHeight,
              live: view.dom.classList.contains('cm-live')
            }
          },
          write: (m) => {
            this.el.style.left = `${Math.round(m.left)}px`
            this.el.style.height = `${m.height}px`
            this.el.hidden = m.live
          }
        })
      }
      destroy(): void {
        this.el.remove()
      }
    }
  )
}
