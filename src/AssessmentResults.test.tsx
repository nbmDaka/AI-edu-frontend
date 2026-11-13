import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { api, apiAll, type AdaptiveResult, type Attempt } from './api'
import { TestRunner } from './TestRunner'
import { AttemptHistory } from './AttemptHistory'
import { AttemptSummary } from './AdaptiveLearning'
import { I18nProvider } from './i18n'

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
const clients: QueryClient[] = []
const adaptive: AdaptiveResult = { readiness: 40, threshold: 60, module_passed: false, module_completed: false, theory: .5, practice: 1, errors: .5, competency: .3, competencies: {}, module_short_id: 'm', repeat_item_short_id: 'l', next_item_short_id: null }
const quiz = { id: 1, version: 1, title: 'Quiz', passing_percent: 70, max_attempts: null, questions: [{ id: 10, text: 'Question', points: 1, options: [{ id: 20, text: 'Answer' }] }] }
function mount(element: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear() })

for (const scenario of [
  { name: 'test passed, module failed', passed: true, module_passed: false, module_completed: false },
  { name: 'test failed, module passed', passed: false, module_passed: true, module_completed: true },
  { name: 'later failure preserves completion', passed: false, module_passed: false, module_completed: true },
]) describe(scenario.name, () => {
  const result = { ...adaptive, ...scenario, readiness: scenario.module_passed ? 75 : 40, next_item_short_id: scenario.module_completed ? 'next' : null }
  const attempt = { id: 1, test: 1, test_version: 1, passed: scenario.passed, percent: scenario.passed ? 80 : 50, earned_points: 1, total_points: 2, snapshot: [], answers: [], completed_at: '2026-11-13T00:00:00Z', adaptive_result: result } satisfies Attempt
  function setup() {
    vi.mocked(apiAll).mockResolvedValue([])
    vi.mocked(api).mockImplementation(async (path, method) => method === 'POST' ? attempt as never : path.endsWith('/test/') ? quiz as never : { count: 1, results: [attempt], next: null } as never)
  }
  function checkModule() { expect(screen.getByRole('heading', { name: scenario.module_passed ? 'Порог готовности достигнут' : 'Порог готовности не достигнут' })).toBeTruthy() }
  it('separates the fresh result and server navigation', async () => {
    setup(); mount(<TestRunner itemId="test" courseSlug="course"/>)
    const start = await screen.findByRole('button', { name: 'Начать тестирование' })
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(start)
    fireEvent.click(screen.getByRole('radio')); fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' })); fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
    await screen.findByRole('heading', { name: /Результат теста/ }); checkModule()
    expect(document.querySelector('.assessment-result-banner.passed')).toBeNull()
    expect(!!screen.queryByRole('link', { name: 'Перейти к следующему материалу' })).toBe(scenario.module_completed)
    if (scenario.module_completed && !scenario.module_passed) expect(screen.getByText('Модуль был освоен ранее. Эта попытка не отменяет завершение.')).toBeTruthy()
  })
  it('separates test history and treats reopened results as historical', async () => {
    setup(); mount(<TestRunner itemId="test" courseSlug="course"/>)
    const button = await screen.findByRole('button', { name: /Посмотреть результат/ })
    expect(button.textContent).toContain(scenario.passed ? 'Тест пройден!' : 'Тест не пройден')
    expect(button.textContent).toContain(scenario.module_passed ? 'Порог готовности достигнут' : 'Порог готовности не достигнут')
    fireEvent.click(button); checkModule()
    expect(screen.getByText('Состояние сохранено на момент попытки. Текущую доступность смотрите в курсе.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Перейти к следующему материалу' })).toBeNull()
    expect(screen.queryByText('Можно продолжить обучение.')).toBeNull()
  })
  it('separates progress history including saved completion', async () => {
    setup(); mount(<AttemptHistory/>)
    await screen.findByText(scenario.passed ? 'Тест пройден!' : 'Тест не пройден')
    expect(screen.getByText(scenario.module_passed ? 'Порог готовности достигнут' : 'Порог готовности не достигнут')).toBeTruthy()
    fireEvent.click(screen.getByText('Посмотреть результат'))
    await screen.findByRole('heading', { name: 'Результат модуля' }); checkModule()
    expect(screen.queryByText('Можно продолжить обучение.')).toBeNull()
  })
})

it.each([['en', 'Test result', 'Readiness threshold not reached'], ['kz', 'Тест нәтижесі', 'Дайындық шегіне жетпеді']])('translates both results in %s', (locale, testLabel, moduleLabel) => {
  localStorage.setItem('ai-edu-locale', locale)
  mount(<I18nProvider><AttemptSummary attempt={{ percent: 80, passed: true, adaptive_result: adaptive } as Attempt}/></I18nProvider>)
  expect(screen.getByText(new RegExp(testLabel))).toBeTruthy(); expect(screen.getByText(moduleLabel)).toBeTruthy()
})
