import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealTimeVADOptions } from '@ricky0123/vad-web'
import { useVoiceConversation } from './useVoiceConversation'

const fake = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), destroy: vi.fn() }))
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: fake.create }, utils: { encodeWAV: () => new ArrayBuffer(100) } }))
let callbacks: Partial<RealTimeVADOptions>
let stopTrack: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  document.cookie = 'csrftoken=test'
  stopTrack = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack, addEventListener: vi.fn() }] }) } })
  fake.start.mockResolvedValue(undefined); fake.destroy.mockResolvedValue(undefined)
  fake.create.mockImplementation(async options => { callbacks = options; return { start: fake.start, destroy: fake.destroy } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const options = () => ({ contextType: 'item' as const, contextId: 'lesson-a', onInterrupt: vi.fn(), onQuestion: vi.fn(), onError: vi.fn() })

describe('continuous voice conversation', () => {
  it('automatically submits speech, stays listening and interrupts on real speech only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: 'Объясните оценивание.' }))
    vi.stubGlobal('fetch', fetchMock)
    const config = options()
    const view = renderHook(() => useVoiceConversation(config))
    await act(() => view.result.current.start())
    expect(view.result.current.enabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => { callbacks.onSpeechStart?.(); callbacks.onVADMisfire?.() })
    expect(config.onInterrupt).not.toHaveBeenCalled()
    act(() => { callbacks.onSpeechRealStart?.(); callbacks.onSpeechEnd?.(new Float32Array(16000)) })
    await waitFor(() => expect(config.onQuestion).toHaveBeenCalledWith('Объясните оценивание.'))
    expect(config.onInterrupt).toHaveBeenCalledOnce()
    expect(view.result.current.enabled).toBe(true)
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect(form.get('context_id')).toBe('lesson-a')
    expect((form.get('file') as Blob).type).toBe('audio/wav')
    expect(callbacks.baseAssetPath).toBe('/voice-assets/')
    act(() => view.result.current.stop())
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(fake.destroy).toHaveBeenCalledOnce()
  })
  it('discards stale transcription when a new utterance interrupts it', async () => {
    const resolvers: ((response: Response) => void)[] = []
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => resolvers.push(resolve)))
    vi.stubGlobal('fetch', fetchMock)
    const config = options()
    const view = renderHook(() => useVoiceConversation(config))
    await act(() => view.result.current.start())
    act(() => { callbacks.onSpeechRealStart?.(); callbacks.onSpeechEnd?.(new Float32Array(16000)) })
    act(() => { callbacks.onSpeechRealStart?.(); callbacks.onSpeechEnd?.(new Float32Array(16000)) })
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => { resolvers[0](Response.json({ text: 'Старое' })); resolvers[1](Response.json({ text: 'Новое' })) })
    expect(config.onQuestion).toHaveBeenCalledExactlyOnceWith('Новое')
  })
  it('cancels transcription and microphone when leaving the lecture', async () => {
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(r => { resolve = r }))
    vi.stubGlobal('fetch', fetchMock)
    const config = options()
    const view = renderHook(() => useVoiceConversation(config))
    await act(() => view.result.current.start())
    act(() => { callbacks.onSpeechRealStart?.(); callbacks.onSpeechEnd?.(new Float32Array(16000)) })
    view.unmount()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect(stopTrack).toHaveBeenCalledOnce()
    await act(async () => resolve(Response.json({ text: 'Поздний ответ' })))
    expect(config.onQuestion).not.toHaveBeenCalled()
  })
  it('releases a microphone granted after the conversation was cancelled', async () => {
    let grant!: (stream: MediaStream) => void
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(resolve => { grant = resolve }))
    const view = renderHook(() => useVoiceConversation(options()))
    let pending!: Promise<void>
    act(() => { pending = view.result.current.start() })
    act(() => view.result.current.stop())
    await act(async () => { grant({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream); await pending })
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(fake.create).not.toHaveBeenCalled()
    expect(view.result.current.enabled).toBe(false)
  })
  it('handles permission refusal without sending audio', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'))
    const config = options()
    const view = renderHook(() => useVoiceConversation(config))
    await act(() => view.result.current.start())
    expect(view.result.current.starting).toBe(false)
    expect(view.result.current.enabled).toBe(false)
    expect(config.onError).toHaveBeenCalledOnce()
  })
})
