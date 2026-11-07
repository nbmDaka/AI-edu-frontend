export type TrackRef = { id: number; short_id: string; title: string }
export type CourseAccessMode = 'TRACK_DEFAULT' | 'CUSTOM'
export type AdminUser = { id: number; email: string; first_name: string; last_name: string; role: 'STUDENT' | 'ADMIN'; is_active: boolean; learning_track: number | null; learning_track_title: string | null; course_access_mode: CourseAccessMode; course_ids: number[]; accessible_course_count: number; is_protected: boolean; date_joined: string; last_login: string | null }
export type AdminLearningProgress = { id: number; item_title: string; item_type: 'LECTURE' | 'TEST' | 'PRACTICE'; course_title: string; module_title: string; progress_percent: number; is_completed: boolean; completed_at: string | null; updated_at: string }
export type User = { id: number; email: string; first_name: string; last_name: string; role: 'STUDENT' | 'ADMIN'; learning_track: TrackRef | null; date_joined?: string }
export type Track = { id: number; short_id: string; title: string; description: string; cover: number | null; is_published: boolean; is_active: boolean; is_system: boolean }
export type Course = { id: number; short_id: string; learning_track: number | null; title: string; slug: string; description: string; cover: number | null; position: number; is_published: boolean; adaptive_learning_enabled?: boolean; certificate_enabled?: boolean; certificate_hours?: number; certificate_module_count?: number }
export type Module = { id: number; short_id: string; course: number; title: string; description: string; position: number; is_published: boolean; adaptive_threshold?: number; is_locked?: boolean }
export type Lesson = { id: number; short_id: string; learning_item_short_id?: string | null; module: number; title: string; description: string; position: number; status: 'DRAFT' | 'PUBLISHED'; is_locked?: boolean }
export type LearningItem = { id: number; short_id: string; module: number; module_short_id?: string; module_title?: string; module_position?: number; course_id?: number; course_short_id?: string; course_title?: string; type: 'LECTURE' | 'TEST' | 'PRACTICE'; title: string; description: string; position: number; status: 'DRAFT' | 'PUBLISHED'; lesson: number | null; lesson_short_id: string | null; test: number | null; practice: number | null; practice_version?: number | null; is_locked?: boolean; competencies?: string[] }
export type Block = { id?: number; type: 'TEXT' | 'IMAGE'; position: number; content: string; media: number | null; media_url?: string | null; config: Record<string, unknown> }
export type LessonAttachment = { media: number; name: string; size: number; url: string }
export type Option = { id?: number; text: string; position: number; is_correct?: boolean }
export type Question = { id?: number; text: string; position: number; points: number; competency?: string; options: Option[] }
export type Test = { id?: number; lesson?: number; title: string; description: string; passing_percent: number; max_attempts: number | null; is_published?: boolean; version?: number; questions: Question[] }
export type WeakTopic = { competency: string; title: string; score: number; correct: number; total: number }
export type ReviewItem = { short_id: string; title: string; type: 'LECTURE' | 'PRACTICE'; match: 'tag' | 'title' }
export type Recommendation = { review?: { competency: string; title: string; items: ReviewItem[] }[]; status: 'passed' | 'repeat'; action: 'next_module' | 'repeat_module' | 'course_completed'; level: 'repeat' | 'extra_practice' | 'next' | 'advanced'; gap: number; weakest_indicator: 'theory' | 'practice' | 'competency'; weak_topics: WeakTopic[]; weak_topic_limit: number; route?: ReviewRoute }
export type ReviewRoute = { scope: 'topics' | 'module'; items: Omit<ReviewItem, 'match'>[] }
export type ReadinessModule = { id: number; short_id: string; title: string; status: 'locked' | 'available' | 'repeat' | 'completed'; threshold: number; attempts: number; readiness: number | null; best_readiness: number | null; history: { completed_at: string; readiness: number; passed: boolean }[]; recommendation: Recommendation | null }
export type ReadinessCourse = { id: number; short_id: string; slug: string; title: string; passed_modules: number; total_modules: number; average_readiness: number | null; modules: ReadinessModule[]; competencies: { competency: string; title: string; score: number; is_weak: boolean }[]; weak_topic_limit: number }
export type ActivityType = 'LOGIN' | 'LECTURE_STARTED' | 'LECTURE_COMPLETED' | 'PRACTICE_SUBMITTED' | 'TEST_SUBMITTED'
export type ActivityEvent = { id: number; type: ActivityType; created_at: string; course: number | null; course_title: string | null; module_title: string | null; item_short_id: string | null; item_title: string | null; data: { score?: number; completed?: boolean; practice_type?: string; percent?: number; passed?: boolean; readiness?: number; module_passed?: boolean; test_title?: string } }
export type ReadinessDashboard = { courses: ReadinessCourse[] }
export type AdaptiveResult = { readiness: number; threshold: number; module_passed: boolean; module_completed: boolean; theory: number; practice: number; errors: number; competency: number; competencies: Record<string, number>; module_short_id: string; repeat_item_short_id: string; next_item_short_id: string | null; recommendation?: Recommendation }
export type AttemptQuestion = { question: string; selected: string; correct: string; points: number; question_id?: number; selected_option_id?: number; correct_option_id?: number; is_correct?: boolean; earned_points?: number; options?: { id: number; text: string }[] }
export type Attempt = { id: number; test: number; test_title?: string; course_title?: string | null; test_version: number; answers: { question: number; option: number }[]; snapshot: AttemptQuestion[]; earned_points: number; total_points: number; percent: number; passed: boolean; completed_at: string; adaptive_result?: AdaptiveResult | null }
export type ResumeLearningItem = { short_id: string; title: string; type: LearningItem['type'] }
export type CourseLearningSummary = { id: number; short_id: string; slug: string; title: string; description: string; cover: number | null; learning_track_title: string | null; percent: number; completed_items: number; total_items: number; is_started: boolean; is_completed: boolean; last_activity_at: string | null; resume_learning_item: ResumeLearningItem | null; certificate_enabled?: boolean; certificate_hours?: number }
export type LearningDashboard = { resume_course: CourseLearningSummary | null; active_courses: CourseLearningSummary[]; completed_courses: CourseLearningSummary[]; available_courses: CourseLearningSummary[] }
export type CourseProgress = { percent: number; items: Record<string, { progress_percent: number; is_completed: boolean; is_started?: boolean }>; modules?: Record<string, { id: number; status: 'locked' | 'completed' | 'repeat' | 'available'; is_locked: boolean; is_completed: boolean; threshold: number; readiness: number | null; attempts: number }> }
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

function cookie(name: string) { return document.cookie.split('; ').find(x => x.startsWith(name + '='))?.split('=')[1] || '' }
export class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message) } }
function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(errorMessage).join(' ')
  if (value && typeof value === 'object') return Object.values(value).map(errorMessage).join(' ')
  return translateCurrentLocale('Ошибка запроса')
}
async function responseError(res: Response): Promise<ApiError> {
  if (res.status === 413) return new ApiError(translateCurrentLocale('Размер файла превышает лимит сервера (до 10 МБ). Попробуйте уменьшить размер изображения.'), 413)
  const payload = await res.json().catch(() => ({}))
  const rawDetail = payload.error?.detail ?? payload.detail
  const detail = typeof rawDetail === 'object' && rawDetail !== null && 'file' in rawDetail ? (rawDetail as { file: unknown }).file : rawDetail ?? translateCurrentLocale('Ошибка запроса')
  return new ApiError(errorMessage(detail), res.status, payload.error?.code)
}

let csrfRequest: Promise<void> | undefined
async function ensureCsrfToken(force = false) {
  if (!force && cookie('csrftoken') && !csrfRequest) return
  if (!csrfRequest) {
    csrfRequest = (async () => {
      const response = await fetch('/api/v1/csrf/', { credentials: 'include' })
      if (!response.ok) throw await responseError(response)
    })().finally(() => { csrfRequest = undefined })
  }
  await csrfRequest
}

export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  if (data instanceof FormData) for (const value of data.values()) if (value instanceof Blob) validateUploadSize(value)
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
  if (unsafe) await ensureCsrfToken()
  const body = data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data)
  const headers: Record<string, string> = {}
  if (body && !(data instanceof FormData)) headers['Content-Type'] = 'application/json'
  for (let attempt = 0; attempt < 2; attempt++) {
    if (unsafe) headers['X-CSRFToken'] = decodeURIComponent(cookie('csrftoken'))
    const res = await fetch('/api/v1/' + path.replace(/^\//, ''), { method, body, headers, credentials: 'include' })
    if (res.ok) return res.status === 204 ? undefined as T : res.json()
    const error = await responseError(res)
    const csrfFailed = error.status === 403 && (error.code === 'csrf_failed' || (error.code === 'permission_denied' && error.message.startsWith('CSRF Failed:')))
    if (!unsafe || attempt > 0 || !csrfFailed) throw error
    await ensureCsrfToken(true)
  }
  throw new ApiError(translateCurrentLocale('Ошибка запроса'), 403)
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
import { validateUploadSize } from './utils/upload'
