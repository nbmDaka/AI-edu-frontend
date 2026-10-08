import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTutorMessage } from './client'

const input = { context_type: 'lesson' as const, context_id: 'lecture1', session_id: 'test-session', messages: [{ role: 'user' as const, content: 'Вопрос' }] }
afterEach(() => vi.unstubAllGlobals())

function streamResponse(text: string, step = 1) {
  const bytes = new TextEncoder().encode(text)
  return new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += step) controller.enqueue(bytes.slice(index, index + step))
    controller.close()
  } }), { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('tutor stream transport', () => {
  it('decodes fragmented Cyrillic UTF-8 and CRLF event boundaries', async () => {
    document.cookie = 'csrftoken=test'
    const fetchMock = vi.fn().mockResolvedValue(streamResponse('event: chunk\r\ndata: {"text":"Привет"}\r\n\r\nevent: done\r\ndata: {"sources":[]}\r\n\r\n'))
    vi.stubGlobal('fetch', fetchMock)
    const events = vi.fn()
    await sendTutorMessage(input, new AbortController().signal, events)
    expect(events).toHaveBeenCalledWith('chunk', { text: 'Привет' })
    expect(events).toHaveBeenCalledWith('done', { sources: [] })
    const options = fetchMock.mock.calls[0][1]
    expect(options.credentials).toBe('include')
    expect(options.headers['X-CSRFToken']).toBe('test')
    expect(JSON.parse(options.body).context_id).toBe('lecture1')
    expect(options.headers['X-API-Key']).toBeUndefined()
  })
  it('reports an interrupted stream instead of claiming completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse('event: chunk\ndata: {"text":"Часть"}\n\n')))
    await expect(sendTutorMessage(input, new AbortController().signal, vi.fn())).rejects.toThrow('Связь с тьютором прервалась')
  })
  it('handles service errors carried inside an HTTP 200 stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse('event: error\ndata: {"error":"Ошибка генерации"}\n\n', 7)))
    await expect(sendTutorMessage(input, new AbortController().signal, vi.fn())).rejects.toThrow('Ошибка генерации')
  })
  it('shows backend errors on authentication and quota failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail: 'Лимит исчерпан' }, { status: 429 })))
    await expect(sendTutorMessage(input, new AbortController().signal, vi.fn())).rejects.toThrow('Лимит исчерпан')
  })
  it('reads the platform nested error envelope for avatar availability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'error', detail: { detail: 'Кевин завершает предыдущий ответ.' } } }, { status: 429 })))
    await expect(sendTutorMessage(input, new AbortController().signal, vi.fn())).rejects.toThrow('Кевин завершает предыдущий ответ.')
  })
  it('forwards incremental neural packets and skips SSE keepalive comments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(': keepalive\n\nevent: avatar\ndata: {"kind":"segment","pcm":"AAA=","offset":0,"frames":[{"t":0,"weights":[0.1]}]}\n\nevent: done\ndata: {}\n\n', 5)))
    const events = vi.fn()
    await sendTutorMessage({ ...input, avatar: true }, new AbortController().signal, events)
    expect(events).toHaveBeenCalledWith('avatar', expect.objectContaining({ kind: 'segment', frames: [{ t: 0, weights: [.1] }] }))
    expect(events).toHaveBeenCalledTimes(2)
  })
})
