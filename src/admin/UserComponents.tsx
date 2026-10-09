import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, apiAll, type AdminUser, type Page } from '../api'
import { Button, ErrorState, Input, Loading, Notice, Select } from '../components/ui'
import { useI18n } from '../i18n'
import { CourseAccessSelector, type AccessValues } from './CourseAccessSelector'

export const userName = (user: Pick<AdminUser, 'first_name' | 'last_name' | 'email'>) => `${user.first_name} ${user.last_name}`.trim() || user.email
export const initials = (user: Pick<AdminUser, 'first_name' | 'last_name' | 'email'>) => (user.first_name || user.email)[0].toUpperCase() + (user.last_name?.[0]?.toUpperCase() ?? '')
export const accessPayload = (values: AccessValues) => ({ ...values, course_ids: values.course_access_mode === 'CUSTOM' ? values.course_ids : [] })
export function useAdminTracks() { return useQuery({ queryKey: ['admin', 'tracks'], queryFn: () => apiAll<import('../api').Track>('tracks/') }) }

export function UserStatus({ active }: { active: boolean }) {
  const { t } = useI18n()
  return <span className={`user-status ${active ? 'is-active' : ''}`}>{t(active ? 'Активен' : 'Неактивен')}</span>
}

export function UserRowActions({ user, actorId, onStatusChange }: { user: AdminUser; actorId: number; onStatusChange: (user: AdminUser) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  const close = () => { if (ref.current) ref.current.open = false }
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <details className="user-row-actions" ref={ref} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label={`${t('Действия')}: ${userName(user)}`}><MoreHorizontal size={18}/></summary>
    <div className="user-actions-menu"><Link to={`/admin/users/${user.id}`} onClick={close}>{t('Открыть')}</Link>{!user.is_protected && <><Link to={`/admin/users/${user.id}?tab=general`} onClick={close}>{t('Редактировать')}</Link>{user.role === 'STUDENT' && <Link to={`/admin/users/${user.id}?tab=access`} onClick={close}>{t('Изменить доступ')}</Link>}</>}
      <button type="button" className={user.is_active ? 'danger' : ''} disabled={user.is_protected || user.id === actorId} onClick={() => { close(); onStatusChange(user) }}>{t(user.is_active ? 'Деактивировать пользователя' : 'Активировать пользователя')}</button>
    </div>
  </details>
}

export function Pagination({ data, page, busy, onPage }: { data?: Page<unknown>; page: number; busy: boolean; onPage: (page: number) => void }) {
  const { t } = useI18n()
  return <div className="management-pagination"><span>{t('Всего')}: {data?.count ?? 0} · {t('Страница')} {page}</span><div className="management-pagination-actions"><Button type="button" variant="secondary" disabled={busy || !data?.previous} onClick={() => onPage(page - 1)}>{t('Назад')}</Button><Button type="button" variant="secondary" disabled={busy || !data?.next} onClick={() => onPage(page + 1)}>{t('Далее')}</Button></div></div>
}

export function UserCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (user: AdminUser) => void }) {
  const { t } = useI18n()
  const tracks = useAdminTracks()
  const ref = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', role: 'STUDENT' as AdminUser['role'], learning_track: null as number | null, course_access_mode: 'TRACK_DEFAULT' as AdminUser['course_access_mode'], course_ids: [] as number[] })
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) onClose()
    if (event.key !== 'Tab') return
    const focusable = [...(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),a[href]') ?? [])]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const create = async (event: React.SubmitEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const created = await api<AdminUser>('admin/users/', 'POST', { ...form, ...accessPayload(form) })
      onCreated(created)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Не удалось сохранить')) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><div className="admin-create-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="create-user-title" onKeyDown={keyDown}>
    <div className="admin-dialog-heading"><h2 id="create-user-title">{t('Добавить пользователя')}</h2><button type="button" aria-label={t('Закрыть')} onClick={onClose} disabled={busy}><X size={19}/></button></div>
    <form className="admin-user-form" onSubmit={event => void create(event)}>
      <fieldset disabled={busy}>
      <div className="admin-form-grid"><label>{t('Имя')}<Input value={form.first_name} maxLength={150} onChange={event => setForm({ ...form, first_name: event.target.value })}/></label><label>{t('Фамилия')}<Input value={form.last_name} maxLength={150} onChange={event => setForm({ ...form, last_name: event.target.value })}/></label></div>
      <label>Email<Input type="email" required autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label>{t('Роль')}<Select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as AdminUser['role'], learning_track: null, course_access_mode: 'TRACK_DEFAULT', course_ids: [] })}><option value="STUDENT">{t('Студент')}</option><option value="ADMIN">{t('Администратор')}</option></Select></label>
      {form.role === 'STUDENT' && (tracks.isLoading ? <Loading variant="inline"/> : tracks.error ? <ErrorState error={tracks.error}/> : <CourseAccessSelector value={form} tracks={tracks.data ?? []} onChange={value => setForm(current => ({ ...current, ...value }))} onUnavailableChange={setUnavailable}/>)}
      <label>{t('Временный пароль')}<Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <p className="admin-form-note">{t('Пользователь сможет изменить пароль в своём профиле.')}</p><Notice text={error} kind="error"/>
      <div className="admin-form-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('Отмена')}</Button><Button type="submit" disabled={busy || form.role === 'STUDENT' && (!form.learning_track || unavailable || tracks.isLoading || Boolean(tracks.error))}>{busy ? t('Сохранение…') : t('Создать пользователя')}</Button></div>
      </fieldset>
    </form>
  </div></div>
}
