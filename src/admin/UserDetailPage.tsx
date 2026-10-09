import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api, type AdminLearningProgress, type AdminUser, type Page, type User } from '../api'
import { Button, Confirm, ErrorState, Input, Loading, Notice, Select } from '../components/ui'
import { useI18n } from '../i18n'
import { useLeaveWarning } from '../useLeaveWarning'
import { CourseAccessSelector, type AccessValues } from './CourseAccessSelector'
import { accessPayload, initials, Pagination, useAdminTracks, userName, UserRowActions, UserStatus } from './UserComponents'

function GeneralForm({ user, actor, onSaved, onDirty }: { user: AdminUser; actor: User; onSaved: (user: AdminUser) => void; onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n()
  const initial = { first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role, is_active: user.is_active }
  const [form, setForm] = useState(initial)
  const [access, setAccess] = useState<AccessValues>({ learning_track: user.learning_track, course_access_mode: user.course_access_mode, course_ids: user.course_ids })
  const tracks = useAdminTracks()
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const changedRole = form.role !== user.role
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  useLeaveWarning(dirty)
  const save = async (event: React.SubmitEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { ...form, ...(changedRole ? form.role === 'STUDENT' ? accessPayload(access) : { learning_track: null, course_access_mode: 'TRACK_DEFAULT', course_ids: [] } : {}) }
      onSaved(await api<AdminUser>(`admin/users/${user.id}/`, 'PATCH', payload))
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form className="admin-user-form admin-narrow-form" onSubmit={event => void save(event)}><fieldset disabled={busy || user.is_protected}>
    <div className="admin-form-grid"><label>{t('Имя')}<Input value={form.first_name} maxLength={150} onChange={event => setForm({ ...form, first_name: event.target.value })}/></label><label>{t('Фамилия')}<Input value={form.last_name} maxLength={150} onChange={event => setForm({ ...form, last_name: event.target.value })}/></label></div>
    <label>Email<Input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
    <div className="admin-form-grid"><label>{t('Роль')}<Select value={form.role} disabled={user.id === actor.id} onChange={event => setForm({ ...form, role: event.target.value as AdminUser['role'] })}><option value="STUDENT">{t('Студент')}</option><option value="ADMIN">{t('Администратор')}</option></Select></label><label>{t('Статус')}<Select value={form.is_active ? 'active' : 'inactive'} disabled={user.id === actor.id} onChange={event => setForm({ ...form, is_active: event.target.value === 'active' })}><option value="active">{t('Активен')}</option><option value="inactive">{t('Неактивен')}</option></Select></label></div>
    {changedRole && form.role === 'STUDENT' && (tracks.isLoading ? <Loading variant="inline"/> : tracks.error ? <ErrorState error={tracks.error}/> : <CourseAccessSelector value={access} tracks={tracks.data ?? []} onChange={setAccess} onUnavailableChange={setUnavailable}/>)}
    {changedRole && form.role === 'ADMIN' && <p className="admin-form-note">{t('Администратору доступны инструменты управления. История обучения сохранится.')}</p>}
    {user.id === actor.id && <p className="admin-form-note">{t('Свою роль и статус изменить нельзя.')}</p>}
    <Notice text={error} kind="error"/><div className="admin-form-actions"><Button type="submit" disabled={!dirty || changedRole && form.role === 'STUDENT' && (!access.learning_track || unavailable || tracks.isLoading || Boolean(tracks.error))}>{busy ? t('Сохранение…') : t('Сохранить изменения')}</Button></div>
  </fieldset></form>
}

function AccessForm({ user, onSaved, onDirty }: { user: AdminUser; onSaved: (user: AdminUser) => void; onDirty: (dirty: boolean) => void }) {
  const { t } = useI18n()
  const tracks = useAdminTracks()
  const initial: AccessValues = { learning_track: user.learning_track, course_access_mode: user.course_access_mode, course_ids: user.course_ids }
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [unavailable, setUnavailable] = useState(false)
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  useLeaveWarning(dirty)
  if (user.role === 'ADMIN') return <p className="admin-form-note">{t('Администратору доступны инструменты управления. История обучения сохранится.')}</p>
  const save = async (event: React.SubmitEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { onSaved(await api<AdminUser>(`admin/users/${user.id}/`, 'PATCH', accessPayload(value))) }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <form className="admin-user-form admin-narrow-form" onSubmit={event => void save(event)}><fieldset disabled={busy || user.is_protected}>
    {tracks.isLoading ? <Loading variant="inline"/> : tracks.error ? <ErrorState error={tracks.error}/> : <CourseAccessSelector value={value} tracks={tracks.data ?? []} onChange={setValue} onUnavailableChange={setUnavailable} warnOnTrackChange/>}
    <p className="admin-form-note">{t('Доступ ограничивает открытие учебных материалов. Сохранённый прогресс и попытки не удаляются.')}</p><Notice text={error} kind="error"/>
    <div className="admin-form-actions"><Button type="submit" disabled={!dirty || !value.learning_track || unavailable || tracks.isLoading || Boolean(tracks.error)}>{busy ? t('Сохранение…') : t('Сохранить доступ')}</Button></div>
  </fieldset></form>
}

function LearningProgress({ userId }: { userId: number }) {
  const { t, locale } = useI18n()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['admin-user-progress', userId, page], queryFn: () => api<Page<AdminLearningProgress>>(`admin/users/${userId}/learning-progress/?page=${page}&page_size=30`) })
  return <>{query.isLoading ? <Loading/> : query.error ? <ErrorState error={query.error}/> : query.data?.results.length ? <div className="management-table-wrap"><table className="management-table progress-table"><thead><tr><th>{t('Учебный материал')}</th><th>{t('Тип')}</th><th>{t('Прогресс')}</th><th>{t('Статус')}</th><th>{t('Обновлено')}</th></tr></thead><tbody>{query.data.results.map(row => <tr key={row.id}><td><strong>{row.item_title}</strong><small>{row.course_title} · {row.module_title}</small></td><td>{t(row.item_type === 'LECTURE' ? 'Лекция' : row.item_type === 'TEST' ? 'Тест' : 'Практика')}</td><td>{row.progress_percent}%</td><td>{t(row.is_completed ? 'Завершено' : 'В процессе')}</td><td>{new Date(row.updated_at).toLocaleDateString(locale === 'kz' ? 'kk-KZ' : locale)}</td></tr>)}</tbody></table></div> : <p className="management-empty">{t('Сохранённого прогресса пока нет.')}</p>}<Pagination data={query.data} page={page} busy={query.isFetching} onPage={setPage}/></>
}

export function UserDetailPage({ actor }: { actor: User }) {
  const { id } = useParams(), { t } = useI18n(), qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = ['general', 'access', 'progress'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'general'
  const query = useQuery({ queryKey: ['admin-user', id], queryFn: () => api<AdminUser>(`admin/users/${id}/`) })
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const saved = (user: AdminUser) => {
    qc.setQueryData(['admin-user', id], user); void qc.invalidateQueries({ queryKey: ['admin-users'] })
    if (user.id === actor.id) void qc.invalidateQueries({ queryKey: ['me'] })
    setRevision(value => value + 1); setNotice(t('Изменения сохранены')); setError('')
  }
  const changeStatus = async () => {
    if (!query.data || busy) return
    setBusy(true); setError('')
    try { saved(await api<AdminUser>(`admin/users/${id}/`, 'PATCH', { is_active: !query.data.is_active })); setConfirm(false) }
    catch (cause) { setError((cause as Error).message); setConfirm(false) } finally { setBusy(false) }
  }
  if (query.isLoading) return <Loading/>
  if (query.error || !query.data) return <ErrorState error={query.error}/>
  const user = query.data
  return <><Link className="back" to="/admin/users"><ArrowLeft size={16}/>{t('Все пользователи')}</Link><div className="user-detail-heading"><span className="avatar">{initials(user)}</span><div><h1>{userName(user)}</h1><p>{user.email} · {t(user.role === 'ADMIN' ? 'Администратор' : 'Студент')}</p></div><UserStatus active={user.is_active}/><UserRowActions user={user} actorId={actor.id} onStatusChange={() => setConfirm(true)}/></div>
    <Notice text={notice} kind="success"/><Notice text={error} kind="error"/>{user.is_protected && <Notice text={t('Системная учётная запись доступна только для просмотра.')}/>}
    <nav className="user-detail-tabs" aria-label={t('Карточка пользователя')}>{[['general', 'Общие данные'], ['access', 'Доступ к обучению'], ['progress', 'Прогресс обучения']].map(([key, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { if (key === tab || dirty && !window.confirm(t('Есть несохранённые изменения. Покинуть страницу?'))) return; setParams({ tab: key }); setNotice(''); setError('') }}>{t(label)}</button>)}</nav>
    {tab === 'general' && <GeneralForm key={`${id}-${revision}`} user={user} actor={actor} onSaved={saved} onDirty={setDirty}/>}{tab === 'access' && <AccessForm key={`${id}-${revision}`} user={user} onSaved={saved} onDirty={setDirty}/>}{tab === 'progress' && <LearningProgress userId={user.id}/>}
    {confirm && <Confirm title={t(user.is_active ? 'Деактивировать пользователя? История обучения сохранится.' : 'Активировать пользователя?')} onCancel={() => { if (!busy) setConfirm(false) }} onConfirm={() => void changeStatus()}/>}
  </>
}
