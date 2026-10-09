import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Layers3, Users } from 'lucide-react'
import type { User } from '../api'
import { LanguageSelect, useI18n } from '../i18n'
import { AccountMenu } from './AccountMenu'
import '../admin-workspace.css'

export function AdminLayout({ user, children }: { user: User; children: ReactNode }) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (headerRef.current) ref.current?.style.setProperty('--admin-header-height', `${headerRef.current.offsetHeight}px`)
    })
    if (headerRef.current) observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [])
  const editor = /\/(edit|test)$/.test(pathname)
  return <div ref={ref} className={`admin-shell ${editor ? 'admin-editor' : ''}`}>
    <header ref={headerRef} className="main-header admin-header"><div className="main-header-inner">
      <Link to="/admin/curriculum" className="brand" aria-label={t('AI Edu — конструктор')}>AI<span>edu</span></Link>
      <nav className="main-nav" aria-label={t('Навигация администратора')}>
        <NavLink to="/admin/curriculum" className={({ isActive }) => `main-nav-link ${isActive || pathname.startsWith('/admin/lessons') ? 'active' : ''}`}><Layers3 size={17}/>{t('Конструктор')}</NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => `main-nav-link ${isActive ? 'active' : ''}`}><Users size={17}/>{t('Пользователи')}</NavLink>
      </nav>
      <LanguageSelect compact/><AccountMenu user={user} admin/>
    </div></header>
    {editor ? <div className="admin-content">{children}</div> : <main className="admin-content">{children}</main>}
  </div>
}
