export type TrackRef = { id: number; short_id: string; title: string }
export type CourseAccessMode = 'TRACK_DEFAULT' | 'CUSTOM'
export type AdminUser = { id: number; email: string; first_name: string; last_name: string; role: 'STUDENT' | 'ADMIN'; is_active: boolean; learning_track: number | null; learning_track_title: string | null; course_access_mode: CourseAccessMode; course_ids: number[]; accessible_course_count: number; is_protected: boolean; date_joined: string; last_login: string | null }
export type AdminLearningProgress = { id: number; item_title: string; item_type: 'LECTURE' | 'TEST' | 'PRACTICE'; course_title: string; module_title: string; progress_percent: number; is_completed: boolean; completed_at: string | null; updated_at: string }
export type User = { id: number; email: string; first_name: string; last_name: string; role: 'STUDENT' | 'ADMIN'; learning_track: TrackRef | null; date_joined?: string }
export type Track = { id: number; short_id: string; title: string; description: string; cover: number | null; is_published: boolean; is_active: boolean; is_system: boolean }
export type Course = { id: number; short_id: string; learning_track: number | null; title: string; slug: string; description: string; cover: number | null; position: number; is_published: boolean; adaptive_learning_enabled?: boolean }
export type Module = { id: number; short_id: string; course: number; title: string; description: string; position: number; is_published: boolean; adaptive_threshold?: number; is_locked?: boolean }
export type Lesson = { id: number; short_id: string; module: number; title: string; description: string; position: number; status: 'DRAFT' | 'PUBLISHED'; is_locked?: boolean }
export type LearningItem = { id: number; short_id: string; module: number; module_short_id?: string; module_title?: string; module_position?: number; course_id?: number; course_short_id?: string; course_title?: string; type: 'LECTURE' | 'TEST' | 'PRACTICE'; title: string; description: string; position: number; status: 'DRAFT' | 'PUBLISHED'; lesson: number | null; lesson_short_id: string | null; test: number | null; practice: number | null; practice_criteria?: string[]; is_locked?: boolean }
export type Block = { id?: number; type: 'TEXT' | 'IMAGE'; position: number; content: string; media: number | null; media_url?: string | null; config: Record<string, unknown> }
export type Option = { id?: number; text: string; position: number; is_correct?: boolean }
export type Question = { id?: number; text: string; position: number; points: number; competency?: string; options: Option[] }
export type Test = { id?: number; lesson?: number; title: string; description: string; passing_percent: number; max_attempts: number | null; is_published?: boolean; version?: number; questions: Question[] }
export type AdaptiveResult = { readiness: number; threshold: number; module_passed: boolean; module_completed: boolean; theory: number; practice: number; errors: number; competency: number; competencies: Record<string, number>; module_short_id: string; repeat_item_short_id: string; next_item_short_id: string | null }
export type Attempt = { id: number; test: number; test_version: number; answers: { question: number; option: number }[]; snapshot: { question: string; selected: string; correct: string; points: number }[]; earned_points: number; total_points: number; percent: number; passed: boolean; completed_at: string; adaptive_result?: AdaptiveResult | null }
export type CourseProgress = { percent: number; items: Record<string, { progress_percent: number; is_completed: boolean }>; modules?: Record<string, { id: number; status: 'locked' | 'completed' | 'repeat' | 'available'; is_locked: boolean; is_completed: boolean; threshold: number; readiness: number | null; attempts: number }> }
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

function cookie(name: string) { return document.cookie.split('; ').find(x => x.startsWith(name + '='))?.split('=')[1] || '' }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(errorMessage).join(' ')
  if (value && typeof value === 'object') return Object.values(value).map(errorMessage).join(' ')
  return translateCurrentLocale('Ошибка запроса')
}
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  if (method !== 'GET' && !cookie('csrftoken')) await fetch('/api/v1/csrf/', { credentials: 'include' })
  const body = data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data)
  const headers: Record<string, string> = {}
  if (body && !(data instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRFToken'] = decodeURIComponent(cookie('csrftoken'))
  const res = await fetch('/api/v1/' + path.replace(/^\//, ''), { method, body, headers, credentials: 'include' })
  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError(translateCurrentLocale('Размер файла превышает лимит сервера (до 10 МБ). Попробуйте уменьшить размер изображения.'), 413)
    }
    const payload = await res.json().catch(() => ({}))
    const rawDetail = payload.error?.detail ?? payload.detail
    const detail = typeof rawDetail === 'object' && rawDetail !== null && 'file' in rawDetail ? (rawDetail as { file: unknown }).file : rawDetail ?? translateCurrentLocale('Ошибка запроса')
    throw new ApiError(errorMessage(detail), res.status)
  }
  return res.status === 204 ? undefined as T : res.json()
}

export async function apiAll<T>(path: string): Promise<T[]> {
  const results: T[] = []
  let next: string | null = path
  while (next) {
    const page: Page<T> = await api<Page<T>>(next)
    results.push(...page.results)
    if (!page.next) break
    const url = new URL(page.next, window.location.origin)
    const apiPrefix = '/api/v1/'
    next = `${url.pathname.startsWith(apiPrefix) ? url.pathname.slice(apiPrefix.length) : url.pathname.replace(/^\//, '')}${url.search}`
  }
  return results
}
import { translateCurrentLocale } from './i18n'
