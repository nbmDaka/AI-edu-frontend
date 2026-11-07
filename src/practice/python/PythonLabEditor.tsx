import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input, Notice, Textarea } from '../../components/ui'
import { LessonAttachments } from '../../components/LessonAttachments'
import { useI18n } from '../../i18n'
import { api, type LessonAttachment } from '../../api'
import { validateUploadSize } from '../../utils/upload'
import type { ConfigEditorProps, PracticeConfig } from '../types'
import { PACKAGES, type CheckValue, type PythonCheck, type PythonLabConfig, type PythonStep } from './protocol'
import { CodeArea } from './CodeArea'
import './python-lab.css'

const emptyCheck = (): PythonCheck => ({ title: '', expression: '', expected: 0, tolerance: 0, is_required: true })
const emptyStep = (): PythonStep => ({ title: '', instructions: '', starter_code: '', checks: [emptyCheck()] })

export function defaultPythonLabConfig(): PythonLabConfig {
  return { packages: ['pandas', 'numpy'], datasets: [], steps: [emptyStep()] }
}

/** Expected values are typed as JSON (1275, 3.5, true, ["a","b"]); anything else is kept as text. */
export function parseExpected(text: string): CheckValue {
  try {
    const value = JSON.parse(text)
    const scalar = (item: unknown) => item === null || ['number', 'string', 'boolean'].includes(typeof item)
    if (scalar(value) || (Array.isArray(value) && value.length <= 100 && value.every(scalar))) return value
  } catch { /* plain text */ }
  return text
}
export function formatExpected(value: CheckValue) {
  if (typeof value !== 'string') return JSON.stringify(value)
  return parseExpected(value) === value ? value : JSON.stringify(value)
}

export function validatePythonLabConfig(config: PracticeConfig): string | null {
  const value = config as Partial<PythonLabConfig>
  if (!Array.isArray(value.steps) || !value.steps.length) return 'Добавьте хотя бы один шаг'
  if (value.steps.some(step => !step.title?.trim())) return 'Укажите название каждого шага'
  const checks = value.steps.flatMap(step => step.checks ?? [])
  if (!checks.length || checks.length > 50) return 'Добавьте от 1 до 50 проверок'
  if (checks.some(check => !check.title.trim() || !check.expression.trim() || check.expression.includes('\n') || !(check.tolerance >= 0)))
    return 'У каждой проверки должны быть название, выражение в одну строку и допуск не меньше 0'
  return null
}

export function PythonLabEditor({ config, disabled, onChange, onUploadingChange }: ConfigEditorProps) {
  const { t } = useI18n()
  const value = { ...defaultPythonLabConfig(), ...config } as PythonLabConfig
  const latest = useRef({ value, onChange })
  latest.current = { value, onChange }
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const setStep = (index: number, patch: Partial<PythonStep>) =>
    onChange({ ...value, steps: value.steps.map((step, i) => i === index ? { ...step, ...patch } : step) })
  const setCheck = (index: number, position: number, patch: Partial<PythonCheck>) =>
    setStep(index, { checks: value.steps[index].checks.map((check, i) => i === position ? { ...check, ...patch } : check) })

  async function upload(files: File[]) {
    setError(''); setUploading(true); onUploadingChange?.(true)
    try {
      if (latest.current.value.datasets.length + files.length > 5) throw new Error(t('Можно добавить не более 5 наборов данных.'))
      files.forEach(validateUploadSize)
      for (const file of files) {
        const form = new FormData(); form.append('file', file)
        const uploaded = await api<LessonAttachment>('media/files/', 'POST', form)
        const next = { ...latest.current.value, datasets: [...latest.current.value.datasets, uploaded] }
        latest.current.value = next
        latest.current.onChange(next)
      }
    } catch (cause) { setError((cause as Error).message) }
    finally { setUploading(false); onUploadingChange?.(false) }
  }

  return <fieldset disabled={disabled} className="practice-config python-lab-editor"><legend>{t('Практика на Python')}</legend>
    <p className="muted">{t('Код студента выполняется в браузере. Каждая проверка — выражение Python, значение которого сравнивается с ожидаемым.')}</p>
    <div className="python-lab-packages" role="group" aria-label={t('Пакеты Python')}><strong>{t('Пакеты Python')}</strong>
      {PACKAGES.map(name => <label key={name}><input type="checkbox" checked={value.packages.includes(name)}
        onChange={event => onChange({ ...value, packages: event.target.checked ? [...value.packages, name] : value.packages.filter(row => row !== name) })}/>{name}</label>)}
    </div>
    <label>{t('Наборы данных (CSV, XLSX, TXT)')}<Input type="file" multiple accept=".csv,.xlsx,.txt" disabled={uploading || value.datasets.length >= 5}
      onChange={event => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) void upload(files) }}/></label>
    <Notice text={error} kind="error" onDismiss={() => setError('')}/>
    <LessonAttachments attachments={value.datasets} onRemove={disabled || uploading ? undefined : media => onChange({ ...value, datasets: value.datasets.filter(file => file.media !== media) })}/>
    {value.steps.map((step, index) => <section className="python-lab-step-editor" key={index}>
      <div className="practice-criterion-main"><label>{t('Шаг')} {index + 1}<Input value={step.title} maxLength={300} placeholder={t('Например: загрузка набора данных')} onChange={event => setStep(index, { title: event.target.value })}/></label>
        <button type="button" className="button secondary" aria-label={`${t('Удалить шаг')} ${index + 1}`} disabled={value.steps.length <= 1}
          onClick={() => onChange({ ...value, steps: value.steps.filter((_, i) => i !== index) })}><Trash2 size={17}/></button></div>
      <label>{t('Задание шага')}<Textarea rows={3} maxLength={20000} value={step.instructions} onChange={event => setStep(index, { instructions: event.target.value })}/></label>
      <label>{t('Стартовый код')}<CodeArea value={step.starter_code} label={`${t('Стартовый код')} ${index + 1}`} onChange={starter_code => setStep(index, { starter_code })}/></label>
      <h4>{t('Проверки')}</h4>
      {!!step.checks.length && <div className="python-lab-check-editor python-lab-check-head" aria-hidden="true">
        <span>{t('Название проверки')}</span><span>{t('Выражение Python')}</span><span>{t('Ожидаемое значение')}</span><span>{t('Допуск')}</span></div>}
      {step.checks.map((check, position) => <div className="python-lab-check-editor" key={position}>
        <Input aria-label={t('Название проверки')} placeholder={t('Название проверки')} maxLength={300} value={check.title} onChange={event => setCheck(index, position, { title: event.target.value })}/>
        <Input aria-label={t('Выражение Python')} className="python-code" placeholder="df.shape[0]" maxLength={500} value={check.expression} onChange={event => setCheck(index, position, { expression: event.target.value })}/>
        <Input aria-label={t('Ожидаемое значение')} placeholder="1275" defaultValue={formatExpected(check.expected)} onChange={event => setCheck(index, position, { expected: parseExpected(event.target.value) })}/>
        <Input aria-label={t('Допуск')} type="number" min={0} step="any" value={check.tolerance} onChange={event => setCheck(index, position, { tolerance: Number(event.target.value) })}/>
        <label><input type="checkbox" checked={check.is_required} onChange={event => setCheck(index, position, { is_required: event.target.checked })}/>{t('Обязательная')}</label>
        <button type="button" className="button secondary" aria-label={`${t('Удалить проверку')} ${position + 1}`}
          onClick={() => setStep(index, { checks: step.checks.filter((_, i) => i !== position) })}><Trash2 size={17}/></button>
      </div>)}
      <button type="button" className="button secondary" onClick={() => setStep(index, { checks: [...step.checks, emptyCheck()] })}><Plus size={17}/>{t('Добавить проверку')}</button>
    </section>)}
    <button type="button" className="button secondary" disabled={value.steps.length >= 15} onClick={() => onChange({ ...value, steps: [...value.steps, emptyStep()] })}><Plus size={17}/>{t('Добавить шаг')}</button>
  </fieldset>
}
