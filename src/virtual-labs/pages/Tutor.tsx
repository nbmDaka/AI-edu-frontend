/* Панель тьютора (ТЗ, п. 8.2): группы и коды приглашения, задания со сроками, проверка результатов
   с комментарием и оценкой, аналитика по слушателям. Администратор видит всех слушателей. */
import { useEffect, useState, type FormEvent } from 'react'
import { Copy, Eye, Plus, Trash2, UserMinus } from 'lucide-react'
import { labApi, type Group, type SessionDetail, type SessionSummary, type TutorAssignment, type UserAnalytics } from '../api'
import { useT } from '../i18n'
import { localize } from '../localize'
import { Lab } from '../store'
import { Badge, Button, Empty, Loading, Markdown, PageHead, Tabs, copyText, fmtDate, fmtDuration, scoreTone, useConfirm, useModal, useToast } from '../components/ui'

type Tab = 'groups' | 'assignments' | 'results' | 'analytics'

export function TutorPage() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('results')
  const [groups, setGroups] = useState<Group[] | null>(null)
  const loadGroups = () => labApi<Group[]>('tutor/groups/').then(setGroups, () => setGroups([]))
  useEffect(() => { void loadGroups() }, [])
  return <>
    <PageHead eyebrow={t('Тьютор')} title={t('Сопровождение слушателей')} description={t('Группы, задания, проверка результатов и аналитика обучения.')}/>
    <Tabs<Tab> label={t('Разделы тьютора')} value={tab} onChange={setTab}
      items={[['results', t('Результаты')], ['groups', t('Группы')], ['assignments', t('Задания')], ['analytics', t('Аналитика')]]}/>
    {!groups ? <Loading/> : tab === 'groups' ? <Groups groups={groups} reload={loadGroups}/> : tab === 'assignments' ? <Assignments groups={groups}/>
      : tab === 'results' ? <Results groups={groups}/> : <Analytics groups={groups}/>}
  </>
}

function GroupFilter({ groups, value, onChange }: { groups: Group[]; value: string; onChange: (v: string) => void }) {
  const t = useT()
  return <select className="input vl-auto" value={value} onChange={e => onChange(e.target.value)} aria-label={t('Группа')}>
    <option value="">{Lab.isAdmin() ? t('Все слушатели') : t('Все мои группы')}</option>
    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
  </select>
}

function Groups({ groups, reload }: { groups: Group[]; reload: () => void }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState({ name: '', description: '' })
  const [open, setOpen] = useState<Group | null>(null)
  const [login, setLogin] = useState('')
  const [found, setFound] = useState<{ id: number; login: string; name: string }[]>([])
  useEffect(() => {
    if (login.trim().length < 2) { setFound([]); return }
    const id = setTimeout(() => labApi<typeof found>(`tutor/users/?q=${encodeURIComponent(login.trim())}`).then(setFound, () => setFound([])), 250)
    return () => clearTimeout(id)
  }, [login])
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try { const g = await labApi<Group>('tutor/groups/', 'POST', form); setForm({ name: '', description: '' }); setOpen(g); reload(); toast(t('Группа создана')) }
    catch (err) { toast((err as Error).message, 'error') }
  }
  const openGroup = async (id: number) => { try { setOpen(await labApi<Group>(`tutor/groups/${id}/`)) } catch (e) { toast((e as Error).message, 'error') } }
  const addMember = async (value: string) => {
    if (!open) return
    try { setOpen(await labApi<Group>(`tutor/groups/${open.id}/members/`, 'POST', { login: value })); setLogin(''); reload() }
    catch (e) { toast((e as Error).message, 'error') }
  }
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Мои группы')}</h2>
      {!groups.length ? <Empty>{t('Создайте первую группу и передайте слушателям код приглашения.')}</Empty>
        : <ul className="vl-list">{groups.map(g => <li key={g.id} className={open?.id === g.id ? 'active' : ''}><div><b>{g.name}</b>
          <small>{t('Слушателей: {n}', { n: g.members })} · {t('заданий: {n}', { n: g.assignments })}{Lab.isAdmin() ? ` · ${t('тьютор')}: ${g.tutor}` : ''}</small></div>
          <div className="vl-row vl-nowrap"><Badge>{g.inviteCode}</Badge><Button variant="secondary" size="sm" onClick={() => void openGroup(g.id)}>{t('Открыть')}</Button></div></li>)}</ul>}
      <form className="vl-mt" onSubmit={create}><h3>{t('Новая группа')}</h3>
        <input className="input" placeholder={t('Название, например «ПК-2026, поток 1»')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={200}/>
        <textarea className="input vl-mt-sm" rows={2} placeholder={t('Описание (необязательно)')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/>
        <Button type="submit" className="vl-mt-sm" disabled={!form.name.trim()}><Plus size={16}/>{t('Создать группу')}</Button></form>
    </section>
    <section className="card">{!open ? <Empty>{t('Выберите группу, чтобы увидеть участников.')}</Empty> : <>
      <div className="vl-row vl-spread"><h2 className="vl-h2">{open.name}</h2>
        <Button variant="ghost" size="sm" onClick={() => confirm(t('Удалить группу «{name}» вместе с заданиями? Результаты слушателей сохранятся.', { name: open.name }), t('Удалить'),
          () => labApi(`tutor/groups/${open.id}/`, 'DELETE').then(() => { setOpen(null); reload() }, e => toast((e as Error).message, 'error')))}><Trash2 size={15}/>{t('Удалить')}</Button></div>
      {open.description && <p>{open.description}</p>}
      <div className="vl-note info"><b>{t('Код приглашения:')}</b> <span className="vl-code">{open.inviteCode}</span>
        <Button variant="ghost" size="sm" onClick={() => copyText(open.inviteCode, toast, t)}><Copy size={14}/></Button>
        <div className="vl-help">{t('Слушатель вводит код в разделе «Задания и группы».')}</div></div>
      <h3 className="vl-mt">{t('Добавить слушателя')}</h3>
      <div className="vl-row"><input className="input vl-grow" placeholder={t('Логин или Ф. И. О.')} value={login} onChange={e => setLogin(e.target.value)}/>
        <Button variant="secondary" disabled={!login.trim()} onClick={() => void addMember(login.trim())}>{t('Добавить')}</Button></div>
      {found.length > 0 && <ul className="vl-suggest">{found.map(u => <li key={u.id}><button type="button" onClick={() => void addMember(u.login)}>{u.name} <small>@{u.login}</small></button></li>)}</ul>}
      <h3 className="vl-mt">{t('Участники ({n})', { n: open.memberList?.length ?? 0 })}</h3>
      <ul className="vl-list">{(open.memberList || []).map(u => <li key={u.id}><div><b>{u.name}</b><small>@{u.login} · {fmtDate(u.joinedAt, t.locale, false)}</small></div>
        <Button variant="ghost" size="sm" title={t('Исключить из группы')} onClick={() => labApi(`tutor/groups/${open.id}/members/${u.id}/`, 'DELETE')
          .then(() => openGroup(open.id).then(reload), e => toast((e as Error).message, 'error'))}><UserMinus size={15}/></Button></li>)}</ul>
    </>}</section>
  </div>
}

function Assignments({ groups }: { groups: Group[] }) {
  const t = useT()
  const toast = useToast()
  const [rows, setRows] = useState<TutorAssignment[] | null>(null)
  const [form, setForm] = useState({ groupId: groups[0]?.id ? String(groups[0].id) : '', workCode: Lab.modules()[0]?.id ?? '', title: '', instructions: '', dueAt: '' })
  const load = () => labApi<TutorAssignment[]>('tutor/assignments/').then(setRows, () => setRows([]))
  useEffect(() => { void load() }, [])
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try { await labApi('tutor/assignments/', 'POST', { ...form, groupId: Number(form.groupId) }); setForm({ ...form, title: '', instructions: '', dueAt: '' }); void load(); toast(t('Задание назначено')) }
    catch (err) { toast((err as Error).message, 'error') }
  }
  if (!groups.length) return <Empty>{t('Сначала создайте группу во вкладке «Группы».')}</Empty>
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Назначенные задания')}</h2>
      {!rows ? <Loading/> : !rows.length ? <Empty>{t('Заданий пока нет.')}</Empty> : <ul className="vl-list">{rows.map(a => <li key={a.id}><div>
        <b>{t('ВР № {n}', { n: a.workNumber })}. {t(a.title)}</b><small>{a.group}{a.dueAt ? ` · ${t('срок')}: ${fmtDate(a.dueAt, t.locale, false)}` : ''}</small>
        {a.instructions && <p>{a.instructions}</p>}</div>
        <div className="vl-row vl-nowrap"><Badge tone={a.completed === a.members && a.members ? 'good' : 'info'}>{t('{a} из {b}', { a: a.completed, b: a.members })}</Badge>
          <Button variant="ghost" size="sm" title={t('Удалить')} onClick={() => labApi(`tutor/assignments/${a.id}/`, 'DELETE').then(load, e => toast((e as Error).message, 'error'))}><Trash2 size={15}/></Button></div></li>)}</ul>}
    </section>
    <form className="card" onSubmit={create}><h2>{t('Новое задание')}</h2>
      <div className="vl-field"><label>{t('Группа')}</label><select className="input" value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })}>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      <div className="vl-field"><label>{t('Виртуальная работа')}</label><select className="input" value={form.workCode} onChange={e => setForm({ ...form, workCode: e.target.value })}>
        {Lab.modules().map(m => <option key={m.id} value={m.id}>{t('ВР № {n}', { n: m.n })}. {t(m.title)}</option>)}</select></div>
      <div className="vl-field"><label>{t('Заголовок (необязательно)')}</label><input className="input" value={form.title} maxLength={300} onChange={e => setForm({ ...form, title: e.target.value })}/></div>
      <div className="vl-field"><label>{t('Указания слушателям')}</label><textarea className="input" rows={4} value={form.instructions} maxLength={5000} onChange={e => setForm({ ...form, instructions: e.target.value })}/></div>
      <div className="vl-field"><label>{t('Срок сдачи')}</label><input className="input" type="date" value={form.dueAt} onChange={e => setForm({ ...form, dueAt: e.target.value })}/></div>
      <Button type="submit" disabled={!form.groupId || !form.workCode}><Plus size={16}/>{t('Назначить')}</Button>
    </form>
  </div>
}

function Results({ groups }: { groups: Group[] }) {
  const t = useT()
  const toast = useToast()
  const open = useModal()
  const [filter, setFilter] = useState({ group: '', work: '', status: '', unreviewed: false })
  const [rows, setRows] = useState<SessionSummary[] | null>(null)
  const load = () => {
    const q = new URLSearchParams()
    if (filter.group) q.set('group', filter.group)
    if (filter.work) q.set('work', filter.work)
    if (filter.status) q.set('status', filter.status)
    if (filter.unreviewed) q.set('unreviewed', '1')
    return labApi<SessionSummary[]>(`tutor/sessions/?${q}`).then(setRows, e => { toast((e as Error).message, 'error'); setRows([]) })
  }
  useEffect(() => { void load() }, [filter])
  const view = async (row: SessionSummary) => {
    try {
      const d = await labApi<SessionDetail>(`tutor/sessions/${row.id}/`)
      open(close => <ReviewDialog detail={d} onClose={close} onSaved={() => { close(); void load() }}/>, { wide: true })
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return <section className="card">
    <div className="vl-row vl-filters"><GroupFilter groups={groups} value={filter.group} onChange={group => setFilter({ ...filter, group })}/>
      <select className="input vl-auto" value={filter.work} onChange={e => setFilter({ ...filter, work: e.target.value })} aria-label={t('Работа')}>
        <option value="">{t('Все работы')}</option>{Lab.modules().map(m => <option key={m.id} value={m.id}>{t('ВР № {n}', { n: m.n })}</option>)}</select>
      <select className="input vl-auto" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} aria-label={t('Статус')}>
        <option value="">{t('Любой статус')}</option><option value="completed">{t('выполнена')}</option><option value="in_progress">{t('в работе')}</option></select>
      <label className="checkbox"><input type="checkbox" checked={filter.unreviewed} onChange={e => setFilter({ ...filter, unreviewed: e.target.checked })}/> {t('Только без отзыва')}</label></div>
    {!rows ? <Loading/> : !rows.length ? <Empty>{t('Результатов пока нет.')}</Empty> : <div className="vl-table-wrap vl-mt"><table className="vl-table">
      <thead><tr><th>{t('Слушатель')}</th><th>{t('Работа')}</th><th>{t('Статус')}</th><th>{t('Экспертиза')}</th><th>{t('Отзыв')}</th><th>{t('Обновлено')}</th><th/></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.user.name}</b><small className="vl-help"> @{r.user.login}</small></td>
        <td>{t('ВР № {n}', { n: r.workNumber })}</td><td><Badge tone={r.status === 'completed' ? 'good' : 'info'}>{r.status === 'completed' ? t('выполнена') : t('в работе')}</Badge></td>
        <td>{r.score != null ? <Badge tone={scoreTone(r.score)}>{r.score}</Badge> : '—'}</td>
        <td>{r.review ? <Badge tone={scoreTone(r.review.grade)}>{r.review.grade ?? '✓'}</Badge> : <span className="vl-help">{t('нет')}</span>}</td>
        <td className="vl-help">{fmtDate(r.updatedAt, t.locale)}</td>
        <td><Button variant="secondary" size="sm" onClick={() => void view(r)}><Eye size={15}/>{t('Проверить')}</Button></td></tr>)}</tbody></table></div>}
  </section>
}

function ReviewDialog({ detail, onClose, onSaved }: { detail: SessionDetail; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [grade, setGrade] = useState('')
  const v = detail.versions.find(x => x.id === detail.currentVersionId) || detail.versions[detail.versions.length - 1]
  const ev = detail.lastEvaluation
  const send = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await labApi(`tutor/sessions/${detail.summary.id}/reviews/`, 'POST', { comment, grade: grade === '' ? null : Number(grade) })
      toast(t('Отзыв отправлен слушателю')); onSaved()
    } catch (err) { toast((err as Error).message, 'error') }
  }
  return <>
    <div className="vl-row vl-spread"><div><span className="eyebrow">{t('ВР № {n}', { n: detail.summary.workNumber })} · {detail.summary.user.name}</span>
      <h2 className="vl-h2">{t(detail.summary.workTitle)}</h2></div><Button variant="ghost" size="sm" onClick={onClose}>{t('Закрыть')}</Button></div>
    <div className="vl-row vl-mt-sm"><Badge tone={scoreTone(ev?.total)}>{t('Экспертиза: {n}', { n: ev?.total ?? '—' })}</Badge>
      <Badge>{t('Генераций: {n}', { n: detail.stats.generations })}</Badge><Badge>{t('Улучшений промпта: {n}', { n: detail.stats.promptImprovements })}</Badge>
      <Badge>{t('Правок: {n}', { n: detail.stats.edits })}</Badge><Badge>{fmtDuration(detail.timeSpent, t)}</Badge></div>
    {ev && <details className="vl-mt"><summary>{t('Экспертиза по критериям')}</summary><table className="vl-table"><tbody>{ev.criteria.map(c =>
      <tr key={c.key}><td>{t(c.name)}</td><td><Badge tone={scoreTone(c.score * 10)}>{c.score}/10</Badge></td><td>{localize(t, c.comment)}</td></tr>)}</tbody></table></details>}
    {detail.prompt && <details className="vl-mt"><summary>{t('Промпт слушателя')}</summary><pre className="vl-pre">{detail.prompt}</pre></details>}
    {v ? <Markdown text={v.text} className="vl-result vl-mt"/> : <p className="vl-help">{t('Материал ещё не создан.')}</p>}
    {detail.reviews.length > 0 && <><h3 className="vl-mt">{t('Отзывы')}</h3><ul className="vl-list">{detail.reviews.map(r => <li key={r.id}><div><p>{r.comment || '—'}</p>
      <small>{r.reviewer} · {fmtDate(r.createdAt, t.locale)}</small></div>{r.grade != null && <Badge tone={scoreTone(r.grade)}>{r.grade}</Badge>}</li>)}</ul></>}
    <form className="vl-mt" onSubmit={send}><h3>{t('Новый отзыв')}</h3>
      <textarea className="input" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('Что получилось, что доработать')} maxLength={5000}/>
      <div className="vl-row vl-mt-sm"><label className="vl-inline-label">{t('Оценка (0–100)')}<input className="input vl-num" type="number" min={0} max={100} value={grade} onChange={e => setGrade(e.target.value)}/></label>
        <Button type="submit" disabled={!comment.trim() && grade === ''}>{t('Отправить отзыв')}</Button></div></form>
  </>
}

function Analytics({ groups }: { groups: Group[] }) {
  const t = useT()
  const [group, setGroup] = useState('')
  const [rows, setRows] = useState<UserAnalytics[] | null>(null)
  useEffect(() => { setRows(null); labApi<UserAnalytics[]>(`tutor/overview/${group ? `?group=${group}` : ''}`).then(setRows, () => setRows([])) }, [group])
  const total = Lab.modules().length
  const avg = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '—' }
  return <section className="card">
    <div className="vl-row vl-spread"><GroupFilter groups={groups} value={group} onChange={setGroup}/>
      {rows && rows.length > 0 && <div className="vl-row"><Badge>{t('Слушателей: {n}', { n: rows.length })}</Badge><Badge tone="info">{t('Средняя оценка: {n}', { n: avg(rows.map(r => r.avgScore)) })}</Badge>
        <Badge>{t('Средний рост: {a} → {b}', { a: avg(rows.map(r => r.avgFirstScore)), b: avg(rows.map(r => r.avgScore)) })}</Badge></div>}</div>
    {!rows ? <Loading/> : !rows.length ? <Empty>{t('Нет данных по слушателям.')}</Empty> : <div className="vl-table-wrap vl-mt"><table className="vl-table">
      <thead><tr><th>{t('Слушатель')}</th><th>{t('Выполнено')}</th><th>{t('Первая → итоговая')}</th><th>{t('Промпт')}</th><th>{t('Самопроверка')}</th><th>{t('Тьютор')}</th><th>{t('Генераций / улучшений / правок')}</th><th>{t('Время')}</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.fio}</b><small className="vl-help"> @{r.login}</small>{r.organization && <small className="vl-help"><br/>{r.organization}</small>}</td>
        <td>{r.completed} / {total}</td><td>{r.avgFirstScore ?? '—'} → {r.avgScore != null ? <Badge tone={scoreTone(r.avgScore)}>{r.avgScore}</Badge> : '—'}</td>
        <td>{r.avgPrompt != null ? r.avgPrompt + '%' : '—'}</td><td>{r.avgQuiz != null ? r.avgQuiz + '%' : '—'}</td><td>{r.avgGrade ?? '—'}</td>
        <td>{r.generations} / {r.promptImprovements} / {r.edits}</td><td>{fmtDuration(r.timeSpentMs, t)}</td></tr>)}</tbody></table></div>}
  </section>
}
