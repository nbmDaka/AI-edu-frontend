import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, apiAll, type Course, type LearningItem, type Module, type Track } from '../api'
import { AdminCurriculum } from './CurriculumExplorer'
import { CurriculumEntityPage } from './CurriculumEntityPage'

vi.mock('../api', () => ({ api: vi.fn(), apiAll: vi.fn() }))
const mockedApi = vi.mocked(api)
const mockedApiAll = vi.mocked(apiAll)
const track: Track = { id: 1, short_id: 'track-1', title: 'Разработка', description: '', cover: null, is_published: true, is_active: true, is_system: false }
const course: Course = { id: 2, short_id: 'course-2', title: 'Основы Python', slug: 'python', description: '', learning_track: 1, cover: null, position: 0, is_published: true }
const moduleItem: Module = { id: 3, short_id: 'module-3', title: 'Введение', description: '', course: 2, position: 0, is_published: true }
const item: LearningItem = { id: 4, short_id: 'item-4', title: 'Первая лекция', description: '', module: 3, position: 0, status: 'DRAFT', type: 'LECTURE', lesson: 8, lesson_short_id: 'lesson-4', test: null, practice: null }
let modules: Module[]
let items: LearningItem[]

function renderExplorer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/curriculum']}><Routes>
    <Route path="/admin/curriculum" element={<AdminCurriculum/>}/>
    <Route path="/admin/curriculum/courses/:courseId" element={<><div>Страница курса</div><Link to="/admin/curriculum">Назад</Link></>}/>
    <Route path="/admin/curriculum/modules/:moduleId" element={<div>Страница модуля</div>}/>
    <Route path="/admin/curriculum/items/:id/edit" element={<div>Редактор элемента</div>}/>
  </Routes></MemoryRouter></QueryClientProvider>)
}

function renderEntity(kind: 'course' | 'module') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const path = kind === 'course' ? '/admin/curriculum/courses/course-2' : '/admin/curriculum/modules/module-3'
  const pattern = kind === 'course' ? '/admin/curriculum/courses/:courseId' : '/admin/curriculum/modules/:moduleId'
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={<CurriculumEntityPage kind={kind}/>}/></Routes></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  modules = [moduleItem]
  items = [item]
  mockedApi.mockReset()
  mockedApiAll.mockReset()
  mockedApiAll.mockImplementation(async path => {
    if (path === 'tracks/') return [track] as never
    if (path === 'courses/') return [course] as never
    if (path === 'modules/') return modules as never
    if (path === 'items/') return items as never
    return [] as never
  })
})
afterEach(cleanup)

describe('curriculum explorer', () => {
  it('switches the visible course list with the selected track', async () => {
    const secondTrack = { ...track, id: 8, short_id: 'track-8', title: 'Дизайн' }
    const secondCourse = { ...course, id: 9, short_id: 'course-9', slug: 'design', learning_track: 8, title: 'Основы дизайна' }
    mockedApiAll.mockImplementation(async path => {
      if (path === 'tracks/') return [track, secondTrack] as never
      if (path === 'courses/') return [course, secondCourse] as never
      if (path === 'modules/') return modules as never
      if (path === 'items/') return items as never
      return [] as never
    })
    renderExplorer()
    await screen.findByRole('link', { name: 'Основы Python' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Траектория обучения' }), { target: { value: 'track-8' } })
    expect(await screen.findByRole('link', { name: 'Основы дизайна' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Основы Python' })).toBeNull()
  })

  it('navigates directly from course, module, and learning item names', async () => {
    renderExplorer()
    await screen.findByRole('link', { name: 'Основы Python' })
    expect(screen.getByRole('link', { name: 'Введение' }).getAttribute('href')).toContain('/admin/curriculum/modules/module-3')
    expect(screen.getByRole('link', { name: 'Первая лекция' }).getAttribute('href')).toContain('/admin/curriculum/items/item-4/edit')
    fireEvent.click(screen.getByRole('link', { name: 'Основы Python' }))
    expect(await screen.findByText('Страница курса')).toBeTruthy()
  })

  it('creates a module and confirms deletion from a row menu', async () => {
    mockedApi.mockImplementation(async (path, method, body) => {
      if (path === 'modules/' && method === 'POST') {
        const created: Module = { ...moduleItem, id: 5, short_id: 'module-5', title: (body as { title: string }).title, position: 1 }
        modules = [...modules, created]
        return created as never
      }
      if (path === 'items/item-4/' && method === 'DELETE') { items = []; return undefined as never }
      return {} as never
    })
    renderExplorer()
    await screen.findByRole('link', { name: 'Первая лекция' })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить модуль в курс Основы Python' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Продолжение' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('modules/', 'POST', expect.objectContaining({ title: 'Продолжение', course: 2 })))
    await screen.findByRole('link', { name: 'Продолжение' })
    fireEvent.click(screen.getByRole('button', { name: 'Действия: Первая лекция' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Первая лекция')
    fireEvent.click(dialog.querySelector('.button.danger') as HTMLElement)
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('items/item-4/', 'DELETE'))
  })

  it('creates one test and keeps it after the other items', async () => {
    mockedApi.mockImplementation(async (path, method, body) => {
      if (path === 'items/' && method === 'POST') {
        const created = { ...item, id: 5, short_id: 'item-5', type: 'TEST' as const, title: (body as { title: string }).title, position: 1, lesson: null, lesson_short_id: null, test: 11 }
        items = [...items, created]
        return created as never
      }
      if (path === 'items/item-5/' && method === 'DELETE') { items = [item]; return undefined as never }
      return {} as never
    })
    renderExplorer()
    await screen.findByRole('link', { name: 'Первая лекция' })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить элемент' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Тест' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Проверка знаний' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('items/', 'POST', expect.objectContaining({ type: 'TEST', module: 3 })))
    await screen.findByRole('link', { name: 'Проверка знаний' })
    const rows = screen.getAllByRole('link').filter(link => link.classList.contains('curriculum-row-title'))
    expect(rows.slice(-2).map(link => link.textContent)).toEqual(['Первая лекция', 'Проверка знаний'])
    fireEvent.click(screen.getByRole('button', { name: 'Добавить элемент' }))
    expect((screen.getByRole('menuitem', { name: 'Тест' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitem', { name: 'Лекция' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('menuitem', { name: 'Практическая работа' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Действия: Проверка знаний' }))
    expect((screen.getByRole('menuitem', { name: 'Переместить выше' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitem', { name: 'Переместить ниже' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Переместить выше' }))
    expect(mockedApi).not.toHaveBeenCalledWith('items/item-5/', 'PATCH', expect.anything())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Действия: Первая лекция' }))
    expect((screen.getByRole('menuitem', { name: 'Переместить ниже' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Действия: Проверка знаний' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    fireEvent.click(screen.getByRole('dialog').querySelector('.button.danger') as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Проверка знаний' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Добавить элемент' }))
    expect((screen.getByRole('menuitem', { name: 'Тест' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables test creation even when search hides the existing test', async () => {
    items = [...items, { ...item, id: 5, short_id: 'item-5', type: 'TEST', title: 'Проверка знаний', position: 1 }]
    renderExplorer()
    await screen.findByRole('link', { name: 'Проверка знаний' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по учебной структуре' }), { target: { value: 'Первая лекция' } })
    expect(screen.queryByRole('link', { name: 'Проверка знаний' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить элемент' }))
    expect((screen.getByRole('menuitem', { name: 'Тест' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it.each([
    ['course', 'courses/course-2/', 'Новое название курса'],
    ['module', 'modules/module-3/', 'Новое название модуля'],
  ] as const)('saves %s settings on its own page', async (kind, endpoint, title) => {
    mockedApi.mockImplementation(async (path, method, body) => {
      if (path === endpoint && method === 'PATCH') return { ...(kind === 'course' ? course : moduleItem), ...(body as object) } as never
      if (path === endpoint) return (kind === 'course' ? course : moduleItem) as never
      return {} as never
    })
    renderEntity(kind)
    await screen.findByRole('heading', { name: kind === 'course' ? 'Настройки курса' : 'Настройки модуля' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: title } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith(endpoint, 'PATCH', expect.objectContaining({ title })))
  })
})
