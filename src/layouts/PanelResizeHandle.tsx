import { useEffect, useRef, useState, type RefObject } from 'react'
import { useI18n } from '../i18n'

const MIN_WIDTH = 300, MAX_WIDTH = 560, DEFAULT_WIDTH = 340

export function PanelResizeHandle({ panel, width, onResize }: {
  panel: RefObject<HTMLElement | null>; width: number; onResize: (width: number) => void
}) {
  const { t } = useI18n()
  const drag = useRef<{ pointer: number; x: number; width: number; maximum: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const bounds = () => {
    const center = panel.current?.parentElement?.querySelector('.learning-center')
    const available = (center?.getBoundingClientRect().width ?? 800) + (panel.current?.getBoundingClientRect().width ?? width) - 420
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available))
  }
  const change = (next: number, maximum = bounds()) => onResize(Math.round(Math.max(MIN_WIDTH, Math.min(maximum, next))))
  const stop = () => { drag.current = null; setDragging(false); document.body.classList.remove('is-resizing-learning-panels') }
  useEffect(() => () => document.body.classList.remove('is-resizing-learning-panels'), [])

  return <div className={`learning-panel-resizer ${dragging ? 'is-dragging' : ''}`} role="separator"
    aria-label={t('Изменить ширину панели тьютора')} aria-orientation="vertical" aria-controls="learning-tutor-panel"
    aria-valuemin={MIN_WIDTH} aria-valuemax={bounds()} aria-valuenow={Math.min(width, bounds())} tabIndex={0}
    title={t('Перетащите границу. Двойной щелчок - исходная ширина.')}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointer: event.pointerId, x: event.clientX,
        width: panel.current?.getBoundingClientRect().width ?? width, maximum: bounds() }
      setDragging(true)
      document.body.classList.add('is-resizing-learning-panels')
    }}
    onPointerMove={event => {
      const start = drag.current
      if (start && start.pointer === event.pointerId) change(start.width + start.x - event.clientX, start.maximum)
    }}
    onPointerUp={event => {
      if (drag.current?.pointer !== event.pointerId) return
      stop()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={stop} onLostPointerCapture={stop}
    onDoubleClick={() => change(DEFAULT_WIDTH)}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Home') change(MIN_WIDTH)
      else if (event.key === 'End') change(bounds())
      else change(width + (event.key === 'ArrowLeft' ? 20 : -20))
    }}/>
}
