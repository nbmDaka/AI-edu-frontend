import { useEffect, useRef, useState } from 'react'
import type { MicVAD } from '@ricky0123/vad-web'
import { voiceRequest } from './useTutorVoice'

type Options = {
  contextType: 'lesson' | 'item'
  contextId: string
  onInterrupt: () => void
  onQuestion: (text: string) => void
  onError: (message: string) => void
}

export function useVoiceConversation(options: Options) {
  const [enabled, setEnabled] = useState(false)
  const [starting, setStarting] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const callbacks = useRef(options)
  callbacks.current = options
  const mounted = useRef(true)
  const running = useRef(false)
  const epoch = useRef(0)
  const utterance = useRef(0)
  const detector = useRef<MicVAD | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const request = useRef<AbortController | null>(null)
  const durationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const release = () => {
    running.current = false
    epoch.current++
    utterance.current++
    request.current?.abort()
    if (durationTimer.current) clearTimeout(durationTimer.current)
    durationTimer.current = null
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    const vad = detector.current
    detector.current = null
    if (vad) void vad.destroy().catch(() => {})
  }
  const stop = () => {
    if (running.current) callbacks.current.onInterrupt()
    release()
    if (mounted.current) { setEnabled(false); setStarting(false); setHearing(false); setTranscribing(false) }
  }
  const start = async () => {
    if (running.current) return
    running.current = true
    const session = ++epoch.current
    const current = () => mounted.current && running.current && epoch.current === session
    setStarting(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Микрофон недоступен в этом браузере.')
      // Request permission directly from the button gesture; models load locally afterwards.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (!current()) { mic.getTracks().forEach(track => track.stop()); return }
      stream.current = mic
      mic.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (current()) { stop(); callbacks.current.onError('Микрофон отключён.') }
      }))
      const { MicVAD, utils } = await import('@ricky0123/vad-web')
      if (!current()) return
      const vad = await MicVAD.new({
        model: 'v5', startOnLoad: false,
        baseAssetPath: '/voice-assets/', onnxWASMBasePath: '/voice-assets/',
        ortConfig: ort => { ort.env.wasm.numThreads = 1 },
        getStream: async () => mic,
        positiveSpeechThreshold: 0.7, negativeSpeechThreshold: 0.4,
        redemptionMs: 900, preSpeechPadMs: 400, minSpeechMs: 350,
        onSpeechStart: () => { if (current()) setHearing(true) },
        onSpeechRealStart: () => {
          if (!current()) return
          utterance.current++
          request.current?.abort()
          setTranscribing(false)
          callbacks.current.onInterrupt()
          durationTimer.current = setTimeout(() => {
            if (current()) { stop(); callbacks.current.onError('Фраза длиннее 30 секунд. Включите разговор и задайте более короткий вопрос.') }
          }, 30000)
        },
        onVADMisfire: () => { if (current()) setHearing(false) },
        onSpeechEnd: audio => {
          if (!current()) return
          setHearing(false)
          if (durationTimer.current) clearTimeout(durationTimer.current)
          durationTimer.current = null
          const turn = utterance.current
          const controller = new AbortController()
          request.current = controller
          setTranscribing(true)
          const timeout = setTimeout(() => controller.abort('timeout'), 45000)
          const context = callbacks.current
          const form = new FormData()
          form.set('file', new Blob([utils.encodeWAV(audio)], { type: 'audio/wav' }), 'question.wav')
          form.set('language', 'ru'); form.set('context_type', context.contextType); form.set('context_id', context.contextId)
          void (async () => {
            try {
              const response = await voiceRequest('transcribe', form, controller.signal)
              const result = await response.json()
              if (!current() || turn !== utterance.current || controller.signal.aborted) return
              if (typeof result.text === 'string' && result.text.trim()) callbacks.current.onQuestion(result.text.trim())
              else callbacks.current.onError('Речь не распознана. Повторите вопрос.')
            } catch (error) {
              if (current() && turn === utterance.current && (!controller.signal.aborted || controller.signal.reason === 'timeout')) {
                callbacks.current.onError(controller.signal.reason === 'timeout' ? 'Распознавание заняло слишком много времени. Повторите вопрос.' : (error as Error).message)
              }
            } finally {
              clearTimeout(timeout)
              if (current() && request.current === controller) { request.current = null; setTranscribing(false) }
            }
          })()
        },
      })
      if (!current()) { await vad.destroy(); return }
      detector.current = vad
      await vad.start()
      if (current()) setEnabled(true)
    } catch {
      if (current()) { stop(); callbacks.current.onError('Не удалось включить разговор. Проверьте разрешение микрофона и загрузку голосовой модели.') }
    } finally { if (current()) setStarting(false) }
  }

  useEffect(() => {
    mounted.current = true
    const visibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', visibility)
    return () => { mounted.current = false; release(); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  return { enabled, starting, hearing, transcribing, start, stop }
}
