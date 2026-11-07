import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, ExternalLink, Sparkles } from 'lucide-react'
import { RichLessonContent } from '../components/RichLessonContent'
import { LessonAttachments } from '../components/LessonAttachments'
import { Button, Notice } from '../components/ui'
import { useI18n } from '../i18n'
import type { LearningItem } from '../api'
import type { Criterion, PracticePlugin, PracticeState, WorkPreview } from './types'
import { safeResultLink, type TaskConfig } from './commonTask'
import { workspaceApi } from '../workspace/api'
import { workshopFor } from '../workspace/workshops'

type Step = 'task' | 'work' | 'review'
type Draft = { checks?: boolean[]; data?: Record<string, unknown>; result?: Record<string, unknown>; preview?: WorkPreview }
const readDraft = (key: string): Draft => {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? '{}')
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return {}
    const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
    return {
      checks: Array.isArray(draft.checks) ? draft.checks.map(Boolean) : [],
      data: record(draft.data) ? draft.data : {},
      result: record(draft.result) ? draft.result : {},
      preview: record(draft.preview) ? {
        title: typeof draft.preview.title === 'string' ? draft.preview.title : undefined,
        files: Array.isArray(draft.preview.files) ? draft.preview.files.filter((file: unknown) => record(file) && typeof file.name === 'string' && typeof file.url === 'string') : [],
      } : {},
    }
  } catch { return {} }
}

export function PracticeFlow({ state, plugin, item, ownerId, busy, start, submit, onWorkspaceChange }: {
  state: PracticeState; plugin: PracticePlugin; item: LearningItem; ownerId?: number; busy: boolean
  start: () => Promise<boolean>; submit: (data: Record<string, unknown>) => Promise<boolean>
  onWorkspaceChange?: (enabled: boolean) => void
}) {
  const { t } = useI18n()
  const version = state.version!
  const config = version.config as Partial<TaskConfig>
  const submitted = !!state.submission && state.submission.status !== 'IN_PROGRESS'
  const storageKey = `practice-draft:${ownerId ?? 'current'}:${item.short_id}:${version.id}:${state.submission?.id ?? 'new'}`
  const initial = useRef(readDraft(storageKey)).current
  const [step, setStep] = useState<Step>('task')
  const [entered, setEntered] = useState(false)
  const [workPending, setWorkPending] = useState(false)
  const [checks, setChecks] = useState<boolean[]>(Array.isArray(initial.checks) ? initial.checks.map(Boolean) : [])
  const [draft, setDraft] = useState<Record<string, unknown>>(initial.data ?? {})
  const [workResult, setWorkResult] = useState<Record<string, unknown>>(initial.result ?? {})
  const [preview, setPreview] = useState<WorkPreview>(initial.preview ?? {})
  const [confirmed, setConfirmed] = useState(false)
  const root = useRef<HTMLElement>(null)
  const criteria: (Criterion & { checked?: boolean })[] = submitted && state.submission!.criteria_snapshot?.length
    ? state.submission!.criteria_snapshot : config.criteria ?? []
  const savedChecks = state.submission?.submission_data.checks as boolean[] | undefined
  const values = submitted ? criteria.map((row, i) => row.checked ?? savedChecks?.[i] ?? false) : checks
  const canReview = submitted || Object.keys(workResult).length > 0
  const workspace = step === 'work' && plugin.layout === 'workspace'
  const documentId = typeof workResult.document_id === 'number' ? workResult.document_id : state.submission?.document_id
  const reviewDocument = useQuery({ queryKey: ['workspace-document', ownerId, documentId],
    enabled: step === 'review' && plugin.layout === 'workspace' && !!documentId,
    queryFn: () => workspaceApi.document(documentId!), retry: false })
  const reviewMessages = useQuery({ queryKey: ['workspace-messages', ownerId, documentId],
    enabled: step === 'review' && plugin.layout === 'workspace' && !!documentId,
    queryFn: () => workspaceApi.messages(documentId!), retry: false })
  const savedArtifact = reviewMessages.data?.map(message => message.artifact).filter(file => file?.revision === reviewDocument.data?.revision).at(-1)
  const resultTitle = reviewDocument.data?.content.title ?? preview.title
  const submittedLink = submitted && typeof state.submission?.submission_data.artifact_url === 'string'
    ? safeResultLink(state.submission.submission_data.artifact_url) : undefined
  const files = savedArtifact ? [{ name: savedArtifact.name, url: savedArtifact.url }]
    : submittedLink ? [{ name: t('Открыть результат'), url: submittedLink }] : preview.files

  useEffect(() => {
    onWorkspaceChange?.(workspace)
    return () => onWorkspaceChange?.(false)
  }, [workspace, onWorkspaceChange])
  useEffect(() => {
    try {
      if (submitted) sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, JSON.stringify({ checks, data: draft, result: workResult, preview }))
    } catch { /* Draft persistence is optional; generated lectures remain on the server. */ }
  }, [storageKey, submitted, checks, draft, workResult, preview])
  useEffect(() => {
    const center = root.current?.closest('.learning-center')
    if (center) center.scrollTop = 0
  }, [step])

  const enter = async (newAttempt = false) => {
    if (busy) return
    if (!state.submission || newAttempt) {
      if (!await start()) return
      if (newAttempt) { setChecks([]); setDraft({}); setWorkResult({}); setPreview({}); setConfirmed(false) }
    }
    setEntered(true); setStep('work')
  }
  const review = (data: Record<string, unknown> = {}, result: WorkPreview = {}) => {
    setWorkResult(data); setPreview(result); setStep('review')
  }
  const finish = async () => {
    if (busy || workPending || submitted) return
    const data = { ...workResult, ...draft }
    if (version.practice_type === 'guided_assignment') {
      data.report = String(data.report ?? '').trim()
      data.artifact_url = String(data.artifact_url ?? '').trim()
    }
    if (criteria.length) data.checks = criteria.map((_, index) => !!checks[index])
    if (plugin.layout === 'workspace') data.completed = true
    await submit(data)
  }
  const report = String((submitted ? state.submission?.submission_data : draft)?.report ?? '')
  const artifact = String(draft.artifact_url ?? '')
  const reportReady = version.practice_type !== 'guided_assignment' || report.trim().length >= 40 && (!artifact || !!safeResultLink(artifact))
  const ready = canReview && reportReady && !workPending && !(documentId && (reviewDocument.isPending || reviewDocument.error || reviewMessages.error)) && (criteria.length
    ? criteria.every((row, index) => !row.is_required || checks[index]) : confirmed)
  const Runtime = plugin.StudentRuntime

  if (plugin.layout === 'standalone') return <section ref={root} className="practice-flow">
    <header className="practice-flow-heading"><span className="eyebrow">{t('ПРАКТИЧЕСКАЯ РАБОТА')}</span><h1>{version.title}</h1></header>
    {version.description && <p className="practice-description">{version.description}</p>}
    <Runtime state={state} busy={busy} item={item} ownerId={ownerId}
      onStart={async () => { await start() }} onSubmit={async data => { await submit(data) }}/>
  </section>

  return <section ref={root} className={`practice-flow ${workspace ? 'is-workspace' : ''}`}>
    {!workspace && <>
      <header className="practice-flow-heading"><span className="eyebrow">{t('ПРАКТИЧЕСКАЯ РАБОТА')}</span><h1>{version.title}</h1></header>
      <nav className="practice-flow-steps" aria-label={t('Этапы практической работы')}>
        {(['task', 'work', 'review'] as Step[]).map((value, index) => <button key={value} type="button" aria-current={step === value ? 'step' : undefined}
          disabled={busy || value === 'review' && (!canReview || workPending)} onClick={() => value === 'work' ? void enter() : setStep(value)}>
          <span>{index + 1}</span>{t(value === 'task' ? 'Задание' : value === 'work' ? 'Выполнение' : 'Самопроверка')}
        </button>)}
      </nav>
    </>}
    {step === 'task' && <div className="practice-task-page">
      <section><h2>{t('Инструкция к заданию')}</h2><article className="article markdown assignment-instructions">
        {config.instructions?.length ? config.instructions.map((part, index) => <RichLessonContent key={index} value={part}/>)
          : <p>{t('Выполните задание в выбранном инструменте, затем вернитесь к самопроверке.')}</p>}
      </article></section>
      {config.source_url && safeResultLink(config.source_url) && <a className="practice-source-link" href={config.source_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{t('Исходный документ')}</a>}
      <LessonAttachments attachments={config.source_files ?? []}/>
      <section className="practice-task-criteria"><h2>{t('Критерии самопроверки')}</h2>
        {criteria.length ? <ol>{criteria.map((criterion, index) => <li key={index}><strong>{criterion.title}</strong>{criterion.description && <p>{criterion.description}</p>}{criterion.is_required && <small>{t('Обязательный критерий')}</small>}</li>)}</ol>
          : <p className="muted">{t('Критерии пока не заданы преподавателем. Перед завершением проверьте результат по инструкции.')}</p>}
      </section>
      <div className="practice-tool-card"><Sparkles size={22}/><div><small>{t('Инструмент выполнения')}</small><strong>{t(workshopFor(version.practice_type)?.title ?? 'Практическое задание')}</strong></div>
        <Button disabled={busy} onClick={() => void enter()}>{t(submitted ? 'Посмотреть результат' : state.submission ? 'Продолжить выполнение' : 'Начать выполнение')}<ArrowRight size={16}/></Button></div>
    </div>}
    {entered && <div className="practice-work-panel" hidden={step !== 'work'}>
      <Runtime state={state} busy={busy} item={item} ownerId={ownerId} draft={draft} onDraftChange={setDraft}
        onStart={async () => { await enter(true) }} onSubmit={async data => review(data)} onReview={review}
        onBackToTask={() => setStep('task')} onActivityChange={setWorkPending}/>
    </div>}
    {step === 'review' && <div className="practice-review-page">
      <section className="practice-result-summary"><h2>{t('Результат работы')}</h2>
        {resultTitle && <p><CheckCircle2 size={18}/>{resultTitle}</p>}
        {report && <p className="practice-report-preview">{report}</p>}
        {files?.filter(file => /^\/api\/v1\/workspace\/artifacts\/\d+\/download\/$/.test(file.url) || safeResultLink(file.url)).map(file =>
          <a key={file.url} href={file.url} className="practice-source-link" target={file.url.startsWith('/') ? undefined : '_blank'} rel="noreferrer"><Download size={16}/>{file.name}</a>)}
        {!resultTitle && !report && <p>{t('Проверьте подготовленный результат перед завершением работы.')}</p>}
        {(reviewDocument.error || reviewMessages.error) && <Notice kind="error" text={t('Не удалось загрузить результат. Откройте инструмент и повторите самопроверку.')}/>}
        <Button variant="secondary" disabled={busy || workPending} onClick={() => void enter()}>{t(submitted ? 'Посмотреть результат' : 'Продолжить редактирование')}</Button>
      </section>
      <fieldset className="practice-self-check" disabled={busy || workPending || submitted}><legend>{t('Критерии самопроверки')}</legend>
        {criteria.map((criterion, index) => <label className="assignment-check" key={index}><input type="checkbox" disabled={busy || workPending || submitted} checked={!!values[index]} onChange={event => setChecks(criteria.map((_, i) => i === index ? event.target.checked : !!checks[i]))}/>
          <span><strong>{criterion.title}</strong>{criterion.description && <small>{criterion.description}</small>}{criterion.is_required && <small>{t('Обязательный критерий')}</small>}</span></label>)}
        {!criteria.length && <label className="assignment-check"><input type="checkbox" checked={submitted || confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{t('Я проверил(а) результат и выполнил(а) инструкцию задания')}</span></label>}
      </fieldset>
      {submitted ? <div className="assignment-submitted"><p><CheckCircle2 size={18}/>{t(state.is_completed ? 'Практическая работа завершена' : 'Работа отправлена')}</p>
        {state.result?.self_assessment_score != null && <p>{t('Самооценка')}: {Math.round(state.result.self_assessment_score * 100)}%. {t('Не является оценкой преподавателя или ИИ')}</p>}
        {!state.is_completed && <Button disabled={busy} onClick={() => void enter(true)}>{t('Начать новую попытку')}</Button>}</div>
        : <div className="practice-flow-actions"><Button variant="secondary" disabled={busy} onClick={() => setStep('task')}><ArrowLeft size={16}/>{t('К заданию')}</Button>
          <Button disabled={busy || !ready} onClick={() => void finish()}><Check size={17}/>{t('Завершить работу')}</Button></div>}
    </div>}
  </section>
}
