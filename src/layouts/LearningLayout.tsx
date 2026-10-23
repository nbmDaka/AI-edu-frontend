import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight, CircleCheck, Code2, PanelLeftOpen, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LearningItem, Lesson, Module, User } from '../api'
import { LanguageSelect, useI18n } from '../i18n'
import { LearningStatus } from '../components/LearningStatus'
import { AccountMenu } from './AccountMenu'
import { NextItemAction } from './NextItemAction'
import { PanelResizeHandle } from './PanelResizeHandle'
import './learning-navigation.css'

export type ContentEntry = Lesson | LearningItem
export type ItemProgress = { progress_percent: number; is_completed: boolean; is_started?: boolean }
export type CourseSection = { module: Module; lessons: ContentEntry[] }
export const entryHref = (item: ContentEntry) => 'type' in item ? `/items/${item.short_id}` : `/lessons/${item.short_id}`
const typeLabel = (item: ContentEntry) => 'type' in item && item.type === 'TEST' ? 'Тест' : 'type' in item && item.type === 'PRACTICE' ? 'Практика' : 'Лекция'
const outlinePreference = (key: string) => { try { return sessionStorage.getItem(key) !== 'closed' } catch { return true } }

export function LearningLayout({ children, tutor, workspace = false, assessment = false, hideNext = false, courseTitle, courseSlug, user, moduleTitle, sections, lessonId, lessonTitle, totalLessons, next, courseProgress, itemProgress = {} }: {
  user?: User; courseSlug?: string; workspace?: boolean; assessment?: boolean; hideNext?: boolean
  children: ReactNode; courseTitle?: string; moduleTitle?: string; sections?: CourseSection[]; lessonId: string; lessonTitle: string
  currentIndex?: number; totalLessons?: number; previous?: ContentEntry; next?: ContentEntry; tutor?: ReactNode
  courseProgress?: number; itemProgress?: Record<string, ItemProgress>
}) {
  const { t } = useI18n()
  const preferenceKey = `course-outline:${courseSlug ?? courseTitle ?? 'course'}`
  const [desktopOpen, setDesktopOpen] = useState(() => outlinePreference(preferenceKey))
  const setOutlineVisible = (value: boolean) => { setDesktopOpen(value); try { sessionStorage.setItem(preferenceKey, value ? 'open' : 'closed') } catch { /* Optional UI preference. */ } }
  const [compact, setCompact] = useState(() => window.innerWidth <= 900)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tutorOpen, setTutorOpen] = useState(false)
  const [tutorWidth, setTutorWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem('learning-tutor-width'))
      return value >= 300 && value <= 560 ? value : 340
    } catch { return 340 }
  })
  const tutorPanelRef = useRef<HTMLElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const resizeTutor = (width: number) => {
    setTutorWidth(width)
    try { localStorage.setItem('learning-tutor-width', String(width)) } catch { /* Optional preference. */ }
  }
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const activeModule = sections?.find(section => section.lessons.some(item => item.short_id === lessonId))?.module.id
  const drawerRef = useRef<HTMLElement>(null), tutorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focusOutlineTrigger = useRef(false)
  const focusOutlinePanel = useRef(false)
  const outlineRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focusOutlineTrigger.current && !desktopOpen) {
      focusOutlineTrigger.current = false
      triggerRef.current?.focus()
    }
    if (focusOutlinePanel.current && desktopOpen) {
      focusOutlinePanel.current = false
      outlineRef.current?.querySelector<HTMLButtonElement>('.outline-close')?.focus()
    }
  }, [desktopOpen])
  useEffect(() => {
    const resize = () => { setCompact(window.innerWidth <= 900); if (window.innerWidth > 900) setDrawerOpen(false) }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    setDrawerOpen(false); setTutorOpen(false)
    if (activeModule !== undefined) setExpanded(current => ({ ...current, [activeModule]: true }))
    window.scrollTo?.(0, 0)
    centerRef.current?.scrollTo?.(0, 0)
  }, [lessonId, activeModule])
  useEffect(() => { setDesktopOpen(outlinePreference(preferenceKey)); setExpanded({}) }, [preferenceKey])
  useEffect(() => {
    if (!drawerOpen && !tutorOpen) return
    const returnFocus = document.activeElement as HTMLElement | null
    const root = drawerOpen ? drawerRef.current : tutorRef.current
    const focusable = () => [...(root?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select,summary,[tabindex="0"]') ?? [])].filter(element => !element.closest('[hidden]'))
    focusable()[0]?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawerOpen(false); setTutorOpen(false) }
      if (event.key !== 'Tab') return
      const nodes = focusable(), first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keyboard); if (drawerOpen) triggerRef.current?.focus(); else if (returnFocus?.isConnected) returnFocus.focus() }
  }, [drawerOpen, tutorOpen])

  const closeOutline = () => { if (compact) setDrawerOpen(false); else { focusOutlineTrigger.current = true; setOutlineVisible(false) } }
  const outline = <>
    <div className="outline-header"><div><span className="eyebrow">{t('СОДЕРЖАНИЕ КУРСА')}</span><h2>{courseTitle || t('Оглавление')}</h2></div><button className="icon-button outline-close" onClick={closeOutline} aria-label={t('Закрыть оглавление')}><X size={20}/></button></div>
    {totalLessons ? <div className="outline-progress"><div><span>{t('Ваш прогресс')}</span><strong>{courseProgress ?? 0}%</strong></div><div className="progress-track" role="progressbar" aria-label={t('Прогресс курса')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={courseProgress ?? 0}><span style={{ width: `${courseProgress ?? 0}%` }}/></div></div> : null}
    <nav className="outline-scroll" aria-label={t('Материалы курса')}>{sections?.map((section, sectionIndex) => {
      const open = expanded[section.module.id] ?? section.module.id === activeModule
      return <section className="outline-section" key={section.module.id}>
        <button type="button" className="outline-module-toggle" aria-expanded={open} aria-controls={`outline-module-${section.module.id}`} onClick={() => setExpanded(current => ({ ...current, [section.module.id]: !open }))}><span><small>{t('Модуль')} {sectionIndex + 1}</small><strong>{section.module.title}</strong></span><ChevronDown size={18} className={open ? 'is-expanded' : ''}/></button>
        <div id={`outline-module-${section.module.id}`} hidden={!open}>{section.lessons.map(item => {
          const state = itemProgress[item.short_id], locked = section.module.is_locked || item.is_locked
          const active = item.short_id === lessonId
          const number = /(?:лекция|практическая\s+работа|практика)\s*№?\s*(\d+)/i.exec(item.title)?.[1]
            ?? section.lessons.filter(entry => typeLabel(entry) === typeLabel(item)).findIndex(entry => entry.short_id === item.short_id) + 1
          const content = <><LearningStatus locked={locked} completed={state?.is_completed} percent={state?.progress_percent} started={state?.is_started} iconOnly size={21}/><span className="outline-entry-copy"><span className="outline-lesson-title" title={item.title}>{active ? `${t(typeLabel(item))} ${number}` : item.title}</span><small>{'type' in item && item.type === 'PRACTICE' ? <Code2 size={12}/> : 'type' in item && item.type === 'TEST' ? <CircleCheck size={12}/> : <BookOpen size={12}/>} {t(typeLabel(item))}</small></span></>
          return locked ? <div key={item.short_id} className="outline-lesson is-locked" aria-disabled="true" title={t('Сначала завершите предыдущий модуль')}>{content}</div> : <Link key={item.short_id} to={entryHref(item)} onClick={() => setDrawerOpen(false)} className={`outline-lesson ${item.short_id === lessonId ? 'active' : ''}`} aria-label={active ? item.title : undefined} aria-current={item.short_id === lessonId ? 'page' : undefined}>{content}</Link>
        })}</div>
      </section>
    })}</nav>
  </>

  const showOutline = !assessment && !compact && desktopOpen
  const showRail = !assessment && !showOutline
  const percent = Math.min(100, Math.max(0, courseProgress ?? 0))
  return <div style={{ '--learning-tutor-width': `${tutorWidth}px` } as CSSProperties} className={`learning-layout ${workspace ? 'is-document-workspace' : ''} ${assessment ? 'is-assessment' : ''} ${showOutline ? 'has-course-outline' : showRail ? 'has-course-rail' : ''} ${tutor && !assessment ? 'has-lecture-tutor' : ''}`}>
    {!assessment && <header className="learning-header" inert={drawerOpen || tutorOpen}>
      <Link to={courseSlug ? `/courses/${courseSlug}` : '/catalog'} className="learning-back" aria-label={t(courseSlug ? 'Вернуться к курсу' : 'Вернуться в каталог')}><ArrowLeft size={17}/><span>{t(courseSlug ? 'К курсу' : 'Каталог')}</span></Link>
      <nav className="learning-header-title learning-breadcrumbs" aria-label={t('Путь обучения')}>{courseTitle && <Link to={courseSlug ? `/courses/${courseSlug}` : '/catalog'}>{courseTitle}</Link>}{moduleTitle && <span>{moduleTitle}</span>}</nav>
      <div className="learning-header-tools"><LanguageSelect compact/>{tutor && <button className="button secondary tutor-toggle" title={t('Открыть тьютора')} aria-label={t('Открыть тьютора')} aria-expanded={tutorOpen} onClick={() => setTutorOpen(true)}><Sparkles size={17}/><span>{t('Тьютор')}</span></button>}{user && <div className="workspace-account"><AccountMenu user={user}/></div>}</div>
    </header>}
    <div className="learning-workspace" inert={drawerOpen || tutorOpen}>
      {showOutline && <aside ref={outlineRef} id="course-outline" className="course-outline desktop-outline" aria-label={t('Содержание курса')}>{outline}</aside>}
      {showRail && <aside className="course-outline-rail" aria-label={t('Панель курса')}><div className="course-outline-rail-inner">
        <button ref={triggerRef} type="button" className="outline-rail-trigger" onClick={() => { if (compact) setDrawerOpen(true); else { focusOutlinePanel.current = true; setOutlineVisible(true) } }} aria-label={t('Содержание')} title={t('Содержание')} aria-expanded={compact ? drawerOpen : false} aria-haspopup={compact ? 'dialog' : undefined}><PanelLeftOpen size={19}/><ChevronRight size={16}/></button>
        {courseProgress !== undefined && <div className="outline-rail-progress" role="progressbar" aria-label={t('Прогресс курса')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${t('Ваш прогресс')}: ${percent}%`}><strong>{percent}%</strong><span className="outline-rail-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }}/></span></div>}
      </div></aside>}
      <div ref={centerRef} className="learning-center"><main className="learning-main" aria-label={lessonTitle}>{children}</main>{!hideNext && <div className="learning-next-bar"><NextItemAction next={next} courseSlug={courseSlug}/></div>}</div>
      {tutor && !assessment && !tutorOpen && <aside ref={tutorPanelRef} id="learning-tutor-panel" className="learning-tutor" aria-label={t('AI Tutor')}>
        <PanelResizeHandle panel={tutorPanelRef} width={tutorWidth} onResize={resizeTutor}/>{tutor}
      </aside>}
    </div>
    {drawerOpen && compact && <div className="outline-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDrawerOpen(false) }}><aside ref={drawerRef} role="dialog" aria-modal="true" id="course-outline" className="course-outline mobile-outline" aria-label={t('Содержание курса')}>{outline}</aside></div>}
    {tutorOpen && <div ref={tutorRef} className="tutor-overlay" role="dialog" aria-modal="true" aria-label={t('ИИ-тьютор')} onMouseDown={event => { if (event.target === event.currentTarget) setTutorOpen(false) }}><aside className="learning-tutor"><div className="tutor-mobile-close"><button className="icon-button" title={t('Закрыть тьютора')} aria-label={t('Закрыть тьютора')} onClick={() => setTutorOpen(false)}><X size={19}/></button></div>{tutor}</aside></div>}
  </div>
}
