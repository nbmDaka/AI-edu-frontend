import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdaptiveResultCard, LearningItemLink, PracticeRunner } from './AdaptiveLearning'
import { LearningLayout } from './layouts/LearningLayout'
import { api, type AdaptiveResult, type LearningItem, type Module } from './api'

vi.mock('./api', () => ({ api: vi.fn() }))
const mockedApi = vi.mocked(api)
const item: LearningItem = { id: 1, short_id: 'practice-1', module: 1, title: 'Практическое задание', description: '',
  type: 'PRACTICE', position: 0, status: 'PUBLISHED', lesson: null, lesson_short_id: null, test: null, practice: null }
const result: AdaptiveResult = { readiness: 31, threshold: 60, module_passed: false, module_completed: false,
  theory: .5, practice: .5, errors: .5, competency: .3, competencies: { general: .3 },
  module_short_id: 'module-1', repeat_item_short_id: 'lecture-1', next_item_short_id: null }

function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}

beforeEach(() => mockedApi.mockReset())
afterEach(cleanup)

describe('adaptive learning', () => {
  it('directs a failed attempt to repeat the module', () => {
    mount(<AdaptiveResultCard result={result}/>)
    expect(screen.getByText('31%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Повторить модуль' }).getAttribute('href')).toBe('/items/lecture-1')
    expect(screen.queryByRole('link', { name: 'Следующий модуль' })).toBeNull()
  })

  it('opens the next module after readiness reaches its threshold', () => {
    mount(<AdaptiveResultCard result={{ ...result, readiness: 77, module_completed: true, module_passed: true, next_item_short_id: 'lecture-2' }}/>)
    expect(screen.getByRole('heading', { name: 'Модуль освоен' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Следующий модуль' }).getAttribute('href')).toBe('/items/lecture-2')
  })

  it('keeps locked items visible without a clickable link', () => {
    mount(<LearningItemLink item={{ ...item, is_locked: true }}>Следующая практика</LearningItemLink>)
    expect(screen.getByText('Следующая практика').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('blocks locked items in the outline and next-element navigation', () => {
    const module: Module = { id: 2, short_id: 'module-2', course: 1, title: 'Следующий модуль', description: '', position: 1, is_published: true, is_locked: true }
    const locked = { ...item, module: 2, is_locked: true }
    mount(<LearningLayout lessonId="lecture-1" lessonTitle="Лекция" next={locked} sections={[{ module, lessons: [locked] }]}><p>Материалы</p></LearningLayout>)
    expect(screen.queryByRole('link', { name: 'Практическое задание' })).toBeNull()
    expect(screen.getByText('Сначала завершите текущий модуль')).toBeTruthy()
  })

  it('saves actual practice checks rather than a client-supplied score', async () => {
    mockedApi.mockResolvedValue({ criteria: ['Первый критерий', 'Второй критерий'], checks: null } as never)
    mount(<PracticeRunner item={item}/>)
    const first = await screen.findByRole('checkbox', { name: 'Первый критерий' })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Сохранить самопроверку' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(first)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить самопроверку' }))
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('items/practice-1/practice/', 'POST', { checks: [true, false] }))
    expect(await screen.findByText('Самопроверка сохранена')).toBeTruthy()
  })
})
