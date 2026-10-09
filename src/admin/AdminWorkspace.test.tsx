import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, apiAll, type AdminUser, type Course, type Track, type User } from '../api'
import { AdminLayout } from '../layouts/AdminLayout'
import { ProtectedPage } from '../App'
import { UsersPage } from './UsersPage'
import { UserDetailPage } from './UserDetailPage'
import { CourseAccessSelector, type AccessValues } from './CourseAccessSelector'
import { AdminProfilePage } from './AdminProfilePage'
import { AuthPage } from '../AuthPage'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn(), apiAll: vi.fn() }))
const mockApi = vi.mocked(api), mockAll = vi.mocked(apiAll)
const actor: User = { id: 1, email: 'admin@example.test', first_name: 'Admin', last_name: '', role: 'ADMIN', learning_track: null }
const student: AdminUser = { id: 2, email: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace', role: 'STUDENT',
  is_active: true, learning_track: 1, learning_track_title: 'IT', course_access_mode: 'TRACK_DEFAULT', course_ids: [],
  accessible_course_count: 2, is_protected: false, date_joined: '2026-01-01T00:00:00Z', last_login: null }
const tracks: Track[] = [1, 2].map(id => ({ id, short_id: `track-${id}`, title: id === 1 ? 'IT' : 'Business', description: '', cover: null, is_active: true, is_published: true, is_system: false }))
const courses: Course[] = [1, 2].map(id => ({ id, short_id: `course-${id}`, slug: `course-${id}`, learning_track: 1, title: id === 1 ? 'Python' : 'AI', description: '', cover: null, position: id, is_published: true }))
const list = { count: 31, next: '/api/v1/admin/users/?page=2', previous: null, results: [student] }

function mount(element: React.ReactNode, path = '/admin/users') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>)
}
function details(tab = 'general') {
  return mount(<Routes><Route path="/admin/users/:id" element={<UserDetailPage actor={actor}/>}/></Routes>, `/admin/users/2?tab=${tab}`)
}

beforeEach(() => {
  mockApi.mockReset(); mockAll.mockReset()
  mockApi.mockImplementation(async (path, method, data) => {
    if (path.includes('learning-progress/')) return { count: 1, next: null, previous: null, results: [{ id: 1, item_title: 'Real lecture', item_type: 'LECTURE', course_title: 'Python', module_title: 'Module', progress_percent: 54, is_completed: false, updated_at: '2026-01-01T00:00:00Z', completed_at: null }] } as never
    if (path === 'admin/users/2/') return { ...student, ...(method === 'PATCH' ? data as object : {}) } as never
    if (path.startsWith('admin/users/?')) return list as never
    if (path === 'admin/users/' && method === 'POST') return { ...student, ...data as object, id: 3 } as never
    if (path === 'auth/login/') return actor as never
    if (path === 'auth/me/') return { ...actor, ...data as object } as never
    return undefined as never
  })
  mockAll.mockImplementation(async path => path === 'tracks/' ? tracks as never : courses as never)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('admin workspace', () => {
  it('shows only builder and users navigation and a separate profile link', () => {
    mount(<AdminLayout user={actor}><p>Workspace</p></AdminLayout>)
    expect(screen.getByRole('link', { name: 'Конструктор' }).getAttribute('href')).toBe('/admin/curriculum')
    expect(screen.getByRole('link', { name: 'Пользователи' }).getAttribute('href')).toBe('/admin/users')
    expect(screen.queryByText('Моё обучение')).toBeNull()
    expect(screen.queryByText('Каталог')).toBeNull()
    expect(screen.queryByText('Панель администратора')).toBeNull()
    const menu = document.querySelector('details.user-menu') as HTMLDetailsElement
    menu.open = true
    expect(within(menu).getByRole('link', { name: 'Профиль' }).getAttribute('href')).toBe('/admin/profile')
    fireEvent.keyDown(document, { key: 'Escape' }); expect(menu.open).toBe(false)
  })

  it('denies students and anonymous users the administrative route', () => {
    const routes = (user: User | null) => <Routes><Route path="/admin/users" element={<ProtectedPage user={user} admin><p>Private users</p></ProtectedPage>}/><Route path="/" element={<p>Student home</p>}/><Route path="/login" element={<p>Login</p>}/></Routes>
    const view = mount(routes({ ...actor, role: 'STUDENT' }))
    expect(screen.getByText('Student home')).toBeTruthy(); expect(screen.queryByText('Private users')).toBeNull()
    view.unmount(); mount(routes(null))
    expect(screen.getByText('Login')).toBeTruthy()
  })

  it('allows admin guards and wraps content in the admin shell', () => {
    mount(<ProtectedPage user={actor} admin><p>Private users</p></ProtectedPage>)
    expect(screen.getByText('Private users')).toBeTruthy()
    expect(document.querySelector('.admin-shell')).toBeTruthy()
    expect(document.querySelector('.main-layout')).toBeNull()
  })

  it('loads a paginated management table without loading every user', async () => {
    mount(<UsersPage user={actor}/>)
    expect(await screen.findByRole('link', { name: /Ada Lovelace/ })).toBeTruthy()
    expect(screen.getByText('Всего: 31 · Страница 1')).toBeTruthy()
    expect(screen.getByText('Последний вход')).toBeTruthy()
    expect(mockAll.mock.calls.some(([path]) => path.includes('admin/users'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await waitFor(() => expect(mockApi.mock.calls.some(([path]) => path.includes('page=2') && path.includes('page_size=30'))).toBe(true))
  })

  it('sends search, role, track and status filters to the backend and resets pagination', async () => {
    mount(<UsersPage user={actor}/>, '/admin/users?page=2')
    await screen.findByText('Ada Lovelace')
    fireEvent.change(screen.getByLabelText('Поиск пользователей'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'STUDENT' } })
    fireEvent.change(screen.getByLabelText('Траектория'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'active' } })
    await waitFor(() => expect(mockApi.mock.calls.some(([path]) => {
      const query = new URLSearchParams(path.split('?')[1]); return query.get('search') === 'Ada' && query.get('role') === 'STUDENT' && query.get('learning_track') === '1' && query.get('status') === 'active' && !query.has('page')
    })).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    expect(screen.getByRole('button', { name: 'Фильтры' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('creates a student through a compact modal without system privilege fields', async () => {
    mount(<Routes><Route path="/admin/users" element={<UsersPage user={actor}/>}/><Route path="/admin/users/3" element={<p>Created user</p>}/></Routes>)
    await screen.findByText('Ada Lovelace')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить пользователя' }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText('Имя'), { target: { value: 'New' } })
    fireEvent.change(within(modal).getByLabelText('Email'), { target: { value: 'new@example.test' } })
    fireEvent.change(within(modal).getByLabelText('Временный пароль'), { target: { value: 'SafeTemporaryWord842!' } })
    fireEvent.change(await within(modal).findByLabelText('Траектория обучения'), { target: { value: '1' } })
    fireEvent.click(within(modal).getByRole('button', { name: 'Создать пользователя' }))
    expect(await screen.findByText('Created user')).toBeTruthy()
    const request = mockApi.mock.calls.find(([path, method]) => path === 'admin/users/' && method === 'POST')!
    expect(request[2]).toMatchObject({ role: 'STUDENT', learning_track: 1, course_access_mode: 'TRACK_DEFAULT', course_ids: [] })
    expect(request[2]).not.toHaveProperty('is_superuser')
    expect(request[2]).not.toHaveProperty('is_staff')
  })

  it('edits user details and displays actual progress only', async () => {
    details()
    await screen.findByRole('heading', { name: 'Ada Lovelace' })
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('admin/users/2/', 'PATCH', { first_name: 'Updated', last_name: 'Lovelace', email: 'ada@example.test', role: 'STUDENT', is_active: true }))
    await screen.findByText('Изменения сохранены')
    fireEvent.click(screen.getByRole('button', { name: 'Прогресс обучения' }))
    expect(await screen.findByText('Real lecture')).toBeTruthy()
    expect(screen.getByText('54%')).toBeTruthy()
    expect(screen.getByText('В процессе')).toBeTruthy()
  })

  it('saves explicit course grants from the access tab', async () => {
    details('access')
    fireEvent.click(await screen.findByRole('radio', { name: 'Выбранные курсы' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Python' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('admin/users/2/', 'PATCH', { learning_track: 1, course_access_mode: 'CUSTOM', course_ids: [1] }))
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy()
  })

  it('keeps course selections through search and clears incompatible selections on track change', async () => {
    function Selector() {
      const [value, setValue] = useState<AccessValues>({ learning_track: 1, course_access_mode: 'CUSTOM', course_ids: [] })
      return <><CourseAccessSelector value={value} tracks={tracks} onChange={setValue} onUnavailableChange={() => {}} warnOnTrackChange/><output>{JSON.stringify(value)}</output></>
    }
    mount(<Selector/>)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Python' }))
    fireEvent.change(screen.getByLabelText('Поиск курсов'), { target: { value: 'AI' } })
    expect(screen.queryByRole('checkbox', { name: 'Python' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Поиск курсов'), { target: { value: '' } })
    expect((screen.getByRole('checkbox', { name: 'Python' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать все' }))
    expect((screen.getByRole('checkbox', { name: 'AI' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Снять выбор' }))
    expect((screen.getByRole('checkbox', { name: 'Python' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Python' }))
    fireEvent.change(screen.getByLabelText('Траектория обучения'), { target: { value: '2' } })
    expect(screen.getByText(/Траектория изменена/)).toBeTruthy()
    expect(screen.getByText(/Траектория изменена/).textContent).toContain('История обучения сохранится')
    expect(document.querySelector('output')?.textContent).toContain('"course_ids":[]')
  })

  it('protects unsaved edits when changing detail tabs', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    details(); await screen.findByLabelText('Имя')
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Доступ к обучению' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(screen.getByLabelText('Имя')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('keeps the current administrator profile separate from student learning', () => {
    mount(<AdminProfilePage user={actor}/>)
    expect(screen.getByRole('heading', { name: 'Мой профиль' })).toBeTruthy()
    expect(screen.getByLabelText('Email').getAttribute('readonly')).toBe('')
    expect(screen.getByRole('heading', { name: 'Изменить пароль' })).toBeTruthy()
    expect(screen.queryByText('Результаты тестов')).toBeNull()
    expect(screen.queryByLabelText('Траектория обучения')).toBeNull()
  })

  it('directs administrator login to the existing curriculum', async () => {
    mount(<Routes><Route path="/login" element={<AuthPage mode="login"/>}/><Route path="/admin/curriculum" element={<p>Curriculum workspace</p>}/></Routes>, '/login')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'SafeTemporaryWord842!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Curriculum workspace')).toBeTruthy()
  })
})
