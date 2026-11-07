import { useDeferredValue, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw, Users } from 'lucide-react'
import { api, type ActivityEvent, type ActivityType, type Page } from '../api'
import { Button, ErrorState, Input, Loading, Select } from '../components/ui'
import { useI18n } from '../i18n'
import { ACTIVITY_ICONS, ACTIVITY_LABELS, ACTIVITY_TYPES, activityPlace, activityResult } from '../activity/labels'
import './analytics.css'
import './activity.css'

type AdminActivityEvent = ActivityEvent & { user_id: number; user_email: string; user_name: string }
type ActivitySummary = { days: { date: string; total: number; by_type: Partial<Record<ActivityType, number>> }[]; totals: Record<ActivityType, number>; active_users: number }

const KPI_TONES: Record<ActivityType, string> = { LOGIN: 'blue', LECTURE_STARTED: 'gold', LECTURE_COMPLETED: 'teal', PRACTICE_SUBMITTED: 'purple', TEST_SUBMITTED: 'blue' }

function DailyChart({ summary, number }: { summary: ActivitySummary; number: (value: number) => string }) {
  const { t, locale } = useI18n()
  const max = Math.max(1, ...summary.days.map(day => day.total))
  const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })
  return <section className="analytics-panel activity-chart"><h2>{t('Активность по дням')}</h2><p>{t('Все события за последние 14 дней с учётом фильтров, кроме периода.')}</p>
    <ol className="activity-days">{summary.days.map(day => <li key={day.date} title={ACTIVITY_TYPES.filter(type => day.by_type[type]).map(type => `${t(ACTIVITY_LABELS[type])}: ${day.by_type[type]}`).join('\n')}>
      <span className="activity-day-value">{day.total ? number(day.total) : ''}</span>
      <span className="activity-day-bar"><i style={{ height: `${day.total / max * 100}%` }}/></span>
      <span className="activity-day-label">{dayLabel(day.date)}</span>
      <span className="sr-only">{dayLabel(day.date)}: {number(day.total)}</span>
    </li>)}</ol>
  </section>
}

export function ActivityPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  const period = params.get('period') || '30d'
  const type = params.get('type') || ''
  const user = params.get('user') || ''
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [page, setPage] = useState(1)
  const filters = new URLSearchParams({ period })
  if (type) filters.set('type', type)
  if (user) filters.set('user', user)
  if (deferredSearch) filters.set('search', deferredSearch)
  const list = useQuery({ queryKey: ['admin-activity', filters.toString(), page],
    queryFn: () => api<Page<AdminActivityEvent>>(`admin/activity/?${filters}&page=${page}`), placeholderData: keepPreviousData })
  const summary = useQuery({ queryKey: ['admin-activity-summary', filters.toString()],
    queryFn: () => api<ActivitySummary>(`admin/activity/summary/?${filters}`), placeholderData: keepPreviousData })
  const format = new Intl.NumberFormat(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU')
  const number = (value: number) => format.format(value)
  const when = (value: string) => new Date(value).toLocaleString(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setPage(1)
    setParams(next, { replace: true })
  }
  const reset = () => { setParams({}); setSearch(''); setPage(1) }
  const pageCount = list.data ? Math.max(1, Math.ceil(list.data.count / 30)) : 1
  const refresh = () => { void list.refetch(); void summary.refetch() }
  return <div className="analytics-page">
    <div className="admin-page-heading"><div><span className="eyebrow">{t('Управление обучением')}</span><h1>{t('Журнал активности')}</h1><p>{t('Входы, лекции, практики и тесты студентов по времени.')}</p></div>
      <Button variant="secondary" disabled={list.isFetching} onClick={refresh}><RefreshCw size={16} className={list.isFetching ? 'analytics-spin' : ''}/>{t('Обновить')}</Button>
    </div>
    <div className="analytics-filters activity-filters">
      <label>{t('Период')}<Select value={period} onChange={event => setFilter('period', event.target.value)}>
        <option value="7d">{t('Последние 7 дней')}</option><option value="30d">{t('Последние 30 дней')}</option><option value="90d">{t('Последние 90 дней')}</option><option value="all">{t('Всё время')}</option>
      </Select></label>
      <label>{t('Действие')}<Select value={type} onChange={event => setFilter('type', event.target.value)}><option value="">{t('Все действия')}</option>
        {ACTIVITY_TYPES.map(kind => <option key={kind} value={kind}>{t(ACTIVITY_LABELS[kind])}</option>)}</Select></label>
      <label>{t('Студент')}<Input type="search" placeholder={t('Имя или email')} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}/></label>
      <Button variant="secondary" onClick={reset}>{t('Сбросить')}</Button>
    </div>
    {user && <p className="activity-user-filter">{t('Показаны действия одного студента.')} <button type="button" className="text-link" onClick={() => setFilter('user', '')}>{t('Показать всех')}</button></p>}
    {summary.data && <>
      <div className="analytics-kpis activity-kpis">
        <article className="analytics-kpi teal"><div><span>{t('Активных студентов')}</span><Users size={20} aria-hidden="true"/></div><strong>{number(summary.data.active_users)}</strong><small>{t('С хотя бы одним действием за период')}</small></article>
        {ACTIVITY_TYPES.map(kind => { const Icon = ACTIVITY_ICONS[kind]; return <article key={kind} className={`analytics-kpi ${KPI_TONES[kind]}`}>
          <div><span>{t(ACTIVITY_LABELS[kind])}</span><Icon size={20} aria-hidden="true"/></div><strong>{number(summary.data.totals[kind] ?? 0)}</strong></article> })}
      </div>
      <DailyChart summary={summary.data} number={number}/>
    </>}
    <section className="analytics-panel"><h2>{t('События')}</h2><p>{list.data ? `${t('Найдено')}: ${number(list.data.count)}` : ''}</p>
      {list.isLoading ? <Loading label={t('Загрузка журнала…')}/> : list.error ? <ErrorState error={list.error}/> : list.data && <>
        <div className="analytics-table-scroll"><table className="analytics-table activity-table"><caption className="sr-only">{t('Журнал активности')}</caption><thead><tr>
          <th scope="col">{t('Время')}</th><th scope="col">{t('Студент')}</th><th scope="col">{t('Действие')}</th><th scope="col">{t('Где')}</th><th scope="col">{t('Результат')}</th>
        </tr></thead><tbody>{list.data.results.map(event => { const Icon = ACTIVITY_ICONS[event.type]; return <tr key={event.id}>
          <td className="activity-time">{when(event.created_at)}</td>
          <th scope="row"><button type="button" className="activity-user" onClick={() => setFilter('user', String(event.user_id))}>{event.user_name || event.user_email}</button>
            <small><Link to={`/admin/users/${event.user_id}`}>{t(event.user_name ? event.user_email : 'Профиль студента')}</Link></small></th>
          <td><span className={`activity-type ${event.type.toLowerCase()}`}><Icon size={14} aria-hidden="true"/>{t(ACTIVITY_LABELS[event.type])}</span></td>
          <td className="activity-place">{activityPlace(event) || '—'}</td>
          <td>{activityResult(event, t) || '—'}</td>
        </tr> })}</tbody></table>{!list.data.results.length && <div className="management-empty">{t('Нет событий для выбранных фильтров')}</div>}</div>
        {pageCount > 1 && <div className="management-pagination"><span>{t('Страница')} {page} / {pageCount}</span><div className="management-pagination-actions"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('Назад')}</Button><Button variant="secondary" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>{t('Далее')}</Button></div></div>}
      </>}
    </section>
  </div>
}
