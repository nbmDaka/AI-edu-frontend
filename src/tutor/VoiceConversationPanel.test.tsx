import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TutorPanel } from './TutorPanel'
import { sendTutorMessage } from './client'

const fake = vi.hoisted(() => ({ interrupt: () => {}, question: (_text: string) => {}, stop: vi.fn(), accept: vi.fn() }))
vi.mock('./client', () => ({ sendTutorMessage: vi.fn() }))
vi.mock('./useTutorVoice', () => ({ useTutorVoice: () => ({ recording: false, transcribing: false, requestingMic: false, speakingId: null, loadingSpeechId: null, stopSpeech: vi.fn(), unlockAudio: vi.fn(), cancel: vi.fn() }) }))
vi.mock('./KevinAvatar', () => ({ localAvatarEnabled: true, useKevinAvatar: () => ({ ready: true, active: false, portrait: null, unlock: vi.fn(), stop: fake.stop, accept: fake.accept, prepareResponse: vi.fn(), behavior: vi.fn() }) }))
vi.mock('./useVoiceConversation', () => ({ useVoiceConversation: (options: { onInterrupt: () => void; onQuestion: (text: string) => void }) => {
  fake.interrupt = options.onInterrupt; fake.question = options.onQuestion
  return { enabled: true, starting: false, hearing: false, transcribing: false, start: vi.fn(), stop: vi.fn() }
} }))
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear() })

describe('voice turns in the tutor panel', () => {
  it('submits automatically and an old aborted request cannot stop the next avatar stream', async () => {
    const transport = vi.mocked(sendTutorMessage)
    transport.mockImplementationOnce(async (_, signal, onEvent) => {
      onEvent('chunk', { text: 'Первый ответ' })
      await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    transport.mockImplementationOnce(async (_, __, onEvent) => {
      onEvent('chunk', { text: 'Второй ответ' })
      onEvent('avatar', { kind: 'start' } as never)
      await new Promise(() => {})
    })
    const client = new QueryClient()
    client.setQueryData(['me'], { id: 1 })
    render(<QueryClientProvider client={client}><TutorPanel contextType="item" contextId="lecture-a" lessonTitle="Оценивание"/></QueryClientProvider>)
    act(() => fake.question('Первый вопрос'))
    await screen.findByText('Первый ответ')
    act(() => { fake.interrupt(); fake.question('Второй вопрос') })
    const stops = fake.stop.mock.calls.length
    await screen.findByText('Второй ответ')
    await waitFor(() => expect(screen.getByText('Ответ прерван')).toBeTruthy())
    expect(transport.mock.calls[0][1].aborted).toBe(true)
    expect(transport.mock.calls[1][0]).toMatchObject({ context_id: 'lecture-a', avatar: true })
    expect(fake.accept).toHaveBeenCalledOnce()
    expect(fake.stop.mock.calls.length).toBe(stops)
  })
})
