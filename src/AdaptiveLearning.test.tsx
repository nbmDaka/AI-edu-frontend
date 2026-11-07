import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdaptiveResultCard, LearningItemLink, PracticeRunner } from './AdaptiveLearning'
import { LearningLayout } from './layouts/LearningLayout'
import { api, type AdaptiveResult, type LearningItem, type Module } from './api'

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

  it('explains a failed attempt with the gap, weakest indicator and topics to review', () => {
    mount(<AdaptiveResultCard result={{ ...result, recommendation: { status: 'repeat', action: 'repeat_module', level: 'repeat', gap: -29,
      weakest_indicator: 'competency', weak_topic_limit: .6, weak_topics: [{ competency: 'визуализация', title: 'Визуализация', score: 0, correct: 0, total: 2 }] } }}/>)
    expect(screen.getByRole('heading', { name: 'Почему такой результат' })).toBeTruthy()
    expect(screen.getByText('До порога не хватило 29 п.')).toBeTruthy()
    expect(screen.getByText(/Слабее всего/).textContent).toBe('Слабее всего: Компетенции')
    expect(screen.getByRole('listitem').textContent).toBe('Визуализация: 0% (0/2)')
    expect(screen.getByText(/пройдите модуль заново целиком/)).toBeTruthy()
  })

  it('links the materials to review for each weak topic', () => {
    mount(<AdaptiveResultCard result={{ ...result, recommendation: { status: 'repeat', action: 'repeat_module', level: 'repeat', gap: -29,
      weakest_indicator: 'competency', weak_topic_limit: .6, weak_topics: [{ competency: 'корреляция', title: 'Корреляция', score: 0, correct: 0, total: 2 }],
      review: [{ competency: 'корреляция', title: 'Корреляция', items: [{ short_id: 'lec-3', title: 'Лекция 3', type: 'LECTURE', match: 'tag' }, { short_id: 'pr-3', title: 'Практика 3', type: 'PRACTICE', match: 'tag' }] }] } }}/>)
    expect(screen.getByRole('listitem').textContent).toBe('Корреляция: 0% (0/2)Что повторить: Лекция 3, Практика 3')
    expect(screen.getByRole('link', { name: 'Лекция 3' }).getAttribute('href')).toBe('/items/lec-3')
    expect(screen.getByRole('link', { name: 'Практика 3' }).getAttribute('href')).toBe('/items/pr-3')
  })

  it('sends a near miss to review only the materials of its weak topics', () => {
    mount(<AdaptiveResultCard result={{ ...result, readiness: 52, repeat_item_short_id: 'lec-3', recommendation: { status: 'repeat', action: 'repeat_module', level: 'extra_practice', gap: -8,
      weakest_indicator: 'competency', weak_topic_limit: .6, weak_topics: [{ competency: 'корреляция', title: 'Корреляция', score: .25, correct: 1, total: 4 }],
      review: [{ competency: 'корреляция', title: 'Корреляция', items: [{ short_id: 'lec-3', title: 'Лекция 3', type: 'LECTURE', match: 'tag' }] }],
      route: { scope: 'topics', items: [{ short_id: 'lec-3', title: 'Лекция 3', type: 'LECTURE' }] } } }}/>)
    expect(screen.getByText(/только материалы по слабым темам: 1/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Повторите слабые темы' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Начать повторение' }).getAttribute('href')).toBe('/items/lec-3')
    expect(screen.queryByRole('link', { name: 'Повторить модуль' })).toBeNull()
    expect(screen.getByText(/Повторите отмеченные материалы/)).toBeTruthy()
  })

  it('keeps older attempts without a recommendation unchanged', () => {
    mount(<AdaptiveResultCard result={result}/>)
    expect(screen.queryByRole('region', { name: 'Рекомендация' })).toBeNull()
  })

  it('shows the margin above the threshold for a passed attempt', () => {
    mount(<AdaptiveResultCard result={{ ...result, readiness: 77, module_completed: true, module_passed: true, next_item_short_id: 'lecture-2',
      recommendation: { status: 'passed', action: 'next_module', level: 'advanced', gap: 17, weakest_indicator: 'theory', weak_topic_limit: .6, weak_topics: [] } }}/>)
    expect(screen.getByText('Готовность выше порога на 17 п.')).toBeTruthy()
    expect(screen.queryByText(/Слабее всего/)).toBeNull()
    expect(screen.queryByText(/Повторите темы/)).toBeNull()
    expect(screen.getByText(/модуль освоен с большим запасом/)).toBeTruthy()
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
