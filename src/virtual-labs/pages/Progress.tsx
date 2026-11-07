/* Мой прогресс (ТЗ, п. 32): показатели по работам, отзывы тьютора, отчёт о прохождении. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { labApi, type Review, type UserAnalytics } from '../api'
import { useT, type T } from '../i18n'
import { EVENT_NAMES } from '../localize'
import { Lab, useLab } from '../store'
import { useLabPath } from '../paths'
import { Badge, Kpi, Loading, Meter, Note, PageHead, fmtDate, fmtDuration, scoreTone } from '../components/ui'
import { ExportButtons } from './Lab'

export function progressMarkdown(an: UserAnalytics, t: T): string {
  const p = Lab.profile() || {}
  const mods = Lab.modules()
  return `## ${t('Сведения')}\n- ${t('Слушатель')}: ${p.fio || an.fio || '—'}\n- ${t('Организация')}: ${p.organization || '—'}\n- ${t('Дисциплина')}: ${p.discipline || '—'}\n- ${t('Дата отчёта')}: ${fmtDate(Date.now(), t.locale)}\n\n` +
    `## ${t('Сводные показатели')}\n| ${t('Показатель')} | ${t('Значение')} |\n|---|---|\n| ${t('Выполнено работ')} | ${an.completed} / ${mods.length} |\n| ${t('Средняя оценка экспертизы')} | ${an.avgScore ?? '—'} |\n| ${t('Средняя первая оценка')} | ${an.avgFirstScore ?? '—'} |\n| ${t('Средний результат самопроверки')} | ${an.avgQuiz != null ? an.avgQuiz + '%' : '—'} |\n| ${t('Средняя оценка тьютора')} | ${an.avgGrade ?? '—'} |\n| ${t('Генераций')} | ${an.generations} |\n| ${t('Улучшений промпта')} | ${an.promptImprovements} |\n| ${t('Правок материала')} | ${an.edits} |\n| ${t('Время работы')} | ${fmtDuration(an.timeSpentMs, t)} |\n\n` +
    `## ${t('По виртуальным работам')}\n| № | ${t('Работа')} | ${t('Статус')} | ${t('Первая оценка')} | ${t('Итоговая оценка')} | ${t('Промпт')} | ${t('Самопроверка')} | ${t('Время')} |\n|---|---|---|---|---|---|---|---|\n` +
    mods.map(m => {
      const w = an.perWork.find(x => x.modId === m.id)
      return `| ${m.n} | ${t(m.title)} | ${w ? (w.completed ? t('выполнена') : t('в работе')) : t('не начата')} | ${w?.firstScore ?? '—'} | ${w?.score ?? '—'} | ${w && w.promptScore != null ? w.promptScore + '%' : '—'} | ${w && w.quiz != null ? w.quiz + '%' : '—'} | ${w ? fmtDuration(w.timeSpentMs, t) : '—'} |`
    }).join('\n')
}

export function ProgressPage() {
  useLab()
  const t = useT()
  const path = useLabPath()
  const [an, setAn] = useState<UserAnalytics | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    labApi<UserAnalytics>('analytics/').then(setAn, e => setError((e as Error).message))
    labApi<Review[]>('reviews/').then(r => { setReviews(r); if (r.some(x => !x.seen)) void labApi('reviews/', 'POST') }, () => setReviews([]))
  }, []) // аналитика считается сервером при открытии страницы
  if (error) return <Note kind="error">{error}</Note>
  if (!an) return <Loading/>
  const mods = Lab.modules()
  const tools = Object.entries(an.tools || {}).sort((a, b) => b[1] - a[1])
  return <>
    <PageHead eyebrow={t('Learning Analytics')} title={t('Мой прогресс')} description={t('Как меняется качество ваших промптов и материалов от работы к работе.')}/>
    <div className="vl-grid g4">
      <Kpi value={`${an.completed} / ${mods.length}`} label={t('работ выполнено')}><Meter value={mods.length ? an.completed / mods.length * 100 : 0} tone="info"/></Kpi>
      <Kpi value={`${an.avgFirstScore ?? '—'} → ${an.avgScore ?? '—'}`} label={t('оценка: первая → итоговая (среднее)')}/>
      <Kpi value={an.avgPrompt != null ? an.avgPrompt + '%' : '—'} label={t('средняя оценка промптов')}/>
      <Kpi value={fmtDuration(an.timeSpentMs, t)} label={t('время в лабораториях')}/>
    </div>
    <div className="vl-grid g4 vl-mt">
      <Kpi value={an.generations} label={t('генераций')}/><Kpi value={an.promptImprovements} label={t('улучшений промпта')}/>
      <Kpi value={an.edits} label={t('правок материала')}/><Kpi value={an.avgGrade ?? '—'} label={t('средняя оценка тьютора')}/>
    </div>
    {reviews.length > 0 && <section className="card vl-mt2"><h2>{t('Отзывы тьютора')}</h2><ul className="vl-list">{reviews.map(r =>
      <li key={r.id}><div><b>{t(r.workTitle)}</b>{!r.seen && <> <Badge tone="info">{t('новый')}</Badge></>}<p>{r.comment || '—'}</p>
        <small>{r.reviewer} · {fmtDate(r.createdAt, t.locale)}</small></div>{r.grade != null && <Badge tone={scoreTone(r.grade)}>{t('Оценка: {n}', { n: r.grade })}</Badge>}</li>)}</ul></section>}
    <section className="card vl-mt2"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('По виртуальным работам')}</h2>
      <ExportButtons title={t('Отчёт о прохождении виртуальных лабораторий')} text={progressMarkdown(an, t)} code={null} meta={`AI edu · ${fmtDate(Date.now(), t.locale)}`}/></div>
      <div className="vl-table-wrap vl-mt"><table className="vl-table"><thead><tr><th>№</th><th>{t('Работа')}</th><th>{t('Статус')}</th><th>{t('Первая')}</th><th>{t('Итоговая')}</th><th>{t('Промпт')}</th><th>{t('Самопроверка')}</th><th>{t('Время')}</th></tr></thead>
        <tbody>{mods.map(m => {
          const w = an.perWork.find(x => x.modId === m.id)
          return <tr key={m.id}><td>{m.n}</td><td><Link className="text-link" to={path(`lab/${m.id}`)}>{t(m.title)}</Link></td>
            <td><Badge tone={w?.completed ? 'good' : w ? 'info' : ''}>{w ? (w.completed ? t('выполнена') : t('в работе')) : t('не начата')}</Badge></td>
            <td>{w?.firstScore ?? '—'}</td><td>{w?.score != null ? <Badge tone={scoreTone(w.score)}>{w.score}</Badge> : '—'}</td>
            <td>{w?.promptScore != null ? w.promptScore + '%' : '—'}</td><td>{w?.quiz != null ? w.quiz + '%' : '—'}</td><td>{w ? fmtDuration(w.timeSpentMs, t) : '—'}</td></tr>
        })}</tbody></table></div></section>
    {tools.length > 0 && <section className="card vl-mt2"><h2>{t('Использование инструментов')}</h2><div className="vl-chips">
      {tools.map(([k, n]) => <span key={k} className="vl-chip">{t(EVENT_NAMES[k] || k)} · {n}</span>)}</div></section>}
  </>
}
