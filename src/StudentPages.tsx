import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Code2, Layers } from 'lucide-react'
import { api, apiAll, type Block, type Course, type CourseProgress, type CourseLearningSummary, type LearningItem, type Lesson, type LessonAttachment, type Module, type Track, type User } from './api'
import { Button, ErrorState, Input, Loading, Notice, Select } from './components/ui'
import { LearningLayout, type CourseSection } from './layouts/LearningLayout'
import { RichLessonContent } from './components/RichLessonContent'
import { LessonAttachments } from './components/LessonAttachments'
import { LectureProgress } from './LectureProgress'
import { useI18n } from './i18n'
import { TutorPanel } from './tutor/TutorPanel'
import { withoutRepeatedLectureTitle } from './lecture/title'
import { TestRunner } from './TestRunner'
import { CourseProgressIndicator, LearningStatus } from './components/LearningStatus'
import { LearningItemLink, PracticeRunner } from './AdaptiveLearning'
import { ProgramJourney } from './ProgramJourney'

function isTiptapContent(value: string) { try { return JSON.parse(value)?.type === 'doc' } catch { return false } }

export function CatalogPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useQuery({ queryKey: ['courses'], queryFn: () => apiAll<Course>('courses/') })
  return <><div className="page-heading-row"><div><span className="eyebrow">{t('КАТАЛОГ ОБУЧЕНИЯ')}</span><h1>{t('Каталог')}</h1><p>{t('Материалы доступны в рамках выбранной траектории обучения.')}</p></div><span className="catalog-count">{data?.length ?? 0} {t(data?.length === 1 ? 'курс' : 'курсов')}</span></div>{isLoading ? <Loading/> : error ? <ErrorState error={error}/> : data?.length ? <div className="catalog-grid">{data.map((course, i) => <Link className="catalog-card" key={course.id} to={`/courses/${course.slug}`}><div className={`catalog-card-art ${course.cover ? 'has-cover' : `tone-${i % 3}`}`}>{course.cover ? <img src={`/api/v1/media/${course.cover}/`} alt={course.title} className="catalog-card-image"/> : <><Layers size={29}/><span>AI Edu · {String(i + 1).padStart(2, '0')}</span></>}</div><div className="catalog-card-body"><span className="eyebrow">{t('КУРС')}</span><h2>{course.title}</h2><p>{course.description || t('Уроки и тесты для системного обучения.')}</p><span className="card-link">{t('Открыть курс')} <ChevronRight size={16}/></span></div></Link>)}</div> : <div className="empty-state"><Layers size={28}/><h2>{t('Курсы пока не опубликованы')}</h2><p>{t('Загляните позже — здесь появятся материалы по вашей траектории.')}</p></div>}</>
}

export function CoursePage() {
  const { t } = useI18n()
  const { slug } = useParams()
  const course = useQuery({ queryKey: ['course', slug], queryFn: () => api<Course>(`courses/${slug}/`) })
  const modules = useQuery({ queryKey: ['modules', course.data?.id], queryFn: () => apiAll<Module>(`modules/?course=${course.data!.id}`), enabled: Boolean(course.data) })
  const items = useQuery({ queryKey: ['course-items', course.data?.id], queryFn: () => apiAll<LearningItem>(`items/?course=${course.data!.id}&page_size=100`), enabled: Boolean(course.data) })
  const progress = useQuery({ queryKey: ['course-progress', course.data?.short_id], queryFn: () => api<CourseProgress & CourseLearningSummary>(`courses/${course.data!.short_id}/progress/`), enabled: Boolean(course.data) })
  if (course.isLoading || modules.isLoading || items.isLoading || progress.isLoading) return <Loading/>
  if (course.error || modules.error || items.error || progress.error) return <ErrorState error={course.error || modules.error || items.error || progress.error}/>
  const state = progress.data
  if (course.data?.certificate_enabled) return <><Link className="back" to="/"><ArrowLeft size={16}/>{t('Моё обучение')}</Link><ProgramJourney courseId={course.data.short_id}/></>
  return <>
    <Link className="back" to="/catalog"><ArrowLeft size={16}/>{t('Все курсы')}</Link>
    {course.data?.cover && <div className="course-banner"><img src={`/api/v1/media/${course.data.cover}/`} alt=""/></div>}
    <div className="page-heading-row"><div><span className="eyebrow">{state?.learning_track_title}</span><h1>{course.data?.title}</h1><p>{course.data?.description}</p></div></div>
    {state && <section className="course-overview card" aria-label={t('Прогресс курса')}><CourseProgressIndicator percent={state.percent} completed={state.completed_items} total={state.total_items}/>
      {state.is_completed ? <LearningStatus completed/> : state.resume_learning_item ? <Link className="button primary" to={`/items/${state.resume_learning_item.short_id}`}>{t(state.is_started ? 'Продолжить' : 'Начать курс')}<ChevronRight size={16}/></Link> : <p>{t('Материалы курса пока недоступны')}</p>}
      {state.is_completed && <strong>{t('Курс завершён')}</strong>}
    </section>}
    <div className="module-list">{modules.data?.map((module, index) => <section className="module-card card" key={module.id}><div className="module-number">{String(index + 1).padStart(2, '0')}</div><div className="module-content"><div><span className="eyebrow">{t('МОДУЛЬ')} {index + 1}</span><h2>{module.title}</h2><p>{module.description}</p>{module.is_locked && <p className="module-lock-message">{t('Сначала завершите предыдущий модуль')}</p>}</div>
      <div className="module-lesson-list">{items.data?.filter(item => item.module === module.id).sort((a, b) => a.position - b.position || a.id - b.id).map(item => {
        const itemState = state?.items[item.short_id]
        const itemLocked = item.is_locked || module.is_locked
        return <LearningItemLink item={item} locked={itemLocked} key={item.id}><span className="lesson-list-icon">{item.type === 'TEST' ? <CheckCircle2 size={17}/> : item.type === 'PRACTICE' ? <Code2 size={17}/> : <BookOpen size={17}/>}</span><span className="module-lesson-copy"><strong>{item.title}</strong><small>{t(item.type === 'LECTURE' ? 'Лекция' : item.type === 'TEST' ? 'Тест' : 'Практика')}</small></span><span className="module-lesson-actions"><LearningStatus locked={itemLocked} completed={itemState?.is_completed} percent={itemState?.progress_percent} started={itemState?.is_started} iconOnly/>{!itemLocked && <ChevronRight size={17}/>}</span></LearningItemLink>
      })}</div></div></section>)}</div>
    {!modules.data?.length && <div className="empty-state"><p>{t('Материалы курса пока недоступны')}</p></div>}
  </>
}

// Migrated lectures keep their public ID, but use the explicit relation for older bookmarks.
export function LessonPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const lesson = useQuery({ queryKey: ['legacy-lesson', id], queryFn: () => api<Lesson>(`lessons/${id}/`) })
  if (lesson.isLoading) return <Loading/>
  if (lesson.error) return <ErrorState error={lesson.error}/>
  if (lesson.data?.learning_item_short_id) return <Navigate to={`/items/${lesson.data.learning_item_short_id}`} replace/>
  return <div className="empty-state"><h1>{t('Материал пока недоступен')}</h1><p>{t('Этот материал ещё не связан с учебным элементом курса.')}</p><Link className="button secondary" to="/catalog">{t('Перейти в каталог')}</Link></div>
}

export function LearningItemPage({ user }: { user?: User } = {}) {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const [workspace, setWorkspace] = useState(false)
  const [search] = useSearchParams()
  const item = useQuery({ queryKey: ['learning-item', id], queryFn: () => api<LearningItem>(`items/${id}/`) })
  const blocks = useQuery({ queryKey: ['item-blocks', item.data?.lesson_short_id], queryFn: () => api<Block[]>(`lessons/${item.data!.lesson_short_id}/blocks/`), enabled: item.data?.type === 'LECTURE' && Boolean(item.data.lesson_short_id) })
  const attachments = useQuery({ queryKey: ['item-attachments', item.data?.lesson_short_id], queryFn: () => api<LessonAttachment[]>(`lessons/${item.data!.lesson_short_id}/attachments/`), enabled: item.data?.type === 'LECTURE' && Boolean(item.data.lesson_short_id) })
  const courseItems = useQuery({ queryKey: ['learning-items', item.data?.course_id], queryFn: () => apiAll<LearningItem>(`items/?course=${item.data!.course_id}&page_size=100`), enabled: Boolean(item.data?.course_id) })
  const progress = useQuery({ queryKey: ['course-progress', item.data?.course_short_id], queryFn: () => api<CourseProgress>(`courses/${item.data!.course_short_id}/progress/`), enabled: Boolean(item.data?.course_short_id) })
  if (item.isLoading || blocks.isLoading || attachments.isLoading || courseItems.isLoading || progress.isLoading) return <Loading/>
  if (item.error || blocks.error || attachments.error || courseItems.error || progress.error) return <ErrorState error={item.error || blocks.error || attachments.error || courseItems.error || progress.error}/>
  const grouped = new Map<number, CourseSection>()
  for (const entry of courseItems.data ?? []) {
    let section = grouped.get(entry.module)
    if (!section) {
      section = {
        module: {
          id: entry.module,
          short_id: entry.module_short_id ?? String(entry.module),
          course: entry.course_id ?? 0,
          title: entry.module_title ?? '',
          description: '',
          position: entry.module_position ?? 0,
          is_published: true,
          is_locked: entry.is_locked,
        },
        lessons: [],
      }
      grouped.set(entry.module, section)
    }
    section.lessons.push(entry)
  }
  const sections: CourseSection[] = [...grouped.values()].sort((a, b) => a.module.position - b.module.position || a.module.id - b.module.id)
  for (const section of sections) section.lessons.sort((a, b) => a.position - b.position || a.id - b.id)
  const entries = sections.flatMap(section => section.lessons)
  const index = entries.findIndex(entry => entry.short_id === id)
  const kind = item.data?.type === 'TEST' ? t('ТЕСТ') : item.data?.type === 'PRACTICE' ? t('ПРАКТИКА') : t('ЛЕКЦИЯ')
  const assessment = item.data?.type === 'TEST' && ['assessment', 'results'].includes(search.get('view') ?? '')
  return <LearningLayout tutor={item.data && item.data.type !== 'TEST' ? <TutorPanel key={`item-${id}`} contextType="item" contextId={id} lessonTitle={item.data.title} materialType={item.data.type === 'PRACTICE' ? 'practice' : 'lecture'}/> : undefined} workspace={workspace} assessment={assessment} hideNext={item.data?.type === 'TEST'} user={user} courseSlug={item.data?.course_short_id} courseTitle={item.data?.course_title} moduleTitle={item.data?.module_title} sections={sections} lessonId={id} lessonTitle={item.data?.title || t('Материал')} totalLessons={entries.length || undefined} next={index >= 0 ? entries[index + 1] : undefined} courseProgress={progress.data?.percent} itemProgress={progress.data?.items}>
    {item.data?.type === 'LECTURE' && <div className="lesson-heading"><span className="eyebrow">{kind}</span><h1>{item.data?.title}</h1><p>{item.data?.description}</p></div>}
    {item.data?.type === 'LECTURE' && <LectureProgress key={id} itemId={id} courseId={item.data.course_short_id ?? ''} savedPercent={progress.data?.items[id]?.progress_percent ?? 0}><article className="article lesson-article">{blocks.data?.map((block, index) => {
      const content = index === 0 ? withoutRepeatedLectureTitle(block.content, item.data?.title ?? '') : block.content
      return block.type === 'TEXT' ? <div key={block.id} className="markdown" style={{ textAlign: block.config?.align === 'center' || block.config?.align === 'right' ? block.config.align : 'left' }}>{isTiptapContent(content) ? <RichLessonContent value={content}/> : <ReactMarkdown skipHtml>{content}</ReactMarkdown>}</div> : <figure key={block.id}><img className={block.config?.width === 'reading' ? 'lesson-image-reading' : ''} src={block.media_url || ''} alt={String(block.config?.alt || block.content || 'Изображение лекции')}/>{block.content && <figcaption>{block.content}</figcaption>}</figure>
    })}<LessonAttachments attachments={attachments.data ?? []}/></article></LectureProgress>}
    {item.data?.type === 'TEST' && <TestRunner key={id} itemId={id} ownerId={user?.id} next={index >= 0 ? entries[index + 1] : undefined} courseSlug={item.data.course_short_id}/>}
    {item.data?.type === 'PRACTICE' && <PracticeRunner key={id} item={item.data} ownerId={user?.id} onWorkspaceChange={setWorkspace}/>}
  </LearningLayout>
}

export function PasswordSection() {
  const { t } = useI18n()
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [message, setMessage] = useState('')
  const save = async () => {
    try {
      await api('auth/password/', 'POST', { current_password: current, new_password: next })
      setCurrent(''); setNext(''); setMessage(t('Пароль изменён'))
    } catch (e) { setMessage((e as Error).message) }
  }
  return <div className="card form-card"><h3>{t('Изменить пароль')}</h3><div className="row"><label>{t('Текущий пароль')}<Input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)}/></label><label>{t('Новый пароль')}<Input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)}/></label></div><Button disabled={!current || next.length < 8} onClick={save}>{t('Обновить пароль')}</Button><Notice text={message} onDismiss={() => setMessage('')} kind={message === t('Пароль изменён') ? 'success' : 'error'}/></div>
}

export function ProfilePage({ user }: { user: User }) {
  const { t, locale } = useI18n()
  const qc = useQueryClient()
  const tracks = useQuery({ queryKey: ['profile-tracks'], queryFn: () => apiAll<Track>('tracks/') })
  const [first, setFirst] = useState(user.first_name), [last, setLast] = useState(user.last_name), [selectedTrack, setSelectedTrack] = useState(String(user.learning_track?.id ?? '')), [message, setMessage] = useState('')
  const save = async () => { try { const u = await api<User>('auth/me/', 'PATCH', { first_name: first, last_name: last, learning_track: selectedTrack ? Number(selectedTrack) : null }); qc.setQueryData(['me'], u); qc.invalidateQueries({ queryKey: ['courses'] }); qc.invalidateQueries({ queryKey: ['learning-summary'] }); setMessage(t('Профиль сохранён')) } catch (e) { setMessage((e as Error).message) } }
  const dateLocale = locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU'
  return <><div className="page-head"><div><span className="eyebrow">{t('ЛИЧНЫЕ ДАННЫЕ')}</span><h1>{t('Профиль')}</h1><p>{t('Управляйте личной информацией и смотрите результаты.')}</p></div></div><div className="card profile-card"><div className="avatar large">{(user.first_name || user.email)[0].toUpperCase()}</div><div><strong>{user.email}</strong><p>{t('Траектория:')} {user.learning_track?.title ?? t('не выбрана')}</p>{user.date_joined && <p>{t('С нами с')} {new Date(user.date_joined).toLocaleDateString(dateLocale)}</p>}</div></div><div className="card form-card"><h3>{t('Личные данные')}</h3><div className="row"><label>{t('Имя')}<Input value={first} onChange={e => setFirst(e.target.value)}/></label><label>{t('Фамилия')}<Input value={last} onChange={e => setLast(e.target.value)}/></label></div><label>{t('Траектория обучения')}<Select value={selectedTrack} onChange={e => setSelectedTrack(e.target.value)}><option value="">{t('Не выбрана')}</option>{tracks.data?.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</Select></label><Button onClick={save}>{t('Сохранить')}</Button><Notice text={message} onDismiss={() => setMessage('')}/></div><PasswordSection/></>
}
