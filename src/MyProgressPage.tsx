import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, apiAll, type CourseLearningSummary, type CourseProgress, type LearningDashboard, type LearningItem } from './api'
import { AttemptHistory } from './AttemptHistory'
import { CourseProgressIndicator } from './components/LearningStatus'
import { Button, ErrorState, Loading } from './components/ui'
import { useI18n } from './i18n'

function CourseProgressCard({ course }: { course: CourseLearningSummary }) {
  const { t } = useI18n()
  const progress = useQuery({ queryKey: ['course-progress', course.short_id], queryFn: () => api<CourseProgress>(`courses/${course.short_id}/progress/`) })
  const materials = useQuery({ queryKey: ['course-items', course.id], queryFn: () => apiAll<LearningItem>(`items/?course=${course.id}&page_size=100`) })
  const completed = materials.data?.filter(item => item.status === 'PUBLISHED' && progress.data?.items[item.short_id]?.is_completed).sort((a, b) => (a.module_position ?? 0) - (b.module_position ?? 0) || a.module - b.module || a.position - b.position || a.id - b.id) ?? []
  return <article className="card progress-course"><h2><Link to={`/courses/${course.slug}`}>{course.title}</Link></h2>
    <CourseProgressIndicator percent={progress.data?.percent ?? course.percent} completed={course.completed_items} total={course.total_items}/>
    <h3>{t('Завершённые материалы')}</h3>
    {progress.isLoading || materials.isLoading ? <Loading/> : progress.error || materials.error ? <><ErrorState error={progress.error || materials.error}/><Button variant="secondary" onClick={() => { void progress.refetch(); void materials.refetch() }}>{t('Повторить')}</Button></> : completed.length ? <ul>{completed.map(item => <li key={item.id}>{item.module_title} · {item.is_locked ? item.title : <Link to={`/items/${item.short_id}`}>{item.title}</Link>}</li>)}</ul> : <p>{t('Завершённых материалов пока нет.')}</p>}
  </article>
}

export function MyProgressPage() {
  const { t } = useI18n()
  const dashboard = useQuery({ queryKey: ['learning-summary'], queryFn: () => api<LearningDashboard>('me/learning/') })
  const data = dashboard.data
  const courses = [...new Map((data ? [...data.active_courses, ...(data.resume_course ? [data.resume_course] : []), ...data.completed_courses, ...data.available_courses] : []).map(course => [course.id, course])).values()]
  return <><h1>{t('Мой прогресс')}</h1><section aria-label={t('Курсы')}>
    {dashboard.isLoading ? <Loading/> : dashboard.error ? <><ErrorState error={dashboard.error}/><Button variant="secondary" onClick={() => void dashboard.refetch()}>{t('Повторить')}</Button></> : courses.length ? <div className="progress-courses">{courses.map(course => <CourseProgressCard key={course.id} course={course}/>)}</div> : <p>{t('Нет доступных курсов.')}</p>}
  </section><AttemptHistory/></>
}
