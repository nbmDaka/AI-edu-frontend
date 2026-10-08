import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useTutorVoice } from './useTutorVoice'

const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null, buffer: null }
const resume = vi.fn().mockResolvedValue(undefined)
const close = vi.fn().mockResolvedValue(undefined)
class TestAudioContext {
  destination = {}
  resume = resume
  close = close
  decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 })
  createBufferSource = () => source
}

class TestRecorder {
  static current: TestRecorder
  static isTypeSupported = () => true
  mimeType = 'audio/webm'
  state = 'inactive'
  onstop: (() => void) | null = null
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  constructor() { TestRecorder.current = this }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.cookie = 'csrftoken=test'
  vi.stubGlobal('AudioContext', TestAudioContext)
  vi.stubGlobal('MediaRecorder', TestRecorder)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('tutor voice lifecycle', () => {
  it('plays server audio and stops it when leaving the lecture', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/wav' } }))
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => useTutorVoice('item', 'lesson-a', 'ru', vi.fn(), vi.fn()))
    await act(() => view.result.current.speak('answer-1', 'Ответ'))
    expect(source.start).toHaveBeenCalledOnce()
    expect(view.result.current.speakingId).toBe('answer-1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ context_id: 'lesson-a', text: 'Ответ' })
    view.unmount()
    expect(source.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
  it('puts the recognized question in the editor and releases the microphone', async () => {
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } })
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: 'Что делает append?' }))
    vi.stubGlobal('fetch', fetchMock)
    const onTranscript = vi.fn()
    const view = renderHook(() => useTutorVoice('item', 'lesson-a', 'ru', onTranscript, vi.fn()))
    await act(() => view.result.current.toggleRecording())
    expect(view.result.current.recording).toBe(true)
    await act(() => view.result.current.toggleRecording())
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Что делает append?'))
    expect(stopTrack).toHaveBeenCalledOnce()
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect(form.get('context_id')).toBe('lesson-a')
    expect(form.get('file')).toBeInstanceOf(Blob)
  })
  it('does not transcribe a recording after changing the lecture', async () => {
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const view = renderHook(() => useTutorVoice('item', 'lesson-a', 'ru', vi.fn(), vi.fn()))
    await act(() => view.result.current.toggleRecording())
    view.unmount()
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
