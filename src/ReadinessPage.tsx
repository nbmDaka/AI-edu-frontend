import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { api, type ActivityEvent, type ReadinessCourse, type ReadinessDashboard, type ReadinessModule } from './api'
import { ACTIVITY_ICONS, ACTIVITY_LABELS, activityPlace, activityResult } from './activity/labels'
import { Button, ErrorState, Loading } from './components/ui'
import { RecommendationDetails } from './AdaptiveLearning'
import { useI18n } from './i18n'
import './readiness.css'

const STATUS_LABELS = { locked: 'Закрыт', available: 'Не пройден тест', repeat: 'Нужно повторить', completed: 'Пройден' } as const

function percent(value: number) {
  return `${Number(value.toFixed(1)).toLocaleString('ru-RU')}%`
}

/** Readiness bar on a fixed 0–100 scale with the module threshold marked. */
function ReadinessBar({ value, threshold, label }: { value: number | null; threshold: number; label: string }) {
  const filled = Math.max(0, Math.min(100, value ?? 0))
  const passed = value !== null && value >= threshold
  return <div className="readiness-bar" role="img" aria-label={label}>
    <span className={`readiness-bar-fill ${passed ? 'passed' : ''}`} style={{ width: `${filled}%` }}/>
    <span className="readiness-bar-threshold" style={{ left: `${threshold}%` }}/>
  </div>
}

function ModuleRow({ module }: { module: ReadinessModule }) {
  const { t } = useI18n()
  const barLabel = module.readiness === null ? `${t('Готовность ещё не измерена')}, ${t('порог')} ${module.threshold}%`
    : `${t('Готовность')} ${percent(module.readiness)}, ${t('порог')} ${module.threshold}%`
  return <li className="readiness-module">
    <div className="readiness-module-head">
      <h3>{module.title}</h3>
      <span className={`readiness-status ${module.status}`}>{t(STATUS_LABELS[module.status])}</span>
    </div>
    <div className="readiness-module-figures">
      <strong>{module.readiness === null ? '—' : percent(module.readiness)}</strong>
      <span>{t('порог')} {module.threshold}%</span>
      {module.attempts > 0 && <span>{t('Попыток')}: {module.attempts}</span>}
      {module.best_readiness !== null && module.attempts > 1 && <span>{t('Лучший результат')}: {percent(module.best_readiness)}</span>}
    </div>
    <ReadinessBar value={module.readiness} threshold={module.threshold} label={barLabel}/>
    {module.history.length > 1 && <ol className="readiness-history" aria-label={t('История попыток')}>
      {module.history.map((entry, index) => <li key={entry.completed_at + index} className={entry.passed ? 'passed' : ''}
        title={new Date(entry.completed_at).toLocaleString('ru-RU')}>{percent(entry.readiness)}</li>)}
    </ol>}
    {module.recommendation && <details className="readiness-recommendation">
      <summary>{t('Рекомендация по последней попытке')}</summary>
      <RecommendationDetails recommendation={module.recommendation}/>
    </details>}
  </li>
}

function CourseReadiness({ course }: { course: ReadinessCourse }) {
  const { t } = useI18n()
  const weak = course.competencies.filter(row => row.is_weak)
  return <section className="readiness-course card" aria-labelledby={`readiness-${course.id}`}>
    <header className="readiness-course-head">
      <div><span className="eyebrow">{t('Курс')}</span><h2 id={`readiness-${course.id}`}><Link to={`/courses/${course.slug}`}>{course.title}</Link></h2></div>
      <dl className="readiness-summary">
        <div><dt>{t('Модулей пройдено')}</dt><dd>{course.passed_modules} / {course.total_modules}</dd></div>
        <div><dt>{t('Средняя готовность')}</dt><dd>{course.average_readiness === null ? '—' : percent(course.average_readiness)}</dd></div>
        <div><dt>{t('Слабых тем')}</dt><dd>{weak.length}</dd></div>
      </dl>
    </header>
    <ul className="readiness-modules">{course.modules.map(module => <ModuleRow key={module.id} module={module}/>)}</ul>
    {course.competencies.length > 0 && <section className="readiness-competencies" aria-label={t('Профиль компетенций')}>
      <h3>{t('Профиль компетенций')}</h3>
      <p className="readiness-note">{t('Оценка темы копится по всем попыткам: 40 % прежней оценки и 60 % последнего теста. Ниже')} {Math.round(course.weak_topic_limit * 100)}% — {t('слабая тема')}.</p>
      <ul>{course.competencies.map(row => <li key={row.competency} className={row.is_weak ? 'weak' : ''}>
        <span>{row.title}</span>
        <span className="readiness-competency-bar"><span style={{ width: `${Math.round(row.score * 100)}%` }}/></span>
        <strong>{Math.round(row.score * 100)}%</strong>
      </li>)}</ul>
    </section>}
  </section>
}

function RecentActivity() {
  const { t } = useI18n()
  const feed = useQuery({ queryKey: ['my-activity'], queryFn: () => api<ActivityEvent[]>('me/activity/'), staleTime: 30000 })
  if (!feed.data?.length) return null
  return <section className="readiness-activity card" aria-labelledby="readiness-activity-title">
    <h2 id="readiness-activity-title">{t('Последние действия')}</h2>
    <ol>{feed.data.map(event => { const Icon = ACTIVITY_ICONS[event.type]; const result = activityResult(event, t); return <li key={event.id}>
      <Icon size={16} aria-hidden="true"/>
      <div><strong>{t(ACTIVITY_LABELS[event.type])}</strong>{event.item_short_id ? <Link to={`/items/${event.item_short_id}`}>{activityPlace(event)}</Link> : <span>{activityPlace(event)}</span>}
        {result && <span className="readiness-activity-result">{result}</span>}</div>
      <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</time>
    </li> })}</ol>
  </section>
}

export function ReadinessPage() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['my-readiness'], queryFn: () => api<ReadinessDashboard>('me/readiness/'), staleTime: 30000 })
  if (query.isLoading) return <Loading label={t('Загрузка…')}/>
  if (query.error) return <><ErrorState error={query.error}/><Button variant="secondary" onClick={() => void query.refetch()}>{t('Повторить')}</Button></>
  const courses = query.data?.courses ?? []
  return <>
    <div className="page-heading-row"><div><h1>{t('Моя готовность')}</h1>
      <p>{t('Готовность по модулям, история попыток и темы, которые стоит повторить. Модуль засчитывается, когда готовность не ниже порога.')}</p></div></div>
    {courses.length ? courses.map(course => <CourseReadiness key={course.id} course={course}/>)
      : <section className="empty-state"><Gauge size={28}/><h2>{t('Пока нет курсов с адаптивным обучением')}</h2>
        <p>{t('Готовность появится после итогового теста модуля в адаптивном курсе.')}</p><Link className="button primary" to="/">{t('Моё обучение')}</Link></section>}
    <RecentActivity/>
  </>
}
