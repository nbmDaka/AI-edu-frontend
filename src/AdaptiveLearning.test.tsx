import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdaptiveResultCard, LearningItemLink, PracticeRunner } from './AdaptiveLearning'
import { LearningLayout } from './layouts/LearningLayout'
import { api, apiAll, type AdaptiveResult, type LearningItem, type Module } from './api'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
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

beforeEach(() => {
  mockedApi.mockReset()
  mockedApi.mockResolvedValue({ ...item, course_id: 1 } as never)
  vi.mocked(apiAll).mockImplementation(async path => path.startsWith('modules/') ? [{ id: 1, short_id: 'module-1', is_published: true }] as never : [{ ...item, type: 'LECTURE', short_id: 'lecture-1', module_short_id: 'module-1' }] as never)
})
afterEach(cleanup)

describe('adaptive learning', () => {
  it('directs a failed attempt to repeat the module', async () => {
    mount(<AdaptiveResultCard result={result}/>)
    expect(screen.getByText('31%')).toBeTruthy()
    expect((await screen.findByRole('link', { name: 'Повторить модуль' })).getAttribute('href')).toBe('/items/lecture-1')
    expect(screen.queryByRole('link', { name: 'Следующий модуль' })).toBeNull()
  })

  it('opens the next module after readiness reaches its threshold', () => {
    mount(<AdaptiveResultCard result={{ ...result, readiness: 77, module_completed: true, module_passed: true, next_item_short_id: 'lecture-2' }}/>)
    expect(screen.getByText('Модуль освоен')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Следующий модуль' }).getAttribute('href')).toBe('/items/lecture-2')
  })


  it('sorts actual competencies without assigning individual pass thresholds', () => {
    mount(<AdaptiveResultCard result={{ ...result, module_completed: true, competencies: { Strong: .9, Weak: .2 } }}/>)
    expect([...document.querySelectorAll('.competency-results li')].map(row => row.textContent)).toEqual(['Weak20%', 'Strong90%'])
    expect(screen.queryByText('Не освоено')).toBeNull()
  })

  it('keeps empty competency data explicit', () => {
    mount(<AdaptiveResultCard result={{ ...result, module_completed: true, competencies: {} }}/>)
    expect(screen.getByText('Нет данных по компетенциям для этой попытки.')).toBeTruthy()
  })

  it('links only current published unlocked review materials in course order', async () => {
    vi.mocked(apiAll).mockImplementation(async path => path.startsWith('modules/') ? [{ id: 1, short_id: 'module-1', is_published: true }] as never : [
      { ...item, id: 2, short_id: 'second', module_short_id: 'module-1', position: 2 },
      { ...item, id: 3, short_id: 'draft', module_short_id: 'module-1', status: 'DRAFT' },
      { ...item, id: 4, short_id: 'locked', module_short_id: 'module-1', is_locked: true },
      { ...item, id: 5, short_id: 'other', module_short_id: 'module-2' },
      { ...item, id: 6, short_id: 'test', module_short_id: 'module-1', type: 'TEST' },
      { ...item, id: 1, short_id: 'first', module_short_id: 'module-1', position: 0 },
    ] as never)
    mount(<AdaptiveResultCard result={result}/>)
    await screen.findByRole('link', { name: 'Повторить модуль' })
    expect([...document.querySelectorAll('.repeat-materials ol a')].map(link => link.getAttribute('href'))).toEqual(['/items/first', '/items/second'])
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

  it('opens a legacy practice in its workspace without adding self-assessment controls', async () => {
    const state = { version: { id: 1, practice_type: 'checklist_practice', plugin_version: '1.0.0', version_number: 1, title: 'Задание', description: '', config: { criteria: [
      { title: 'Первый критерий', description: '', is_required: true }, { title: 'Второй критерий', description: '', is_required: true },
    ] } }, submission: { id: 9, status: 'IN_PROGRESS', submission_data: {} }, result: null, progress_percent: 0, is_completed: false }
    mockedApi.mockResolvedValue(state as never)
    mount(<PracticeRunner item={item}/>)
    fireEvent.click(await screen.findByRole('button', { name: /Продолжить выполнение/ }))
    expect(document.querySelector('.practice-flow.is-workspace')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
