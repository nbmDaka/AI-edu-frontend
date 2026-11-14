import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthPage } from './AuthPage'
import { EditorPage } from './AdminPages'
import { CatalogPage } from './StudentPages'
import { TestRunner } from './TestRunner'
import { api, apiAll } from './api'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
const mockedApi = vi.mocked(api)
const mockedApiAll = vi.mocked(apiAll)
function renderAt(path: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const pattern = path.replace(/\/\d+\//, '/:id/').replace(/\/\d+$/, '/:id')
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element}/><Route path="/" element={<div>Home</div>}/></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  mockedApi.mockReset()
  mockedApiAll.mockReset()
})
afterEach(cleanup)

describe('main flows', () => {
  it('submits login details through the API', async () => {
    mockedApi.mockResolvedValue({ id: 1, email: 'student@example.test', role: 'STUDENT' })
    renderAt('/login', <AuthPage mode="login"/>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.test' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'StrongPass321!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('auth/login/', 'POST', expect.objectContaining({ email: 'student@example.test' })))
  })

  it('saves edited lesson blocks in their visible order', async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path === 'lessons/1/') return { id: 1, title: 'Intro', status: 'DRAFT' } as never
      if (path === 'lessons/1/blocks/') return [] as never
      return {} as never
    })
    renderAt('/admin/lessons/1/edit', <EditorPage/>)
    await screen.findByText('Intro')
    fireEvent.click(screen.getByRole('button', { name: /Текстовый блок/ }))
    fireEvent.change(screen.getByPlaceholderText('Пишите в Markdown: заголовки, списки, выделения…'), { target: { value: '# First block' } })
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('lessons/1/blocks/', 'PUT', [{ type: 'TEXT', position: 0, content: '# First block', media: null, config: {} }]))
  })

  it('sends student answers without the correct answer flag', async () => {
    mockedApi.mockImplementation(async (path, method) => {
      if (path === 'lessons/1/') return { id: 1, title: 'Intro', description: '' } as never
      if (path === 'lessons/1/blocks/') return [] as never
      if (path === 'items/1/test/') return { title: 'Quiz', description: '', passing_percent: 70, max_attempts: 1, questions: [{ id: 10, text: 'Question?', points: 1, position: 0, options: [{ id: 20, text: 'Answer', position: 0 }, { id: 21, text: 'Other', position: 1 }] }] } as never
      if (path === 'items/1/attempts/' && method === 'POST') return { id: 1, passed: true, percent: 100, earned_points: 1, total_points: 1 } as never
      if (path === 'items/1/attempts/') return { count: 0, results: [], next: null, previous: null } as never
      return {} as never
    })
    renderAt('/test', <TestRunner itemId="1"/>)
    await screen.findByText('Использовано попыток: 0')
    fireEvent.click(await screen.findByRole('button', { name: 'Начать тестирование' }))
    await screen.findByText('Question?')
    fireEvent.click(screen.getByLabelText('Answer'))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('items/1/attempts/', 'POST', { answers: [{ question: 10, option: 20 }], request_id: expect.any(String) }))
  })

  it('renders course cover in catalog when present', async () => {
    mockedApiAll.mockResolvedValue([
      { id: 1, short_id: 'c1', title: 'Python Course', slug: 'python', description: 'Learn Python', cover: 42, position: 0, is_published: true, learning_track: 1 },
      { id: 2, short_id: 'c2', title: 'JS Course', slug: 'js', description: 'Learn JS', cover: null, position: 1, is_published: true, learning_track: 1 }
    ] as never)
    renderAt('/catalog', <CatalogPage/>)
    const img = await screen.findByRole('img', { name: 'Python Course' })
    expect(img.getAttribute('src')).toBe('/api/v1/media/42/')
    expect(screen.queryByRole('img', { name: 'JS Course' })).toBeNull()
  })
})
