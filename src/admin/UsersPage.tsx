import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Filter, Plus } from 'lucide-react'
import { api, apiAll, type AdminUser, type Course, type Page, type User } from '../api'
import { Button, Confirm, ErrorState, Input, Loading, Notice, Select } from '../components/ui'
import { useI18n } from '../i18n'
import { initials, Pagination, userName, UserCreateDialog, UserRowActions, UserStatus, useAdminTracks } from './UserComponents'

export function UsersPage({ user }: { user: User }) {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  const serialized = params.toString()
  const [debounced, setDebounced] = useState(serialized)
  useEffect(() => { const timer = setTimeout(() => setDebounced(serialized), 300); return () => clearTimeout(timer) }, [serialized])
  const query = new URLSearchParams(debounced); query.set('page_size', '30')
  const users = useQuery({ queryKey: ['admin-users', debounced], queryFn: () => api<Page<AdminUser>>(`admin/users/?${query}`) })
  const tracks = useAdminTracks()
  const courses = useQuery({ queryKey: ['admin', 'courses'], queryFn: () => apiAll<Course>('courses/') })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value); else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const changeStatus = async () => {
    if (!changing || busy) return
    setBusy(true); setNotice('')
    try {
      await api(`admin/users/${changing.id}/`, 'PATCH', { is_active: !changing.is_active })
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
      setFailed(false); setNotice(t(changing.is_active ? 'Пользователь деактивирован. История обучения сохранена.' : 'Пользователь активирован.'))
    } catch (cause) { setFailed(true); setNotice(cause instanceof Error ? cause.message : t('Не удалось сохранить')) }
    finally { setBusy(false); setChanging(null) }
  }
  const page = Math.max(1, Number(params.get('page')) || 1)
  const dateLocale = locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU'
  return <div className="admin-users-page">
    <div className="admin-page-heading"><div><h1>{t('Пользователи')}</h1><p>{t('Управление аккаунтами, траекториями и доступом к курсам.')}</p></div><Button onClick={() => setCreating(true)}><Plus size={16}/>{t('Добавить пользователя')}</Button></div>
    <Button variant="secondary" className="user-filters-toggle" aria-expanded={filtersOpen} aria-controls="user-filters" onClick={() => setFiltersOpen(value => !value)}><Filter size={16}/>{t('Фильтры')}</Button>
    <div id="user-filters" className={`user-filters ${filtersOpen ? 'is-open' : ''}`}>
      <label>{t('Поиск пользователей')}<Input type="search" value={params.get('search') ?? ''} placeholder={t('Имя или email')} onChange={event => setFilter('search', event.target.value)}/></label>
      <label>{t('Роль')}<Select value={params.get('role') ?? ''} onChange={event => setFilter('role', event.target.value)}><option value="">{t('Все роли')}</option><option value="STUDENT">{t('Студент')}</option><option value="ADMIN">{t('Администратор')}</option></Select></label>
      <label>{t('Траектория')}<Select value={params.get('learning_track') ?? ''} onChange={event => setFilter('learning_track', event.target.value)}><option value="">{t('Все траектории')}</option>{tracks.data?.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</Select></label>
      <label>{t('Статус')}<Select value={params.get('status') ?? ''} onChange={event => setFilter('status', event.target.value)}><option value="">{t('Все статусы')}</option><option value="active">{t('Активен')}</option><option value="inactive">{t('Неактивен')}</option></Select></label>
      <label>{t('Курс')}<Select value={params.get('course') ?? ''} onChange={event => setFilter('course', event.target.value)}><option value="">{t('Все курсы')}</option>{courses.data?.filter(course => course.is_published).map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>
    </div>
    {tracks.error && <ErrorState error={tracks.error}/>} {courses.error && <ErrorState error={courses.error}/>}<Notice text={notice} kind={failed ? 'error' : 'success'}/>
    {users.isLoading ? <Loading/> : users.error ? <ErrorState error={users.error}/> : <>
      <div className="management-table-wrap" aria-busy={users.isFetching}><table className="management-table"><thead><tr><th className="user-name-cell">{t('Пользователь')}</th><th className="user-email-cell">Email</th><th>{t('Роль')}</th><th>{t('Траектория')}</th><th>{t('Доступ к курсам')}</th><th>{t('Статус')}</th><th className="user-last-login">{t('Последний вход')}</th><th className="user-actions-cell"><span className="sr-only">{t('Действия')}</span></th></tr></thead><tbody>
        {users.data?.results.map(row => <tr key={row.id}><td className="user-name-cell"><Link className="user-name" to={`/admin/users/${row.id}`}><span className="avatar">{initials(row)}</span><span><strong>{userName(row)}</strong><small>{row.email}</small></span></Link></td><td className="user-email-cell">{row.email}</td><td data-label={t('Роль')}>{t(row.role === 'ADMIN' ? 'Администратор' : 'Студент')}</td><td data-label={t('Траектория')}>{row.learning_track_title ?? '—'}</td><td data-label={t('Доступ к курсам')}>{row.role === 'ADMIN' ? '—' : row.course_access_mode === 'TRACK_DEFAULT' ? t('Все курсы траектории') : `${t('Выбрано курсов')}: ${row.accessible_course_count}`}</td><td data-label={t('Статус')}><UserStatus active={row.is_active}/></td><td className="user-last-login">{row.last_login ? new Date(row.last_login).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td className="user-actions-cell"><UserRowActions user={row} actorId={user.id} onStatusChange={setChanging}/></td></tr>)}
      </tbody></table>{!users.data?.results.length && <div className="management-empty">{t('Пользователи не найдены')}</div>}</div>
      <Pagination data={users.data} page={page} busy={users.isFetching || serialized !== debounced} onPage={next => setFilter('page', String(next))}/>
    </>}
    {creating && <UserCreateDialog onClose={() => setCreating(false)} onCreated={created => { setCreating(false); void qc.invalidateQueries({ queryKey: ['admin-users'] }); navigate(`/admin/users/${created.id}`) }}/>}
    {changing && <Confirm title={`${t(changing.is_active ? 'Деактивировать пользователя' : 'Активировать пользователя')} «${userName(changing)}»? ${t('История обучения сохранится.')}`} onCancel={() => { if (!busy) setChanging(null) }} onConfirm={() => void changeStatus()}/>}
  </div>
}
