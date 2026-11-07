import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '../api'
import { ActivityPage } from './ActivityPage'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }))
const mockedApi = vi.mocked(api)

const event = { id: 1, type: 'TEST_SUBMITTED', created_at: '2026-11-06T10:00:00Z', user_id: 7, user_email: 'student@test.kz', user_name: 'Ками',
  course: 1, course_title: 'ИАД', module_title: 'Модуль 1', item_short_id: 'test-1', item_title: 'Итоговый тест',
  data: { percent: 50, passed: false, readiness: 43.5, module_passed: false } }
const days = Array.from({ length: 14 }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, '0')}`, total: index === 13 ? 3 : 0, by_type: index === 13 ? { TEST_SUBMITTED: 3 } : {} }))
const summary = { days, active_users: 1, totals: { LOGIN: 2, LECTURE_STARTED: 1, LECTURE_COMPLETED: 1, PRACTICE_SUBMITTED: 0, TEST_SUBMITTED: 3 } }

beforeEach(() => {
  mockedApi.mockReset()
  mockedApi.mockImplementation(async (path: string) => (path.startsWith('admin/activity/summary') ? summary : { count: 1, next: null, previous: null, results: [event] }) as never)
})
afterEach(cleanup)

it('lists events with their place and result and filters by action and student', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ActivityPage/></MemoryRouter></QueryClientProvider>)
  const table = await screen.findByRole('table', { name: 'Журнал активности' })
  const row = within(table).getAllByRole('row')[1]
  expect(row.textContent).toContain('Попытка теста')
  expect(row.textContent).toContain('ИАД · Модуль 1 · Итоговый тест')
  expect(row.textContent).toContain('Результат 50% · готовность 43,5% · не пройден')
  expect(screen.getByText('Активных студентов').closest('article')?.textContent).toContain('1')
  fireEvent.click(screen.getByRole('combobox', { name: 'Действие' }))
  fireEvent.click(screen.getByRole('option', { name: 'Сдача практики' }))
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('admin/activity/?period=30d&type=PRACTICE_SUBMITTED&page=1'))
  fireEvent.click(within(row).getByRole('button', { name: 'Ками' }))
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('admin/activity/summary/?period=30d&type=PRACTICE_SUBMITTED&user=7'))
  expect(screen.getByText('Показаны действия одного студента.')).toBeTruthy()
})
