import type { KeyboardEvent } from 'react'

/** Plain textarea with Python-friendly Tab handling; no editor dependency is added to the platform. */
export function CodeArea({ value, onChange, disabled, label, rows }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string; rows?: number }) {
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    const area = event.currentTarget
    const { selectionStart: start, selectionEnd: end } = area
    onChange(value.slice(0, start) + '    ' + value.slice(end))
    requestAnimationFrame(() => { area.selectionStart = area.selectionEnd = start + 4 })
  }
  return <textarea className="python-code" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label={label}
    rows={rows ?? Math.min(24, Math.max(6, value.split('\n').length + 1))} disabled={disabled} value={value}
    onChange={event => onChange(event.target.value)} onKeyDown={keyDown}/>
}
