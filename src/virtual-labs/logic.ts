/* Действия виртуальной лаборатории: генерация, экспертиза, правки, текст для портфолио. */
import { useSyncExternalStore } from 'react'
import { PromptEngine } from './core/promptEngine'
import { Evaluation } from './core/evaluation'
import type { Field, Session, WorkModule } from './core/types'
import { Orchestrator } from './orchestrator'
import { Lab } from './store'

export const STEPS = ['Задание', 'Исходные данные', 'Промпт', 'Генерация', 'Экспертиза', 'Улучшение', 'Портфолио']

export const PROFILE_FIELDS: Field[] = [
  { key: 'fio', label: 'Ф. И. О.', type: 'text', required: true },
  { key: 'organization', label: 'Организация образования', type: 'text', placeholder: 'Например: КазНУ им. аль-Фараби' },
  { key: 'position', label: 'Должность', type: 'text', placeholder: 'старший преподаватель' },
  { key: 'discipline', label: 'Основная дисциплина / предмет', type: 'text', required: true },
  { key: 'program', label: 'Образовательная программа', type: 'text' },
  { key: 'audience', label: 'Уровень обучающихся', type: 'select', options: ['Студенты бакалавриата', 'Магистранты', 'Студенты колледжа', 'Учащиеся школы', 'Слушатели курсов повышения квалификации'] },
  { key: 'course', label: 'Курс / класс', type: 'text' },
  { key: 'language', label: 'Язык обучения', type: 'select', options: ['Русский', 'Казахский', 'Английский'] },
  { key: 'duration', label: 'Продолжительность занятия, мин', type: 'number', default: 50 },
]

export const DOC_KINDS: [string, string][] = [
  ['syllabus', 'Силлабус'], ['lecture', 'Лекция'], ['program', 'Образовательная программа'], ['guidelines', 'Методические указания'],
  ['textbook', 'Учебник / пособие'], ['presentation', 'Презентация'], ['other', 'Другое'],
]

/** Шаги цикла открываются по порядку: промпт — после исходных данных, экспертиза — после генерации */
export function unlocked(s: Session, i: number): boolean {
  if (i <= 1) return true
  if (i <= 3) return !!s.prompt
  return s.versions.length > 0
}

export function goStep(m: WorkModule, i: number) {
  const s = Lab.session(m.id)
  if (!unlocked(s, i)) return
  s.step = i
  Lab.save(m.id)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---------- состояние «идёт генерация» ----------
let busyId: string | null = null
const busyListeners = new Set<() => void>()
const setBusy = (id: string | null) => { busyId = id; busyListeners.forEach(f => f()) }
export const useBusy = () => useSyncExternalStore(f => { busyListeners.add(f); return () => { busyListeners.delete(f) } }, () => busyId)

function composePrompt(s: Session): string {
  let p = s.prompt
  if (s.inputs.basedOnText) p += `\n\nИСХОДНАЯ ЛЕКЦИЯ ИЗ ПОРТФОЛИО (используй как основу):\n"""\n${String(s.inputs.basedOnText).slice(0, 6000)}\n"""`
  return p
}

type Notify = (text: string, kind?: 'success' | 'error') => void

/** Генерация через AI Orchestrator, экспертиза и сохранение версии */
export async function generate(m: WorkModule, notify: Notify, t: (k: string, v?: Record<string, string | number>) => string) {
  if (busyId) return
  const s = Lab.session(m.id)
  s.step = 3
  Lab.save(m.id)
  setBusy(m.id)
  try {
    const r = await Orchestrator.generate(m, s.inputs, composePrompt(s))
    const ev = Lab.evaluate(m, s, r.text)
    const pa = PromptEngine.analyze(s.prompt)
    Lab.addVersion(m.id, { kind: 'generation', prompt: s.prompt, promptScore: pa.score, text: r.text, score: ev.total, provider: r.provider, model: r.model, ms: r.ms, error: r.error || null })
    s.stats.generations++
    s.lastEvaluation = ev
    s.lastPromptScore = pa.score
    Lab.log('generation', m.id, { score: ev.total, provider: r.provider })
    await Lab.flush(m.id)
    if (r.error) notify(t('Модель ИИ недоступна ({error}). Результат получен в демо-режиме.', { error: r.error }), 'error')
  } catch (e) {
    notify(t('Ошибка генерации: {error}', { error: (e as Error).message }), 'error')
  } finally {
    setBusy(null)
  }
}

/** Правка преподавателя сохраняется как новая версия с повторной экспертизой */
export async function saveEdit(m: WorkModule, s: Session, text: string): Promise<number> {
  let report = text
  if (m.special === 'expertise') s.inputs.content = text
  const ev = Lab.evaluate(m, s, text)
  if (m.special === 'expertise') report = Evaluation.toMarkdown(ev, s.inputs.topic)
  Lab.addVersion(m.id, { kind: 'edit', prompt: s.prompt, promptScore: PromptEngine.analyze(s.prompt).score, text: report, score: ev.total, model: 'правка преподавателя' })
  s.stats.edits++
  s.lastEvaluation = ev
  Lab.log('edit', m.id, { score: ev.total })
  await Lab.flush(m.id)
  return Lab.currentVersion(m.id)?.score ?? ev.total
}

/** Итоговый текст для портфолио */
export function portfolioText(m: WorkModule, s: Session): string {
  const v = Lab.currentVersion(m.id)!
  if (m.special === 'compare') {
    const gens = s.versions.filter(x => x.kind === 'generation')
    if (gens.length >= 2) {
      const a = gens[0], b = v
      const clean = (t: string) => t.replace(/^>.*$/m, '').replace(/^#\s.*$/m, '').replace(/^##/gm, '###')
      return `## Промпт №1 (оценка промпта ${a.promptScore}%)\n\`\`\`\n${a.prompt}\n\`\`\`\n\n## Результат №1 — оценка экспертизы ${a.score}\n${clean(a.text)}\n\n` +
        `## Улучшенный промпт (оценка ${b.promptScore}%)\n\`\`\`\n${b.prompt}\n\`\`\`\n\n## Итоговый результат — оценка экспертизы ${b.score}\n${clean(b.text)}\n\n` +
        `## Вывод\nСтруктурирование промпта (роль, контекст, цели обучения, аудитория, формат, ограничения, критерии) изменило оценку материала с ${a.score} до ${b.score} баллов.`
    }
  }
  if (m.special === 'chat' && s.chat.length) return v.text + '\n\n## Протокол тестового диалога\n' + s.chat.map(x => `**${x.role === 'user' ? 'Обучающийся' : 'Ассистент'}:** ${x.content}`).join('\n\n')
  return v.text
}

// ---------- тест в формате «**Вопрос N.** … A) … Ответ: X» ----------
export interface ParsedQuestion { q: string; options: string[]; answer: number; expl?: string }
export function parseQuiz(text: string): ParsedQuestion[] {
  const qs: ParsedQuestion[] = []
  const re = /\*\*Вопрос\s*(\d+)\.\*\*\s*(.+)\n((?:\s*[A-DА-Г]\)\s*.+\n)+)\s*Ответ:\s*([A-DА-Г])[.,]?\s*(.*)/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(text))) {
    const opts = mm[3].trim().split('\n').map(x => x.replace(/^\s*[A-DА-Г]\)\s*/, '').trim())
    const L = 'ABCDАБВГ'
    let ans = L.indexOf(mm[4]); if (ans > 3) ans -= 4
    qs.push({ q: mm[2].trim(), options: opts, answer: ans, expl: mm[5] })
  }
  return qs
}

/** Значение поля: введённое ранее → из профиля → по умолчанию */
export function fieldValue(f: Field, s: Session): string | number {
  return Lab.fieldDefault(f.key, f.profile, f.default ?? (f.type === 'select' && f.options ? f.options[0] : ''), s.inputs)
}

/** Проверка обязательных полей и приведение чисел */
export function readFields(fields: Field[], values: Record<string, string | number>): { data: Record<string, string | number>; bad: string[] } {
  const data: Record<string, string | number> = {}
  const bad: string[] = []
  for (const f of fields) {
    const v = String(values[f.key] ?? '').trim()
    if (f.required && !v) bad.push(f.key)
    data[f.key] = f.type === 'number' && v !== '' ? +v : v
  }
  return { data, bad }
}

export const isScience = (m: WorkModule) => m.block === 'Научная деятельность'
