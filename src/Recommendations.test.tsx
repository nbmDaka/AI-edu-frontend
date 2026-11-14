import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { api, apiAll, type AdaptiveResult, type LearningItem } from './api'
import { AdaptiveResultCard } from './AdaptiveLearning'
import { CompetencyMaterialsEditor } from './LearningItemEditorPage'
import { I18nProvider } from './i18n'

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
const clients: QueryClient[] = []
const result: AdaptiveResult = { readiness: 40, threshold: 60, module_passed: false, module_completed: false, theory: .5, practice: 1, errors: .5, competency: .3, competencies: { theory: .3 }, module_short_id: 'module', repeat_item_short_id: 'lecture', next_item_short_id: null,
  recommendations: { version: 1, reference_score: .5, fallback: null, groups: [{ competency: 'theory', score: .3, reason: 'below_reference', materials: [
    { item_id: 1, short_id: 'old', module_id: 1, title: 'Saved lecture title', type: 'LECTURE', available_item_short_id: 'current' },
    { item_id: 2, short_id: 'closed', module_id: 1, title: 'Closed practice', type: 'PRACTICE', available_item_short_id: null },
  ] }] } }
function mount(element: React.ReactNode) {
  vi.mocked(apiAll).mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter><I18nProvider>{element}</I18nProvider></MemoryRouter></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); localStorage.clear() })

it('uses current server permission for links and saved evidence in history', async () => {
  mount(<AdaptiveResultCard result={result} historical/>)
  expect(screen.getByRole('link', { name: 'Saved lecture title' }).getAttribute('href')).toBe('/items/current')
  expect(screen.queryByRole('link', { name: /Closed practice/ })).toBeNull()
  expect(document.querySelector('a[href="/items/closed"]')).toBeNull()
  expect(screen.getByText('Материал сейчас недоступен', { exact: false })).toBeTruthy()
  expect(screen.getByText(/30% · ниже ориентира 50%/)).toBeTruthy()
  await screen.findByText('Материалы для повторения сейчас недоступны.')
})

it('shows honest fallback for old attempts and missing mappings', () => {
  mount(<AdaptiveResultCard result={{ ...result, recommendations: undefined }}/>)
  expect(screen.getByText(/Для этой попытки адресные рекомендации не сохранялись/)).toBeTruthy()
})

it('keeps the displayed reason precise immediately below the reference', () => {
  mount(<AdaptiveResultCard result={{ ...result, recommendations: { ...result.recommendations!, groups: [{ ...result.recommendations!.groups[0], score: .4999 }] } }}/>)
  expect(screen.getByText(/49.99% · ниже ориентира 50%/)).toBeTruthy()
})

it.each([['en', 'Targeted recommendations', 'below the reference'], ['kz', 'Мақсатты ұсыныстар', 'бағдардан төмен']])('translates recommendations in %s', (locale, heading, reason) => {
  localStorage.setItem('ai-edu-locale', locale)
  mount(<AdaptiveResultCard result={result}/>)
  expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
  expect(screen.getByText(new RegExp(reason))).toBeTruthy()
})

it('saves material competency mappings through the existing item API', async () => {
  vi.mocked(api).mockResolvedValue({ competency_keys: ['theory', 'application'] } as never)
  mount(<CompetencyMaterialsEditor item={{ short_id: 'lecture', competency_keys: [] } as unknown as LearningItem}/>)
  fireEvent.change(screen.getByLabelText('Ключи компетенций'), { target: { value: ' Theory \n\napplication' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить связи' }))
  await screen.findByText('Связи сохранены')
  expect(api).toHaveBeenCalledWith('items/lecture/', 'PATCH', { competency_keys: ['Theory', 'application'] })
  await waitFor(() => expect((screen.getByLabelText('Ключи компетенций') as HTMLTextAreaElement).value).toBe('theory\napplication'))
})
