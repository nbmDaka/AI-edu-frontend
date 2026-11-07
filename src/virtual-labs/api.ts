/* Клиент API модуля: /api/v1/virtual-labs/. Сессия и CSRF — как в AI edu (cookie csrftoken, заголовок X-CSRFToken). */
import { tr } from './i18n'
import type { EvaluationResult, PortfolioItem, Profile, Session } from './core/types'

export const API_BASE = '/api/v1/virtual-labs/'

export class LabApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message) }
}

function cookie(name: string) {
  return decodeURIComponent(document.cookie.split('; ').find(x => x.startsWith(name + '='))?.split('=')[1] || '')
}

let csrfRequest: Promise<void> | undefined
async function ensureCsrf() {
  if (cookie('csrftoken')) return
  csrfRequest ??= fetch('/api/v1/csrf/', { credentials: 'include' }).then(() => undefined).finally(() => { csrfRequest = undefined })
  await csrfRequest
}

function message(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(message).join(' ')
  if (value && typeof value === 'object') return Object.values(value).map(message).join(' ')
  return ''
}

async function failure(res: Response): Promise<LabApiError> {
  if (res.status === 413) return new LabApiError(tr('Файл слишком большой для сервера.'), 413)
  if (res.status === 429) return new LabApiError(tr('Слишком много запросов. Подождите минуту и повторите.'), 429, 'throttled')
  const payload = await res.json().catch(() => ({}))
  const detail = payload?.error?.detail ?? payload?.detail ?? payload
  const code = payload?.error?.code ?? payload?.code
  return new LabApiError(tr(message(detail) || 'Ошибка запроса'), res.status, code)
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request(path: string, method: Method = 'GET', data?: unknown): Promise<Response> {
  const unsafe = method !== 'GET'
  if (unsafe) await ensureCsrf()
  const form = typeof FormData !== 'undefined' && data instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (unsafe) headers['X-CSRFToken'] = cookie('csrftoken')
  if (data !== undefined && !form) headers['Content-Type'] = 'application/json'
  const res = await fetch(path.startsWith('/') ? path : API_BASE + path, {
    method, credentials: 'include', headers, body: data === undefined ? undefined : form ? data as FormData : JSON.stringify(data),
  })
  if (!res.ok) throw await failure(res)
  return res
}

export async function labApi<T = unknown>(path: string, method: Method = 'GET', data?: unknown): Promise<T> {
  const res = await request(path, method, data)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function labBlob(path: string, method: Method = 'POST', data?: unknown): Promise<{ blob: Blob; filename: string }> {
  const res = await request(path, method, data)
  const disposition = res.headers.get('Content-Disposition') || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return { blob: await res.blob(), filename: star ? decodeURIComponent(star[1]) : plain ? plain[1] : 'file' }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- типы ответов ----------
export type Role = 'teacher' | 'tutor' | 'admin'
export type CriterionConfig = { key: string; name: string; weight: number; isActive: boolean; description?: string }
export type TemplateOverride = { role: string; task: string; constraints: string[]; system: string }
export type LabConfig = {
  user: { id: number; login: string; name: string; firstName?: string; role: Role }
  courses: { id: number | null; title: string; description: string; works: string[] }[]
  enabledWorks: string[]
  templates: Record<string, TemplateOverride>
  criteria: CriterionConfig[]
  ai: { configured: boolean; kind: string; name: string; model: string }
  tts: { configured: boolean; kind: string; name: string; model: string }
  features: { manageAccounts: boolean; maxUploadBytes: number; uploadExtensions: string[] }
}
export type LabState = { version: number; profile: Profile | null; settings: Record<string, unknown>; sessions: Record<string, Session>; portfolio: PortfolioItem[] }
export type Publication = { title: string; authors: string; year: number | null; venue: string; doi: string | null; url: string; cited: number | null; abstract?: string; source: string }
export type LiteratureResult = { results: Publication[]; errors: Record<string, string> }
export type UploadedDoc = { id: number; name: string; kind: string; size: number; contentType: string; pages: number; chars: number; createdAt: string; url: string; text?: string }
export type UserAnalytics = {
  id: number; login: string; fio: string; organization: string; started: number; completed: number; generations: number; promptImprovements: number
  edits: number; timeSpentMs: number; avgScore: number | null; avgFirstScore: number | null; avgQuiz: number | null; avgPrompt: number | null
  avgGrade: number | null; portfolio: number; events: number; tools: Record<string, number>; aiRequests: number
  perWork: { modId: string; completed: boolean; firstScore: number | null; score: number | null; bestScore: number | null; generations: number; promptScore: number | null; quiz: number | null; timeSpentMs: number }[]
}
export type Review = { id: number; workCode: string; workTitle: string; reviewer: string; comment: string; grade: number | null; createdAt: string; seen: boolean }
export type MyAssignment = { id: number; group: string; workCode: string; workNumber: number; title: string; instructions: string; dueAt: string | null; createdAt: string; completed: boolean; score: number | null }
export type Group = { id: number; name: string; description: string; inviteCode: string; tutor: string; members: number; assignments: number; createdAt: string; memberList?: { id: number; login: string; name: string; joinedAt: string }[] }
export type TutorAssignment = { id: number; groupId: number; group: string; workCode: string; workNumber: number; workTitle: string; title: string; instructions: string; dueAt: string | null; createdAt: string; members: number; completed: number }
export type SessionSummary = { id: number; workCode: string; workNumber: number; workTitle: string; user: { id: number; login: string; name: string }; status: 'in_progress' | 'completed'; step: number; score: number | null; generations: number; updatedAt: string; completedAt: string | null; review: { grade: number | null; comment: string; createdAt: string } | null }
export type SessionDetail = Session & { summary: SessionSummary; recommendations: { kind: string; text: string }[]; reviews: { id: number; grade: number | null; comment: string; reviewer: string; createdAt: string }[] }
export type NextWork = { id: string | null; reason: string }
export type ServerEvaluation = EvaluationResult
