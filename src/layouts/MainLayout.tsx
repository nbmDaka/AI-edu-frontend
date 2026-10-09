import { BookOpen, GraduationCap, UserRound } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { User } from '../api'
import { LanguageSelect, useI18n } from '../i18n'
import { AccountMenu } from './AccountMenu'

export function MainLayout({ user, children }: { user: User; children: ReactNode }) {
  const { t } = useI18n()
  const navItems = [
    { to: '/', label: t('Моё обучение'), icon: GraduationCap, end: true },
    { to: '/catalog', label: t('Каталог'), icon: BookOpen },
    { to: '/profile', label: t('Профиль'), icon: UserRound },
  ]
  return <div className="main-layout">
    <header className="main-header"><div className="main-header-inner">
      <Link to="/" className="brand" aria-label={t('AI Edu — на главную')}>AI<span>edu</span></Link>
      <nav className="main-nav" aria-label={t('Основная навигация')}>{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `main-nav-link ${isActive ? 'active' : ''}`}><Icon size={17}/>{label}</NavLink>)}</nav>
      <LanguageSelect compact/><AccountMenu user={user}/>
    </div></header>
    <main className="main-content">{children}</main>
  </div>
}
