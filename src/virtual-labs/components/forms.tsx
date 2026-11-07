/* Поля формы «Исходные данные», загрузка документа в файловое хранилище, форма профиля, самопроверка. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileUp, FolderOpen } from 'lucide-react'
import { labApi, type UploadedDoc } from '../api'
import type { Field, Profile, QuizQuestion } from '../core/types'
import { useT } from '../i18n'
import { PROFILE_FIELDS, readFields } from '../logic'
import { Lab } from '../store'
import { Button, Spinner, useToast } from './ui'

type Value = string | number

/** Загрузка DOCX/PDF/PPTX/TXT на сервер: файл сохраняется в хранилище, текст извлекается сервером */
export function UploadButton({ kind = 'other', onUploaded, label, compact }: { kind?: string; onUploaded: (doc: UploadedDoc) => void; label?: string; compact?: boolean }) {
  const t = useT()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const accept = (Lab.config()?.features.uploadExtensions ?? ['.docx', '.pdf', '.pptx', '.txt', '.md']).join(',')
  const upload = async (file: File) => {
    const max = Lab.config()?.features.maxUploadBytes ?? 10 * 1024 * 1024
    if (file.size > max) { toast(t('Файл больше {n} МБ.', { n: Math.round(max / 1048576) }), 'error'); return }
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    setBusy(true)
    try {
      const doc = await labApi<UploadedDoc>('files/', 'POST', form)
      Lab.log('upload', null, { kind, name: doc.name })
      toast(t('Загружено: {name}', { name: doc.name }))
      onUploaded(doc)
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <>
    <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => input.current?.click()}>
      {busy ? <Spinner/> : <FileUp size={16}/>}{label ?? t('Загрузить файл (DOCX, PDF, PPTX, TXT)')}</Button>
    <input ref={input} type="file" accept={accept} hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }}/>
  </>
}

/** Выбор ранее загруженного документа: его текст подставляется в поле */
function DocumentPicker({ onPick }: { onPick: (text: string, name: string) => void }) {
  const t = useT()
  const toast = useToast()
  const [docs, setDocs] = useState<UploadedDoc[] | null>(null)
  useEffect(() => { labApi<UploadedDoc[]>('files/').then(setDocs, () => setDocs([])) }, [])
  if (!docs?.length) return null
  return <label className="vl-inline-select"><FolderOpen size={15}/>
    <select className="input" value="" aria-label={t('Вставить из моих документов')} onChange={async e => {
      const id = e.target.value; if (!id) return
      try { const d = await labApi<UploadedDoc>(`files/${id}/`); onPick(d.text || '', d.name) } catch (err) { toast((err as Error).message, 'error') }
    }}>
      <option value="">{t('Вставить из моих документов…')}</option>
      {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select></label>
}

export function FieldInput({ f, value, invalid, onChange }: { f: Field; value: Value; invalid?: boolean; onChange: (v: Value) => void }) {
  const t = useT()
  const toast = useToast()
  const id = 'vl_f_' + f.key
  const wide = f.type === 'textarea' || f.type === 'filetext'
  const cls = 'input' + (invalid ? ' vl-invalid' : '')
  const portfolio = Lab.portfolio()
  let control: ReactNode
  if (f.type === 'textarea' || f.type === 'filetext') {
    control = <>
      <textarea className={cls} id={id} name={f.key} rows={f.rows || 3} placeholder={f.placeholder ? t(f.placeholder) : ''} value={value} onChange={e => onChange(e.target.value)} aria-invalid={invalid}/>
      {f.type === 'filetext' && <div className="vl-row vl-field-tools">
        <UploadButton compact label={t('Загрузить файл')} onUploaded={doc => onChange(doc.text || '')}/>
        <DocumentPicker onPick={(text, name) => { onChange(text); toast(t('Вставлен текст документа «{name}»', { name })) }}/>
        {portfolio.length > 0 && <select className="input vl-auto" value="" aria-label={t('Вставить из портфолио')}
          onChange={e => { const it = portfolio.find(x => x.id === e.target.value); if (it) { onChange(it.text); toast(t('Вставлен материал из портфолио')) } }}>
          <option value="">{t('Вставить из портфолио…')}</option>
          {portfolio.map(it => <option key={it.id} value={it.id}>{it.title}</option>)}
        </select>}
      </div>}
    </>
  } else if (f.type === 'select') {
    control = <select className={cls} id={id} name={f.key} value={String(value)} onChange={e => onChange(e.target.value)}>
      {(f.options || []).map((o, i) => <option key={o} value={o}>{t(f.labels ? f.labels[i] : o)}</option>)}
    </select>
  } else if (f.type === 'portfolio') {
    const items = portfolio.filter(it => !f.category || it.category === f.category)
    control = <>
      <select className={cls} id={id} name={f.key} value={String(value)} onChange={e => onChange(e.target.value)}>
        <option value="">{t('— не использовать —')}</option>
        {items.map(it => <option key={it.id} value={it.id}>{it.title}</option>)}
      </select>
      {!items.length && <small className="vl-help">{t('В портфолио пока нет подходящих материалов — сначала выполните ВР № 1, либо просто укажите тему.')}</small>}
    </>
  } else {
    control = <input className={cls} id={id} name={f.key} type={f.type === 'number' ? 'number' : 'text'} value={value}
      min={f.min} max={f.max} placeholder={f.placeholder ? t(f.placeholder) : ''} onChange={e => onChange(e.target.value)} aria-invalid={invalid}/>
  }
  return <div className={`vl-field ${wide ? 'wide' : ''}`}>
    <label htmlFor={id}>{t(f.label)}{f.required && <span className="vl-req" aria-hidden="true"> *</span>}</label>
    {control}
    {f.help && <small className="vl-help">{t(f.help)}</small>}
  </div>
}

export function ProfileForm({ initial, onSave, submitLabel, extra }: { initial: Profile; onSave: (p: Profile) => Promise<void> | void; submitLabel: string; extra?: ReactNode }) {
  const t = useT()
  const toast = useToast()
  const [vals, setVals] = useState<Record<string, Value>>(() => Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, initial[f.key] ?? f.default ?? (f.options ? f.options[0] : '')])))
  const [bad, setBad] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  return <form noValidate onSubmit={async e => {
    e.preventDefault()
    const r = readFields(PROFILE_FIELDS, vals); setBad(r.bad)
    if (r.bad.length) { document.getElementById('vl_f_' + r.bad[0])?.focus(); toast(t('Заполните обязательные поля'), 'error'); return }
    setBusy(true)
    try { await onSave(r.data as Profile) } catch (err) { toast((err as Error).message, 'error') } finally { setBusy(false) }
  }}>
    <div className="vl-form-grid">{PROFILE_FIELDS.map(f => <FieldInput key={f.key} f={f} value={vals[f.key] ?? ''} invalid={bad.includes(f.key)} onChange={v => setVals({ ...vals, [f.key]: v })}/>)}</div>
    <div className="vl-row vl-mt"><Button type="submit" disabled={busy}>{submitLabel}</Button>{extra}</div>
  </form>
}

export function Quiz({ qs, onGraded, label }: { qs: (QuizQuestion & { expl?: string })[]; onGraded: (score: number, answered: number) => void; label?: string }) {
  const t = useT()
  const [ans, setAns] = useState<Record<number, number>>({})
  const [checked, setChecked] = useState(false)
  return <div className="vl-quiz">
    {qs.map((q, i) => <fieldset className="vl-question" key={i}><legend>{i + 1}. {t(q.q)}</legend>
      <div className="options">{q.options.map((o, j) => <label key={j} className={`${ans[i] === j ? 'selected' : ''} ${checked && j === q.answer ? 'vl-right' : ''} ${checked && ans[i] === j && j !== q.answer ? 'vl-wrong' : ''}`}>
        <input type="radio" name={`vl_q${i}`} checked={ans[i] === j} onChange={() => setAns({ ...ans, [i]: j })}/> <span>{t(o)}</span></label>)}</div>
      {checked && q.expl && <small className="vl-help">{q.expl}</small>}
    </fieldset>)}
    <Button variant="secondary" onClick={() => {
      setChecked(true)
      const ok = qs.filter((q, i) => ans[i] === q.answer).length
      onGraded(Math.round(ok / qs.length * 100), Object.keys(ans).length)
    }}>{label ?? t('Проверить ответы')}</Button>
  </div>
}
