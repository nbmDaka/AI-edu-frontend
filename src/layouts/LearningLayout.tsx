import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, Check, CheckCircle2, Code2, List, LockKeyhole, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LearningItem, Lesson, Module } from '../api'
import { LanguageSelect, useI18n } from '../i18n'

type ContentEntry = Lesson | LearningItem
export type ItemProgress = { progress_percent: number; is_completed: boolean }
export type CourseSection = { module: Module; lessons: ContentEntry[] }
const entryHref = (item: ContentEntry) => 'type' in item ? `/items/${item.short_id}` : `/lessons/${item.short_id}`
const entryIcon = (item: ContentEntry) => 'type' in item && item.type === 'TEST' ? <CheckCircle2 size={15}/> : 'type' in item && item.type === 'PRACTICE' ? <Code2 size={15}/> : <BookOpen size={15}/>
const entryLocked = (item: ContentEntry) => Boolean(item.is_locked)

function AITutorPlaceholder() {
  const { t } = useI18n()
  return <><div className="tutor-icon"><Sparkles size={18}/></div><h2>{t('AI Tutor')}</h2><p>{t('Персональный помощник появится здесь позже.')}</p></>
}

export function LearningLayout({ children, tutor, courseTitle, moduleTitle, sections, lessonId, lessonTitle, currentIndex, totalLessons, previous, next, courseProgress, itemProgress = {} }: {
  children: ReactNode; courseTitle?: string; moduleTitle?: string; sections?: CourseSection[]; lessonId: string; lessonTitle: string
  currentIndex?: number; totalLessons?: number; previous?: ContentEntry; next?: ContentEntry; tutor?: ReactNode
  courseProgress?: number; itemProgress?: Record<string, ItemProgress>
}) {
  const [outlineOpen, setOutlineOpen] = useState(false)
  const { t } = useI18n()
  useEffect(() => { setOutlineOpen(false) }, [lessonId])
  useEffect(() => {
    if (!outlineOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOutlineOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [outlineOpen])

  const outline = <>
    <div className="outline-header"><div><span className="eyebrow">{t('СОДЕРЖАНИЕ КУРСА')}</span><h2>{courseTitle || t('Оглавление')}</h2></div><button className="icon-button outline-close" onClick={() => setOutlineOpen(false)} aria-label={t('Закрыть оглавление')}><X size={19}/></button></div>
    {totalLessons ? <div className="outline-progress"><div><span>{t('Ваш прогресс')}</span><strong>{courseProgress ?? 0}%</strong></div><div className="progress-track"><span style={{ width: `${courseProgress ?? 0}%` }}/></div></div> : null}
    <div className="outline-scroll">{sections?.map((section, sectionIndex) => <section className="outline-section" key={section.module.id}>
      <h3>{t('МОДУЛЬ')} {sectionIndex + 1} · {section.module.title}</h3>
      {section.lessons.map(item => {
        const state = itemProgress[item.short_id]
        if (section.module.is_locked || entryLocked(item)) return <div key={item.id} className="outline-lesson is-locked" aria-disabled="true" title={t('Сначала завершите предыдущий модуль')}><LockKeyhole size={15}/><span className="outline-lesson-title">{item.title}</span></div>
        return <Link key={item.id} to={entryHref(item)} onClick={() => setOutlineOpen(false)} className={`outline-lesson ${item.short_id === lessonId ? 'active' : ''}`} aria-current={item.short_id === lessonId ? 'page' : undefined}>
          {entryIcon(item)}<span className="outline-lesson-title">{item.title}</span>{state?.is_completed ? <Check size={15} className="outline-complete" aria-label={t('Выполнено')}/> : state?.progress_percent ? <small>{state.progress_percent}%</small> : null}
        </Link>
      })}
    </section>)}</div>
  </>

  return <div className="learning-layout">
    <header className="learning-header">
      <Link to="/catalog" className="learning-back" aria-label={t('Вернуться в каталог')}><ArrowLeft size={17}/><span>{t('Каталог')}</span></Link>
      <div className="learning-header-title"><span>{courseTitle || t('Моё обучение')}</span><strong>{moduleTitle || lessonTitle}</strong></div>
      <div className="learning-header-tools"><LanguageSelect compact/><button className="button secondary outline-button" onClick={() => setOutlineOpen(true)} aria-expanded={outlineOpen} aria-controls="course-outline"><List size={17}/><span>{t('Содержание')}</span></button></div>
    </header>
    <div className="learning-workspace">
      <aside className="course-outline desktop-outline" aria-label={t('Содержание курса')}>{outline}</aside>
      <div className="learning-center"><main className="learning-main">{children}</main>
        <footer className="lesson-navigation">
          {previous ? <Link className="button secondary" to={entryHref(previous)} aria-label={`${t('Предыдущий элемент')}: ${previous.title}`}><ArrowLeft size={16}/><span><small>{t('Предыдущий')}</small>{previous.title}</span></Link> : <span/>}
          <span className="lesson-counter">{totalLessons ? `${(currentIndex || 0) + 1} ${t('из')} ${totalLessons}` : t('Элемент')}</span>
          {next ? entryLocked(next) ? <span className="course-end"><LockKeyhole size={16}/>{t('Сначала завершите текущий модуль')}</span> : <Link className="button secondary" to={entryHref(next)} aria-label={`${t('Следующий элемент')}: ${next.title}`}><span><small>{t('Следующий')}</small>{next.title}</span><ArrowLeft className="next-arrow" size={16}/></Link> : <span className="course-end"><Check size={16}/>{t('Последний элемент')}</span>}
        </footer>
      </div>
      <aside className="learning-tutor" aria-label={t('AI Tutor')}>{tutor ?? <AITutorPlaceholder/>}</aside>
    </div>
    {outlineOpen && <div className="outline-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOutlineOpen(false) }}><aside id="course-outline" className="course-outline mobile-outline" aria-label={t('Содержание курса')}>{outline}</aside></div>}
  </div>
}
