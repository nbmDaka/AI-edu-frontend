import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Notice } from '../components/ui'
import { useI18n } from '../i18n'
import type { AnalyticsModule } from './analytics'

const MIN_THRESHOLD = 40
const MAX_THRESHOLD = 80

/** Share of students whose latest readiness reaches `threshold`, recalculated in the browser. */
export function passingAt(values: number[], threshold: number) {
  return values.filter(value => value >= threshold).length
}

/** Lets an administrator change the real module threshold right from the statistics. */
function ThresholdEditor({ module }: { module: AnalyticsModule }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [value, setValue] = useState(String(module.threshold ?? 60))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && parsed >= MIN_THRESHOLD && parsed <= MAX_THRESHOLD
  const changed = parsed !== module.threshold
  async function save() {
    setBusy(true); setError('')
    try {
      await api(`modules/${module.short_id}/threshold/`, 'PATCH', { adaptive_threshold: parsed })
      await qc.invalidateQueries({ queryKey: ['admin-analytics'] })
    } catch (cause) { setError(t((cause as Error).message)) }
    finally { setBusy(false) }
  }
  return <div className="analytics-threshold">
    <label>{t('Порог')}, %<input className="input" type="number" min={MIN_THRESHOLD} max={MAX_THRESHOLD} step={1} value={value}
      aria-label={`${t('Порог модуля')} ${module.title}`} onChange={event => setValue(event.target.value)}/></label>
    {changed && <button type="button" className="button secondary" disabled={!valid || busy} onClick={() => void save()}>{t(busy ? 'Сохранение…' : 'Сохранить')}</button>}
    <Notice text={error} kind="error" onDismiss={() => setError('')}/>
  </div>
}

export function RecommendationPanel({ modules, courseTitles, number }: {
  modules: AnalyticsModule[]; courseTitles: Map<number, string>; number: (value: number) => string
}) {
  const { t } = useI18n()
  const [whatIf, setWhatIf] = useState<number | null>(null)
  const rows = modules.filter(row => row.recommendations?.tested_students)
  if (!rows.length) return null
  return <section className="analytics-panel analytics-recommendations">
    <div className="analytics-table-heading"><div><h2>{t('Рекомендации по модулям')}</h2>
      <p>{t('Последнее решение каждого студента после итогового теста модуля, за всё время.')}</p></div></div>
    <div className="analytics-whatif">
      <label><span>{t('Проверить другой порог')}: <b>{whatIf === null ? t('как в модулях') : `${whatIf}%`}</b></span>
        <input type="range" min={MIN_THRESHOLD} max={MAX_THRESHOLD} step={1} value={whatIf ?? 60}
          onChange={event => setWhatIf(Number(event.target.value))}/></label>
      {whatIf !== null && <button type="button" className="button secondary" onClick={() => setWhatIf(null)}>{t('Сбросить')}</button>}
    </div>
    <div className="analytics-table-scroll"><table className="analytics-table"><caption className="sr-only">{t('Рекомендации по модулям')}</caption><thead><tr>
      <th scope="col">{t('Модуль')}</th><th scope="col">{t('Сдавали тест')}</th><th scope="col">{t('Далее')}</th><th scope="col">{t('Повтор')}</th>
      <th scope="col">{t('Средняя готовность')}</th><th scope="col">{t('Частые слабые темы')}</th>
      {whatIf !== null && <th scope="col">{t('Далее при пороге')} {whatIf}%</th>}
    </tr></thead><tbody>{rows.map(row => {
      const stats = row.recommendations!
      const next = whatIf === null ? null : passingAt(stats.readiness_values, whatIf)
      return <tr key={row.id}>
        <th scope="row"><Link to={`/admin/curriculum/modules/${row.short_id}`}>{row.title}</Link><small>{courseTitles.get(row.course_id)}</small></th>
        <td>{number(stats.tested_students)}<small>{t('Попыток')}: {number(stats.attempts)}</small></td>
        <td>{number(stats.next_students)}<small>{number(stats.next_rate)}%</small></td>
        <td>{number(stats.repeat_students)}</td>
        <td>{stats.average_readiness === null ? '—' : `${number(stats.average_readiness)}%`}{row.threshold !== undefined && <ThresholdEditor key={row.threshold} module={row}/>}</td>
        <td>{stats.weak_topics.length ? <ul className="analytics-topics">{stats.weak_topics.map(topic =>
          <li key={topic.competency}>{topic.title} <small>({number(topic.students)})</small></li>)}</ul> : '—'}</td>
        {next !== null && <td>{number(next)}<small>{number(Math.round(next / stats.tested_students * 1000) / 10)}%</small></td>}
      </tr>
    })}</tbody></table></div>
    <p className="analytics-chart-note">{t('Слабая тема — компетенция, где студент ответил верно меньше чем на 60 % вопросов. В скобках — число студентов. Ползунок только показывает расчёт, а кнопка «Сохранить» у порога меняет его для новых попыток студентов.')}</p>
  </section>
}
