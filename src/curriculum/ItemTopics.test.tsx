import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api, type LearningItem } from '../api'
import { ItemTopics } from './ItemTopics'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }))
const mockedApi = vi.mocked(api)
afterEach(cleanup)

const item = { id: 1, short_id: 'lec-1', module: 1, type: 'LECTURE', title: 'Лекция', description: '', position: 0, status: 'PUBLISHED',
  lesson: 1, lesson_short_id: 'l1', test: null, practice: null, competencies: ['Pandas'] } as LearningItem

it('adds, removes and saves the topics of a material', async () => {
  mockedApi.mockResolvedValue({ ...item, competencies: ['Корреляция'] } as never)
  render(<QueryClientProvider client={new QueryClient()}><ItemTopics item={item}/></QueryClientProvider>)
  expect((screen.getByRole('button', { name: 'Сохранить темы' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Новая тема' }), { target: { value: ' Корреляция ' } })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Новая тема' }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'Убрать тему Pandas' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить темы' }))
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('items/lec-1/', 'PATCH', { competencies: ['Корреляция'] }))
  expect(await screen.findByText('Темы сохранены')).toBeTruthy()
})
