/* Элементы интерфейса модуля. Классы — те же, что в AI edu (button, input, card, modal, notification-toast …),
   поэтому модуль выглядит как остальная платформа; собственные элементы — с префиксом vl- (virtual-labs.css). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { md } from '../core/util'
import { dateLocale, useT, type LabLocale, type T } from '../i18n'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }
export function Button({ children, variant = 'primary', size = 'md', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} {...props} className={`button ${variant} ${size === 'sm' ? 'vl-sm' : ''} ${className}`}>{children}</button>
}

export function Spinner({ label }: { label?: string }) {
  return <span className="loading-inline vl-spinner" role="status"><Loader2 className="loading-spinner" size={16} aria-hidden="true"/>{label && <span>{label}</span>}</span>
}

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return <div className="loading-section" role="status" aria-live="polite"><div className="loading-section-content">
    <Loader2 className="loading-spinner" size={28} aria-hidden="true"/><div className="loading-section-text"><span>{label ?? t('Загрузка…')}</span></div></div></div>
}

export function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="page-head vl-page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state vl-empty">{children}</div>
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'good' | 'error'; children: ReactNode }) {
  return <div className={`vl-note ${kind}`} role={kind === 'error' ? 'alert' : undefined}>{children}</div>
}

// ---------- уведомления ----------
type ToastFn = (text: string, kind?: 'success' | 'error') => void
const ToastContext = createContext<ToastFn>(() => {})
export const useToast = () => useContext(ToastContext)

// ---------- модальные окна ----------
type ModalRender = (close: () => void) => ReactNode
const ModalContext = createContext<(render: ModalRender, options?: { wide?: boolean }) => void>(() => {})
export const useModal = () => useContext(ModalContext)

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: 'success' | 'error' }[]>([])
  const [modal, setModal] = useState<{ render: ModalRender; wide: boolean } | null>(null)
  const seq = useRef(0)
  const toast = useCallback<ToastFn>((text, kind = 'success') => {
    const id = ++seq.current
    setToasts(list => [...list.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), kind === 'error' ? 6000 : 2600)
  }, [])
  const close = useCallback(() => setModal(null), [])
  const open = useCallback((render: ModalRender, options?: { wide?: boolean }) => setModal({ render, wide: !!options?.wide }), [])
  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal, close])
  return <ToastContext.Provider value={toast}><ModalContext.Provider value={open}>
    {children}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className={`modal vl-modal ${modal.wide ? 'vl-modal-wide' : ''}`} role="dialog" aria-modal="true">{modal.render(close)}</div></div>}
    {toasts.length > 0 && createPortal(<div className="notification-stack vl-toasts">{toasts.map(x => {
      const Icon = x.kind === 'error' ? CircleAlert : CircleCheck
      return <div key={x.id} role={x.kind === 'error' ? 'alert' : 'status'} className={`toast notification-toast ${x.kind}`}><Icon size={20} aria-hidden="true"/><span>{x.text}</span></div>
    })}</div>, document.body)}
  </ModalContext.Provider></ToastContext.Provider>
}

export function useConfirm() {
  const open = useModal()
  const t = useT()
  return (text: string, okLabel: string, onOk: () => void) => open(close => <>
    <h3>{t('Подтверждение')}</h3><p>{text}</p>
    <div className="row"><Button variant="danger" onClick={() => { close(); onOk() }}>{okLabel}</Button><Button variant="secondary" onClick={close}>{t('Отмена')}</Button></div>
  </>)
}

// ---------- отображение ----------
/** Markdown → HTML. Функция md экранирует исходный текст, поэтому вставка безопасна. */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`markdown vl-doc ${className}`} dangerouslySetInnerHTML={{ __html: md(text) }}/>
}

export const scoreTone = (v: number | null | undefined) => v == null ? '' : v >= 85 ? 'good' : v >= 70 ? 'accent' : v >= 50 ? 'warn' : 'bad'

export function Badge({ tone = '', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`vl-badge ${tone}`} title={title}>{children}</span>
}

export function Meter({ value, tone }: { value: number; tone?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return <div className={`vl-meter ${tone ?? scoreTone(v)}`} role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${v}%` }}/></div>
}

export function Kpi({ value, label, children }: { value: ReactNode; label: ReactNode; children?: ReactNode }) {
  return <div className="card vl-kpi"><b>{value}</b><span>{label}</span>{children}</div>
}

export function Tabs<K extends string>({ items, value, onChange, label }: { items: [K, string][]; value: K; onChange: (k: K) => void; label: string }) {
  return <div className="vl-tabs" role="tablist" aria-label={label}>
    {items.map(([k, text]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{text}</button>)}
  </div>
}

export function StepNav({ prev, next }: { prev?: ReactNode; next?: ReactNode }) {
  return <div className="vl-step-nav"><div>{prev}</div><div className="vl-row">{next}</div></div>
}

export function copyText(text: string, toast: ToastFn, t: T) {
  navigator.clipboard?.writeText(text).then(() => toast(t('Скопировано')), () => toast(t('Не удалось скопировать'), 'error'))
}

// ---------- даты и длительность на языке интерфейса ----------
export function fmtDate(ts: number | string | null | undefined, locale: LabLocale, withTime = true): string {
  if (ts == null || ts === '') return '—'
  try {
    return new Date(ts).toLocaleString(dateLocale(locale), withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' })
  } catch { return String(ts) }
}

export function fmtDuration(ms: number | null | undefined, t: T): string {
  const m = Math.round((ms || 0) / 60000)
  if (m < 1) return t('< 1 мин')
  if (m < 60) return t('{m} мин', { m })
  return t('{h} ч {m} мин', { h: Math.floor(m / 60), m: m % 60 })
}

export function fmtSize(bytes: number): string {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'
}
