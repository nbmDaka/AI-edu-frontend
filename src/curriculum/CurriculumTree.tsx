import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import type { Course, LearningItem, Module } from '../api'
import { entityPath, type Entity, type EntityKind, type EntitySelection } from './types'
import { AddLearningItemMenu, LearningItemTypeIcon, itemTypeLabel } from './LearningItemControls'
import { useI18n } from '../i18n'

export type ModuleGroup = { module: Module; items: LearningItem[]; totalItems: number; hasTest: boolean }
export type CourseGroup = { course: Course; modules: ModuleGroup[]; totalModules: number }

function Status({ published }: { published: boolean }) {
  const { t } = useI18n()
  return <span className={`curriculum-status ${published ? 'is-published' : ''}`}>{t(published ? 'Опубликован' : 'Черновик')}</span>
}

export function EntityActionsMenu({ kind, item, editHref, canMoveUp, canMoveDown, onMove, onDelete }: {
  kind: EntityKind
  item: Entity
  editHref: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (selection: EntitySelection, delta: number) => void
  onDelete: (selection: EntitySelection) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [open])
  const selection = { kind, item }
  return <div className="entity-actions" ref={ref}>
    <button type="button" className="entity-actions-trigger" aria-label={`${t('Действия')}: ${item.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><MoreHorizontal size={19}/></button>
    {open && <div role="menu" className="entity-actions-popover">
      <Link role="menuitem" to={editHref} onClick={() => setOpen(false)}>{t('Редактировать')}</Link>
      <button role="menuitem" disabled={!canMoveUp} onClick={() => { onMove(selection, -1); setOpen(false) }}>{t('Переместить выше')}</button>
      <button role="menuitem" disabled={!canMoveDown} onClick={() => { onMove(selection, 1); setOpen(false) }}>{t('Переместить ниже')}</button>
      <span className="entity-actions-separator"/>
      <button role="menuitem" className="danger" onClick={() => { onDelete(selection); setOpen(false) }}>{t('Удалить')}</button>
    </div>}
  </div>
}

type TreeProps = {
  trackKey: string
  expanded: Record<string, boolean>
  forceOpen: boolean
  onToggle: (key: string) => void
  onCreate: (kind: EntityKind, parentId: number, type?: LearningItem['type']) => void
  onMove: (selection: EntitySelection, delta: number) => void
  onDelete: (selection: EntitySelection) => void
}

function LearningItemRow({ item, index, length, trackKey, canReorder, onMove, onDelete }: {
  item: LearningItem; index: number; length: number; trackKey: string; canReorder: boolean
  onMove: TreeProps['onMove']; onDelete: TreeProps['onDelete']
}) {
  const { t } = useI18n()
  const href = `${entityPath('items', item)}?track=${encodeURIComponent(trackKey)}`
  return <div className="curriculum-lesson-row">
    <span className="curriculum-number">{String(index + 1).padStart(2, '0')}.</span>
    <span className={`curriculum-item-icon type-${item.type.toLowerCase()}`}><LearningItemTypeIcon type={item.type}/></span>
    <Link className="curriculum-row-title" to={href}>{item.title}</Link>
    <span className="curriculum-item-type">{t(itemTypeLabel[item.type])}</span>
    <Status published={item.status === 'PUBLISHED'}/>
    <EntityActionsMenu kind="items" item={item} editHref={href} canMoveUp={canReorder && item.type !== 'TEST' && index > 0} canMoveDown={canReorder && item.type !== 'TEST' && index < length - 1} onMove={onMove} onDelete={onDelete}/>
  </div>
}

function ModuleRow({ group, index, length, trackKey, expanded, forceOpen, onToggle, onCreate, onMove, onDelete }: {
  group: ModuleGroup; index: number; length: number; trackKey: string
  expanded: TreeProps['expanded']; forceOpen: boolean; onToggle: TreeProps['onToggle']
  onCreate: TreeProps['onCreate']; onMove: TreeProps['onMove']; onDelete: TreeProps['onDelete']
}) {
  const { t } = useI18n()
  const { module, items, totalItems, hasTest } = group
  const contentCount = items.filter(item => item.type !== 'TEST').length
  const key = `module-${module.id}`
  const open = forceOpen || (expanded[key] ?? true)
  const href = `${entityPath('modules', module)}?track=${encodeURIComponent(trackKey)}`
  return <div className="curriculum-module">
    <div className="curriculum-module-row">
      <button className="curriculum-expand" aria-label={`${t(open ? 'Свернуть' : 'Развернуть')} ${t('модуль')} ${module.title}`} aria-expanded={open} onClick={() => onToggle(key)}>{open ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>
      <span className="curriculum-number">{String(index + 1).padStart(2, '0')}.</span>
      <Link className="curriculum-row-title" to={href}>{module.title}</Link>
      <span className="curriculum-count">{totalItems} {t('эл.')}</span>
      <Status published={module.is_published}/>
      <AddLearningItemMenu hasTest={hasTest} onSelect={type => onCreate('items', module.id, type)}/>
      <EntityActionsMenu kind="modules" item={module} editHref={href} canMoveUp={!forceOpen && index > 0} canMoveDown={!forceOpen && index < length - 1} onMove={onMove} onDelete={onDelete}/>
    </div>
    {open && <div className="curriculum-lessons">{items.length ? items.map((item, itemIndex) => <LearningItemRow key={item.id} item={item} index={itemIndex} length={contentCount} trackKey={trackKey} canReorder={!forceOpen} onMove={onMove} onDelete={onDelete}/>) : <div className="curriculum-empty-row">{t('Элементов пока нет. Добавьте лекцию, практику или тест.')}</div>}</div>}
  </div>
}

export function CourseSection({ group, index, length, trackKey, expanded, forceOpen, onToggle, onCreate, onMove, onDelete }: TreeProps & { group: CourseGroup; index: number; length: number }) {
  const { t } = useI18n()
  const { course, modules, totalModules } = group
  const key = `course-${course.id}`
  const open = forceOpen || (expanded[key] ?? true)
  const href = `${entityPath('courses', course)}?track=${encodeURIComponent(trackKey)}`
  return <section className="curriculum-course-section" aria-label={`${t('Курс')} ${course.title}`}>
    <div className="curriculum-course-row">
      <button className="curriculum-expand" aria-label={`${t(open ? 'Свернуть' : 'Развернуть')} ${t('Курс')} ${course.title}`} aria-expanded={open} onClick={() => onToggle(key)}>{open ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</button>
      <span className="curriculum-course-icon">{course.cover ? <img src={`/api/v1/media/${course.cover}/`} alt="" className="curriculum-course-cover"/> : <BookOpen size={20}/>}</span>
      <Link className="curriculum-row-title" to={href}>{course.title}</Link>
      <span className="curriculum-count">{totalModules} {t('мод.')}</span>
      <Status published={course.is_published}/>
      <button className="curriculum-add-inline" aria-label={`${t('Добавить модуль в курс')} ${course.title}`} title={t('Добавить модуль')} onClick={() => onCreate('modules', course.id)}><Plus size={17}/><span>{t('Модуль')}</span></button>
      <EntityActionsMenu kind="courses" item={course} editHref={href} canMoveUp={!forceOpen && index > 0} canMoveDown={!forceOpen && index < length - 1} onMove={onMove} onDelete={onDelete}/>
    </div>
    {open && <div className="curriculum-course-body">{modules.length ? modules.map((moduleGroup, moduleIndex) => <ModuleRow key={moduleGroup.module.id} group={moduleGroup} index={moduleIndex} length={modules.length} trackKey={trackKey} expanded={expanded} forceOpen={forceOpen} onToggle={onToggle} onCreate={onCreate} onMove={onMove} onDelete={onDelete}/>) : <div className="curriculum-empty-row">{t('Модулей пока нет')} <button onClick={() => onCreate('modules', course.id)}>{t('Добавить модуль')}</button></div>}</div>}
  </section>
}
