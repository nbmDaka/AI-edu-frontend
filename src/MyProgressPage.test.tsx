import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { api, apiAll } from './api'
import { MyProgressPage } from './MyProgressPage'

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
const course = { id: 1, short_id: 'course', slug: 'course', title: 'Course', percent: 50, completed_items: 1, total_items: 2 }
const page = (results: unknown[], next: string | null = null) => ({ count: 2, results, next, previous: null })
const clients: QueryClient[] = []
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter><MyProgressPage/></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.mocked(api).mockReset()
  vi.mocked(apiAll).mockReset().mockResolvedValue([{ id: 1, short_id: 'lecture', title: 'Done lecture', status: 'PUBLISHED' }, { id: 2, short_id: 'pending', title: 'Pending lecture', status: 'PUBLISHED' }] as never)
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })

it('deduplicates courses and lists completed materials while paging through real history', async () => {
  vi.mocked(api).mockImplementation(async path => {
    if (path === 'me/learning/') return { active_courses: [course], resume_course: course, completed_courses: [], available_courses: [] } as never
    if (path.includes('/progress/')) return { percent: 50, items: { lecture: { is_completed: true } } } as never
    return page([{ id: path.endsWith('2') ? 2 : 1, test_title: path.endsWith('2') ? 'Old test' : 'New test', percent: 80, completed_at: '2026-11-13T00:00:00Z' }], path.endsWith('1') ? '/api/v1/attempts/?page=2' : null) as never
  })
  mount()
  expect(await screen.findByRole('link', { name: 'Done lecture' })).toBeTruthy()
  expect(screen.getAllByRole('link', { name: 'Course' })).toHaveLength(1)
  expect(screen.queryByText('Pending lecture')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }))
  expect(await screen.findByText('Old test')).toBeTruthy()
  expect(screen.getByText('New test')).toBeTruthy()
  expect(vi.mocked(api)).toHaveBeenCalledWith('attempts/?page=2')
})

it('keeps history available when the course summary fails', async () => {
  vi.mocked(api).mockImplementation(async path => {
    if (path === 'me/learning/') throw new Error('Summary failed')
    return page([{ id: 1, test_title: 'Saved test', percent: 40, completed_at: '2026-11-13T00:00:00Z' }]) as never
  })
  mount()
  expect(await screen.findByText('Summary failed')).toBeTruthy()
  expect(await screen.findByText('Saved test')).toBeTruthy()
})

it('keeps completed materials available when history fails', async () => {
  vi.mocked(api).mockImplementation(async path => {
    if (path === 'me/learning/') return { active_courses: [course], completed_courses: [], available_courses: [] } as never
    if (path.includes('/progress/')) return { percent: 50, items: { lecture: { is_completed: true } } } as never
    throw new Error('History failed')
  })
  mount()
  expect(await screen.findByText('History failed')).toBeTruthy()
  expect(await screen.findByRole('link', { name: 'Done lecture' })).toBeTruthy()
})
