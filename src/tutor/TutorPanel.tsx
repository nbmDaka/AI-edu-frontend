import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Copy, LoaderCircle, Mic, Send, Sparkles, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '../api'
import { useI18n } from '../i18n'
import { sendTutorMessage, type TutorMessage, type TutorSource } from './client'
import './tutor.css'
import { useTutorVoice } from './useTutorVoice'

type Message = TutorMessage & { id: string; sources?: TutorSource[]; interrupted?: boolean }
type Conversation = { sessionId: string; messages: Message[] }

function loadConversation(key: string | null): Conversation {
  try {
    const saved = key ? JSON.parse(sessionStorage.getItem(key) ?? 'null') : null
    if (saved && typeof saved.sessionId === 'string' && Array.isArray(saved.messages)) {
      return { sessionId: saved.sessionId, messages: saved.messages.filter((m: Message) =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && typeof m.id === 'string').slice(-50) }
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
  return { sessionId: crypto.randomUUID(), messages: [] }
}

export function TutorPanel({ contextType, contextId, lessonTitle }: { contextType: 'lesson' | 'item'; contextId: string; lessonTitle: string }) {
  const queryClient = useQueryClient()
  const userId = queryClient.getQueryData<User>(['me'])?.id
  const storageKey = userId ? `ai-edu:tutor:${userId}:${contextType}:${contextId}` : null
  return <TutorConversation key={storageKey ?? `${contextType}:${contextId}`} storageKey={storageKey} contextType={contextType} contextId={contextId} lessonTitle={lessonTitle}/>
}

function TutorConversation({ storageKey, contextType, contextId, lessonTitle }: { storageKey: string | null; contextType: 'lesson' | 'item'; contextId: string; lessonTitle: string }) {
  const { t, locale } = useI18n()
  const [conversation, setConversation] = useState(() => loadConversation(storageKey))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const nearBottom = useRef(true)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const voice = useTutorVoice(contextType, contextId, locale, text => { setDraft(prev => prev ? `${prev} ${text}` : text); inputRef.current?.focus() }, setError)

  useEffect(() => {
    try { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(conversation)) } catch { /* Continue without persistence. */ }
  }, [storageKey, conversation])
  useEffect(() => {
    const node = listRef.current
    if (node && nearBottom.current) node.scrollTop = node.scrollHeight
  }, [conversation, busy, error])
  useEffect(() => () => {
    abortRef.current?.abort()
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  const submit = async (text: string) => {
    text = text.trim()
    if (!text || busy || voice.recording || voice.transcribing || voice.requestingMic) return
    const controller = new AbortController()
    abortRef.current = controller
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const answerId = crypto.randomUUID()
    const history = [...conversation.messages.filter(m => !m.interrupted), userMessage]
    setConversation(prev => ({ ...prev, messages: [...prev.messages, userMessage] }))
    setDraft(''); setBusy(true); setError(''); nearBottom.current = true
    const timeout = setTimeout(() => controller.abort('timeout'), 120000)
    let answerText = ''
    try {
      await sendTutorMessage({ context_type: contextType, context_id: contextId, session_id: conversation.sessionId,
        messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }, controller.signal, (event, data) => {
        if (controller.signal.aborted) return
        if (event === 'chunk' && data.text) {
          answerText += data.text
          setConversation(prev => {
            const answer = prev.messages.find(m => m.id === answerId)
            return { ...prev, messages: answer ? prev.messages.map(m => m.id === answerId ? { ...m, content: m.content + data.text } : m)
              : [...prev.messages, { id: answerId, role: 'assistant', content: data.text! }] }
          })
        }
        if (event === 'done') setConversation(prev => ({ ...prev, messages: prev.messages.map(m => m.id === answerId ? { ...m, sources: data.sources } : m) }))
      })
      if (!controller.signal.aborted && autoSpeak && locale === 'ru' && answerText) void voice.speak(answerId, answerText)
    } catch (cause) {
      setConversation(prev => ({ ...prev, messages: prev.messages.map(m => m.id === answerId ? { ...m, interrupted: true } : m) }))
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setError(controller.signal.reason === 'timeout' ? t('Тьютор не успел ответить. Повторите запрос.') : (cause as Error).message)
      }
    } finally {
      clearTimeout(timeout)
      if (abortRef.current === controller) { abortRef.current = null; setBusy(false) }
    }
  }

  const clear = () => {
    abortRef.current?.abort()
    abortRef.current = null
    voice.cancel()
    setBusy(false); setError(''); setDraft('')
    setConversation({ sessionId: crypto.randomUUID(), messages: [] })
  }
  const copy = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(message.id)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1800)
    } catch { setError(t('Не удалось скопировать ответ.')) }
  }
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(draft) }

  return <section className="tutor-panel" aria-label={t('Диалог с тьютором')}>
    <header className="tutor-panel-header"><div className="tutor-heading"><Sparkles size={18}/><h2>{t('ИИ-тьютор')}</h2></div>
      <div className="tutor-header-actions"><button type="button" className="icon-button" title={t(locale !== 'ru' ? 'Озвучка доступна на русском' : 'Автоматическая озвучка')} aria-label={t('Автоматическая озвучка')} aria-pressed={autoSpeak} disabled={locale !== 'ru'} onClick={() => { if (!autoSpeak) voice.unlockAudio(); else voice.stopSpeech(); setAutoSpeak(!autoSpeak) }}>{autoSpeak ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>
      <button type="button" className="icon-button" title={t('Очистить диалог')} aria-label={t('Очистить диалог')} disabled={!conversation.messages.length && !busy} onClick={clear}><Trash2 size={16}/></button></div>
    </header>
    <p className="tutor-lesson" title={lessonTitle}>{lessonTitle}</p>
    <div className="tutor-messages" ref={listRef} role="log" aria-live="polite" aria-busy={busy} onScroll={() => {
      const node = listRef.current
      if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70
    }}>
      {!conversation.messages.length && <div className="tutor-empty"><BookHint/><h3>{t('Что разберём?')}</h3>
        <div className="tutor-suggestions">{[['Кратко о лекции', 'Кратко объясни основные идеи этой лекции.'], ['Объяснить проще', 'Объясни эту лекцию простыми словами.'], ['Пример', 'Приведи практический пример по теме этой лекции.']].map(([label, prompt]) =>
          <button type="button" key={label} onClick={() => void submit(t(prompt))}>{t(label)}</button>)}</div>
      </div>}
      {conversation.messages.map(message => <div className={`tutor-message ${message.role}`} key={message.id}>
        <span className="tutor-message-author">{t(message.role === 'user' ? 'Вы' : 'Тьютор')}</span>
        <div className="tutor-message-content"><ReactMarkdown skipHtml>{message.content}</ReactMarkdown></div>
        {message.interrupted && <small className="tutor-interrupted">{t('Ответ прерван')}</small>}
        {message.role === 'assistant' && <div className="tutor-message-tools">
          <button type="button" className="icon-button" title={t(copied === message.id ? 'Скопировано' : 'Копировать ответ')} aria-label={t('Копировать ответ')} onClick={() => void copy(message)}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>}</button>
          {!message.interrupted && <button type="button" className="icon-button" disabled={locale !== 'ru'} title={t(locale !== 'ru' ? 'Озвучка доступна на русском' : voice.speakingId === message.id ? 'Остановить озвучку' : 'Озвучить ответ')} aria-label={t(voice.speakingId === message.id || voice.loadingSpeechId === message.id ? 'Остановить озвучку' : 'Озвучить ответ')} onClick={() => void voice.speak(message.id, message.content)}>{voice.loadingSpeechId === message.id ? <LoaderCircle className="tutor-spinner" size={14}/> : voice.speakingId === message.id ? <Square size={14}/> : <Volume2 size={14}/>}</button>}
          {!!message.sources?.length && <details className="tutor-sources"><summary>{t('Материал лекции')}</summary>{message.sources.map((source, index) => <div key={`${source.chunk_id}-${index}`}><strong>{source.label}</strong><p>{source.snippet ?? source.text ?? ''}</p></div>)}</details>}
        </div>}
      </div>)}
      {busy && <div className="tutor-thinking" role="status"><span className="tutor-pulse"/>{t('Тьютор отвечает...')}</div>}
    </div>
    {error && <div className="tutor-error" role="alert">{error}<button type="button" onClick={() => {
      const last = [...conversation.messages].reverse().find(m => m.role === 'user')
      if (last) { setDraft(last.content); inputRef.current?.focus() }
    }}>{t('Повторить вопрос')}</button></div>}
    {(voice.recording || voice.transcribing || voice.requestingMic) && <div className="tutor-voice-status" role="status">{t(voice.recording ? 'Идёт запись...' : voice.transcribing ? 'Распознаю речь...' : 'Открываю микрофон...')}</div>}
    <form className="tutor-composer" onSubmit={onSubmit}>
      <textarea ref={inputRef} rows={2} maxLength={4000} value={draft} placeholder={t('Спросите по лекции...')} aria-label={t('Вопрос тьютору')} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(draft) }
      }}/>
      <div className="tutor-composer-actions"><button type="button" className={`tutor-mic ${voice.recording ? 'recording' : ''}`} title={t(voice.recording ? 'Закончить запись' : 'Записать вопрос')} aria-label={t(voice.recording ? 'Закончить запись' : 'Записать вопрос')} aria-pressed={voice.recording} disabled={busy || voice.transcribing || voice.requestingMic} onClick={() => void voice.toggleRecording()}>{voice.recording ? <Square size={16}/> : voice.transcribing || voice.requestingMic ? <LoaderCircle className="tutor-spinner" size={16}/> : <Mic size={17}/>}</button>
      {busy ? <button type="button" className="tutor-send stopping" title={t('Остановить ответ')} aria-label={t('Остановить ответ')} onClick={() => abortRef.current?.abort()}><Square size={16}/></button>
        : <button type="submit" className="tutor-send" title={t('Отправить вопрос')} aria-label={t('Отправить вопрос')} disabled={!draft.trim() || voice.recording || voice.transcribing}><Send size={17}/></button>}</div>
    </form>
  </section>
}

function BookHint() { return <Sparkles className="tutor-empty-icon" size={28} aria-hidden="true"/> }
