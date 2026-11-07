/* Модуль «Виртуальные лаборатории» для AI edu.
   Подключение в основной платформе (см. INTEGRATION.md):
     <Route path="/virtual-labs/*" element={<ProtectedPage user={user}><VirtualLabsApp/></ProtectedPage>}/>
   и пункт меню { to: '/virtual-labs', label: t('Виртуальные лаборатории'), icon: FlaskConical }. */
import { useEffect, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { BarChart3, ClipboardList, FlaskConical, FolderOpen, GraduationCap, Settings2, UserRound } from 'lucide-react'
import { useT } from './i18n'
import { Lab, useLab } from './store'
import { Button, Loading, Note, UIProvider } from './components/ui'
import { Catalog } from './pages/Catalog'
import { LabPage } from './pages/Lab'
import { PortfolioPage } from './pages/Portfolio'
import { ProgressPage } from './pages/Progress'
import { AssignmentsPage } from './pages/Assignments'
import { ProfilePage } from './pages/Profile'
import { TutorPage } from './pages/Tutor'
import { AdminPage } from './pages/Admin'
import { BaseContext, useLabPath } from './paths'
import './virtual-labs.css'

export { useLabPath }


function SubNav() {
  const t = useT()
  const path = useLabPath()
  const items: [string, string, typeof FlaskConical, boolean?][] = [
    ['', 'Лаборатории', FlaskConical, true], ['portfolio', 'Портфолио', FolderOpen], ['progress', 'Мой прогресс', BarChart3],
    ['assignments', 'Задания и группы', ClipboardList], ['profile', 'Профиль и документы', UserRound],
  ]
  if (Lab.isTutor()) items.push(['tutor', 'Тьютор', GraduationCap])
  if (Lab.isAdmin()) items.push(['admin', 'Администрирование', Settings2])
  return <nav className="vl-subnav" aria-label={t('Разделы виртуальных лабораторий')}>
    {items.map(([to, label, Icon, end]) => <NavLink key={to} to={path(to)} end={end} className={({ isActive }) => `vl-subnav-link ${isActive ? 'active' : ''}`}>
      <Icon size={16}/>{t(label)}</NavLink>)}
  </nav>
}

function Gate({ children }: { children: ReactNode }) {
  useLab()
  const t = useT()
  useEffect(() => { void Lab.load() }, [])
  const status = Lab.status()
  if (status === 'error') return <Note kind="error">{t('Не удалось загрузить виртуальные лаборатории: {error}', { error: Lab.error() })}
    <div className="vl-mt"><Button variant="secondary" onClick={() => void Lab.load(true)}>{t('Повторить')}</Button></div></Note>
  if (status !== 'ready') return <Loading/>
  return <>{children}</>
}

export function VirtualLabsApp({ basePath = '/virtual-labs' }: { basePath?: string }) {
  return <BaseContext.Provider value={basePath}><UIProvider><div className="vl-root">
    <Gate>
      <SubNav/>
      <Routes>
        <Route index element={<Catalog/>}/>
        <Route path="lab/:code" element={<LabPage/>}/>
        <Route path="portfolio" element={<PortfolioPage/>}/>
        <Route path="progress" element={<ProgressPage/>}/>
        <Route path="assignments" element={<AssignmentsPage/>}/>
        <Route path="profile" element={<ProfilePage/>}/>
        <Route path="tutor" element={Lab.isTutor() ? <TutorPage/> : <Navigate to={basePath} replace/>}/>
        <Route path="admin" element={Lab.isAdmin() ? <AdminPage/> : <Navigate to={basePath} replace/>}/>
        <Route path="*" element={<Navigate to={basePath} replace/>}/>
      </Routes>
    </Gate>
  </div></UIProvider></BaseContext.Provider>
}

export { registerVirtualLabPractices } from './practice/register'
