import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type User } from '../api'
import { Button, Input, Notice } from '../components/ui'
import { PasswordSection } from '../StudentPages'
import { useI18n } from '../i18n'
import { useLeaveWarning } from '../useLeaveWarning'

export function AdminProfilePage({ user }: { user: User }) {
  const { t } = useI18n(), qc = useQueryClient()
  const [first, setFirst] = useState(user.first_name), [last, setLast] = useState(user.last_name)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const dirty = first !== user.first_name || last !== user.last_name
  useLeaveWarning(dirty)
  const save = async (event: React.SubmitEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { qc.setQueryData(['me'], await api<User>('auth/me/', 'PATCH', { first_name: first, last_name: last })); setNotice(t('Профиль сохранён')) }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <div className="admin-profile"><div className="admin-page-heading"><div><h1>{t('Мой профиль')}</h1><p>{t('Личные данные и безопасность учётной записи.')}</p></div></div>
    <form className="admin-user-form card" onSubmit={event => void save(event)}><label>Email<Input value={user.email} readOnly/></label><div className="admin-form-grid"><label>{t('Имя')}<Input maxLength={150} value={first} onChange={event => setFirst(event.target.value)}/></label><label>{t('Фамилия')}<Input maxLength={150} value={last} onChange={event => setLast(event.target.value)}/></label></div><Notice text={error} kind="error"/><Notice text={notice} kind="success"/><div className="admin-form-actions"><Button type="submit" disabled={busy || !dirty}>{busy ? t('Сохранение…') : t('Сохранить изменения')}</Button></div></form>
    <PasswordSection/>
  </div>
}
