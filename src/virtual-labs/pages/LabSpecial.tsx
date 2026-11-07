/* Особые виджеты шага «Генерация»: слайды и PPTX, озвучка, поиск публикаций в трёх базах, чат с ассистентом,
   предпросмотр теста, сравнение генераций. */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, Play, Presentation, Search, Send, Square, Trash2 } from 'lucide-react'
import { labBlob, saveBlob, type Publication } from '../api'
import { Evaluation } from '../core/evaluation'
import type { Session, Version, WorkModule } from '../core/types'
import { useT } from '../i18n'
import { goStep, parseQuiz, saveEdit } from '../logic'
import { Orchestrator } from '../orchestrator'
import { Lab } from '../store'
import { Badge, Button, Markdown, Note, Spinner, scoreTone, useToast } from '../components/ui'
import { Quiz } from '../components/forms'

type Props = { m: WorkModule; s: Session; v: Version }

export function SpecialWidget(p: Props) {
  switch (p.m.special) {
    case 'slides': return <Slides {...p}/>
    case 'tts': return <Tts {...p}/>
    case 'research': return <Research {...p}/>
    case 'chat': return <Chat {...p}/>
    case 'quiz': return <QuizPreview {...p}/>
    case 'compare': return <Compare {...p}/>
    default: return null
  }
}

function sectionBody(text: string, key: string): string {
  const sec = Evaluation.splitSections(text).find(x => x.head.includes(key))
  return sec ? sec.body.trim() : ''
}

// ВР №5: макет слайдов и готовая презентация PowerPoint
export function parseSlides(text: string) {
  const re = /^###\s*Слайд\s*(\d+)\.?\s*(.*)$/gm
  const idx: { n: string; title: string; at: number; end: number }[] = []
  let mm: RegExpExecArray | null
  while ((mm = re.exec(text))) idx.push({ n: mm[1], title: mm[2], at: mm.index, end: re.lastIndex })
  return idx.map((x, i) => ({ n: x.n, title: x.title, body: text.slice(x.end, i + 1 < idx.length ? idx[i + 1].at : undefined).split(/\n##\s/)[0].replace(/^- /gm, '').trim() }))
}

function Slides({ m, s, v }: Props) {
  const t = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const slides = parseSlides(v.text)
  if (!slides.length) return null
  const pptx = async () => {
    setBusy(true)
    try {
      const { blob, filename } = await labBlob('export/', 'POST', { format: 'pptx', title: s.inputs.topic || t(m.title), text: v.text, meta: `AI edu · ${t('ВР № {n}', { n: m.n })}`, lang: t.locale })
      saveBlob(blob, filename); Lab.log('export', m.id, { format: 'pptx' })
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  return <div className="card vl-mt"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('Макет слайдов ({n})', { n: slides.length })}</h2>
    <Button onClick={() => void pptx()} disabled={busy}>{busy ? <Spinner/> : <Presentation size={16}/>}{t('Скачать презентацию PPTX')}</Button></div>
    <p className="vl-help">{t('Сервер собирает файл PowerPoint: титульный слайд, слайды с тезисами, заметки докладчика и итоговый слайд. Его можно открыть в PowerPoint, Google Slides или загрузить в Canva.')}</p>
    <div className="vl-slides">{slides.map(x => <div key={x.n} className="vl-slide"><span>{t('Слайд {n}', { n: x.n })}</span><b>{x.title}</b><small>{x.body.slice(0, 160)}</small></div>)}</div></div>
}

// ВР №6, №12: озвучка текста диктора — нейросетевой голос сервера или голос браузера
function Tts({ m, s, v }: Props) {
  const t = useT()
  const toast = useToast()
  const text = sectionBody(v.text, 'диктор') || v.text
  const [state, setState] = useState<{ loading?: boolean; url?: string; warn?: string }>({})
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => () => { if (state.url) URL.revokeObjectURL(state.url) }, [state.url])
  const speak = async () => {
    if (Lab.ttsReady()) {
      setState({ loading: true })
      try {
        const blob = await Orchestrator.synthesize(text)
        if (blob) {
          setState({ url: URL.createObjectURL(blob) })
          Lab.log('tts', m.id, { service: Lab.config().tts.kind })
          setTimeout(() => audio.current?.play().catch(() => {}), 50)
          return
        }
      } catch (e) { setState({ warn: (e as Error).message + ' · ' + t('озвучено браузером') }) }
    }
    if (!Orchestrator.speak(text, s.inputs.language)) toast(t('Браузер не поддерживает синтез речи'), 'error')
    else Lab.log('tts', m.id, { service: 'browser' })
  }
  return <div className="card vl-mt"><h2>{t('Озвучка текста диктора')}</h2>
    <p className="vl-help">{t('Сервис озвучки:')} <b>{Lab.ttsReady() ? Lab.config().tts.name : t('Браузер (Web Speech API)')}</b>. {Lab.ttsReady() ? t('Готовую аудиозапись можно скачать и вставить в учебное видео.') : t('Нейросетевой голос (OpenAI TTS или ElevenLabs) подключает администратор.')}</p>
    <div className="vl-row"><Button onClick={() => void speak()}><Play size={16}/>{t('Озвучить')}</Button>
      <Button variant="secondary" onClick={() => { audio.current?.pause(); Orchestrator.stopSpeaking() }}><Square size={15}/>{t('Стоп')}</Button>
      {state.loading && <Spinner/>}{state.warn && <Badge tone="warn">{state.warn}</Badge>}</div>
    {state.url && <div className="vl-mt"><audio ref={audio} controls src={state.url} className="vl-audio"/>
      <a className="button secondary vl-sm vl-mt" href={state.url} download={`${m.short || m.id}.mp3`}><Download size={15}/>{t('Скачать MP3')}</a></div>}
  </div>
}

// ВР №7: поиск реальных публикаций — OpenAlex, Crossref, Semantic Scholar (ТЗ, п. 16)
const SOURCES: [string, string][] = [['openalex', 'OpenAlex'], ['crossref', 'Crossref'], ['semantic_scholar', 'Semantic Scholar']]

function Research({ m, s, v }: Props) {
  const t = useT()
  const toast = useToast()
  const [q, setQ] = useState([s.inputs.topic, s.inputs.researchArea].filter(Boolean).join(' '))
  const [sources, setSources] = useState<string[]>(SOURCES.map(x => x[0]))
  const [res, setRes] = useState<{ loading?: boolean; items?: Publication[]; errors?: Record<string, string>; error?: string }>({})
  const [picked, setPicked] = useState<number[]>([])
  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (!sources.length) { toast(t('Выберите хотя бы одну базу'), 'error'); return }
    setRes({ loading: true })
    try {
      const r = await Orchestrator.searchLiterature(q, sources)
      s.research = r.results
      Lab.log('literature', m.id, { n: r.results.length, sources })
      setRes({ items: r.results, errors: r.errors }); setPicked(r.results.map((_, i) => i))
    } catch (err) { setRes({ error: (err as Error).message }) }
  }
  const add = async () => {
    const sel = picked.map(i => res.items![i])
    if (!sel.length) return
    const names = [...new Set(sel.map(w => SOURCES.find(x => x[0] === w.source)?.[1] || w.source))].join(', ')
    const block = `\n\n## Найденные публикации (проверено по ${names})\n` + sel.map((w, i) => `${i + 1}. ${w.authors || 'Автор не указан'}. ${w.title} (${w.year || 'б.г.'}). ${w.venue || ''}.${w.doi ? ' DOI: ' + w.doi : ''}`).join('\n')
    const score = await saveEdit(m, s, v.text.replace(/\n\n## Найденные публикации[\s\S]*$/, '') + block)
    toast(t('Добавлены проверенные публикации · оценка {n}', { n: score }))
  }
  return <div className="card vl-mt"><h2>{t('Поиск реальных публикаций')}</h2>
    <p className="vl-help">{t('Открытые научные базы: OpenAlex (более 250 млн работ), Crossref (сведения о DOI) и Semantic Scholar. Выберите публикации и добавьте их в результат — они будут отмечены как проверенные.')}</p>
    <form className="vl-row" onSubmit={search}>
      <input className="input vl-grow" value={q} onChange={e => setQ(e.target.value)} aria-label={t('Поисковый запрос')} minLength={2}/>
      <Button type="submit" disabled={res.loading}><Search size={16}/>{t('Найти')}</Button></form>
    <div className="vl-row vl-mt">{SOURCES.map(([k, label]) => <label key={k} className="checkbox"><input type="checkbox" checked={sources.includes(k)}
      onChange={e => setSources(e.target.checked ? [...sources, k] : sources.filter(x => x !== k))}/> {label}</label>)}</div>
    <div className="vl-mt">
      {res.loading && <Spinner label={t('Поиск…')}/>}
      {res.error && <Note kind="warn">{t('Не удалось выполнить поиск: {error}', { error: res.error })}</Note>}
      {res.errors && Object.keys(res.errors).length > 0 && <Note kind="warn">{t('Недоступны базы: {list}. Результаты остальных баз показаны.', { list: Object.keys(res.errors).map(k => SOURCES.find(x => x[0] === k)?.[1] || k).join(', ') })}</Note>}
      {res.items && !res.items.length && <p className="vl-help">{t('Ничего не найдено. Попробуйте английские ключевые слова.')}</p>}
      {res.items && res.items.length > 0 && <>
        <div className="vl-table-wrap"><table className="vl-table"><thead><tr><th/><th>{t('Публикация')}</th><th>{t('Год')}</th><th>{t('Цитир.')}</th><th>{t('База')}</th></tr></thead><tbody>
          {res.items.map((w, i) => <tr key={i}><td><input type="checkbox" checked={picked.includes(i)} aria-label={t('Выбрать')} onChange={e => setPicked(e.target.checked ? [...picked, i] : picked.filter(j => j !== i))}/></td>
            <td><b>{w.title}</b><br/><small className="vl-help">{w.authors}{w.venue ? ` · ${w.venue}` : ''}{w.doi && <> · <a className="text-link" href={`https://doi.org/${w.doi}`} target="_blank" rel="noopener noreferrer">DOI</a></>}</small></td>
            <td>{w.year || ''}</td><td>{w.cited ?? '—'}</td><td><Badge>{SOURCES.find(x => x[0] === w.source)?.[1] || w.source}</Badge></td></tr>)}
        </tbody></table></div>
        <Button className="vl-mt" onClick={() => void add()}>{t('Добавить выбранные в результат')}</Button></>}
    </div>
  </div>
}

// ВР №9: тестовый чат с учебным AI-ассистентом
function Chat({ m, s, v }: Props) {
  const t = useT()
  const [q, setQ] = useState('')
  const [wait, setWait] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight })
  const send = async (e: FormEvent) => {
    e.preventDefault()
    const text = q.trim(); if (!text || wait) return
    s.chat.push({ role: 'user', content: text }); setQ(''); setWait(true); Lab.save(m.id)
    const ans = await Orchestrator.chat(s.inputs, v.text, s.chat)
    s.chat.push({ role: 'assistant', content: ans }); Lab.log('chat', m.id); Lab.save(m.id); setWait(false)
  }
  return <div className="card vl-mt"><div className="vl-row vl-spread"><h2 className="vl-h2">{t('Тестовый чат с ассистентом')}</h2><Badge>{t(s.inputs.aiRole || 'Тьютор')}</Badge></div>
    <p className="vl-help">{t('Задайте вопросы так, как их задал бы обучающийся. Проверьте, соблюдает ли ассистент правила и опирается ли на базу знаний.')}</p>
    <div className="vl-chat" ref={box}>{s.chat.length ? s.chat.map((x, i) => <Markdown key={i} text={x.content} className={`vl-msg ${x.role}`}/>)
      : <p className="vl-help">{t('Например: «Что такое …?», «Реши за меня задачу», «Приведи пример».')}</p>}
      {wait && <div className="vl-msg assistant"><Spinner/></div>}</div>
    <form className="vl-row vl-mt" onSubmit={send}><input className="input vl-grow" value={q} onChange={e => setQ(e.target.value)} placeholder={t('Вопрос обучающегося…')} aria-label={t('Сообщение')}/>
      <Button type="submit" disabled={wait}><Send size={16}/>{t('Отправить')}</Button>
      {s.chat.length > 0 && <Button variant="ghost" onClick={() => { s.chat = []; Lab.save(m.id) }}><Trash2 size={15}/>{t('Очистить')}</Button>}</form>
  </div>
}

// ВР №10: предпросмотр сгенерированного теста
function QuizPreview({ m, v }: Props) {
  const t = useT()
  const qs = parseQuiz(v.text)
  const [res, setRes] = useState<{ sc: number; answered: number } | null>(null)
  if (!qs.length) return <Note>{t('Предпросмотр теста недоступен: вопросы не в формате «**Вопрос N.** … A) … Ответ: X». Попросите ИИ использовать этот формат.')}</Note>
  return <div className="card vl-mt"><h2>{t('Предпросмотр теста ({n} вопросов)', { n: qs.length })}</h2>
    <p className="vl-help">{t('Пройдите тест как обучающийся — система проверит ответы автоматически по ключу. Так вы найдёте неоднозначные вопросы.')}</p>
    <Quiz qs={qs} onGraded={(sc, answered) => { setRes({ sc, answered }); Lab.log('test-preview', m.id, { score: sc }) }}/>
    {res && <p><Badge tone={scoreTone(res.sc)}>{t('Результат: {n}%', { n: res.sc })}</Badge> <span className="vl-help">{t('отвечено {a} из {b}', { a: res.answered, b: qs.length })}</span></p>}
  </div>
}

// ВР №13: сравнение генерации по короткому и по улучшенному промпту
function Compare({ m, s }: Props) {
  const t = useT()
  const gens = s.versions.filter(x => x.kind === 'generation')
  if (gens.length < 2) {
    return gens.length === 1 ? <Note>{t('Генерация №1 выполнена. Изучите оценку на шаге «Экспертиза», затем вернитесь к шагу «Промпт», нажмите «Улучшить промпт» и выполните генерацию №2.')}
      <div className="vl-row vl-mt"><Button onClick={() => goStep(m, 2)}>{t('Улучшить промпт')}</Button></div></Note> : null
  }
  const stats = (v: Version) => { const ev = Lab.evaluate(m, s, v.text); return { prompt: v.promptScore ?? 0, score: ev.total, words: ev.stats.words, secs: ev.sections.filter(x => x.status === 'ok').length } }
  const a = gens[0], b = gens[gens.length - 1]
  const x = stats(a), y = stats(b)
  const row = (n: string, p: number, q: number, suf = '') => <tr><td>{t(n)}</td><td>{p}{suf}</td><td>{q}{suf}</td><td><b>{q - p > 0 ? '+' : ''}{q - p}{suf}</b></td></tr>
  return <div className="card vl-mt"><h2>{t('Сравнение: генерация №1 и генерация №{n}', { n: gens.length })}</h2>
    <div className="vl-table-wrap"><table className="vl-table"><thead><tr><th>{t('Показатель')}</th><th>№1</th><th>№{gens.length}</th><th>{t('Изменение')}</th></tr></thead><tbody>
      {row('Оценка промпта', x.prompt, y.prompt, '%')}{row('Оценка экспертизы', x.score, y.score)}{row('Объём, слов', x.words, y.words)}{row('Раскрытых разделов', x.secs, y.secs)}</tbody></table></div>
    <Note kind={y.score > x.score ? 'good' : 'warn'}>{y.score > x.score ? t('Улучшение промпта повысило оценку материала на {n} баллов: модель получила роль, контекст, аудиторию, формат и ограничения.', { n: y.score - x.score })
      : t('Оценка не выросла — проверьте, какие блоки промпта действительно изменились.')}</Note>
    <div className="vl-grid g2 vl-mt"><div><h3>{t('Промпт №1')}</h3><pre className="vl-pre">{a.prompt}</pre></div><div><h3>{t('Промпт №{n}', { n: gens.length })}</h3><pre className="vl-pre">{b.prompt}</pre></div></div>
  </div>
}
