import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { api, type User } from '../api'
import { useI18n } from '../i18n'

export function AccountMenu({ user, admin = false }: { user: User; admin?: boolean }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const close = () => { if (ref.current) ref.current.open = false }
  useEffect(() => {
    const outside = (event: MouseEvent | TouchEvent) => { if (!ref.current?.contains(event.target as Node)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  useEffect(close, [location.pathname])
  const logout = async () => {
    try {
      await api('auth/logout/', 'POST')
      qc.clear()
      qc.setQueryData(['me'], null)
      navigate('/login', { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Не удалось выйти')) }
  }
  return <details ref={ref} className="user-menu">
    <summary aria-label={t('Меню пользователя')}><span className="avatar">{(user.first_name || user.email)[0].toUpperCase()}</span><span className="user-menu-name">{admin ? t('Администратор') : user.first_name || user.email}</span><ChevronDown size={15}/></summary>
    <div className="user-menu-panel"><span className="user-menu-email" title={user.email}>{user.email}</span><Link to={admin ? '/admin/profile' : '/profile'} onClick={close}><UserRound size={16}/>{t('Профиль')}</Link><button onClick={() => { close(); void logout() }}><LogOut size={16}/>{t('Выйти')}</button>{error && <p role="alert" className="field-error">{error}</p>}</div>
  </details>
}
