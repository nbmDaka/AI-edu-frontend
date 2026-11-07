import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type ReadinessDashboard } from './api'
import { ReadinessPage } from './ReadinessPage'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: vi.fn() }))
const mockedApi = vi.mocked(api)

const dashboard: ReadinessDashboard = { courses: [{
  id: 1, short_id: 'c1', slug: 'iad', title: 'ИАД', passed_modules: 1, total_modules: 2, average_readiness: 79.4, weak_topic_limit: .6,
  modules: [
    { id: 1, short_id: 'm1', title: 'Модуль 1', status: 'completed', threshold: 60, attempts: 2, readiness: 79.4, best_readiness: 79.4,
      history: [{ completed_at: '2026-11-01T10:00:00Z', readiness: 43.5, passed: false }, { completed_at: '2026-11-02T10:00:00Z', readiness: 79.4, passed: true }],
      recommendation: { status: 'passed', action: 'next_module', level: 'advanced', gap: 19.4, weakest_indicator: 'theory', weak_topics: [], weak_topic_limit: .6 } },
    { id: 2, short_id: 'm2', title: 'Модуль 2', status: 'available', threshold: 60, attempts: 0, readiness: null, best_readiness: null, history: [], recommendation: null },
  ],
  competencies: [{ competency: 'корреляция', title: 'Корреляция', score: .42, is_weak: true }, { competency: 'pandas', title: 'Pandas', score: .9, is_weak: false }],
}] }

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><ReadinessPage/></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => mockedApi.mockReset())
afterEach(cleanup)

it('shows readiness against the threshold, attempt history and weak competencies', async () => {
  mockedApi.mockResolvedValue(dashboard as never)
  mount()
  const course = await screen.findByRole('region', { name: 'ИАД' })
  expect(mockedApi).toHaveBeenCalledWith('me/readiness/')
  expect(within(course).getByText('1 / 2')).toBeTruthy()
  expect(within(course).getByRole('img', { name: 'Готовность 79,4%, порог 60%' })).toBeTruthy()
  expect(within(course).getByRole('img', { name: 'Готовность ещё не измерена, порог 60%' })).toBeTruthy()
  expect(within(course).getByRole('list', { name: 'История попыток' }).textContent).toContain('43,5%')
  expect(within(course).getByText('Пройден')).toBeTruthy()
  expect(within(course).getByText('Не пройден тест')).toBeTruthy()
  const profile = within(course).getByRole('region', { name: 'Профиль компетенций' })
  expect(within(profile).getByText('Корреляция').closest('li')?.className).toBe('weak')
  expect(within(profile).getByText('Pandas').closest('li')?.className).toBe('')
})

it('shows the latest actions of the student', async () => {
  mockedApi.mockImplementation(async (path: string) => (path === 'me/activity/' ? [{ id: 5, type: 'PRACTICE_SUBMITTED', created_at: '2026-11-06T10:00:00Z',
    course: 1, course_title: 'ИАД', module_title: 'Модуль 1', item_short_id: 'pr-1', item_title: 'Практическая 1', data: { score: 1, completed: true } }] : dashboard) as never)
  mount()
  const feed = await screen.findByRole('region', { name: 'Последние действия' })
  expect(within(feed).getByText('Сдача практики')).toBeTruthy()
  expect(within(feed).getByRole('link', { name: 'ИАД · Модуль 1 · Практическая 1' }).getAttribute('href')).toBe('/items/pr-1')
  expect(within(feed).getByText('100% · засчитана')).toBeTruthy()
})

it('explains when there are no adaptive courses yet', async () => {
  mockedApi.mockResolvedValue({ courses: [] } as never)
  mount()
  expect(await screen.findByText('Пока нет курсов с адаптивным обучением')).toBeTruthy()
})
