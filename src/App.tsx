import { lazy, Suspense, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { BookOpen, Layers3 } from 'lucide-react'
import { api, apiAll, type Course, type User } from './api'
import { MainLayout } from './layouts/MainLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { ErrorState, Loading } from './components/ui'
import { useI18n } from './i18n'

const UsersPage = lazy(() => import('./admin/UsersPage').then(module => ({ default: module.UsersPage })))
const UserDetailPage = lazy(() => import('./admin/UserDetailPage').then(module => ({ default: module.UserDetailPage })))
const AdminProfilePage = lazy(() => import('./admin/AdminProfilePage').then(module => ({ default: module.AdminProfilePage })))

const AuthPage = lazy(() => import('./AuthPage').then(module => ({ default: module.AuthPage })))
const CatalogPage = lazy(() => import('./StudentPages').then(module => ({ default: module.CatalogPage })))
const CoursePage = lazy(() => import('./StudentPages').then(module => ({ default: module.CoursePage })))
const LessonPage = lazy(() => import('./StudentPages').then(module => ({ default: module.LessonPage })))
const LearningItemPage = lazy(() => import('./StudentPages').then(module => ({ default: module.LearningItemPage })))
const ProfilePage = lazy(() => import('./StudentPages').then(module => ({ default: module.ProfilePage })))
const EditorPage = lazy(() => import('./LessonEditorPage').then(module => ({ default: module.EditorPage })))
const LearningItemEditorPage = lazy(() => import('./LearningItemEditorPage').then(module => ({ default: module.LearningItemEditorPage })))
const TestEditor = lazy(() => import('./AdminPages').then(module => ({ default: module.TestEditor })))
const AdminCurriculum = lazy(() => import('./AdminCurriculum').then(module => ({ default: module.AdminCurriculum })))
const CurriculumEntityPage = lazy(() => import('./curriculum/CurriculumEntityPage').then(module => ({ default: module.CurriculumEntityPage })))

function Home({ user }: { user: User }) {
  const { t } = useI18n()
  const isAdmin = user.role === 'ADMIN'
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => apiAll<Course>('courses/'), enabled: !isAdmin })
  return <>
    <section className="home-hero">
      <div className="home-hero-copy"><span className="eyebrow">{t(isAdmin ? 'ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО' : 'ПРОДОЛЖАЙТЕ УЧИТЬСЯ')}</span>
        <h1>{t(isAdmin ? 'Создавайте обучение, которое увлекает' : 'Знания, которые открывают возможности')}</h1>
        <p>{isAdmin ? t('Собирайте программу, готовьте уроки и помогайте студентам двигаться вперёд.') : `${t('Траектория:')} ${user.learning_track?.title ?? t('не выбрана')}. ${t('Изучайте курсы в своём темпе и проверяйте себя.')}`}</p>
        <Link className="button primary" to={isAdmin ? '/admin/curriculum' : '/catalog'}>{t(isAdmin ? 'Открыть учебную программу' : 'Перейти в каталог')}<span aria-hidden="true">→</span></Link>
      </div><div className="home-hero-art" aria-hidden="true"><BookOpen size={48}/><span>AI Edu</span></div>
    </section>
    <section className="home-next"><div><span className="eyebrow">{t(isAdmin ? 'УПРАВЛЕНИЕ' : 'ВАШЕ ОБУЧЕНИЕ')}</span><h2>{isAdmin ? `${t('Добро пожаловать')}, ${user.first_name || t('администратор')}` : `${t('С возвращением')}${user.first_name ? `, ${user.first_name}` : ''}`}</h2><p>{isAdmin ? t('Все инструменты для работы с образовательным контентом собраны в одном месте.') : `${t('Ваша траектория')} — ${user.learning_track?.title ?? t('не выбрана')}. ${courses.data?.length ?? 0} ${t('доступных курсов')}.`}</p></div>
      <div className="home-quick-links">{isAdmin ? <Link className="quick-link-card" to="/admin/curriculum"><span className="quick-link-icon"><Layers3 size={20}/></span><span><strong>{t('Учебная программа')}</strong><small>{t('Траектории, курсы, модули и уроки')}</small></span><span aria-hidden="true">→</span></Link> : courses.data?.length ? courses.data.slice(0, 3).map(course => <Link key={course.id} className="quick-link-card" to={`/courses/${course.slug}`}><span className="quick-link-icon">{course.cover ? <img src={`/api/v1/media/${course.cover}/`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}/> : <BookOpen size={20}/>}</span><span><strong>{course.title}</strong><small>{t('Открыть курс')}</small></span><span aria-hidden="true">→</span></Link>) : <Link className="quick-link-card" to="/catalog"><span className="quick-link-icon"><BookOpen size={20}/></span><span><strong>{t('Мои курсы')}</strong><small>{t('Открыть каталог курсов')}</small></span><span aria-hidden="true">→</span></Link>}</div>
    </section>
  </>
}

export function ProtectedPage({ user, children, admin = false }: { user: User | null | undefined; children: React.ReactNode; admin?: boolean }) {
  if (!user) return <Navigate to="/login" replace/>
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace/>
  return user.role === 'ADMIN' ? <AdminLayout user={user}>{children}</AdminLayout> : <MainLayout user={user}>{children}</MainLayout>
}

export default function App() {
  const { t } = useI18n()
  const { data: user, isLoading, error } = useQuery({ queryKey: ['me'], queryFn: () => api<User>('auth/me/').catch(() => null), staleTime: 60000 })
  useEffect(() => { fetch('/api/v1/csrf/', { credentials: 'include' }).catch(() => {}) }, [])
  if (isLoading) return <Loading fullPage label={t('Загрузка платформы…')} description={t('Подготовка образовательного пространства…')} />
  if (error) return <ErrorState error={error}/>
  return <Suspense fallback={<Loading fullPage label={t('Загрузка страницы…')} />}><Routes>
    <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin/curriculum' : '/'} replace/> : <AuthPage mode="login"/>}/>
    <Route path="/register" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin/curriculum' : '/'} replace/> : <AuthPage mode="register"/>}/>
    <Route path="/" element={<ProtectedPage user={user}>{user?.role === 'ADMIN' ? <Navigate to="/admin/curriculum" replace/> : <Home user={user!}/>}</ProtectedPage>}/>
    <Route path="/catalog" element={<ProtectedPage user={user}><CatalogPage/></ProtectedPage>}/>
    <Route path="/courses/:slug" element={<ProtectedPage user={user}><CoursePage/></ProtectedPage>}/>
    <Route path="/lessons/:id" element={user ? <LessonPage/> : <Navigate to="/login" replace/>}/>
    <Route path="/items/:id" element={user ? <LearningItemPage/> : <Navigate to="/login" replace/>}/>
    <Route path="/profile" element={<ProtectedPage user={user}>{user?.role === 'ADMIN' ? <Navigate to="/admin/profile" replace/> : <ProfilePage user={user!}/>}</ProtectedPage>}/>
    <Route path="/admin" element={<ProtectedPage user={user} admin><Navigate to="/admin/curriculum" replace/></ProtectedPage>}/>
    <Route path="/admin/users" element={<ProtectedPage user={user} admin><UsersPage user={user!}/></ProtectedPage>}/>
    <Route path="/admin/users/:id" element={<ProtectedPage user={user} admin><UserDetailPage actor={user!}/></ProtectedPage>}/>
    <Route path="/admin/profile" element={<ProtectedPage user={user} admin><AdminProfilePage user={user!}/></ProtectedPage>}/>
    <Route path="/admin/curriculum" element={<ProtectedPage user={user} admin><AdminCurriculum/></ProtectedPage>}/>
    <Route path="/admin/curriculum/courses/:courseId" element={<ProtectedPage user={user} admin><CurriculumEntityPage kind="course"/></ProtectedPage>}/>
    <Route path="/admin/curriculum/modules/:moduleId" element={<ProtectedPage user={user} admin><CurriculumEntityPage kind="module"/></ProtectedPage>}/>
    <Route path="/admin/curriculum/lessons/:id/edit" element={<ProtectedPage user={user} admin><EditorPage/></ProtectedPage>}/>
    <Route path="/admin/curriculum/items/:id/edit" element={<ProtectedPage user={user} admin><LearningItemEditorPage/></ProtectedPage>}/>
    <Route path="/admin/tracks" element={<Navigate to="/admin/curriculum" replace/>}/>
    <Route path="/admin/modules" element={<Navigate to="/admin/curriculum" replace/>}/>
    <Route path="/admin/lessons" element={<Navigate to="/admin/curriculum" replace/>}/>
    <Route path="/admin/lessons/:id/edit" element={<ProtectedPage user={user} admin><EditorPage/></ProtectedPage>}/>
    <Route path="/admin/lessons/:id/test" element={<ProtectedPage user={user} admin><TestEditor/></ProtectedPage>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>
}
