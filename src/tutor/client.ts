export type TutorMessage = { role: 'user' | 'assistant'; content: string }
export type TutorSource = { chunk_id: number; label: string; snippet?: string; text?: string }
export type TutorEvent = { text?: string; error?: string; message?: string; sources?: TutorSource[]; locateSnippet?: string | null }

export async function sendTutorMessage(
  input: { context_type: 'lesson' | 'item'; context_id: string; session_id: string; messages: TutorMessage[] },
  signal: AbortSignal,
  onEvent: (event: string, data: TutorEvent) => void,
) {
  const csrf = () => document.cookie.split('; ').find(value => value.startsWith('csrftoken='))?.slice(10) ?? ''
  if (!csrf()) {
    const tokenResponse = await fetch('/api/v1/csrf/', { credentials: 'include', signal })
    if (!tokenResponse.ok) throw new Error('Не удалось подтвердить вход. Обновите страницу.')
  }
  const response = await fetch('/api/v1/tutor/chat/', {
    method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf()) },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const detail = data?.detail ?? data?.error
    throw new Error(typeof detail === 'string' ? detail : response.status === 403 ? 'Войдите в аккаунт, чтобы продолжить.' : 'Не удалось получить ответ тьютора. Попробуйте ещё раз.')
  }
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
    throw new Error('Сервис тьютора вернул некорректный ответ.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  const dispatch = (frame: string) => {
    let event = 'message'
    const lines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) lines.push(line.slice(5).trimStart())
    }
    if (!lines.length) return
    const data = JSON.parse(lines.join('\n')) as TutorEvent
    if (event === 'error') throw new Error(data.error ?? data.message ?? 'Не удалось завершить ответ.')
    if (event === 'done') completed = true
    onEvent(event, data)
  }
  const flush = () => {
    buffer = buffer.replace(/\r\n/g, '\n')
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      dispatch(frame)
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      flush()
    }
    buffer += decoder.decode()
    flush()
    if (buffer.trim()) dispatch(buffer)
    if (!completed) throw new Error('Связь с тьютором прервалась. Повторите запрос.')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
