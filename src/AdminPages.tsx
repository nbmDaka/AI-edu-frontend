import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Eye, ImagePlus, Plus, Save, Trash2 } from 'lucide-react'
import { api, ApiError, type Block, type Lesson, type Question, type Test } from './api'
import { Button, ErrorState, Input, Loading, Notice, Textarea } from './components/ui'
import { prepareImageForUpload } from './utils/image'
import { EditorLayout, type SaveState } from './layouts/EditorLayout'
import { useI18n } from './i18n'

function useLeaveWarning(dirty: boolean) {
  const { t } = useI18n()
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler) }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const handler = () => { if (!window.confirm(t('Несохранённые изменения будут потеряны. Продолжить?'))) window.history.forward() }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (anchor && anchor.origin === window.location.origin && anchor.pathname !== window.location.pathname && !window.confirm(t('Несохранённые изменения будут потеряны. Продолжить?'))) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [dirty])
}
function isDesktopViewport() {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 900px)').matches : window.innerWidth >= 900
}
export function EditorPage() {
  const { t } = useI18n()
  const { id } = useParams(), qc = useQueryClient(), navigate = useNavigate()
  const lesson = useQuery({ queryKey: ['admin-lesson', id], queryFn: () => api<Lesson>(`lessons/${id}/`) })
  const saved = useQuery({ queryKey: ['admin-blocks', id], queryFn: () => api<Block[]>(`lessons/${id}/blocks/`) })
  const [blocks, setBlocks] = useState<Block[]>([]), [dirty, setDirty] = useState(false), [preview, setPreview] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  const [settingsOpen, setSettingsOpen] = useState(isDesktopViewport)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [insertMenuIndex, setInsertMenuIndex] = useState<number | null>(null)
  useEffect(() => { if (saved.data && !dirty) { setBlocks(saved.data); setSelectedIndex(saved.data.length ? 0 : null) } }, [saved.data, dirty])
  useLeaveWarning(dirty)
  const markChanged = (next: Block[]) => { setBlocks(next.map((block, index) => ({ ...block, position: index }))); setDirty(true); setSaveState('dirty'); setMessage('') }
  const select = (index: number) => { setSelectedIndex(index); if (!isDesktopViewport()) setSettingsOpen(true) }
  const move = (i: number, delta: number) => { const next = [...blocks], j = i + delta; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; markChanged(next); setSelectedIndex(j) }
  const insert = (index: number, type: Block['type']) => {
    const block: Block = { type, position: index, content: '', media: null, config: {} }
    const next = [...blocks]; next.splice(index, 0, block); markChanged(next); setSelectedIndex(index)
    setInsertMenuIndex(null)
    if (!isDesktopViewport()) setSettingsOpen(true)
  }
  const updateSelected = (changes: Partial<Block>) => {
    if (selectedIndex === null) return
    markChanged(blocks.map((block, index) => index === selectedIndex ? { ...block, ...changes } : block))
  }
  const upload = async (file: File) => {
    if (selectedIndex === null) return
    const index = selectedIndex
    setUploading(true); setSaveState('saving'); setMessage('')
    try {
      const prepared = await prepareImageForUpload(file)
      const data = new FormData(); data.append('file', prepared)
      const result = await api<{id: number; url: string}>('media/', 'POST', data)
      setBlocks(previous => previous.map((block, current) => current === index ? { ...block, media: result.id, media_url: result.url } : block))
      setDirty(true); setSaveState('dirty')
    } catch (error) { setSaveState('error'); setMessage(error instanceof Error ? error.message : t('Не удалось загрузить изображение')) }
    finally { setUploading(false) }
  }
  const save = async (publish = false) => {
    if (uploading || busy) return
    setBusy(true); setSaveState('saving'); setMessage('')
    try {
      const result = await api<Block[]>(`lessons/${id}/blocks/`, 'PUT', blocks.map(({ type, position, content, media, config }) => ({ type, position, content, media, config })))
      if (publish) await api(`lessons/${id}/`, 'PATCH', { status: 'PUBLISHED' })
      qc.setQueryData(['admin-blocks', id], result); setBlocks(result); setDirty(false); setSaveState('saved'); setMessage(publish ? t('Урок опубликован') : t('Изменения сохранены')); qc.invalidateQueries({ queryKey: ['admin-lesson', id] })
    } catch (error) { setSaveState('error'); setMessage(error instanceof Error ? error.message : t('Не удалось сохранить урок')) }
    finally { setBusy(false) }
  }
  if (lesson.isLoading || saved.isLoading) return <Loading/>
  if (lesson.error || saved.error) return <ErrorState error={lesson.error || saved.error}/>
  const activeBlock = selectedIndex === null ? undefined : blocks[selectedIndex]
  const editorActions = <><Button variant="secondary" onClick={() => setPreview(value => !value)}><Eye size={16}/>{preview ? t('Редактировать') : t('Предпросмотр')}</Button><Button variant="secondary" disabled={busy || uploading} onClick={() => save()}><Save size={16}/>{t('Сохранить')}</Button><Button disabled={busy || uploading} onClick={() => save(true)}>{t('Опубликовать')}</Button></>
  return <EditorLayout title={lesson.data?.title || t('Конструктор урока')} status={lesson.data?.status || 'DRAFT'} saveState={uploading ? 'saving' : saveState} actions={editorActions}>
    <div className={`editor-page-tools ${settingsOpen ? '' : 'settings-collapsed'}`}><div><span className="eyebrow">{t('КОНСТРУКТОР УРОКА')}</span><p>{t('Соберите лекцию из текстовых блоков и изображений.')}</p></div><div className="editor-tool-links"><Button variant="secondary" onClick={() => { if (!dirty || window.confirm(t('Несохранённые изменения будут потеряны. Продолжить?'))) navigate(`/admin/lessons/${id}/test`) }}>{t('Конструктор теста')}</Button><Button variant="secondary" className="settings-trigger" onClick={() => setSettingsOpen(true)}>{t('Настройки блока')}</Button></div></div>
    {message && <Notice text={message} kind={saveState === 'error' ? 'error' : 'success'}/>}
    {preview ? <article className="article card editor-preview">{blocks.map((block, index) => block.type === 'TEXT' ? <div className="markdown" key={block.id ?? index}><ReactMarkdown skipHtml>{block.content}</ReactMarkdown></div> : <figure key={block.id ?? index}>{block.media_url && <img src={block.media_url} alt={block.content || t('Изображение урока')}/>}<figcaption>{block.content}</figcaption></figure>)}</article> : <div className={`editor-workspace ${settingsOpen ? 'settings-open' : 'settings-closed'}`}>
      <section className="editor-canvas" aria-label={t("Блоки урока")}>
        <div className="editor-canvas-heading"><div><strong>{t('Содержание урока')}</strong><span>{blocks.length} {blocks.length === 1 ? t('блок') : t('блоков')}</span></div><span className="save-state compact"><i/> {dirty ? t('Есть изменения') : saveState === 'saved' ? t('Сохранено') : t('Готово к редактированию')}</span></div>
        {blocks.length === 0 && <div className="editor-empty"><span className="quick-link-icon"><BookOpen size={22}/></span><h2>{t('Начните собирать урок')}</h2><p>{t('Добавьте первый текстовый блок или изображение. Настройки появятся справа.')}</p></div>}
        {blocks.map((block, index) => <div className="editor-block-wrap" key={block.id ?? `new-${index}`}>
          <article className={`editor-block-card ${selectedIndex === index ? 'selected' : ''}`}>
            <button className="editor-block-select" aria-pressed={selectedIndex === index} onClick={() => select(index)}><span className="block-type-label">{block.type === 'TEXT' ? t('ТЕКСТОВЫЙ БЛОК') : t('ИЗОБРАЖЕНИЕ')} <span>· {String(index + 1).padStart(2, '0')}</span></span>{block.type === 'TEXT' ? <span className="block-text-preview">{block.content || t('Нажмите, чтобы добавить текст…')}</span> : block.media_url ? <img className="block-image-preview" src={block.media_url} alt={block.content || t('Предпросмотр изображения')}/> : <span className="block-image-empty"><ImagePlus size={20}/>{t('Изображение ещё не загружено')}</span>}</button>
            <div className="block-actions"><button title={t("Переместить вверх")} aria-label={t("Переместить вверх")} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button title={t("Переместить вниз")} aria-label={t("Переместить вниз")} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16}/></button><button title={t("Удалить блок")} aria-label={t("Удалить блок")} onClick={() => { const next = blocks.filter((_, itemIndex) => itemIndex !== index); markChanged(next); setSelectedIndex(next.length ? Math.min(index, next.length - 1) : null) }}><Trash2 size={16}/></button></div>
          </article>
          <div className="add-between-wrap"><button className="add-between" onClick={() => setInsertMenuIndex(current => current === index + 1 ? null : index + 1)} aria-expanded={insertMenuIndex === index + 1} aria-label={`Добавить блок после блока ${index + 1}`}><span>+</span>{t('Добавить блок')}</button>{insertMenuIndex === index + 1 && <div className="add-between-menu"><button onClick={() => insert(index + 1, 'TEXT')}><BookOpen size={15}/>{t('Текст')}</button><button onClick={() => insert(index + 1, 'IMAGE')}><ImagePlus size={15}/>{t('Изображение')}</button></div>}</div>
        </div>)}
        <div className="editor-add-actions"><Button variant="secondary" onClick={() => insert(blocks.length, 'TEXT')}><Plus size={16}/>{t('Текстовый блок')}</Button><Button variant="secondary" onClick={() => insert(blocks.length, 'IMAGE')}><ImagePlus size={16}/>{t('Изображение')}</Button></div>
      </section>
      {settingsOpen && !isDesktopViewport() && <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !isDesktopViewport()) setSettingsOpen(false) }}/>}
      <aside className={`block-settings ${settingsOpen ? 'open' : ''}`} aria-label={t("Настройки выбранного блока")}>
        <div className="block-settings-header"><div><span className="eyebrow">{t('НАСТРОЙКИ')}</span><h2>{activeBlock ? activeBlock.type === 'TEXT' ? t('Текстовый блок') : t('Изображение') : t('Блок не выбран')}</h2></div><button className="icon-button settings-close" aria-label={t("Скрыть настройки")} onClick={() => setSettingsOpen(false)}>×</button></div>
        {activeBlock && selectedIndex !== null ? activeBlock.type === 'TEXT' ? <div className="settings-fields"><label>{t('Текст урока')}<Textarea rows={18} value={activeBlock.content} placeholder={t("Пишите в Markdown: заголовки, списки, выделения…")} onChange={event => updateSelected({ content: event.target.value })}/></label><p className="settings-help">{t('Поддерживаются заголовки, списки, ссылки и выделение текста.')}</p><Button variant="secondary" onClick={() => setPreview(true)}><Eye size={16}/>{t('Предпросмотр лекции')}</Button></div> : <div className="settings-fields"><label className="upload settings-upload"><ImagePlus size={20}/>{activeBlock.media_url ? t('Заменить изображение') : t('Загрузить изображение')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = '' }}/></label>{activeBlock.media_url && <img className="settings-image-preview" src={activeBlock.media_url} alt={t("Предпросмотр загруженного изображения")}/>}<label>{t('Подпись')}<Input value={activeBlock.content} placeholder={t("Кратко опишите изображение")} onChange={event => updateSelected({ content: event.target.value })}/></label><p className="settings-help">{t('Изображения JPEG, PNG и WebP. Подпись также используется для доступного описания.')}</p></div> : <p className="settings-help">{t('Выберите блок в рабочей области, чтобы изменить его содержимое.')}</p>}
      </aside>
    </div>}
  </EditorLayout>
}

const freshQuestion = (position: number): Question => ({ text: '', position, points: 1, competency: 'general', options: [{ text: '', position: 0, is_correct: true }, { text: '', position: 1, is_correct: false }] })
export function TestEditor({ itemId, backLabel }: { itemId?: string; backLabel?: string } = {}) {
  const { t } = useI18n()
  const { id } = useParams(), navigate = useNavigate(), qc = useQueryClient()
  const endpoint = itemId ? `items/${itemId}/test/` : `lessons/${id}/test/`
  const queryId = itemId ?? id
  const { data, isLoading } = useQuery({ queryKey: ['admin-test', queryId], queryFn: () => api<Test>(endpoint).catch(e => { if (e instanceof ApiError && e.status === 404) return null; throw e }) })
  const [test, setTest] = useState<Test>({ title: '', description: '', passing_percent: 70, max_attempts: null, is_published: false, questions: [] })
  const [dirty, setDirty] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [saveState, setSaveState] = useState<SaveState>('saved')
  useEffect(() => { if (data && !dirty) setTest(data) }, [data, dirty])
  useLeaveWarning(dirty)
  const set = (next: Test) => { setTest(next); setDirty(true); setSaveState('dirty') }
  const updateQ = (i: number, q: Question) => set({ ...test, questions: test.questions.map((item, j) => j === i ? q : item) })
  const move = (i: number, delta: number) => { const next = [...test.questions], j = i + delta; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; set({ ...test, questions: next.map((q, idx) => ({ ...q, position: idx })) }) }
  const save = async (publish: boolean) => { setBusy(true); setSaveState('saving'); setMessage(''); try { const result = await api<Test>(endpoint, 'PUT', { ...test, is_published: publish, questions: test.questions.map((q, i) => ({ ...q, position: i, options: q.options.map((o, j) => ({ ...o, position: j })) })) }); qc.setQueryData(['admin-test', queryId], result); await qc.invalidateQueries({ queryKey: ['admin', 'items'] }); setTest(result); setDirty(false); setSaveState('saved'); setMessage(publish ? t('Тест опубликован') : t('Черновик теста сохранён')) } catch (e) { setSaveState('error'); setMessage((e as Error).message) } finally { setBusy(false) } }
  if (isLoading) return <Loading/>
  const testActions = <><Button variant="secondary" disabled={busy} onClick={() => save(false)}>{t('Сохранить черновик')}</Button><Button disabled={busy} onClick={() => save(true)}>{t('Опубликовать тест')}</Button></>
  return <EditorLayout title={test.title || t('Конструктор теста')} status={test.is_published ? 'PUBLISHED' : 'DRAFT'} statusLabel={t(test.is_published ? 'Тест опубликован' : 'Черновик теста')} saveState={saveState} actions={testActions} backLabel={backLabel}>
    <div className="test-editor-page">
      {!itemId && <button className="back" onClick={() => { if (!dirty || window.confirm(t('Несохранённые изменения будут потеряны. Продолжить?'))) navigate(`/admin/lessons/${id}/edit`) }}><ArrowLeft size={16}/> {t('К уроку')}</button>}
      {message && <Notice text={message} kind={saveState === 'error' ? 'error' : 'success'}/>}
      <div className="page-heading-row"><div><span className="eyebrow">{t('КОНСТРУКТОР ТЕСТА')}</span><h1>{t('Проверка знаний')}</h1><p>{t('Создайте вопросы с одним правильным ответом.')}</p></div><span className={`status ${test.is_published ? 'published' : ''}`}>{t(test.is_published ? 'Тест опубликован' : 'Черновик теста')}</span></div>
      <div className="card form-card">
        <label>{t('Название теста')}<Input value={test.title} onChange={event => set({ ...test, title: event.target.value })}/></label>
        <label>{t('Описание')}<Textarea rows={2} value={test.description} onChange={event => set({ ...test, description: event.target.value })}/></label>
        <div className="row"><label>{t('Проходной балл, %')}<Input type="number" min="0" max="100" value={test.passing_percent} onChange={event => set({ ...test, passing_percent: Number(event.target.value) })}/></label><label>{t('Лимит попыток (пусто — без лимита)')}<Input type="number" min="1" value={test.max_attempts ?? ''} onChange={event => set({ ...test, max_attempts: event.target.value ? Number(event.target.value) : null })}/></label></div>
      </div>
      <div className="stack editor-blocks">{test.questions.map((question, index) => <div className="card question-editor" key={index}>
        <div className="block-top"><span className="eyebrow">{t('ВОПРОС')} {index + 1}</span><div className="icon-actions"><button aria-label={t('Переместить вверх')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={17}/></button><button aria-label={t('Переместить вниз')} disabled={index === test.questions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17}/></button><button aria-label={t('Удалить')} onClick={() => set({ ...test, questions: test.questions.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, position: itemIndex })) })}><Trash2 size={17}/></button></div></div>
        <label>{t('Текст вопроса')}<Input value={question.text} onChange={event => updateQ(index, { ...question, text: event.target.value })}/></label><label>{t('Компетенция')}<Input value={question.competency ?? 'general'} maxLength={100} placeholder={t('Например: основы ИИ')} onChange={event => updateQ(index, { ...question, competency: event.target.value })}/></label><label>{t('Баллы')}<Input type="number" min="1" value={question.points} onChange={event => updateQ(index, { ...question, points: Number(event.target.value) })}/></label>
        <div className="option-editor">{question.options.map((option, optionIndex) => <div className="row" key={optionIndex}><input aria-label={t('Правильный ответ')} type="radio" name={`correct-${index}`} checked={option.is_correct || false} onChange={() => updateQ(index, { ...question, options: question.options.map((entry, entryIndex) => ({ ...entry, is_correct: optionIndex === entryIndex })) })}/><Input value={option.text} placeholder={`${t('Вариант')} ${optionIndex + 1}`} onChange={event => updateQ(index, { ...question, options: question.options.map((entry, entryIndex) => entryIndex === optionIndex ? { ...entry, text: event.target.value } : entry) })}/><button aria-label={t('Удалить')} disabled={question.options.length <= 2} onClick={() => updateQ(index, { ...question, options: question.options.filter((_, entryIndex) => entryIndex !== optionIndex).map((entry, entryIndex) => ({ ...entry, position: entryIndex })) })}><Trash2 size={16}/></button></div>)}</div>
        <Button variant="secondary" onClick={() => updateQ(index, { ...question, options: [...question.options, { text: '', position: question.options.length, is_correct: false }] })}><Plus size={16}/> {t('Вариант')}</Button>
      </div>)}</div>
      <div className="add-block"><Button variant="secondary" onClick={() => set({ ...test, questions: [...test.questions, freshQuestion(test.questions.length)] })}><Plus size={17}/> {t('Добавить вопрос')}</Button></div>
    </div>
  </EditorLayout>
}
export { AdminCurriculum } from './curriculum/CurriculumExplorer'
