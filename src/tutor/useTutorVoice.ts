import { useEffect, useRef, useState } from 'react'

async function voiceRequest(path: string, body: string | FormData, signal: AbortSignal) {
  const csrf = () => document.cookie.split('; ').find(value => value.startsWith('csrftoken='))?.slice(10) ?? ''
  if (!csrf()) await fetch('/api/v1/csrf/', { credentials: 'include', signal })
  const response = await fetch(`/api/v1/tutor/${path}/`, {
    method: 'POST', credentials: 'include', signal, body,
    headers: { 'X-CSRFToken': decodeURIComponent(csrf()), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Голосовой сервис недоступен. Попробуйте позже.')
  }
  return response
}

export function useTutorVoice(contextType: 'lesson' | 'item', contextId: string, language: string, onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [requestingMic, setRequestingMic] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [loadingSpeechId, setLoadingSpeechId] = useState<string | null>(null)
  const active = useRef(true)
  const micRequest = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const audioSource = useRef<AudioBufferSourceNode | null>(null)
  const speechAbort = useRef<AbortController | null>(null)
  const transcribeAbort = useRef<AbortController | null>(null)
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopSpeech = () => {
    speechAbort.current?.abort()
    if (audioSource.current) { audioSource.current.onended = null; audioSource.current.stop(); audioSource.current.disconnect(); audioSource.current = null }
    setSpeakingId(null); setLoadingSpeechId(null)
  }
  const unlockAudio = () => {
    if (!audioContext.current) audioContext.current = new AudioContext()
    void audioContext.current.resume()
  }
  const speak = async (id: string, text: string) => {
    const wasPlaying = speakingId === id || loadingSpeechId === id
    stopSpeech()
    if (wasPlaying) return
    const controller = new AbortController()
    speechAbort.current = controller
    setLoadingSpeechId(id)
    const timer = setTimeout(() => controller.abort('timeout'), 120000)
    try {
      unlockAudio()
      const response = await voiceRequest('speech', JSON.stringify({ context_type: contextType, context_id: contextId, text, language: 'ru' }), controller.signal)
      const bytes = await response.arrayBuffer()
      if (!active.current || controller.signal.aborted) return
      const ctx = audioContext.current!
      const buffer = await ctx.decodeAudioData(bytes)
      if (!active.current || controller.signal.aborted) return
      const source = ctx.createBufferSource()
      source.buffer = buffer; source.connect(ctx.destination)
      source.onended = () => { source.disconnect(); if (audioSource.current === source) { audioSource.current = null; if (active.current) setSpeakingId(null) } }
      audioSource.current = source
      setSpeakingId(id); source.start()
    } catch (error) { if (active.current && (!controller.signal.aborted || controller.signal.reason === 'timeout')) onError(controller.signal.reason === 'timeout' ? 'Сервис озвучки не успел ответить. Повторите запрос.' : (error as Error).message) }
    finally { clearTimeout(timer); if (active.current && speechAbort.current === controller) setLoadingSpeechId(null) }
  }
  const toggleRecording = async () => {
    if (recording) { recorder.current?.stop(); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Браузер не поддерживает запись. Используйте Chrome или Edge и HTTPS.'); return
    }
    stopSpeech(); setRequestingMic(true)
    const requestId = ++micRequest.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current || requestId !== micRequest.current) { stream.getTracks().forEach(track => track.stop()); return }
      micStream.current = stream
      const mime = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const capture = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorder.current = capture
      const chunks: Blob[] = []
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      capture.onstop = async () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current)
        stream.getTracks().forEach(track => track.stop()); micStream.current = null
        if (!active.current) return
        setRecording(false)
        const file = new Blob(chunks, { type: capture.mimeType || 'audio/webm' })
        if (!file.size) { onError('Запись пустая. Попробуйте ещё раз.'); return }
        if (file.size > 10 * 1024 * 1024) { onError('Запись слишком большая. Запишите более короткий вопрос.'); return }
        setTranscribing(true)
        const controller = new AbortController()
        transcribeAbort.current = controller
        const timeout = setTimeout(() => controller.abort('timeout'), 120000)
        try {
          const form = new FormData()
          form.set('file', file, 'speech'); form.set('language', language === 'kz' ? 'kk' : language)
          form.set('context_type', contextType); form.set('context_id', contextId)
          const response = await voiceRequest('transcribe', form, controller.signal)
          const result = await response.json()
          if (active.current && !controller.signal.aborted) {
            if (typeof result.text === 'string' && result.text.trim()) onTranscript(result.text.trim())
            else onError('Речь не распознана. Попробуйте ещё раз.')
          }
        } catch (error) { if (active.current && (!controller.signal.aborted || controller.signal.reason === 'timeout')) onError(controller.signal.reason === 'timeout' ? 'Распознавание заняло слишком много времени. Повторите запись.' : (error as Error).message) }
        finally { clearTimeout(timeout); if (active.current) setTranscribing(false) }
      }
      capture.start(); setRecording(true)
      recordingTimer.current = setTimeout(() => { if (capture.state === 'recording') capture.stop() }, 60000)
    } catch {
      micStream.current?.getTracks().forEach(track => track.stop()); micStream.current = null
      if (active.current) onError('Не удалось открыть микрофон. Проверьте разрешение в браузере.')
    } finally { if (active.current) setRequestingMic(false) }
  }

  const cancel = () => {
    micRequest.current++
    stopSpeech(); transcribeAbort.current?.abort()
    if (recordingTimer.current) clearTimeout(recordingTimer.current)
    if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; if (recorder.current.state === 'recording') recorder.current.stop() }
    micStream.current?.getTracks().forEach(track => track.stop()); micStream.current = null
    setRecording(false); setTranscribing(false); setRequestingMic(false)
  }

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      micRequest.current++
      speechAbort.current?.abort(); transcribeAbort.current?.abort()
      if (recordingTimer.current) clearTimeout(recordingTimer.current)
      if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; if (recorder.current.state === 'recording') recorder.current.stop() }
      micStream.current?.getTracks().forEach(track => track.stop())
      if (audioSource.current) { audioSource.current.onended = null; audioSource.current.stop(); audioSource.current = null }
      void audioContext.current?.close(); audioContext.current = null
    }
  }, [])
  return { recording, transcribing, requestingMic, speakingId, loadingSpeechId, stopSpeech, cancel, speak, unlockAudio, toggleRecording }
}
