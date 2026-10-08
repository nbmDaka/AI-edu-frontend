import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TutorPanel } from './TutorPanel'
import { sendTutorMessage } from './client'

vi.mock('./client', () => ({ sendTutorMessage: vi.fn() }))
const transport = vi.mocked(sendTutorMessage)
beforeEach(() => { sessionStorage.clear(); transport.mockReset() })
afterEach(cleanup)

function panel(lessonId = 'lesson-1', userId = 1) {
  const client = new QueryClient()
  client.setQueryData(['me'], { id: userId })
  return <QueryClientProvider client={client}><TutorPanel key={lessonId} contextType="lesson" contextId={lessonId} lessonTitle={`Лекция ${lessonId}`}/></QueryClientProvider>
}

describe('lecture tutor', () => {
  it('sends the active lesson and displays streamed output without empty answer bubbles', async () => {
    transport.mockImplementation(async (_, __, onEvent) => { onEvent('chunk', { text: 'append добавляет элемент.' }); onEvent('done', { sources: [] }) })
    render(panel())
    fireEvent.change(screen.getByRole('textbox', { name: 'Вопрос тьютору' }), { target: { value: 'Что делает append?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить вопрос' }))
    await screen.findByText('append добавляет элемент.')
    expect(transport.mock.calls[0][0].context_id).toBe('lesson-1')
    expect(transport.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Что делает append?' }])
    await waitFor(() => expect(screen.queryByText('Тьютор отвечает...')).toBeNull())
  })
  it('starts a separate conversation when the lecture changes and restores its own history', async () => {
    transport.mockImplementation(async (_, __, onEvent) => { onEvent('chunk', { text: 'Ответ по первой лекции' }); onEvent('done', {}) })
    const view = render(panel())
    fireEvent.click(screen.getByRole('button', { name: 'Пример' }))
    await screen.findByText('Ответ по первой лекции')
    view.rerender(panel('lesson-2'))
    expect(screen.queryByText('Ответ по первой лекции')).toBeNull()
    view.rerender(panel('lesson-1'))
    expect(screen.getByText('Ответ по первой лекции')).toBeTruthy()
    view.rerender(panel('lesson-1', 2))
    expect(screen.queryByText('Ответ по первой лекции')).toBeNull()
  })
  it('cancels an in-flight response when navigating to another lecture', async () => {
    let activeSignal: AbortSignal | undefined
    transport.mockImplementation(async (_, signal) => {
      activeSignal = signal
      await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    const view = render(panel())
    fireEvent.click(screen.getByRole('button', { name: 'Пример' }))
    await screen.findByRole('button', { name: 'Остановить ответ' })
    view.rerender(panel('lesson-2'))
    expect(activeSignal?.aborted).toBe(true)
    expect(screen.queryByText('Тьютор отвечает...')).toBeNull()
  })
  it('clears the chat and creates a new upstream session', async () => {
    transport.mockImplementation(async (_, __, onEvent) => { onEvent('chunk', { text: 'Ответ' }); onEvent('done', {}) })
    render(panel())
    fireEvent.click(screen.getByRole('button', { name: 'Пример' }))
    await screen.findByText('Ответ')
    const firstSession = transport.mock.calls[0][0].session_id
    await waitFor(() => expect(screen.queryByText('Тьютор отвечает...')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Очистить диалог' }))
    expect(screen.queryByText('Ответ')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Пример' }))
    await screen.findByText('Ответ')
    expect(transport.mock.calls[1][0].session_id).not.toBe(firstSession)
  })
})
