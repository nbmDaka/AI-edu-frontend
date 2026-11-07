import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { User } from './api'
import { currentUser } from './session'
import { MainLayout } from './layouts/MainLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { ErrorState, Loading } from './components/ui'
import { useI18n } from './i18n'

const UsersPage = lazy(() => import('./admin/UsersPage').then(module => ({ default: module.UsersPage })))
const ReadinessPage = lazy(() => import('./ReadinessPage').then(module => ({ default: module.ReadinessPage })))
const ActivityPage = lazy(() => import('./admin/ActivityPage').then(module => ({ default: module.ActivityPage })))
const AnalyticsPage = lazy(() => import('./admin/AnalyticsPage').then(module => ({ default: module.AnalyticsPage })))
const UserDetailPage = lazy(() => import('./admin/UserDetailPage').then(module => ({ default: module.UserDetailPage })))
const AdminProfilePage = lazy(() => import('./admin/AdminProfilePage').then(module => ({ default: module.AdminProfilePage })))

const AuthPage = lazy(() => import('./AuthPage').then(module => ({ default: module.AuthPage })))
const PasswordResetPage = lazy(() => import('./PasswordResetPage').then(module => ({ default: module.PasswordResetPage })))
const EmailVerificationPage = lazy(() => import('./EmailVerificationPage').then(module => ({ default: module.EmailVerificationPage })))
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

const MyLearningPage = lazy(() => import('./MyLearningPage').then(module => ({ default: module.MyLearningPage })))
const CertificatePage = lazy(() => import('./ProgramJourney').then(module => ({ default: module.CertificatePage })))

export function ProtectedPage({ user, children, admin = false }: { user: User | null | undefined; children: React.ReactNode; admin?: boolean }) {
  if (!user) return <Navigate to="/login" replace/>
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace/>
  return user.role === 'ADMIN' ? <AdminLayout user={user}>{children}</AdminLayout> : <MainLayout user={user}>{children}</MainLayout>
}

export default function App() {
  const { t } = useI18n()
  const { data: user, isLoading, error } = useQuery({ queryKey: ['me'], queryFn: currentUser, staleTime: 60000, refetchOnWindowFocus: true })
  if (isLoading) return <Loading fullPage label={t('Загрузка платформы…')} description={t('Подготовка образовательного пространства…')} />
  if (error) return <ErrorState error={error}/>
  return <Suspense fallback={<Loading fullPage label={t('Загрузка страницы…')} />}><Routes>
    <Route path="/certificates/:token" element={<CertificatePage/>}/>
    <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin/curriculum' : '/'} replace/> : <AuthPage key="login" mode="login"/>}/>
    <Route path="/register" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin/curriculum' : '/'} replace/> : <AuthPage key="register" mode="register"/>}/>
    <Route path="/forgot-password" element={<PasswordResetPage key="request" mode="request"/>}/>
    <Route path="/reset-password/:uid/:token" element={<PasswordResetPage key="confirm" mode="confirm"/>}/>
    <Route path="/verify-email/:token" element={<EmailVerificationPage key="verify" mode="verify"/>}/>
    <Route path="/resend-verification" element={<EmailVerificationPage key="resend" mode="resend"/>}/>
    <Route path="/" element={<ProtectedPage user={user}>{user?.role === 'ADMIN' ? <Navigate to="/admin/curriculum" replace/> : <MyLearningPage user={user!}/>}</ProtectedPage>}/>
    <Route path="/progress" element={<ProtectedPage user={user}>{user?.role === 'ADMIN' ? <Navigate to="/admin/analytics" replace/> : <ReadinessPage/>}</ProtectedPage>}/>
    <Route path="/catalog" element={<ProtectedPage user={user}><CatalogPage/></ProtectedPage>}/>
    <Route path="/courses/:slug" element={<ProtectedPage user={user}><CoursePage/></ProtectedPage>}/>
    <Route path="/lessons/:id" element={user ? <LessonPage/> : <Navigate to="/login" replace/>}/>
    <Route path="/items/:id" element={user ? <LearningItemPage user={user}/> : <Navigate to="/login" replace/>}/>
    <Route path="/profile" element={<ProtectedPage user={user}>{user?.role === 'ADMIN' ? <Navigate to="/admin/profile" replace/> : <ProfilePage user={user!}/>}</ProtectedPage>}/>
    <Route path="/admin" element={<ProtectedPage user={user} admin><Navigate to="/admin/curriculum" replace/></ProtectedPage>}/>
    <Route path="/admin/users" element={<ProtectedPage user={user} admin><UsersPage user={user!}/></ProtectedPage>}/>
    <Route path="/admin/analytics" element={<ProtectedPage user={user} admin><AnalyticsPage/></ProtectedPage>}/>
    <Route path="/admin/activity" element={<ProtectedPage user={user} admin><ActivityPage/></ProtectedPage>}/>
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
