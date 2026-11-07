/* AI Orchestrator интерфейса (ТЗ, п. 26, 35). Все запросы к языковым моделям идут через сервер:
   ключи API хранятся только там (раздел «Администрирование → Модели ИИ»). Если модель не подключена
   или недоступна, работа продолжается в демо-режиме — шаблонный генератор в браузере. */
import { LabApiError, labApi, labBlob, type LiteratureResult } from './api'
import { DemoGenerator } from './core/demoGenerator'
import type { ChatMessage, GenerationResult, Inputs, WorkModule } from './core/types'
import { Lab } from './store'

export const SERVICE_ROUTES: Record<string, string> = {
  llm: 'Большая языковая модель (генерация текста)',
  'llm+tts': 'LLM + синтез речи (озвучка)',
  'llm+image': 'LLM + промпты для генерации изображений',
  'llm+search': 'LLM + поиск публикаций (OpenAlex, Crossref, Semantic Scholar)',
  'llm+chat': 'LLM в режиме диалога (учебный ассистент)',
  evaluation: 'LLM / правила в режиме экспертизы',
}

type ServerText = { text: string; provider: string; model: string; ms: number }

async function serverText(body: { prompt?: string; messages?: ChatMessage[]; system?: string; kind: string }): Promise<ServerText | { notConfigured: true }> {
  if (!Lab.aiReady()) return { notConfigured: true } // модель не подключена — сразу демо-режим, без лишнего запроса
  try {
    return await labApi<ServerText>('ai/generate/', 'POST', body)
  } catch (e) {
    if (e instanceof LabApiError && e.status === 409) return { notConfigured: true }
    throw e
  }
}

export const Orchestrator = {
  async generate(mod: WorkModule, inputs: Inputs, prompt: string): Promise<GenerationResult> {
    const t0 = Date.now()
    let error: string | null = null
    try {
      const r = await serverText({ prompt, kind: 'generate' })
      if (!('notConfigured' in r)) return { text: r.text, provider: r.provider, model: r.model, ms: r.ms || Date.now() - t0, error: null }
    } catch (e) { error = (e as Error).message }
    await new Promise(r => setTimeout(r, 300 + Math.random() * 300))
    return { text: DemoGenerator.generate(mod, inputs, prompt), provider: 'demo', model: 'шаблонный генератор', ms: Date.now() - t0, error }
  },

  async chat(inputs: Inputs, passport: string, history: ChatMessage[]): Promise<string> {
    const system = 'Ты — учебный AI-ассистент. Следуй паспорту ассистента и отвечай только в его рамках.\n\n' + passport +
      (inputs.knowledge ? '\n\nБАЗА ЗНАНИЙ (используй в первую очередь):\n' + inputs.knowledge : '')
    try {
      const r = await serverText({ messages: history.slice(-12), system, kind: 'chat' })
      if (!('notConfigured' in r)) return r.text
      return DemoGenerator.chatReply(inputs, history)
    } catch (e) {
      return DemoGenerator.chatReply(inputs, history) + `\n\n_(${(e as Error).message})_`
    }
  },

  async expertOpinion(text: string, inputs: Inputs): Promise<string | null> {
    const prompt = `Выступи как эксперт-методист. Оцени учебный материал по теме «${inputs.topic || ''}» для аудитории «${inputs.audience || ''}». ` +
      'Дай краткое экспертное заключение: 3 сильные стороны, 3 недостатка, возможные фактические ошибки и галлюцинации, 3 конкретные рекомендации. Ответ в Markdown, до 250 слов.\n\nМАТЕРИАЛ:\n' + String(text).slice(0, 12000)
    const r = await serverText({ prompt, kind: 'expert', system: 'Ты — строгий и доброжелательный эксперт по качеству учебных материалов.' })
    return 'notConfigured' in r ? null : r.text
  },

  async searchLiterature(q: string, sources: string[], limit = 8): Promise<LiteratureResult> {
    const params = new URLSearchParams({ q, sources: sources.join(','), limit: String(limit) })
    return labApi<LiteratureResult>(`literature/?${params}`)
  },

  /** Озвучка: нейросетевой голос сервера (OpenAI TTS / ElevenLabs) или null, если он не подключён */
  async synthesize(text: string): Promise<Blob | null> {
    if (!Lab.ttsReady()) return null
    const clean = String(text).replace(/[#*|`>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    return (await labBlob('ai/tts/', 'POST', { text: clean })).blob
  },

  speak(text: string, language?: string): boolean {
    if (!globalThis.speechSynthesis) return false
    globalThis.speechSynthesis.cancel()
    const u = new globalThis.SpeechSynthesisUtterance(String(text).replace(/[#*|`>]/g, ' ').slice(0, 6000))
    u.lang = language === 'Казахский' ? 'kk-KZ' : language === 'Английский' ? 'en-US' : 'ru-RU'
    globalThis.speechSynthesis.speak(u)
    return true
  },
  stopSpeaking() { globalThis.speechSynthesis?.cancel() },
}
