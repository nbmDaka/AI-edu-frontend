import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Play, RotateCcw, Send, XCircle } from 'lucide-react'
import { Button, Notice } from '../../components/ui'
import { LessonAttachments } from '../../components/LessonAttachments'
import { useI18n } from '../../i18n'
import { useLeaveWarning } from '../../useLeaveWarning'
import type { RuntimeProps } from '../types'
import { passed, type CheckResult, type PythonLabConfig, type StepOutput } from './protocol'
import { usePython } from './usePython'
import { CodeArea } from './CodeArea'
import './python-lab.css'

type Snapshot = { title: string; step: number; is_required: boolean; checked: boolean; actual: unknown; error: string }

export function PythonLab({ state, busy, onStart, onSubmit }: RuntimeProps) {
  const { t } = useI18n()
  const config = state.version!.config as PythonLabConfig
  const submission = state.submission
  const submitted = !!submission && submission.status !== 'IN_PROGRESS'
  const saved = submission?.submission_data.code as string[] | undefined
  const [code, setCode] = useState<string[]>(() => config.steps.map((step, index) => saved?.[index] ?? step.starter_code))
  const [outputs, setOutputs] = useState<(StepOutput | undefined)[]>([])
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const python = usePython()
  useLeaveWarning(dirty && !submitted)
  const running = python.status === 'running'
  const snapshot = submitted ? submission!.criteria_snapshot as unknown as Snapshot[] : []
  const flatChecks = useMemo(() => config.steps.flatMap(step => step.checks), [config])

  const execute = async (upto: number) => {
    setError('')
    try {
      const steps = config.steps.slice(0, upto + 1).map((step, index) => ({ code: code[index], checks: step.checks.map(check => check.expression) }))
      const result = await python.run({ packages: config.packages, datasets: config.datasets, steps })
      setOutputs(result)
      return result
    } catch (cause) { setError((cause as Error).message); return null }
  }
  const submit = async () => {
    const result = await execute(config.steps.length - 1)
    if (!result) return
    const results: CheckResult[] = result.flatMap(step => step.results)
    await onSubmit({ code, results })
    setDirty(false)
  }

  if (!submission) return <section className="python-lab"><p>{t('Начните выполнение, чтобы открыть редактор кода.')}</p>
    <Button disabled={busy} onClick={() => void onStart()}>{t('Начать выполнение')}</Button></section>

  return <section className="python-lab">
    {!!config.datasets.length && <div className="python-lab-datasets"><h3>{t('Наборы данных')}</h3>
      <p className="muted">{t('Файлы доступны в коде по имени, например pd.read_csv("имя_файла.csv").')}</p>
      <LessonAttachments attachments={config.datasets}/></div>}
    {!python.warm && !submitted && <p className="muted python-lab-hint">{t('Первый запуск загружает Python в браузер и может занять до минуты.')}</p>}
    {config.steps.map((step, index) => {
      const output = outputs[index]
      let offset = 0
      for (let i = 0; i < index; i++) offset += config.steps[i].checks.length
      return <article className="python-lab-step" key={index}>
        <header><span>{t('Шаг')} {index + 1}</span><h3>{step.title}</h3></header>
        {step.instructions && <p className="python-lab-instructions">{step.instructions}</p>}
        <CodeArea value={code[index]} disabled={submitted || busy} label={`${t('Код шага')} ${index + 1}`}
          onChange={value => { setDirty(true); setCode(code.map((row, i) => i === index ? value : row)) }}/>
        {!submitted && <div className="python-lab-actions">
          <Button type="button" variant="secondary" disabled={running || busy} onClick={() => void execute(index)}><Play size={16}/>{t(running ? 'Выполняется…' : 'Запустить')}</Button>
          {step.starter_code !== code[index] && <Button type="button" variant="secondary" disabled={running || busy}
            onClick={() => { setDirty(true); setCode(code.map((row, i) => i === index ? step.starter_code : row)) }}><RotateCcw size={16}/>{t('Вернуть исходный код')}</Button>}
        </div>}
        {output && (output.stdout || output.error) && <pre className={`python-lab-output ${output.error ? 'is-error' : ''}`} aria-live="polite">{output.stdout}{output.error}</pre>}
        {output?.figures.map((figure, i) => <img key={i} className="python-lab-figure" alt={`${t('График')} ${i + 1}`} src={`data:image/png;base64,${figure}`}/>)}
        {!!step.checks.length && <ul className="python-lab-checks">{step.checks.map((check, i) => {
          const result = submitted ? snapshot[offset + i] : undefined
          const ok = submitted ? !!result?.checked : output ? passed(check, output.results[i]) : undefined
          const failure = submitted ? result?.error : output && 'error' in (output.results[i] ?? {}) ? (output.results[i] as { error: string }).error : ''
          return <li key={i} className={ok === undefined ? '' : ok ? 'is-passed' : 'is-failed'}>
            {ok === undefined ? <Circle size={16}/> : ok ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}
            <span>{check.title}{!check.is_required && <small> · {t('необязательная проверка')}</small>}{failure && <small className="python-lab-check-error">{t(failure)}</small>}</span>
          </li>
        })}</ul>}
      </article>
    })}
    <Notice text={t(error)} kind="error" onDismiss={() => setError('')}/>
    {submitted ? <div className="python-lab-result"><p><CheckCircle2 size={18}/>{t(state.is_completed ? 'Практическая работа завершена' : 'Обязательные проверки не пройдены')}</p>
      {state.result && <p>{t('Пройдено проверок')}: {snapshot.filter(row => row.checked).length} / {flatChecks.length} · Ψ = {Math.round(state.result.psi_value * 100)}%</p>}
      {!state.is_completed && <Button disabled={busy} onClick={() => void onStart()}>{t('Начать новую попытку')}</Button>}</div>
      : <div className="python-lab-submit"><p className="muted">{t('Перед отправкой весь код запускается заново, результаты проверок сохраняются автоматически.')}</p>
        <Button disabled={running || busy} onClick={() => void submit()}><Send size={16}/>{t('Отправить на проверку')}</Button></div>}
  </section>
}
