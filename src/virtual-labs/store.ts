/* Данные модуля на сервере (ТЗ, п. 31): профиль, прохождения работ с версиями, портфолио, события.
   Интерфейс меняет объекты сразу (как в версии 4.0), а изменения отправляются на сервер с небольшой задержкой.
   Баллы экспертизы, которые вернул сервер, считаются окончательными: сервер пересчитывает их сам. */
import { useSyncExternalStore } from 'react'
import { labApi, type LabConfig, type LabState } from './api'
import { Registry } from './core/registry'
import { Evaluation, criteriaChanged, type CriteriaConfig } from './core/evaluation'
import { uid } from './core/util'
import type { EvaluationResult, Inputs, PortfolioItem, Profile, Session, Version, WorkModule } from './core/types'
import './core/works'

const DEFAULT_CRITERIA: Record<string, string> = {
  structure: 'Структура', completeness: 'Полнота', topic: 'Соответствие теме', outcomes: 'Соответствие результатам обучения',
  audience: 'Соответствие аудитории', clarity: 'Понятность', terms: 'Корректность терминов', pedagogy: 'Педагогическая ценность',
  science: 'Научная корректность', sources: 'Достоверность и риск галлюцинаций',
}

type Status = 'idle' | 'loading' | 'ready' | 'error'
let status: Status = 'idle'
let loadError = ''
let revision = 0
const listeners = new Set<() => void>()
const notify = () => { revision++; listeners.forEach(fn => fn()) }

let config: LabConfig | null = null
let state: LabState = { version: 3, profile: null, settings: {}, sessions: {}, portfolio: [] }
let saveError = ''

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const inflight = new Map<string, Promise<void>>()
let events: { ts: number; type: string; modId: string | null; data: unknown }[] = []
let eventTimer: ReturnType<typeof setTimeout> | undefined

function newSession(): Session {
  return { inputs: {}, prompt: '', promptVersions: [], versions: [], currentVersionId: null, startedAt: Date.now(), timeSpent: 0, step: 0,
    stats: { generations: 0, promptImprovements: 0, edits: 0 }, completed: false, lastEvaluation: null, lastPromptScore: null,
    quiz: null, chat: [], research: [] }
}

/** Ответ сервера: обновляем только то, что считает сервер (баллы и экспертизу), чтобы не затереть ввод пользователя */
function mergeServer(code: string, server: Session) {
  const local = state.sessions[code]
  if (!local) { state.sessions[code] = server; return }
  const scores = new Map(server.versions.map(v => [v.id, v.score]))
  for (const v of local.versions) if (scores.has(v.id) && scores.get(v.id) != null) v.score = scores.get(v.id)!
  const current = local.versions.find(v => v.id === local.currentVersionId)
  if (server.lastEvaluation && current && server.lastEvaluation.total === current.score) local.lastEvaluation = { ...server.lastEvaluation, engine: 'server' }
}

async function pushSession(code: string) {
  const s = state.sessions[code]
  if (!s) return
  const body = JSON.parse(JSON.stringify(s)) as Session
  try {
    const server = await labApi<Session>(`sessions/${code}/`, 'PUT', body)
    mergeServer(code, server)
    saveError = ''
  } catch (e) {
    saveError = (e as Error).message
  }
  notify()
}

function scheduleFlushEvents() {
  clearTimeout(eventTimer)
  eventTimer = setTimeout(() => {
    const batch = events.splice(0, 200)
    if (batch.length) labApi('events/', 'POST', { events: batch }).catch(() => { events = batch.concat(events).slice(-500) })
  }, 4000)
}

export const Lab = {
  // ---------- загрузка ----------
  status: () => status,
  error: () => loadError,
  saveError: () => saveError,
  async load(force = false) {
    if (status === 'loading' || (status === 'ready' && !force)) return
    status = 'loading'; loadError = ''; notify()
    try {
      const [cfg, st] = await Promise.all([labApi<LabConfig>('config/'), labApi<LabState>('state/')])
      config = cfg
      state = { ...st, sessions: st.sessions || {}, portfolio: st.portfolio || [] }
      for (const s of Object.values(state.sessions)) {
        s.chat ??= []; s.research ??= []; s.promptVersions ??= []; s.stats ??= { generations: 0, promptImprovements: 0, edits: 0 }
      }
      status = 'ready'
    } catch (e) {
      status = 'error'; loadError = (e as Error).message
    }
    notify()
  },
  async reloadConfig() { config = await labApi<LabConfig>('config/'); notify() },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  revision: () => revision,
  notify,

  // ---------- настройки модуля ----------
  config: () => config!,
  role: () => config?.user.role ?? 'teacher',
  isTutor: () => config?.user.role === 'tutor' || config?.user.role === 'admin',
  isAdmin: () => config?.user.role === 'admin',
  aiReady: () => !!config?.ai.configured,
  ttsReady: () => !!config?.tts.configured,
  criteriaConfig(): CriteriaConfig | null {
    const c = config?.criteria
    return c && criteriaChanged(c, DEFAULT_CRITERIA) ? c : null
  },
  enabled(code: string) { return !config || config.enabledWorks.includes(code) },
  /** Работа с учётом шаблона промпта, который задал администратор */
  module(code: string | null | undefined): WorkModule | null {
    const m = Registry.get(code)
    if (!m) return null
    const tpl = config?.templates?.[m.id]
    if (!tpl) return m
    return { ...m, role: tpl.role || m.role, task: tpl.task || m.task, constraints: tpl.constraints?.length ? tpl.constraints : m.constraints }
  },
  modules(): WorkModule[] { return Registry.list().filter(m => Lab.enabled(m.id)).map(m => Lab.module(m.id)!) },
  courses() {
    const list = config?.courses ?? [{ id: null, title: 'Виртуальные работы', description: '', works: Registry.list().map(m => m.id) }]
    return list.map(c => ({ ...c, works: c.works.filter(code => Registry.has(code)) })).filter(c => c.works.length)
  },

  // ---------- профиль ----------
  profile: () => state.profile,
  async saveProfile(p: Profile) {
    state.profile = await labApi<Profile>('profile/', 'PUT', p)
    notify()
  },

  // ---------- прохождения ----------
  sessions: () => state.sessions,
  has: (code: string) => !!state.sessions[code],
  session(code: string): Session {
    if (!state.sessions[code]) state.sessions[code] = newSession()
    return state.sessions[code]
  },
  /** Сохранить прохождение (с задержкой, чтобы не отправлять каждое нажатие клавиши) */
  save(code: string, delay = 700) {
    notify()
    clearTimeout(timers.get(code))
    timers.set(code, setTimeout(() => { timers.delete(code); void Lab.flush(code) }, delay))
  },
  async flush(code: string) {
    clearTimeout(timers.get(code)); timers.delete(code)
    const previous = inflight.get(code)
    if (previous) await previous
    const job = pushSession(code)
    inflight.set(code, job)
    await job
    inflight.delete(code)
  },
  async reset(code: string) {
    clearTimeout(timers.get(code)); timers.delete(code)
    delete state.sessions[code]
    notify()
    await labApi(`sessions/${code}/`, 'DELETE')
  },
  addVersion(code: string, data: Omit<Version, 'id' | 'n' | 'ts'>): Version {
    const s = Lab.session(code)
    const v: Version = { id: uid('v'), n: s.versions.length ? Math.max(...s.versions.map(x => x.n)) + 1 : 1, ts: Date.now(), ...data }
    s.versions.push(v); s.currentVersionId = v.id
    return v
  },
  currentVersion(code: string): Version | null {
    const s = state.sessions[code]
    if (!s) return null
    return s.versions.find(v => v.id === s.currentVersionId) || s.versions[s.versions.length - 1] || null
  },

  /** Экспертиза в браузере — сразу; сервер затем пересчитывает её при сохранении */
  evaluate(m: WorkModule, s: Session, text: string): EvaluationResult {
    if (m.special === 'expertise') {
      const target = Lab.module(s.inputs.targetWork) || Lab.module('vw01')!
      return Evaluation.evaluate(target, s.inputs.content || '', s.inputs, Lab.criteriaConfig())
    }
    return Evaluation.evaluate(m, text, s.inputs, Lab.criteriaConfig())
  },

  // ---------- портфолио ----------
  portfolio: () => state.portfolio,
  async addToPortfolio(item: Omit<PortfolioItem, 'id' | 'ts'>) {
    const existing = state.portfolio.find(p => p.modId === item.modId)
    const it: PortfolioItem = { ...item, id: existing ? existing.id : uid('p'), ts: Date.now() }
    const saved = await labApi<PortfolioItem>('portfolio/', 'POST', it)
    state.portfolio = [saved, ...state.portfolio.filter(p => p.id !== saved.id)]
    notify()
    return saved
  },
  async removeFromPortfolio(id: string) {
    await labApi(`portfolio/${encodeURIComponent(id)}/`, 'DELETE')
    state.portfolio = state.portfolio.filter(p => p.id !== id)
    notify()
  },

  // ---------- события (Learning Analytics) ----------
  log(type: string, modId: string | null, data?: unknown) {
    events.push({ ts: Date.now(), type, modId, data: data ?? null })
    scheduleFlushEvents()
  },

  // ---------- сводка для главной страницы ----------
  summary() {
    const list = Object.entries(state.sessions).filter(([code]) => Registry.has(code))
    const evals = list.map(([, s]) => s.lastEvaluation).filter(Boolean) as EvaluationResult[]
    return {
      started: list.length,
      completed: list.filter(([, s]) => s.completed).length,
      avgScore: evals.length ? Math.round(evals.reduce((a, e) => a + e.total, 0) / evals.length) : null,
      timeSpent: list.reduce((a, [, s]) => a + (s.timeSpent || 0), 0),
      portfolio: state.portfolio.length,
    }
  },
  fieldDefault(key: string, profileKey?: string, fallback?: string | number, inputs?: Inputs): string | number {
    if (inputs && inputs[key] != null && inputs[key] !== '') return inputs[key]
    const p = state.profile || {}
    if (profileKey && p[profileKey]) return p[profileKey]
    return fallback ?? ''
  },
}

export function useLab(): number {
  return useSyncExternalStore(Lab.subscribe, Lab.revision)
}

export function workStatus(code: string): { key: 'none' | 'progress' | 'done'; score: number | null } {
  const s = state.sessions[code]
  if (!s) return { key: 'none', score: null }
  const v = s.versions.find(x => x.id === s.currentVersionId) || s.versions[s.versions.length - 1]
  const score = v ? v.score : null
  return { key: s.completed ? 'done' : 'progress', score }
}

/** Только для тестов */
export function __setState(next: Partial<LabState>, cfg?: LabConfig | null) {
  state = { ...state, ...next }; if (cfg !== undefined) config = cfg; status = 'ready'; notify()
}
