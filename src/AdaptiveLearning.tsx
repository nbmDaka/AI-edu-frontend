import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import { api, type AdaptiveResult, type LearningItem } from './api'
import { Button, ErrorState, Loading, Notice } from './components/ui'
import { useI18n } from './i18n'

export function LearningItemLink({ item, locked = item.is_locked, children }: { item: LearningItem; locked?: boolean; children: ReactNode }) {
  const { t } = useI18n()
  return locked ? <div className="locked-learning-item" aria-disabled="true" title={t('Сначала завершите предыдущий модуль')}>{children}<LockKeyhole size={16}/></div> : <Link to={`/items/${item.short_id}`}>{children}</Link>
}

export function AdaptiveResultCard({ result }: { result: AdaptiveResult }) {
  const { t } = useI18n()
  return <div className={`result-card ${result.module_completed ? 'passed' : 'failed'}`}>
    <h3>{t(result.module_completed ? 'Модуль освоен' : 'Повторите модуль')}</h3>
    <strong>{result.readiness}%</strong><p>{t('Готовность')} · {t('Порог')} {result.threshold}%</p>
    <div className="adaptive-indicators">{([
      ['Теория', result.theory], ['Практика', result.practice], ['Ошибки', result.errors], ['Компетенции', result.competency],
    ] as const).map(([label, value]) => <span key={label}>{t(label)}: {Math.round(value * 100)}%</span>)}</div>
    <p>{t(result.module_completed ? 'Можно продолжить обучение.' : 'Пройдите материалы и практику ещё раз, затем повторите итоговый тест.')}</p>
    {result.module_completed ? result.next_item_short_id ? <Link className="button" to={`/items/${result.next_item_short_id}`}>{t('Следующий модуль')}</Link> : <p>{t('Все опубликованные модули курса пройдены.')}</p> : <Link className="button" to={`/items/${result.repeat_item_short_id}`}>{t('Повторить модуль')}</Link>}
  </div>
}

type PracticeState = { criteria: string[]; checks: boolean[] | null }

export function PracticeRunner({ item }: { item: LearningItem }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const state = useQuery({ queryKey: ['practice', item.short_id], queryFn: () => api<PracticeState>(`items/${item.short_id}/practice/`) })
  const [checks, setChecks] = useState<boolean[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (state.data) setChecks(state.data.checks ?? state.data.criteria.map(() => false)) }, [state.data])
  const save = async () => {
    setBusy(true); setNotice('')
    try {
      await api(`items/${item.short_id}/practice/`, 'POST', { checks })
      await Promise.all([qc.invalidateQueries({ queryKey: ['practice', item.short_id] }), qc.invalidateQueries({ queryKey: ['course-progress'] })])
      setFailed(false); setNotice(t('Самопроверка сохранена'))
    } catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : t('Не удалось сохранить')) }
    finally { setBusy(false) }
  }
  if (state.isLoading) return <Loading/>
  if (state.error) return <ErrorState error={state.error}/>
  if (!state.data?.criteria.length) return <div className="card form-card"><p>{t('Критерии практики ещё не настроены.')}</p></div>
  return <div className="card form-card"><h2>{t('Самопроверка практической работы')}</h2><p>{t('Выполните задание и отметьте соблюдённые критерии. Этот результат учитывается в готовности модуля.')}</p>
    <div className="practice-checks">{state.data.criteria.map((criterion, index) => <label key={index}><input type="checkbox" checked={checks[index] ?? false} onChange={event => { setChecks(current => current.map((value, offset) => offset === index ? event.target.checked : value)); setNotice('') }}/><span>{criterion}</span></label>)}</div>
    <Button disabled={busy || checks.length !== state.data.criteria.length} onClick={() => void save()}>{t('Сохранить самопроверку')}</Button><Notice text={notice} kind={failed ? 'error' : 'success'}/>
  </div>
}
