import { useEffect, useRef, useState } from 'react'
import { Square } from 'lucide-react'

export type AvatarPacket = {
  kind: 'start' | 'segment' | 'end'
  engine?: string
  pcm?: string
  offset?: number
  sampleRate?: number
  names?: string[]
  frames?: { t: number; weights: number[] }[]
  duration?: number
}

export const localAvatarEnabled = import.meta.env.VITE_LOCAL_AVATAR === '1' && ['localhost', '127.0.0.1'].includes(location.hostname)

export function useKevinAvatar(onError: (message: string) => void, onStop: () => void) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const responseGesture = useRef<'wave' | 'explain'>('explain')
  const origin = `http://${location.hostname}:5184`
  const errorHandler = useRef(onError)
  errorHandler.current = onError
  const post = (type: string, data?: AvatarPacket) => iframe.current?.contentWindow?.postMessage({ type, data }, origin)
  useEffect(() => {
    if (!localAvatarEnabled) return
    const handle = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== iframe.current?.contentWindow) return
      if (event.data?.type === 'kevin-ready') setReady(true)
      if (event.data?.type === 'kevin-idle') setActive(false)
      if (event.data?.type === 'kevin-error') errorHandler.current('Не удалось воспроизвести поток аватара.')
    }
    addEventListener('message', handle)
    return () => removeEventListener('message', handle)
  }, [origin])
  return {
    ready,
    active,
    unlock: () => post('kevin-unlock'),
    prepareResponse: (question: string) => {
      responseGesture.current = /^(?:\s*)(?:привет|здравств|салам|доброе утро|добрый день|добрый вечер)/i.test(question) ? 'wave' : 'explain'
    },
    behavior: (state: 'idle' | 'listening' | 'thinking') => iframe.current?.contentWindow?.postMessage({ type: 'kevin-state', state }, origin),
    accept: (data: AvatarPacket) => {
      if (data.kind === 'start') {
        setActive(true)
        iframe.current?.contentWindow?.postMessage({ type: 'kevin-gesture', name: responseGesture.current }, origin)
      }
      post('kevin-stream', data)
    },
    stop: () => { setActive(false); post('kevin-stop') },
    portrait: localAvatarEnabled ? <div className="tutor-avatar">
      <iframe ref={iframe} src={`${origin}/?embed=1&parent=${encodeURIComponent(location.origin)}`} title="Кевин" allow="autoplay"/>
      <span className="tutor-avatar-name">Кевин</span>
      {active && <button className="icon-button tutor-avatar-stop" type="button" title="Остановить Кевина" aria-label="Остановить Кевина" onClick={() => { setActive(false); post('kevin-stop'); onStop() }}><Square size={14}/></button>}
      {!ready && <span className="tutor-avatar-loading" role="status">Загрузка Кевина...</span>}
    </div> : null,
  }
}
