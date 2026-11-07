/* Виртуальная лаборатория: единый цикл из 7 шагов для всех работ (ТЗ, п. 24). */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BrainCircuit, Copy, FolderPlus, RefreshCw, RotateCcw, Save, Sparkles, Undo2 } from 'lucide-react'
import { labBlob, saveBlob } from '../api'
import { PromptEngine } from '../core/promptEngine'
import { Recommendations } from '../core/recommendations'
import { diffLines, type DiffLine } from '../core/util'
import type { Session, Version, WorkModule } from '../core/types'
import { useT, type T } from '../i18n'
import { localize } from '../localize'
import { STEPS, fieldValue, generate, goStep, isScience, portfolioText, readFields, saveEdit, unlocked, useBusy } from '../logic'
import { Orchestrator, SERVICE_ROUTES } from '../orchestrator'
import { Lab, useLab, workStatus } from '../store'
import { useLabPath } from '../paths'
import { Badge, Button, Empty, Kpi, Markdown, Meter, Note, Spinner, StepNav, copyText, fmtDate, fmtDuration, scoreTone, useConfirm, useToast } from '../components/ui'
import { FieldInput, Quiz } from '../components/forms'
import { WorkIcon } from '../components/WorkIcon'
import { SpecialWidget } from './LabSpecial'

export function LabPage() {
  const { code = '' } = useParams()
  return <LabView key={code} code={code}/>
}

/** Лаборатория; embedded — внутри практики AI edu (без шапки и портфолио, со своей кнопкой завершения) */
export function LabView({ code, embedded, onFinish }: { code: string; embedded?: boolean; onFinish?: (m: WorkModule, s: Session, v: Version) => void }) {
  useLab()
  const t = useT()
  const path = useLabPath()
  const confirm = useConfirm()
  const m = Lab.enabled(code) ? Lab.module(code) : null
  // учёт времени выполнения (Learning Analytics)
  useEffect(() => {
    if (!m) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Lab.has(m.id)) { Lab.session(m.id).timeSpent += 15000; Lab.save(m.id, 3000) }
    }, 15000)
    return () => { clearInterval(timer); Orchestrator.stopSpeaking(); if (Lab.has(m.id)) void Lab.flush(m.id) }
  }, [m?.id])
  if (!m) return <Empty>{t('Лаборатория не найдена или отключена администратором.')} {!embedded && <Link className="text-link" to={path()}>{t('К списку')}</Link>}</Empty>
  const s = Lab.session(m.id)
  if (!unlocked(s, s.step)) s.step = 0
  const st = workStatus(m.id)
  const steps = embedded ? STEPS.slice(0, 6) : STEPS
  const step = Math.min(s.step, steps.length - 1)
  const Step = [StepTask, StepInputs, StepPrompt, StepGenerate, StepExpertise, StepImprove, StepPortfolio][step]
  return <div className="vl-lab">
    {!embedded && <Link className="back vl-back" to={path()}><ArrowLeft size={16}/>{t('Все лаборатории')}</Link>}
    <div className="vl-lab-head"><WorkIcon code={m.id} size={28}/><div className="vl-grow">
      <div className="vl-row vl-spread"><span className="eyebrow">{t('Виртуальная работа № {n}', { n: m.n })} · {t(m.category)}</span>
        <div className="vl-row">
          <Badge tone={st.key === 'done' ? 'good' : st.key === 'progress' ? 'info' : ''}>{st.key === 'done' ? t('Выполнена') : st.key === 'progress' ? t('В работе') : t('Не начата')}</Badge>
          <Badge tone={Lab.aiReady() ? 'good' : 'warn'}>{Lab.aiReady() ? Lab.config().ai.name : t('Демо-режим')}</Badge>
          <Button variant="ghost" size="sm" title={t('Начать работу заново')}
            onClick={() => confirm(t('Удалить все версии и начать эту работу заново? Портфолио не изменится.'), t('Начать заново'), () => void Lab.reset(m.id))}><RotateCcw size={15}/>{t('Заново')}</Button>
        </div></div>
      <h1>{t(m.title)}</h1></div></div>
    <nav className="vl-stepper" aria-label={t('Шаги работы')}>
      {steps.map((name, i) => <button key={name} type="button" className={`${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} aria-current={i === step ? 'step' : undefined}
        disabled={!unlocked(s, i)} onClick={() => goStep(m, i)}><span>{i + 1}</span>{t(name)}</button>)}
    </nav>
    <Step key={m.id + ':' + step} m={m} s={s} embedded={embedded} onFinish={onFinish}/>
  </div>
}

type StepProps = { m: WorkModule; s: Session; embedded?: boolean; onFinish?: (m: WorkModule, s: Session, v: Version) => void }

// Шаг 1. Задание
function StepTask({ m }: StepProps) {
  const t = useT()
  const criteria = Lab.config().criteria.filter(c => c.isActive)
  return <>
    <div className="vl-grid g2">
      <div className="card"><h2>{t('Цель работы')}</h2><p>{t(m.goal)}</p><h3>{t('Порядок выполнения')}</h3><ol className="vl-ol">{m.instructions.map(x => <li key={x}>{t(x)}</li>)}</ol></div>
      <div className="card"><h3>{t('Ожидаемый результат')}</h3><p>{t(m.expected)}</p>
        <h3>{t('Обязательные разделы материала')}</h3><div className="vl-chips">{m.sections.map(x => <span key={x.title} className="vl-chip">{t(x.title)}</span>)}</div>
        <h3 className="vl-mt">{t('Критерии автоматической экспертизы')}</h3><p className="vl-help">{criteria.map(c => t(c.name)).join(' · ')}</p>
        <h3>{t('Используемый AI-сервис')}</h3><p className="vl-help">{t(SERVICE_ROUTES[m.service] || SERVICE_ROUTES.llm)}</p></div>
    </div>
    <StepNav next={<Button onClick={() => goStep(m, 1)}>{t('Начать: исходные данные')}<ArrowRight size={16}/></Button>}/>
  </>
}

// Шаг 2. Исходные данные
function StepInputs({ m, s }: StepProps) {
  const t = useT()
  const toast = useToast()
  const [vals, setVals] = useState(() => Object.fromEntries(m.fields.map(f => [f.key, fieldValue(f, s)])))
  const [bad, setBad] = useState<string[]>([])
  const p = Lab.profile()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const { data, bad } = readFields(m.fields, vals); setBad(bad)
    if (bad.length) { document.getElementById('vl_f_' + bad[0])?.focus(); toast(t('Заполните обязательные поля'), 'error'); return }
    const inputs: Record<string, string | number> = data
    if (inputs.basedOn) {
      const it = Lab.portfolio().find(x => x.id === inputs.basedOn)
      inputs.basedOnText = it ? it.text : ''
      if (it && !inputs.topic) inputs.topic = it.title
    }
    if (p?.organization) inputs.organization = p.organization
    s.inputs = inputs
    const kind = m.initialPrompt === 'simple' && !s.versions.length ? 'simple' : 'full'
    s.prompt = kind === 'simple' ? PromptEngine.simple(m, inputs) : PromptEngine.build(m, inputs)
    s.promptVersions.push({ text: s.prompt, score: PromptEngine.analyze(s.prompt).score, kind: 'template', ts: Date.now() })
    Lab.log('inputs', m.id)
    goStep(m, 2)
  }
  return <form className="card" noValidate onSubmit={submit}><h2>{t('Исходные данные')}</h2>
    <p className="vl-help">{t('Укажите параметры вашей дисциплины. Поля со звёздочкой обязательны.')}{p?.fio || p?.discipline ? ' ' + t('Часть полей заполнена из профиля.') : ''}</p>
    <div className="vl-form-grid">{m.fields.map(f => <FieldInput key={f.key} f={f} value={vals[f.key] ?? ''} invalid={bad.includes(f.key)} onChange={v => setVals({ ...vals, [f.key]: v })}/>)}</div>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 0)}><ArrowLeft size={16}/>{t('Задание')}</Button>}
      next={<Button type="submit">{t('Сформировать промпт')}<ArrowRight size={16}/></Button>}/>
  </form>
}

// Шаг 3. Промпт
function PromptAnalysis({ text }: { text: string }) {
  const t = useT()
  const a = PromptEngine.analyze(text)
  return <>
    <h2>{t('Анализ промпта')}</h2>
    <div className="vl-row vl-spread"><b className="vl-big">{a.score}%</b><Badge tone={scoreTone(a.score)}>{a.score >= 85 ? t('Структурированный') : a.score >= 50 ? t('Частично структурирован') : t('Слабый промпт')}</Badge></div>
    <Meter value={a.score}/>
    <h3 className="vl-mt">{t('Блоки промпта')}</h3>
    <div className="vl-chips">{PromptEngine.BLOCKS.map(b => <span key={b.key} className={`vl-chip ${a.present.includes(b.key) ? 'on' : ''}`} title={t(b.hint)}>{a.present.includes(b.key) ? '✓' : '○'} {t(b.label)}</span>)}</div>
    {a.tips.length ? <><h3 className="vl-mt">{t('Что улучшить')}</h3><ul className="vl-ul">{a.tips.map(x => <li key={x}>{t(x)}</li>)}</ul></>
      : <Note kind="good">{t('Промпт содержит все рекомендуемые блоки.')}</Note>}
    <p className="vl-help">{t('Слов в промпте: {n}', { n: a.words })}</p>
  </>
}

function StepPrompt({ m, s }: StepProps) {
  const t = useT()
  const toast = useToast()
  const [text, setText] = useState(s.prompt)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const change = (v: string) => { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => { s.prompt = v; Lab.save(m.id) }, 250) }
  const improve = () => {
    const r = PromptEngine.improve(text, m, s.inputs)
    if (!r.added.length) { toast(t('Все блоки уже есть в промпте')); return }
    s.prompt = r.text; s.stats.promptImprovements++; setText(r.text)
    s.promptVersions.push({ text: r.text, score: PromptEngine.analyze(r.text).score, kind: 'improved', ts: Date.now() })
    Lab.log('prompt-improve', m.id, { added: r.added })
    Lab.save(m.id)
    toast(t('Добавлены блоки: {list}', { list: r.added.map(k => t(PromptEngine.label(k))).join(', ') }))
  }
  return <>
    <div className="vl-grid split">
      <div className="card"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('Промпт')}</h2><Badge>{t('версия {n}', { n: s.promptVersions.length || 1 })}</Badge></div>
        {m.special === 'compare' && s.versions.length < 2 && <Note>{s.versions.length === 0
          ? <><b>{t('Шаг 1.')}</b> {t('Перед вами короткий «наивный» промпт. Выполните по нему генерацию №1, не улучшая его.')}</>
          : <><b>{t('Шаг 2.')}</b> {t('Нажмите «Улучшить промпт», изучите добавленные блоки и выполните генерацию №2.')}</>}</Note>}
        <p className="vl-help">{t('Промпт можно редактировать вручную. Анализ обновляется автоматически. Блоки промпта написаны по-русски: язык материала задаётся в исходных данных.')}</p>
        <textarea className="input vl-prompt" aria-label={t('Текст промпта')} value={text} onChange={e => change(e.target.value)}/>
        <div className="vl-row vl-mt"><Button variant="secondary" onClick={improve}><Sparkles size={16}/>{t('Улучшить промпт')}</Button>
          <Button variant="ghost" onClick={() => { const v = PromptEngine.build(m, s.inputs); s.prompt = v; setText(v); Lab.save(m.id) }}><Undo2 size={16}/>{t('Вернуть шаблон')}</Button>
          <Button variant="ghost" onClick={() => copyText(text, toast, t)}><Copy size={16}/>{t('Копировать')}</Button></div></div>
      <div className="card"><PromptAnalysis text={text}/></div>
    </div>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 1)}><ArrowLeft size={16}/>{t('Исходные данные')}</Button>}
      next={<Button onClick={() => { clearTimeout(timer.current); s.prompt = text; void generate(m, toast, t) }}>{t('Сгенерировать')}<ArrowRight size={16}/></Button>}/>
  </>
}

// Шаг 4. Генерация
function StepGenerate({ m, s }: StepProps) {
  const t = useT()
  const toast = useToast()
  const busy = useBusy()
  const v = Lab.currentVersion(m.id)
  if (busy === m.id) return <div className="card vl-center"><Spinner/><div><b>{t('Идёт генерация…')}</b><div className="vl-help">{Lab.aiReady() ? Lab.config().ai.name : t('Демо-режим')}</div></div></div>
  if (!v) return <><Empty><p>{t('Материал ещё не сгенерирован.')}</p><Button onClick={() => void generate(m, toast, t)}>{t('Сгенерировать')}</Button></Empty>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 2)}><ArrowLeft size={16}/>{t('Промпт')}</Button>}/></>
  return <>
    <div className="card"><VersionHeader v={v} t={t}/>
      {v.error && <Note kind="warn">{t('Модель ИИ вернула ошибку: {error}. Показан результат демо-режима.', { error: v.error })}</Note>}
      <Markdown text={v.text} className="vl-result vl-mt"/>
      <div className="vl-row vl-mt"><Button variant="secondary" size="sm" onClick={() => copyText(v.text, toast, t)}><Copy size={15}/>{t('Копировать')}</Button>
        <Button variant="secondary" size="sm" onClick={() => void generate(m, toast, t)}><RefreshCw size={15}/>{t('Перегенерировать')}</Button></div></div>
    <SpecialWidget m={m} s={s} v={v}/>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 2)}><ArrowLeft size={16}/>{t('Промпт')}</Button>}
      next={<Button onClick={() => goStep(m, 4)}>{t('Экспертиза')}<ArrowRight size={16}/></Button>}/>
  </>
}

function VersionHeader({ v, t }: { v: Version; t: T }) {
  return <div className="vl-row vl-spread"><div className="vl-row"><b>{t('Версия {n}', { n: v.n })}</b><Badge>{v.kind === 'edit' ? t('правка преподавателя') : t('генерация')}</Badge>
    <Badge tone={scoreTone(v.score)}>{t('Оценка: {n}', { n: v.score })}</Badge>{v.promptScore != null && <Badge>{t('Промпт: {n}%', { n: v.promptScore })}</Badge>}</div>
    <span className="vl-help">{v.model ? t(v.model) : ''}{v.ms ? ` · ${(v.ms / 1000).toFixed(1)} ${t('с')}` : ''} · {fmtDate(v.ts, t.locale)}</span></div>
}

// Шаг 5. Экспертиза
function StepExpertise({ m, s }: StepProps) {
  const t = useT()
  const [opinion, setOpinion] = useState<{ loading?: boolean; text?: string; error?: string } | null>(null)
  const v = Lab.currentVersion(m.id)!
  const ev = s.lastEvaluation && s.lastEvaluation.total === v.score ? s.lastEvaluation : Lab.evaluate(m, s, v.text)
  const recs = Recommendations.forWork({ mod: m, prompt: s.prompt, evaluation: ev, stats: s.stats })
  const ask = async () => {
    setOpinion({ loading: true })
    try {
      const text = await Orchestrator.expertOpinion(m.special === 'expertise' ? s.inputs.content : v.text, s.inputs)
      setOpinion(text == null ? { error: t('Языковая модель не подключена: обратитесь к администратору.') } : { text })
      Lab.log('llm-expertise', m.id)
    } catch (e) { setOpinion({ error: (e as Error).message }) }
  }
  return <>
    <div className="card"><div className="vl-row vl-score-head">
      <div className={`vl-ring ${scoreTone(ev.total)}`} style={{ ['--v' as string]: ev.total }}><div><b>{ev.total}</b><span>{t('из 100')}</span></div></div>
      <div className="vl-grow"><h2>{t(ev.level)}</h2>
        <p className="vl-help">{m.special === 'expertise' ? t('Объект экспертизы — материал, который вы вставили на шаге «Исходные данные».') : t('Версия {n}.', { n: v.n })} {t('Слов: {w}, предложений: {s}.', { w: ev.stats.words, s: ev.stats.sentences })}
          {ev.engine === 'server' && ' ' + t('Экспертиза подтверждена сервером.')}</p>
        <div className="vl-chips">{ev.sections.map(x => <span key={x.title} className={`vl-chip ${x.status === 'ok' ? 'on' : x.status === 'missing' ? 'off' : ''}`}>{x.status === 'ok' ? '✓' : x.status === 'missing' ? '✗' : '~'} {t(x.title)}</span>)}</div></div></div></div>
    <div className="card vl-mt"><h2>{t('Критерий → балл → комментарий → рекомендация')}</h2><div className="vl-table-wrap"><table className="vl-table">
      <thead><tr><th>{t('Критерий')}</th><th>{t('Балл')}</th><th>{t('Комментарий')}</th><th>{t('Рекомендация')}</th></tr></thead>
      <tbody>{ev.criteria.map(c => <tr key={c.key}><td><b>{t(c.name)}</b>{c.weight != null && c.weight !== 1 && <small className="vl-help"> ×{c.weight}</small>}</td>
        <td><Badge tone={scoreTone(c.score * 10)}>{c.score}/10</Badge><Meter value={c.score * 10}/></td><td>{localize(t, c.comment)}</td><td>{localize(t, c.rec)}</td></tr>)}</tbody></table></div></div>
    {ev.flags.length > 0 && <Note kind="warn"><b>{t('Требует проверки преподавателем:')}</b><ul className="vl-ul">{ev.flags.map(f => <li key={f}>{localize(t, f)}</li>)}</ul></Note>}
    <div className="card vl-mt"><h2>{t('Рекомендации')}</h2>
      <ul className="vl-ul">{recs.map(r => <li key={r.text}>{localize(t, r.text)} {r.action === 'improve' && <Button variant="secondary" size="sm" onClick={() => goStep(m, 2)}>{t('Улучшить промпт')}</Button>}
        {r.action === 'edit' && <Button variant="secondary" size="sm" onClick={() => goStep(m, 5)}>{t('Открыть редактор')}</Button>}</li>)}</ul>
      {Lab.aiReady() ? <><Button variant="secondary" onClick={ask}><BrainCircuit size={16}/>{t('Получить экспертное заключение ИИ')}</Button>
        {opinion && <div className="vl-mt">{opinion.loading ? <Spinner label={t('Анализ…')}/> : opinion.error ? <Note kind="warn">{opinion.error}</Note> : <Markdown text={opinion.text || ''}/>}</div>}</>
        : <p className="vl-help">{t('Когда администратор подключит языковую модель, здесь можно будет получить экспертное заключение ИИ.')}</p>}
    </div>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 3)}><ArrowLeft size={16}/>{t('Генерация')}</Button>}
      next={<Button onClick={() => goStep(m, 5)}>{t('Улучшение')}<ArrowRight size={16}/></Button>}/>
  </>
}

// Шаг 6. Улучшение
function DiffView({ lines }: { lines: DiffLine[] }) {
  return <div className="vl-diff">{lines.map((x, i) => <div key={i} className={x.t}>{x.s || ' '}</div>)}</div>
}

function StepImprove({ m, s, embedded, onFinish }: StepProps) {
  const t = useT()
  const toast = useToast()
  const v = Lab.currentVersion(m.id)!
  const isExp = m.special === 'expertise'
  const [text, setText] = useState<string>(isExp ? s.inputs.content : v.text)
  const [sel, setSel] = useState<number[]>(() => s.versions.map((_, i) => i).slice(-2))
  useEffect(() => { setSel(s.versions.map((_, i) => i).slice(-2)) }, [s.versions.length])
  const [cmp, setCmp] = useState<[Version, Version] | null | 'bad'>(null)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!text.trim()) { toast(t('Текст пуст'), 'error'); return }
    if (!isExp && text === v.text) { toast(t('Изменений нет')); return }
    setSaving(true)
    try { const score = await saveEdit(m, s, text); toast(t('Правка сохранена · оценка {n}', { n: score })) }
    finally { setSaving(false) }
  }
  const compare = () => {
    if (sel.length !== 2) { setCmp('bad'); return }
    const [a, b] = [...sel].sort((x, y) => x - y).map(i => s.versions[i])
    setCmp([a, b]); Lab.log('compare', m.id)
  }
  return <>
    <div className="card"><h2>{isExp ? t('Исправление материала') : t('Редактор итогового материала')}</h2>
      <p className="vl-help">{isExp ? t('Исправьте исходный материал по рекомендациям экспертизы и сохраните — экспертиза будет выполнена повторно.')
        : t('ИИ создаёт черновик — финальную версию формирует преподаватель. Внесите правки (Markdown: ## заголовок, - список, **жирный**) и сохраните как новую версию.')}</p>
      <textarea className="input vl-editor" aria-label={t('Редактор')} value={text} onChange={e => setText(e.target.value)}/>
      <div className="vl-row vl-mt"><Button disabled={saving} onClick={save}><Save size={16}/>{isExp ? t('Сохранить и повторить экспертизу') : t('Сохранить правку (новая версия)')}</Button>
        <Button variant="secondary" onClick={() => goStep(m, 2)}><Sparkles size={16}/>{t('Улучшить промпт')}</Button>
        <Button variant="secondary" onClick={() => void generate(m, toast, t)}><RefreshCw size={16}/>{t('Перегенерировать')}</Button></div></div>
    <div className="card vl-mt"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('История версий')}</h2><Button variant="secondary" size="sm" onClick={compare}>{t('Сравнить выбранные')}</Button></div>
      <p className="vl-help">{t('Отметьте две версии для сравнения. Текущая версия попадёт в портфолио.')}</p>
      <div className="vl-table-wrap"><table className="vl-table"><thead><tr><th/><th>{t('Версия')}</th><th>{t('Тип')}</th><th>{t('Время')}</th><th>{t('Промпт')}</th><th>{t('Оценка')}</th><th/></tr></thead>
        <tbody>{s.versions.map((x, i) => <tr key={x.id}>
          <td><input type="checkbox" checked={sel.includes(i)} aria-label={t('Выбрать версию {n}', { n: x.n })} onChange={e => setSel(e.target.checked ? [...sel, i] : sel.filter(j => j !== i))}/></td>
          <td><b>v{x.n}</b>{x.id === s.currentVersionId && <> <Badge tone="accent">{t('текущая')}</Badge></>}</td>
          <td>{x.kind === 'edit' ? t('правка') : t('генерация')}</td><td className="vl-help">{fmtDate(x.ts, t.locale)}</td><td>{x.promptScore != null ? x.promptScore + '%' : '—'}</td>
          <td><Badge tone={scoreTone(x.score)}>{x.score}</Badge></td>
          <td>{x.id !== s.currentVersionId && <Button variant="secondary" size="sm" onClick={() => { s.currentVersionId = x.id; s.lastEvaluation = Lab.evaluate(m, s, x.text); Lab.save(m.id, 0) }}>{t('Сделать текущей')}</Button>}</td></tr>)}</tbody></table></div>
      <div className="vl-mt">
        {cmp === 'bad' && <Note kind="warn">{t('Выберите ровно две версии.')}</Note>}
        {cmp && cmp !== 'bad' && (() => {
          const [a, b] = cmp; const d = b.score - a.score
          return <>
            <p><b>v{a.n} → v{b.n}:</b> {t('оценка {a} → {b} ({d}); промпт {pa}% → {pb}%.', { a: a.score, b: b.score, d: (d >= 0 ? '+' : '') + d, pa: a.promptScore ?? '—', pb: b.promptScore ?? '—' })} <span className="vl-help">{t('Зелёным — добавлено, красным — удалено.')}</span></p>
            {a.prompt !== b.prompt && <details className="vl-mb"><summary>{t('Изменения промпта')}</summary><DiffView lines={diffLines(a.prompt, b.prompt)}/></details>}
            <DiffView lines={diffLines(a.text, b.text)}/>
          </>
        })()}
      </div></div>
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 4)}><ArrowLeft size={16}/>{t('Экспертиза')}</Button>}
      next={embedded ? <Button onClick={() => onFinish?.(m, s, Lab.currentVersion(m.id)!)}>{t('Перейти к самопроверке')}<ArrowRight size={16}/></Button>
        : <Button onClick={() => goStep(m, 6)}>{t('Портфолио')}<ArrowRight size={16}/></Button>}/>
  </>
}

// Шаг 7. Портфолио
export function ExportButtons({ title, text, meta, code }: { title: string; text: string; meta: string; code: string | null }) {
  const t = useT()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const run = async (format: string) => {
    setBusy(format)
    try {
      const { blob, filename } = await labBlob('export/', 'POST', { format, title, text, meta, lang: t.locale })
      saveBlob(blob, filename)
      Lab.log('export', code, { format })
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy('') }
  }
  return <div className="vl-row vl-export"><span className="vl-help">{t('Экспорт:')}</span>
    {['docx', 'pdf', 'pptx', 'md', 'txt'].map(f => <Button key={f} variant="secondary" size="sm" disabled={!!busy} onClick={() => void run(f)}>{busy === f ? <Spinner/> : null}{f.toUpperCase()}</Button>)}
  </div>
}

function StepPortfolio({ m, s }: StepProps) {
  const t = useT()
  const toast = useToast()
  const path = useLabPath()
  const v = Lab.currentVersion(m.id)!
  const defTitle = `${t(m.short || m.title)}: ${s.inputs.topic || s.inputs.discipline || ''}`
  const inPf = Lab.portfolio().find(p => p.modId === m.id)
  const [title, setTitle] = useState(inPf ? inPf.title : defTitle)
  const [ack, setAck] = useState(!!inPf)
  const [quizRes, setQuizRes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const first = s.versions[0]
  const next = Recommendations.nextWork({ sessions: Lab.sessions() })
  const nm = next.id ? Lab.module(next.id) : null
  const add = async () => {
    setBusy(true)
    try {
      await Lab.addToPortfolio({ modId: m.id, title: title.trim() || defTitle, category: m.category, text: portfolioText(m, s), score: v.score, promptScore: v.promptScore, prompt: s.prompt, versionN: v.n })
      if (!s.completed) { s.completed = true; s.completedAt = Date.now() }
      Lab.log('portfolio', m.id, { score: v.score })
      await Lab.flush(m.id)
      toast(t('Материал сохранён в портфолио'))
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return <>
    <div className="card"><h2>{t('Итоговая версия')}</h2>
      <p>{t('Версия')} <b>v{v.n}</b> · {t('оценка экспертизы')} <Badge tone={scoreTone(v.score)}>{v.score}</Badge> · {t('категория портфолио')}: <b>{t(m.category)}</b></p>
      <div className="vl-field"><label htmlFor="vl_pf_title">{t('Название материала')}</label><input className="input" id="vl_pf_title" value={title} onChange={e => setTitle(e.target.value)}/></div>
      <Note kind="warn">{t('Материал, созданный с использованием искусственного интеллекта, должен быть проверен преподавателем. Пользователь несёт ответственность за научную и педагогическую корректность итогового материала.')}
        {isScience(m) && <><br/><b>{t('Автоматически сгенерированные библиографические ссылки, DOI и сведения об источниках требуют обязательной проверки по официальным базам данных.')}</b></>}</Note>
      <label className="checkbox vl-mt"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/> {t('Я проверил(а) материал и принимаю ответственность за его корректность')}</label>
      <div className="vl-row vl-mt"><Button disabled={!ack || busy} onClick={() => void add()}><FolderPlus size={16}/>{inPf ? t('Обновить в портфолио') : t('Добавить в портфолио')}</Button></div>
      <ExportButtons title={title || defTitle} text={portfolioText(m, s)} code={m.id}
        meta={`AI edu · ${t('ВР № {n}', { n: m.n })} «${t(m.title)}» · ${t('оценка экспертизы')} ${v.score}/100 · ${fmtDate(Date.now(), t.locale)}`}/>
      {inPf && <p className="vl-help vl-mt">{t('В портфолио с {date}.', { date: fmtDate(inPf.ts, t.locale) })}</p>}</div>
    <div className="card vl-mt"><h2>{t('Самопроверка по лабораторной работе')}</h2>
      <p className="vl-help">{t('Вопросов: {n}. Ответы проверяются автоматически.', { n: m.quiz.length })}{s.quiz && <> {t('Последний результат:')} <b>{s.quiz.score}%</b>.</>}</p>
      <Quiz qs={m.quiz} onGraded={sc => { s.quiz = { score: sc, answers: [], ts: Date.now() }; Lab.log('quiz', m.id, { score: sc }); Lab.save(m.id, 0); setQuizRes(sc) }}/>
      {quizRes != null && <Badge tone={scoreTone(quizRes)}>{t('Результат: {n}%', { n: quizRes })}</Badge>}</div>
    {s.completed && <div className="card vl-mt"><h2>{t('Итоги работы')}</h2><div className="vl-grid g4">
      <Kpi value={fmtDuration(s.timeSpent, t)} label={t('время')}/>
      <Kpi value={s.stats.generations} label={t('генераций')}/>
      <Kpi value={`${s.stats.promptImprovements} / ${s.stats.edits}`} label={t('улучшений промпта / правок')}/>
      <Kpi value={`${first ? first.score : '—'} → ${v.score}`} label={t('оценка: первая → итоговая')}/></div>
      {nm ? <div className="vl-row vl-spread vl-mt"><span className="vl-help">{localize(t, next.reason)}</span><Link className="button primary" to={path(`lab/${nm.id}`)}>{t('Следующая: ВР № {n}', { n: nm.n })}<ArrowRight size={16}/></Link></div>
        : <Note kind="good">{localize(t, next.reason)}</Note>}</div>}
    <StepNav prev={<Button variant="secondary" onClick={() => goStep(m, 5)}><ArrowLeft size={16}/>{t('Улучшение')}</Button>}/>
  </>
}
