import type { Course, LearningItem, Module } from '../api'

export type EntityKind = 'courses' | 'modules' | 'items'
export type Entity = Course | Module | LearningItem
export type EntitySelection = { kind: EntityKind; item: Entity }

export const entityKey = (_kind: EntityKind, item: Entity) => item.short_id
export const entityPath = (kind: EntityKind, item: Entity) => {
  if (kind === 'courses') return `/admin/curriculum/courses/${item.short_id}`
  if (kind === 'modules') return `/admin/curriculum/modules/${item.short_id}`
  return `/admin/curriculum/items/${item.short_id}/edit`
}
export const sortByPosition = <T extends { position: number; id: number }>(items: T[]) => [...items].sort((a, b) => a.position - b.position || a.id - b.id)
export const sortLearningItems = (items: LearningItem[]) => [...items].sort((a, b) => Number(a.type === 'TEST') - Number(b.type === 'TEST') || a.position - b.position || a.id - b.id)
