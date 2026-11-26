// Bấm "Run" trên khối code ở bản xem: chạy (ở main process, tách biệt) rồi hiện kết quả ngay dưới khối.
// Kết quả chỉ để xem, không lưu vào ghi chú.

export async function runCodeBlock(button: HTMLButtonElement): Promise<void> {
  const pre = button.closest('pre')
  const lang = button.dataset.run === 'python' ? 'python' : 'js'
  const code = pre?.querySelector('code')?.textContent?.replace(/\n$/, '') ?? ''
  if (!pre || !window.inknote) return
  // Khối nằm trong <details> (collapse): kết quả đặt sau <details>
  const anchor = (pre.parentElement?.tagName === 'DETAILS' ? pre.parentElement : pre) as HTMLElement
  let box = anchor.nextElementSibling as HTMLElement | null
  if (!box?.classList.contains('code-output')) {
    box = document.createElement('div')
    box.className = 'code-output'
    anchor.after(box)
  }
  box.className = 'code-output running'
  box.replaceChildren(Object.assign(document.createElement('div'), { className: 'code-output-head', textContent: 'Running…' }))
  button.disabled = true
  try {
    const res = await window.inknote.utilities.runCode(lang, code)
    const head = document.createElement('div')
    head.className = 'code-output-head'
    head.textContent = `${res.ok ? 'Output' : 'Error'} · ${res.ms} ms`
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'code-output-close'
    close.textContent = '×'
    close.title = 'Hide output'
    close.addEventListener('click', () => box?.remove())
    head.appendChild(close)
    const body = document.createElement('pre')
    body.textContent = res.output || '(no output)'
    box.className = res.ok ? 'code-output' : 'code-output error'
    box.replaceChildren(head, body)
  } finally {
    button.disabled = false
  }
}
