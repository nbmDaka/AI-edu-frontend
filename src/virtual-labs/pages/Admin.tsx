/* Администрирование модуля (ТЗ, п. 8.3): пользователи и роли, курсы и работы, критерии экспертизы,
   системные шаблоны промптов, подключение моделей ИИ, журнал запросов, резервные копии, LMS (LTI 1.3). */
import { useEffect, useState, type FormEvent } from 'react'
import { DatabaseBackup, Plus, Save, Trash2 } from 'lucide-react'
import { labApi } from '../api'
import { useT } from '../i18n'
import { Lab } from '../store'
import { Registry } from '../core/registry'
import { Badge, Button, Empty, Loading, Note, PageHead, Tabs, copyText, fmtDate, fmtSize, useConfirm, useToast } from '../components/ui'

type Tab = 'users' | 'courses' | 'criteria' | 'templates' | 'ai' | 'log' | 'backups' | 'lti'

export function AdminPage() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('users')
  return <>
    <PageHead eyebrow={t('Администратор')} title={t('Администрирование лабораторий')} description={t('Изменения сразу применяются для всех слушателей модуля.')}/>
    <Tabs<Tab> label={t('Разделы администрирования')} value={tab} onChange={setTab} items={[
      ['users', t('Пользователи и роли')], ['courses', t('Курсы и работы')], ['criteria', t('Критерии экспертизы')], ['templates', t('Шаблоны промптов')],
      ['ai', t('Модели ИИ')], ['log', t('Журнал ИИ')], ['backups', t('Резервные копии')], ['lti', t('LMS (LTI)')]]}/>
    {tab === 'users' ? <Users/> : tab === 'courses' ? <Courses/> : tab === 'criteria' ? <Criteria/> : tab === 'templates' ? <Templates/>
      : tab === 'ai' ? <Providers/> : tab === 'log' ? <AiLog/> : tab === 'backups' ? <Backups/> : <Lti/>}
  </>
}

function useLoad<T>(path: string): [T | null, () => void] {
  const toast = useToast()
  const [data, setData] = useState<T | null>(null)
  const load = () => { labApi<T>(path).then(setData, e => toast((e as Error).message, 'error')) }
  useEffect(load, [path])
  return [data, load]
}

const ROLE_NAMES: Record<string, string> = { teacher: 'Слушатель (преподаватель)', tutor: 'Тьютор', admin: 'Администратор' }

// ---------- пользователи ----------
type AdminUser = { id: number; login: string; name: string; role: string | null; isActive: boolean; isPlatformAdmin: boolean; dateJoined: string | null; lastLogin: string | null }
function Users() {
  const t = useT()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [rows, reload] = useLoad<AdminUser[]>(`admin/users/?q=${encodeURIComponent(q)}&role=${role}`)
  const patch = async (u: AdminUser, data: Record<string, unknown>) => {
    try { await labApi(`admin/users/${u.id}/`, 'PATCH', data); reload(); toast(t('Сохранено')) } catch (e) { toast((e as Error).message, 'error') }
  }
  return <section className="card">
    <div className="vl-row vl-filters"><input className="input vl-grow" placeholder={t('Поиск по логину или Ф. И. О.')} value={q} onChange={e => setQ(e.target.value)}/>
      <select className="input vl-auto" value={role} onChange={e => setRole(e.target.value)} aria-label={t('Роль')}><option value="">{t('Все роли')}</option>
        {Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></div>
    {!rows ? <Loading/> : <div className="vl-table-wrap vl-mt"><table className="vl-table">
      <thead><tr><th>{t('Пользователь')}</th><th>{t('Роль')}</th><th>{t('Последний вход')}</th><th>{t('Доступ')}</th></tr></thead>
      <tbody>{rows.map(u => <tr key={u.id}><td><b>{u.name}</b><small className="vl-help"> @{u.login}</small>{u.isPlatformAdmin && <> <Badge tone="info">{t('администратор платформы')}</Badge></>}</td>
        <td><select className="input vl-auto" value={u.role || 'teacher'} disabled={!u.isActive || u.isPlatformAdmin} onChange={e => void patch(u, { role: e.target.value })} aria-label={t('Роль')}>
          {Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></td>
        <td className="vl-help">{fmtDate(u.lastLogin, t.locale)}</td>
        <td>{Lab.config().features.manageAccounts ? <label className="checkbox"><input type="checkbox" checked={u.isActive} disabled={u.id === Lab.config().user.id || u.isPlatformAdmin}
          onChange={e => void patch(u, { isActive: e.target.checked })}/> {u.isActive ? t('активен') : t('заблокирован')}</label> : <Badge>{u.isActive ? t('активен') : t('заблокирован')}</Badge>}</td></tr>)}</tbody></table></div>}
    <p className="vl-help vl-mt">{t('Тьютор видит результаты слушателей своих групп; администратор — всех. Учётные записи создаются при регистрации или входе из LMS.')}</p>
  </section>
}

// ---------- курсы и работы ----------
type AdminCourse = { id: number; title: string; description: string; position: number; isActive: boolean; works: string[] }
type AdminWork = { code: string; number: number; title: string; courseId: number | null; position: number; isEnabled: boolean; hasTemplate: boolean }
function Courses() {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [courses, reloadCourses] = useLoad<AdminCourse[]>('admin/courses/')
  const [works, reloadWorks] = useLoad<AdminWork[]>('admin/works/')
  const [form, setForm] = useState({ title: '', description: '' })
  const after = () => { reloadCourses(); reloadWorks(); void Lab.reloadConfig() }
  const call = async (path: string, method: 'POST' | 'PATCH' | 'DELETE', data?: unknown) => {
    try { await labApi(path, method, data); after() } catch (e) { toast((e as Error).message, 'error') }
  }
  if (!courses || !works) return <Loading/>
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Виртуальные работы')}</h2>
      <div className="vl-table-wrap"><table className="vl-table"><thead><tr><th>№</th><th>{t('Работа')}</th><th>{t('Курс')}</th><th>{t('Порядок')}</th><th>{t('Включена')}</th></tr></thead>
        <tbody>{works.map(w => <tr key={w.code}><td>{w.number}</td><td>{t(Registry.get(w.code)?.title || w.title)}{w.hasTemplate && <> <Badge tone="info">{t('свой шаблон')}</Badge></>}</td>
          <td><select className="input vl-auto" value={w.courseId ?? ''} onChange={e => void call(`admin/works/${w.code}/`, 'PATCH', { courseId: e.target.value ? Number(e.target.value) : null })} aria-label={t('Курс')}>
            <option value="">—</option>{courses.map(c => <option key={c.id} value={c.id}>{t(c.title)}</option>)}</select></td>
          <td><input className="input vl-num" type="number" min={0} defaultValue={w.position} onBlur={e => Number(e.target.value) !== w.position && void call(`admin/works/${w.code}/`, 'PATCH', { position: Number(e.target.value) })}/></td>
          <td><input type="checkbox" checked={w.isEnabled} aria-label={t('Включена')} onChange={e => void call(`admin/works/${w.code}/`, 'PATCH', { isEnabled: e.target.checked })}/></td></tr>)}</tbody></table></div>
      <p className="vl-help vl-mt">{t('Отключённая работа пропадает из каталога слушателей; их результаты сохраняются.')}</p></section>
    <section className="card"><h2>{t('Курсы (группы работ)')}</h2>
      <ul className="vl-list">{courses.map(c => <li key={c.id}><div className="vl-grow">
        <input className="input" defaultValue={c.title} aria-label={t('Название курса')} onBlur={e => e.target.value.trim() && e.target.value !== c.title && void call(`admin/courses/${c.id}/`, 'PATCH', { title: e.target.value })}/>
        <small>{c.works.map(code => 'ВР ' + Number(code.slice(2))).join(', ') || t('нет работ')}</small></div>
        <div className="vl-row vl-nowrap"><label className="checkbox"><input type="checkbox" checked={c.isActive} onChange={e => void call(`admin/courses/${c.id}/`, 'PATCH', { isActive: e.target.checked })}/> {t('показывать')}</label>
          <Button variant="ghost" size="sm" title={t('Удалить')} onClick={() => confirm(t('Удалить курс «{name}»? Работы останутся без курса.', { name: c.title }), t('Удалить'), () => void call(`admin/courses/${c.id}/`, 'DELETE'))}><Trash2 size={15}/></Button></div></li>)}</ul>
      <form className="vl-mt" onSubmit={e => { e.preventDefault(); void call('admin/courses/', 'POST', form).then(() => setForm({ title: '', description: '' })) }}>
        <h3>{t('Новый курс')}</h3><input className="input" value={form.title} placeholder={t('Название')} onChange={e => setForm({ ...form, title: e.target.value })}/>
        <textarea className="input vl-mt-sm" rows={2} value={form.description} placeholder={t('Описание')} onChange={e => setForm({ ...form, description: e.target.value })}/>
        <Button type="submit" className="vl-mt-sm" disabled={!form.title.trim()}><Plus size={16}/>{t('Добавить курс')}</Button></form></section>
  </div>
}

// ---------- критерии ----------
type AdminCriterion = { key: string; name: string; description: string; weight: number; position: number; isActive: boolean }
function Criteria() {
  const t = useT()
  const toast = useToast()
  const [rows, reload] = useLoad<AdminCriterion[]>('admin/criteria/')
  const patch = async (key: string, data: Record<string, unknown>) => {
    try { await labApi(`admin/criteria/${key}/`, 'PATCH', data); reload(); void Lab.reloadConfig(); toast(t('Сохранено')) } catch (e) { toast((e as Error).message, 'error') }
  }
  if (!rows) return <Loading/>
  return <section className="card"><h2>{t('Критерии AI-экспертизы')}</h2>
    <p className="vl-help">{t('Итоговая оценка — взвешенное среднее баллов по включённым критериям. При всех весах 1 оценка совпадает с исходной методикой. Сервер пересчитывает оценки с этими настройками.')}</p>
    <div className="vl-table-wrap"><table className="vl-table"><thead><tr><th>{t('Критерий')}</th><th>{t('Название для слушателей')}</th><th>{t('Вес (0–5)')}</th><th>{t('Включён')}</th></tr></thead>
      <tbody>{rows.map(c => <tr key={c.key}><td><code>{c.key}</code></td>
        <td><input className="input" defaultValue={c.name} onBlur={e => e.target.value.trim() && e.target.value !== c.name && void patch(c.key, { name: e.target.value })}/></td>
        <td><input className="input vl-num" type="number" min={0} max={5} step={0.5} defaultValue={c.weight} onBlur={e => Number(e.target.value) !== c.weight && void patch(c.key, { weight: Number(e.target.value) })}/></td>
        <td><input type="checkbox" checked={c.isActive} aria-label={t('Включён')} onChange={e => void patch(c.key, { isActive: e.target.checked })}/></td></tr>)}</tbody></table></div>
  </section>
}

// ---------- шаблоны промптов ----------
type AdminTemplate = { work: string; role: string; task: string; constraints: string; system: string; isActive: boolean; updatedAt: string | null }
function Templates() {
  const t = useT()
  const toast = useToast()
  const [rows, reload] = useLoad<AdminTemplate[]>('admin/prompt-templates/')
  const [code, setCode] = useState('system')
  const [form, setForm] = useState<AdminTemplate | null>(null)
  useEffect(() => {
    const row = rows?.find(r => r.work === code)
    const m = Registry.get(code)
    setForm(row && (row.role || row.task || row.system || row.constraints) ? row
      : { work: code, role: m?.role ?? '', task: m?.task ?? '', constraints: (m?.constraints ?? []).join('\n'), system: '', isActive: true, updatedAt: null })
  }, [rows, code])
  if (!rows || !form) return <Loading/>
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await labApi(`admin/prompt-templates/${code}/`, 'PUT', form); reload(); void Lab.reloadConfig(); toast(t('Шаблон сохранён')) } catch (err) { toast((err as Error).message, 'error') }
  }
  const reset = async () => { try { await labApi(`admin/prompt-templates/${code}/`, 'DELETE'); reload(); void Lab.reloadConfig(); toast(t('Возвращён исходный шаблон')) } catch (err) { toast((err as Error).message, 'error') } }
  const custom = rows.find(r => r.work === code)?.isActive
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Шаблоны')}</h2><ul className="vl-list vl-pick">{rows.map(r => <li key={r.work} className={r.work === code ? 'active' : ''}>
      <button type="button" onClick={() => setCode(r.work)}>{r.work === 'system' ? t('Системная инструкция модели') : `${t('ВР № {n}', { n: Registry.get(r.work)?.n ?? '' })}. ${t(Registry.get(r.work)?.title || r.work)}`}</button>
      {r.isActive && <Badge tone="info">{t('изменён')}</Badge>}</li>)}</ul></section>
    <form className="card" onSubmit={save}>
      <h2>{code === 'system' ? t('Системная инструкция модели') : t('Шаблон промпта ВР № {n}', { n: Registry.get(code)?.n ?? '' })}</h2>
      {code === 'system' ? <>
        <p className="vl-help">{t('Передаётся языковой модели вместе с каждым запросом генерации, если работа не задала свою.')}</p>
        <textarea className="input" rows={8} value={form.system} onChange={e => setForm({ ...form, system: e.target.value })}/></> : <>
        <p className="vl-help">{t('Шаблон определяет блоки РОЛЬ, ЗАДАЧА и ОГРАНИЧЕНИЯ промпта, который слушатель получает на шаге «Промпт». В задаче можно использовать поля работы: {topic}, {discipline}, {duration} и др.')}</p>
        <div className="vl-field"><label>{t('Роль')}</label><input className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}/></div>
        <div className="vl-field"><label>{t('Задача')}</label><textarea className="input" rows={3} value={form.task} onChange={e => setForm({ ...form, task: e.target.value })}/></div>
        <div className="vl-field"><label>{t('Дополнительные ограничения (каждое с новой строки)')}</label><textarea className="input" rows={4} value={form.constraints} onChange={e => setForm({ ...form, constraints: e.target.value })}/></div>
        <div className="vl-field"><label>{t('Системная инструкция для этой работы (необязательно)')}</label><textarea className="input" rows={3} value={form.system} onChange={e => setForm({ ...form, system: e.target.value })}/></div></>}
      <label className="checkbox vl-mt"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })}/> {t('Использовать этот шаблон')}</label>
      <div className="vl-row vl-mt"><Button type="submit"><Save size={16}/>{t('Сохранить')}</Button>{custom && <Button variant="secondary" onClick={() => void reset()}>{t('Вернуть исходный')}</Button>}</div>
    </form>
  </div>
}

// ---------- модели ИИ ----------
type Provider = { id: number; name: string; kind: string; task: 'text' | 'tts'; baseUrl: string; model: string; voice: string; isActive: boolean; hasKey: boolean; keyHint: string; updatedAt: string }
type ProvidersPayload = { providers: Provider[]; status: { ai: { configured: boolean; name: string; model: string }; tts: { configured: boolean; name: string; model: string } }
  kinds: { value: string; label: string; task: 'text' | 'tts'; defaults: { base_url?: string; model?: string; voice?: string } }[] }
function Providers() {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [data, reload] = useLoad<ProvidersPayload>('admin/ai-providers/')
  const [form, setForm] = useState({ kind: 'openai', name: '', baseUrl: '', model: '', voice: '', apiKey: '', isActive: true })
  const [testing, setTesting] = useState<number | null>(null)
  if (!data) return <Loading/>
  const kind = data.kinds.find(k => k.value === form.kind)
  const after = () => { reload(); void Lab.reloadConfig() }
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try { await labApi('admin/ai-providers/', 'POST', form); setForm({ ...form, apiKey: '', name: '' }); after(); toast(t('Подключение сохранено')) } catch (err) { toast((err as Error).message, 'error') }
  }
  const test = async (p: Provider) => {
    setTesting(p.id)
    try { const r = await labApi<{ ok: boolean; detail: string }>(`admin/ai-providers/${p.id}/test/`, 'POST'); toast(r.ok ? t('Модель ответила: {text}', { text: r.detail }) : r.detail, r.ok ? 'success' : 'error') }
    catch (err) { toast((err as Error).message, 'error') } finally { setTesting(null) }
  }
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Подключения')}</h2>
      <div className="vl-row"><Badge tone={data.status.ai.configured ? 'good' : 'warn'}>{t('Текст')}: {data.status.ai.configured ? `${data.status.ai.name} · ${data.status.ai.model}` : t('демо-режим')}</Badge>
        <Badge tone={data.status.tts.configured ? 'good' : ''}>{t('Озвучка')}: {data.status.tts.configured ? data.status.tts.name : t('браузер')}</Badge></div>
      {!data.providers.length ? <Empty>{t('Подключений нет: генерация работает в демо-режиме по шаблонам.')}</Empty> : <ul className="vl-list vl-mt">{data.providers.map(p => <li key={p.id}><div>
        <b>{p.name}</b> {p.isActive && <Badge tone="good">{t('активно')}</Badge>}
        <small>{p.task === 'tts' ? t('озвучка') : t('текст')} · {p.model || '—'}{p.baseUrl ? ` · ${p.baseUrl}` : ''} · {p.hasKey ? `${t('ключ')} ${p.keyHint}` : t('без ключа')}</small></div>
        <div className="vl-row vl-nowrap">
          {!p.isActive && <Button variant="secondary" size="sm" onClick={() => labApi(`admin/ai-providers/${p.id}/`, 'PATCH', { isActive: true }).then(after, e => toast((e as Error).message, 'error'))}>{t('Сделать активным')}</Button>}
          {p.task === 'text' && <Button variant="secondary" size="sm" disabled={testing === p.id} onClick={() => void test(p)}>{t('Проверить')}</Button>}
          <Button variant="ghost" size="sm" title={t('Удалить')} onClick={() => confirm(t('Удалить подключение «{name}»?', { name: p.name }), t('Удалить'),
            () => labApi(`admin/ai-providers/${p.id}/`, 'DELETE').then(after, e => toast((e as Error).message, 'error')))}><Trash2 size={15}/></Button></div></li>)}</ul>}
      <Note>{t('Ключи API хранятся только на сервере и в ответах не возвращаются: видны последние 4 символа. Слушатели ключей не вводят.')}</Note>
    </section>
    <form className="card" onSubmit={create}><h2>{t('Новое подключение')}</h2>
      <div className="vl-field"><label>{t('Сервис')}</label><select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value, baseUrl: '', model: '', voice: '' })}>
        {data.kinds.map(k => <option key={k.value} value={k.value}>{t(k.label)} · {k.task === 'tts' ? t('озвучка') : t('текст')}</option>)}</select></div>
      <div className="vl-field"><label>{t('Название')}</label><input className="input" value={form.name} placeholder={kind ? t(kind.label) : ''} onChange={e => setForm({ ...form, name: e.target.value })}/></div>
      <div className="vl-field"><label>{t('Ключ API')}</label><input className="input" type="password" autoComplete="off" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })}/></div>
      <div className="vl-field"><label>{t('Модель')}</label><input className="input" value={form.model} placeholder={kind?.defaults.model} onChange={e => setForm({ ...form, model: e.target.value })}/></div>
      <div className="vl-field"><label>{t('Адрес API (необязательно)')}</label><input className="input" value={form.baseUrl} placeholder={kind?.defaults.base_url} onChange={e => setForm({ ...form, baseUrl: e.target.value })}/></div>
      {kind?.task === 'tts' && <div className="vl-field"><label>{t('Голос')}</label><input className="input" value={form.voice} placeholder={kind.defaults.voice} onChange={e => setForm({ ...form, voice: e.target.value })}/></div>}
      <label className="checkbox"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })}/> {t('Сделать активным')}</label>
      <Button type="submit" className="vl-mt"><Plus size={16}/>{t('Добавить')}</Button></form>
  </div>
}

type LogRow = { id: number; user: string; kind: string; provider: string; model: string; ok: boolean; ms: number | null; chars: number; error: string; createdAt: string }
function AiLog() {
  const t = useT()
  const [rows] = useLoad<LogRow[]>('admin/ai-log/')
  if (!rows) return <Loading/>
  return <section className="card"><h2>{t('Журнал запросов к ИИ и внешним базам')}</h2>
    {!rows.length ? <Empty>{t('Запросов пока не было.')}</Empty> : <div className="vl-table-wrap"><table className="vl-table">
      <thead><tr><th>{t('Время')}</th><th>{t('Пользователь')}</th><th>{t('Тип')}</th><th>{t('Сервис')}</th><th>{t('Символов')}</th><th>{t('мс')}</th><th>{t('Результат')}</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td className="vl-help">{fmtDate(r.createdAt, t.locale)}</td><td>{r.user}</td><td>{r.kind}</td><td>{r.provider}{r.model ? ` · ${r.model}` : ''}</td>
        <td>{r.chars}</td><td>{r.ms ?? '—'}</td><td>{r.ok ? <Badge tone="good">OK</Badge> : <Badge tone="bad" title={r.error}>{t('ошибка')}</Badge>}</td></tr>)}</tbody></table></div>}
  </section>
}

type BackupRow = { id: number; file: string; method: string; size: number | null; ok: boolean; error: string; createdAt: string }
function Backups() {
  const t = useT()
  const toast = useToast()
  const [data, reload] = useLoad<{ backups: BackupRow[]; keep: number }>('admin/backups/')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await labApi('admin/backups/', 'POST'); toast(t('Резервная копия создана')) } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false); reload() }
  }
  if (!data) return <Loading/>
  return <section className="card"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('Резервные копии базы данных')}</h2>
    <Button disabled={busy} onClick={() => void run()}><DatabaseBackup size={16}/>{t('Создать копию сейчас')}</Button></div>
    <p className="vl-help">{t('По расписанию копию создаёт команда «python manage.py vl_backup» (служба backup в docker-compose, cron или планировщик Windows). Хранятся последние {n} копий.', { n: data.keep })}</p>
    {!data.backups.length ? <Empty>{t('Копий пока нет.')}</Empty> : <div className="vl-table-wrap"><table className="vl-table">
      <thead><tr><th>{t('Время')}</th><th>{t('Файл')}</th><th>{t('Способ')}</th><th>{t('Размер')}</th><th>{t('Результат')}</th></tr></thead>
      <tbody>{data.backups.map(b => <tr key={b.id}><td className="vl-help">{fmtDate(b.createdAt, t.locale)}</td><td><code>{b.file}</code></td><td>{b.method}</td>
        <td>{b.size ? fmtSize(b.size) : '—'}</td><td>{b.ok ? <Badge tone="good">OK</Badge> : <Badge tone="bad" title={b.error}>{t('ошибка')}</Badge>}</td></tr>)}</tbody></table></div>}
  </section>
}

type Platform = { id: number; name: string; issuer: string; clientId: string; deploymentIds: string[]; authLoginUrl: string; authTokenUrl: string; jwksUrl: string; isActive: boolean; users: number }
type LtiPayload = { platforms: Platform[]; tool: { toolUrl: string; loginUrl: string; redirectUrl: string; jwksUrl: string; customParameters: string } }
function Lti() {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [data, reload] = useLoad<LtiPayload>('admin/lti/platforms/')
  const empty = { name: '', issuer: '', clientId: '', deploymentIds: '', authLoginUrl: '', authTokenUrl: '', jwksUrl: '' }
  const [form, setForm] = useState(empty)
  const toast_ = toast
  if (!data) return <Loading/>
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try { await labApi('admin/lti/platforms/', 'POST', form); setForm(empty); reload(); toast_(t('Платформа LMS добавлена')) } catch (err) { toast_((err as Error).message, 'error') }
  }
  const field = (key: keyof typeof empty, label: string, placeholder = '') => <div className="vl-field"><label>{t(label)}</label>
    <input className="input" value={form[key]} placeholder={placeholder} onChange={e => setForm({ ...form, [key]: e.target.value })}/></div>
  const toolRows: [string, string][] = [['Адрес инструмента (Tool URL)', data.tool.toolUrl], ['Initiate login URL', data.tool.loginUrl], ['Redirect URI', data.tool.redirectUrl], ['Public keyset (JWKS)', data.tool.jwksUrl]]
  return <div className="vl-grid split">
    <section className="card"><h2>{t('Данные для настройки LMS')}</h2>
      <p className="vl-help">{t('Укажите эти адреса при регистрации внешнего инструмента LTI 1.3 в Moodle, Open edX, Canvas или Blackboard. Чтобы сразу открыть нужную работу, добавьте пользовательский параметр work=vw05.')}</p>
      <table className="vl-table"><tbody>{toolRows.map(([k, v]) => <tr key={k}><td>{t(k)}</td><td><code className="vl-break">{v}</code></td>
        <td><Button variant="ghost" size="sm" onClick={() => copyText(v, toast, t)}>{t('Копировать')}</Button></td></tr>)}</tbody></table>
      <h3 className="vl-mt">{t('Подключённые платформы')}</h3>
      {!data.platforms.length ? <Empty>{t('Платформ пока нет.')}</Empty> : <ul className="vl-list">{data.platforms.map(p => <li key={p.id}><div><b>{p.name}</b>
        <small>{p.issuer} · client_id {p.clientId} · {t('пользователей: {n}', { n: p.users })}</small></div>
        <div className="vl-row vl-nowrap"><label className="checkbox"><input type="checkbox" checked={p.isActive} onChange={e => labApi(`admin/lti/platforms/${p.id}/`, 'PATCH', { isActive: e.target.checked }).then(reload, err => toast((err as Error).message, 'error'))}/> {t('включена')}</label>
          <Button variant="ghost" size="sm" title={t('Удалить')} onClick={() => confirm(t('Удалить платформу «{name}»?', { name: p.name }), t('Удалить'),
            () => labApi(`admin/lti/platforms/${p.id}/`, 'DELETE').then(reload, err => toast((err as Error).message, 'error')))}><Trash2 size={15}/></Button></div></li>)}</ul>}
    </section>
    <form className="card" onSubmit={create}><h2>{t('Новая платформа LMS')}</h2>
      {field('name', 'Название', 'Moodle университета')}{field('issuer', 'Issuer (Platform ID)', 'https://moodle.university.kz')}{field('clientId', 'Client ID')}
      {field('deploymentIds', 'Deployment ID (через запятую)', '1')}{field('authLoginUrl', 'Authentication request URL', 'https://moodle.university.kz/mod/lti/auth.php')}
      {field('jwksUrl', 'Public keyset URL', 'https://moodle.university.kz/mod/lti/certs.php')}{field('authTokenUrl', 'Access token URL (необязательно)')}
      <Button type="submit" disabled={!form.name || !form.issuer || !form.clientId || !form.authLoginUrl || !form.jwksUrl}><Plus size={16}/>{t('Добавить')}</Button></form>
  </div>
}
