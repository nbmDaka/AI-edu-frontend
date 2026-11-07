import { CheckCircle2, ClipboardCheck, Code2, LogIn, PlayCircle } from 'lucide-react'
import type { ActivityEvent, ActivityType } from '../api'

export const ACTIVITY_TYPES: ActivityType[] = ['LOGIN', 'LECTURE_STARTED', 'LECTURE_COMPLETED', 'PRACTICE_SUBMITTED', 'TEST_SUBMITTED']
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LOGIN: 'Вход в аккаунт',
  LECTURE_STARTED: 'Начало лекции',
  LECTURE_COMPLETED: 'Лекция изучена',
  PRACTICE_SUBMITTED: 'Сдача практики',
  TEST_SUBMITTED: 'Попытка теста',
}
export const ACTIVITY_ICONS = { LOGIN: LogIn, LECTURE_STARTED: PlayCircle, LECTURE_COMPLETED: CheckCircle2, PRACTICE_SUBMITTED: Code2, TEST_SUBMITTED: ClipboardCheck }

function percent(value: number) {
  return `${Number(value.toFixed(1)).toLocaleString('ru-RU')}%`
}

/** Short result line for an event, already translated through `t`. */
export function activityResult(event: ActivityEvent, t: (key: string) => string) {
  const { data } = event
  if (event.type === 'PRACTICE_SUBMITTED' && data.score !== undefined)
    return `${percent(data.score * 100)} · ${t(data.completed ? 'засчитана' : 'не засчитана')}`
  if (event.type === 'TEST_SUBMITTED' && data.percent !== undefined) {
    const parts = [`${t('Результат')} ${percent(data.percent)}`]
    if (data.readiness !== undefined) parts.push(`${t('готовность')} ${percent(data.readiness)}`)
    parts.push(t((data.module_passed ?? data.passed) ? 'пройден' : 'не пройден'))
    return parts.join(' · ')
  }
  return ''
}

export function activityPlace(event: ActivityEvent) {
  return [event.course_title, event.module_title, event.item_title].filter(Boolean).join(' · ')
}
