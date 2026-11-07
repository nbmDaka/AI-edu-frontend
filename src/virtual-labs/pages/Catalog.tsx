/* Главная модуля: приветствие, показатели, рекомендация адаптивного модуля, задания тьютора, курсы с работами. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, Sparkles } from 'lucide-react'
import { labApi, type MyAssignment, type NextWork } from '../api'
import { useT } from '../i18n'
import { Lab, useLab, workStatus } from '../store'
import { useLabPath } from '../paths'
import { Badge, Kpi, Meter, PageHead, fmtDate, fmtDuration, useModal } from '../components/ui'
import { ProfileForm } from '../components/forms'
import { WorkIcon } from '../components/WorkIcon'
import { localize } from '../localize'
import type { WorkModule } from '../core/types'

export function WorkCard({ m }: { m: WorkModule }) {
  const t = useT()
  const path = useLabPath()
  const st = workStatus(m.id)
  const label = st.key === 'done' ? t('Выполнена') : st.key === 'progress' ? t('В работе') : t('Не начата')
  return <Link className="card vl-work-card" to={path(`lab/${m.id}`)}>
    <div className="vl-row vl-spread"><WorkIcon code={m.id}/>
      <Badge tone={st.key === 'done' ? 'good' : st.key === 'progress' ? 'info' : ''}>{label}{st.score != null ? ` · ${st.score}` : ''}</Badge></div>
    <span className="eyebrow">{t('Виртуальная работа № {n}', { n: m.n })}</span>
    <h3>{t(m.title)}</h3>
    <p>{t(m.goal)}</p>
  </Link>
}

export function Catalog() {
  useLab()
  const t = useT()
  const path = useLabPath()
  const open = useModal()
  const cfg = Lab.config()
  const sum = Lab.summary()
  const total = Lab.modules().length
  const [next, setNext] = useState<NextWork | null>(null)
  const [assignments, setAssignments] = useState<MyAssignment[]>([])
  useEffect(() => {
    labApi<NextWork>('next/').then(setNext, () => setNext(null))
    labApi<MyAssignment[]>('assignments/').then(setAssignments, () => setAssignments([]))
  }, [sum.completed])
  // первый вход: профиль преподавателя подставляется во все лаборатории
  useEffect(() => {
    if (Lab.profile()) return
    open(close => <>
      <h2>{t('Добро пожаловать в виртуальные лаборатории!')}</h2>
      <p>{t('Заполните профиль преподавателя: эти данные будут подставляться во все работы. Их можно изменить позже в разделе «Профиль и документы».')}</p>
      <ProfileForm initial={{ fio: cfg.user.name !== cfg.user.login ? cfg.user.name : '', audience: 'Студенты бакалавриата', language: 'Русский' }}
        submitLabel={t('Начать работу')} onSave={async p => { await Lab.saveProfile(p); close() }}
        extra={<button type="button" className="button secondary" onClick={() => { void Lab.saveProfile({ fio: '', discipline: '' }); close() }}>{t('Пропустить')}</button>}/>
    </>, { wide: true })
  }, [open, t, cfg])
  const p = Lab.profile() || {}
  const nm = next?.id ? Lab.module(next.id) : null
  const open_ = assignments.filter(a => !a.completed)
  // Имя из учётной записи; если его нет — второе слово Ф. И. О. (порядок «Фамилия Имя Отчество»)
  const parts = String(p.fio || '').trim().split(/\s+/)
  const first = Lab.config().user.firstName || (parts.length === 1 ? parts[0] : parts[1] && !parts[1].includes('.') ? parts[1] : '')
  return <>
    <PageHead eyebrow={t('Траектория 2 · педагоги не IT-специальностей')} title={first ? t('Здравствуйте, {name}!', { name: first }) : t('Виртуальные лаборатории')}
      description={t('Четырнадцать виртуальных работ: от промпта до готового учебного материала с AI-экспертизой, портфолио и аналитикой.')}
      action={<Badge tone={cfg.ai.configured ? 'good' : 'warn'} title={cfg.ai.model}>{cfg.ai.configured ? `● ${cfg.ai.name}` : `● ${t('Демо-режим')}`}</Badge>}/>
    <div className="vl-grid g4">
      <Kpi value={`${sum.completed} / ${total}`} label={t('работ выполнено')}><Meter value={total ? sum.completed / total * 100 : 0} tone="info"/></Kpi>
      <Kpi value={sum.avgScore ?? '—'} label={t('средняя оценка экспертизы')}/>
      <Kpi value={sum.portfolio} label={t('материалов в портфолио')}/>
      <Kpi value={fmtDuration(sum.timeSpent, t)} label={t('время в лабораториях')}/>
    </div>
    {open_.length > 0 && <section className="card vl-mt2"><h2 className="vl-h2"><CalendarClock size={20}/>{t('Задания тьютора')}</h2>
      <ul className="vl-list">{open_.slice(0, 5).map(a => <li key={a.id}><div><b>{t('ВР № {n}', { n: a.workNumber })}. {t(a.title)}</b>
        <small>{a.group}{a.dueAt ? ` · ${t('срок')}: ${fmtDate(a.dueAt, t.locale, false)}` : ''}</small></div>
        <Link className="button secondary vl-sm" to={path(`lab/${a.workCode}`)}>{t('Открыть')}<ArrowRight size={15}/></Link></li>)}</ul></section>}
    {nm ? <section className="card vl-mt2 vl-recommend"><div className="vl-row vl-spread"><div>
      <Badge tone="info"><Sparkles size={13}/> {t('Рекомендация адаптивного модуля')}</Badge>
      <h2 className="vl-mt">{t('ВР № {n}', { n: nm.n })}. {t(nm.title)}</h2><p>{localize(t, next!.reason)}</p></div>
      <Link className="button primary" to={path(`lab/${nm.id}`)}>{t('Открыть лабораторию')}<ArrowRight size={16}/></Link></div></section>
      : next && <section className="vl-note good vl-mt2">{localize(t, next.reason)}</section>}
    {Lab.courses().map(c => {
      const mods = c.works.map(code => Lab.module(code)).filter(Boolean) as WorkModule[]
      const done = mods.filter(m => workStatus(m.id).key === 'done').length
      return <section key={c.title} className="vl-course">
        <div className="vl-row vl-spread vl-course-head"><div><h2>{t(c.title)}</h2>{c.description && <p>{t(c.description)}</p>}</div>
          <Badge tone={done === mods.length ? 'good' : ''}>{t('{a} из {b}', { a: done, b: mods.length })}</Badge></div>
        <div className="vl-grid g3">{mods.map(m => <WorkCard key={m.id} m={m}/>)}</div>
      </section>
    })}
    <p className="vl-help vl-mt2">{t('Цикл каждой работы: задание → исходные данные → промпт → генерация → экспертиза → улучшение → портфолио.')}</p>
  </>
}
