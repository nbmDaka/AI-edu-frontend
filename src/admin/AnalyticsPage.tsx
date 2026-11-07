import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ArrowDownToLine, BookOpen, CheckCheck, RefreshCw, Users } from 'lucide-react'
import { api } from '../api'
import { Button, ErrorState, Input, Loading, Select } from '../components/ui'
import { useI18n } from '../i18n'
import { analyticsCsv, type AnalyticsCourse, type AnalyticsModule, type LearningAnalytics } from './analytics'
import { RecommendationPanel } from './RecommendationPanel'
import './analytics.css'

export function AnalyticsPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  const period = params.get('period') || '30d'
  const track = params.get('track') || ''
  const course = params.get('course') || ''
  const query = new URLSearchParams({ period })
  if (track) query.set('track', track)
  if (course) query.set('course', course)
  const report = useQuery({ queryKey: ['admin-analytics', period, track, course],
    queryFn: () => api<LearningAnalytics>(`admin/analytics/?${query}`), staleTime: 60000, placeholderData: keepPreviousData })
  const [tab, setTab] = useState<'courses' | 'modules'>('courses')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('started_students')
  const format = new Intl.NumberFormat(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU')
  const number = (value: number) => format.format(value)
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key === 'track') next.delete('course')
    setPage(1)
    setParams(next, { replace: true })
  }
  const data = report.data
  const courseTitles = new Map(data?.options.courses.map(row => [row.id, row.title]))
  const trackTitles = new Map(data?.options.tracks.map(row => [row.id, row.title]))
  const rows: (AnalyticsCourse | AnalyticsModule)[] = (data?.[tab] ?? [])
    .filter(row => `${row.title} ${'course_id' in row ? courseTitles.get(row.course_id) : trackTitles.get(row.learning_track_id)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) :
      (b[sort as keyof typeof b] as number) - (a[sort as keyof typeof a] as number) || a.title.localeCompare(b.title))
  const pageCount = Math.max(1, Math.ceil(rows.length / 10))
  const currentPage = Math.min(page, pageCount)
  const pageRows = rows.slice((currentPage - 1) * 10, currentPage * 10)
  const exportCsv = () => {
    if (!data) return
    const csv = analyticsCsv([
      [t('Период активности'), period, t('Траектория'), track ? trackTitles.get(Number(track)) ?? track : t('Все траектории'),
        t('Курс'), course ? courseTitles.get(Number(course)) ?? course : t('Все курсы'), t('Обновлено'), data.generated_at],
      [t(tab === 'courses' ? 'Курс' : 'Модуль'), t(tab === 'courses' ? 'Траектория' : 'Курс'), t('Элементы'),
        t('Начали обучение'), t('Обучались за период'), t('Завершили'), t('Завершение, %')],
      ...rows.map(row => [row.title, ('course_id' in row ? courseTitles.get(row.course_id) : trackTitles.get(row.learning_track_id)) ?? '',
        row.item_count, row.started_students, row.active_students, row.completed_students, row.completion_rate]),
    ])
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = `analytics-${tab}-${period}-${data.generated_at.slice(0, 10)}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const reset = () => { setParams({}); setPage(1); setSearch('') }
  return <div className="analytics-page">
    <div className="admin-page-heading"><div><span className="eyebrow">{t('Управление обучением')}</span><h1>{t('Аналитика')}</h1><p>{t('Использование траекторий, курсов и модулей в одном месте.')}</p></div>
      <Button variant="secondary" disabled={report.isFetching} onClick={() => void report.refetch()}><RefreshCw size={16} className={report.isFetching ? 'analytics-spin' : ''}/>{t('Обновить')}</Button>
    </div>
    <div className="analytics-filters">
      <label>{t('Период активности')}<Select value={period} onChange={event => setFilter('period', event.target.value)}>
        <option value="7d">{t('Последние 7 дней')}</option><option value="30d">{t('Последние 30 дней')}</option><option value="90d">{t('Последние 90 дней')}</option><option value="all">{t('Всё время')}</option>
      </Select></label>
      <label>{t('Траектория')}<Select value={track} onChange={event => setFilter('track', event.target.value)}><option value="">{t('Все траектории')}</option>{data?.options.tracks.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></label>
      <label>{t('Курс')}<Select value={course} onChange={event => setFilter('course', event.target.value)}><option value="">{t('Все курсы')}</option>{data?.options.courses.filter(row => !track || row.learning_track_id === Number(track)).map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</Select></label>
      <Button variant="secondary" onClick={reset}>{t('Сбросить')}</Button>
    </div>
    {report.isLoading || report.isPlaceholderData ? <Loading label={t('Загрузка аналитики…')}/> : report.error ? <div><ErrorState error={report.error}/><Button variant="secondary" onClick={() => void report.refetch()}>{t('Повторить')}</Button></div> : data && <>
      <div className="analytics-scope"><span>{t('Опубликованный контент')} · {t('Курсы')}: <b>{number(data.summary.course_count)}</b> · {t('Модули')}: <b>{number(data.summary.module_count)}</b> · {t('Элементы')}: <b>{number(data.summary.item_count)}</b></span>
        <span>{t('Обновлено')}: {new Date(data.generated_at).toLocaleString(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
      <div className="analytics-kpis">
        {[
          { label: 'Студентов на платформе', value: data.summary.total_students, note: 'Все траектории, включая неактивные аккаунты', Icon: Users, tone: 'blue' },
          { label: 'Обучались за период', value: data.summary.active_students, note: 'Уникальные студенты в выбранном контенте', Icon: Activity, tone: 'teal' },
          { label: 'Начали обучение', value: data.summary.started_students, note: 'В выбранном контенте за всё время', Icon: BookOpen, tone: 'gold' },
          { label: 'Завершили курс', value: data.summary.completed_students, note: 'Хотя бы один выбранный курс за всё время', Icon: CheckCheck, tone: 'purple' },
        ].map(({ label, value, note, Icon, tone }) => <article className={`analytics-kpi ${tone}`} key={label}><div><span>{t(label)}</span><Icon size={20} aria-hidden="true"/></div><strong>{number(value)}</strong><small>{t(note)}</small></article>)}
      </div>
      {!data.summary.started_students && <div className="analytics-empty"><BookOpen size={24} aria-hidden="true"/><div><strong>{t(data.summary.item_count ? 'Обучение ещё не началось' : 'Нет опубликованных учебных элементов')}</strong><p>{t('Статистика появится после сохранения прогресса, попытки теста или начала практики.')}</p></div></div>}
      <div className="analytics-charts">
        <section className="analytics-panel"><h2>{t('Использование траекторий')}</h2><p>{t('Уникальные студенты в выбранном контенте')}</p>
          <div className="analytics-legend"><span><i className="analytics-dot started"/>{t('Начали за всё время')}</span><span><i className="analytics-dot active"/>{t('Обучались за период')}</span></div>
          <div className="analytics-bars">{[...data.tracks].sort((a, b) => b.started_students - a.started_students).slice(0, 6).map(row => {
            const max = Math.max(1, ...data.tracks.map(item => item.started_students))
            return <div className="analytics-bar-row" key={row.id}><div><strong>{row.title}</strong><span>{t('Назначено на траекторию')}: {number(row.assigned_students)}</span></div>
              <div className="analytics-bar-line"><div aria-hidden="true"><i style={{ width: `${row.started_students / max * 100}%` }}/></div><span>{number(row.started_students)} <span className="sr-only">{t('Начали за всё время')}</span></span></div>
              <div className="analytics-bar-line active"><div aria-hidden="true"><i style={{ width: `${row.active_students / max * 100}%` }}/></div><span>{number(row.active_students)} <span className="sr-only">{t('Обучались за период')}</span></span></div>
            </div>
          })}{!data.tracks.length && <p>{t('Нет данных для выбранных фильтров')}</p>}</div>
          {data.tracks.length > 6 && <small>{t('Показаны 6 траекторий с наибольшим числом начавших обучение.')}</small>}
        </section>
        <CompletionChart data={data} number={number}/>
      </div>
      <section className="analytics-panel analytics-details"><div className="analytics-table-heading"><div><h2>{t('Статистика обучения')}</h2><p>{t('Начало и завершение — за всё время. Активность — за выбранный период.')}</p></div><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><ArrowDownToLine size={16}/>{t('Экспорт CSV')}</Button></div>
        <div className="analytics-table-tools"><div className="analytics-tabs" role="group" aria-label={t('Детализация')}>
          <button type="button" aria-pressed={tab === 'courses'} onClick={() => { setTab('courses'); setPage(1) }}>{t('Курсы')} ({number(data.courses.length)})</button>
          <button type="button" aria-pressed={tab === 'modules'} onClick={() => { setTab('modules'); setPage(1) }}>{t('Модули')} ({number(data.modules.length)})</button>
        </div><Input aria-label={t('Поиск по названию')} type="search" placeholder={t('Поиск по названию')} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}/><Select aria-label={t('Сортировка')} value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>
          <option value="started_students">{t('Сначала популярные')}</option><option value="active_students">{t('По активности')}</option><option value="completion_rate">{t('По доле завершения')}</option><option value="title">{t('По названию')}</option></Select></div>
        <div className="analytics-table-scroll"><table className="analytics-table"><caption className="sr-only">{t(tab === 'courses' ? 'Статистика курсов' : 'Статистика модулей')}</caption><thead><tr>
          <th scope="col">{t(tab === 'courses' ? 'Курс' : 'Модуль')}</th><th scope="col">{t('Элементы')}</th><th scope="col">{t('Начали обучение')}</th><th scope="col">{t('Обучались за период')}</th><th scope="col">{t('Завершили')}</th><th scope="col">{t('Доля завершения')}</th>
        </tr></thead><tbody>{pageRows.map(row => <tr key={row.id}><th scope="row"><Link to={`/admin/curriculum/${tab}/${row.short_id}`}>{row.title}</Link><small>{'course_id' in row ? courseTitles.get(row.course_id) : trackTitles.get(row.learning_track_id)}</small></th>
          <td>{number(row.item_count)}{'module_count' in row && <small>{t('Модули')}: {number(row.module_count)}</small>}</td><td>{number(row.started_students)}</td><td><span className={row.active_students ? 'analytics-active-count' : ''}>{number(row.active_students)}</span></td><td>{number(row.completed_students)}</td><td><div className="analytics-completion"><span>{number(row.completion_rate)}%</span><div aria-hidden="true"><i style={{ width: `${row.completion_rate}%` }}/></div></div></td>
        </tr>)}</tbody></table>{!rows.length && <div className="management-empty">{t('Нет данных для выбранных фильтров')}</div>}</div>
        {pageCount > 1 && <div className="management-pagination"><span>{t('Страница')} {currentPage} / {pageCount}</span><div className="management-pagination-actions"><Button variant="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t('Назад')}</Button><Button variant="secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>{t('Далее')}</Button></div></div>}
      </section>
      <RecommendationPanel modules={data.modules} courseTitles={courseTitles} number={number}/>
      <details className="analytics-methodology"><summary>{t('Как считаются показатели')}</summary><ul>
        <li>{t('Учитываются студенты, включая неактивные аккаунты. Администраторы и удалённые пользователи исключены.')}</li>
        <li>{t('Фильтры ограничивают учебный контент. Общее число студентов и назначения на траектории показывают текущее состояние платформы.')}</li>
        <li>{t('Активность — сохранённый прогресс, попытка теста (включая неуспешную) или работа с практикой. Вход в аккаунт не считается обучением.')}</li>
        <li>{t('Период — последние 7, 30 или 90 суток до обновления отчёта. Источник хранит последнюю активность, поэтому график посещений по дням не рассчитывается.')}</li>
        <li>{t('Завершение — выполнены все текущие опубликованные элементы курса или модуля. Пустой курс не считается завершённым. Доля завершения — завершившие / начавшие.')}</li>
        <li>{t('Используется только опубликованный контент активных опубликованных траекторий. Изменение программы или удаление данных может изменить накопленные показатели.')}</li>
        <li>{t('Студент учитывается один раз в каждом показателе. Один студент может изучать несколько курсов, поэтому сумма строк может превышать число уникальных студентов.')}</li>
      </ul></details>
    </>}
  </div>
}

function CompletionChart({ data, number }: { data: LearningAnalytics; number: (value: number) => string }) {
  const { t } = useI18n()
  const started = data.courses.reduce((sum, row) => sum + row.started_students, 0)
  const completed = data.courses.reduce((sum, row) => sum + row.completed_students, 0)
  const percent = started ? Math.round(completed / started * 100) : 0
  return <section className="analytics-panel"><h2>{t('Завершение курсов')}</h2><p>{t('По всем начатым курсам за всё время')}</p><div className="analytics-outcomes">
    <div className="analytics-donut" aria-hidden="true" style={{ background: started ? `conic-gradient(var(--analytics-teal) ${completed / started * 100}%, #e8ecf5 0)` : '#e8ecf5' }}><div><strong>{number(percent)}%</strong><span>{t('завершено')}</span></div></div>
    <dl><div><dt><i className="analytics-dot active"/>{t('Завершили')}</dt><dd>{number(completed)}</dd></div><div><dt><i className="analytics-dot pending"/>{t('Ещё не завершили')}</dt><dd>{number(started - completed)}</dd></div><div><dt>{t('Всего начатых курсов')}</dt><dd>{number(started)}</dd></div></dl>
  </div><p className="analytics-chart-note">{t('Единица подсчёта — студент и курс. Один студент может учитываться в нескольких курсах.')}</p></section>
}
