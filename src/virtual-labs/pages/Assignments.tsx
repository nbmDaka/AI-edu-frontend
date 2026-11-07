/* Задания и группы слушателя: вступление в группу по коду, задания тьютора со сроками, отзывы. */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, UsersRound } from 'lucide-react'
import { labApi, type MyAssignment, type Review } from '../api'
import { useT } from '../i18n'
import { useLabPath } from '../paths'
import { Badge, Button, Empty, Loading, PageHead, fmtDate, scoreTone, useToast } from '../components/ui'

type MyGroup = { id: number; name: string; description: string; tutor: string }

export function AssignmentsPage() {
  const t = useT()
  const toast = useToast()
  const path = useLabPath()
  const [groups, setGroups] = useState<MyGroup[] | null>(null)
  const [items, setItems] = useState<MyAssignment[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [code, setCode] = useState('')
  const load = () => Promise.all([labApi<MyGroup[]>('groups/'), labApi<MyAssignment[]>('assignments/'), labApi<Review[]>('reviews/')])
    .then(([g, a, r]) => { setGroups(g); setItems(a); setReviews(r) }, e => toast((e as Error).message, 'error'))
  useEffect(() => { void load() }, [])
  const join = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const g = await labApi<{ name: string }>('groups/join/', 'POST', { code })
      toast(t('Вы вступили в группу «{name}»', { name: g.name })); setCode(''); void load()
    } catch (err) { toast((err as Error).message, 'error') }
  }
  if (!groups) return <Loading/>
  const reviewFor = (code: string) => reviews.find(r => r.workCode === code)
  return <>
    <PageHead eyebrow={t('Тьютор и группа')} title={t('Задания и группы')} description={t('Тьютор объединяет слушателей в группы, назначает виртуальные работы и оставляет отзывы с оценкой.')}/>
    <div className="vl-grid split">
      <section className="card"><h2>{t('Задания')}</h2>
        {!items.length ? <Empty>{t('Заданий пока нет. Когда тьютор назначит работу вашей группе, она появится здесь.')}</Empty>
          : <ul className="vl-list">{items.map(a => {
            const r = reviewFor(a.workCode)
            const overdue = a.dueAt && !a.completed && new Date(a.dueAt).getTime() < Date.now()
            return <li key={a.id}><div><b>{t('ВР № {n}', { n: a.workNumber })}. {t(a.title)}</b>
              {a.instructions && <p>{a.instructions}</p>}
              <small>{a.group}{a.dueAt ? ` · ${t('срок')}: ${fmtDate(a.dueAt, t.locale, false)}` : ''}</small>
              <div className="vl-row vl-mt-sm">
                <Badge tone={a.completed ? 'good' : overdue ? 'bad' : 'info'}>{a.completed ? t('выполнена') : overdue ? t('срок истёк') : t('в работе')}</Badge>
                {a.score != null && <Badge tone={scoreTone(a.score)}>{t('Экспертиза: {n}', { n: a.score })}</Badge>}
                {r?.grade != null && <Badge tone={scoreTone(r.grade)}>{t('Оценка тьютора: {n}', { n: r.grade })}</Badge>}</div>
              {r?.comment && <p className="vl-quote">{r.comment}</p>}</div>
              <Link className="button secondary vl-sm" to={path(`lab/${a.workCode}`)}>{t('Открыть')}<ArrowRight size={15}/></Link></li>
          })}</ul>}
      </section>
      <section className="card"><h2><UsersRound size={20} className="vl-inline-icon"/>{t('Мои группы')}</h2>
        {groups.length ? <ul className="vl-list">{groups.map(g => <li key={g.id}><div><b>{g.name}</b><small>{t('Тьютор')}: {g.tutor}</small>{g.description && <p>{g.description}</p>}</div></li>)}</ul>
          : <p className="vl-help">{t('Вы пока не состоите в группе.')}</p>}
        <form className="vl-mt" onSubmit={join}><label htmlFor="vl_join">{t('Код приглашения от тьютора')}</label>
          <div className="vl-row vl-mt-sm"><input id="vl_join" className="input vl-grow vl-code" value={code} maxLength={12} placeholder="ABCD2345"
            onChange={e => setCode(e.target.value.toUpperCase())}/><Button type="submit" disabled={code.trim().length < 4}>{t('Вступить')}</Button></div></form>
      </section>
    </div>
  </>
}
