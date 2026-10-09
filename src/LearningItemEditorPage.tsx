import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from './i18n'
import { api, apiAll, type LearningItem, type Module } from './api'
import { Button, ErrorState, Input, Loading, Notice, Textarea } from './components/ui'
import { EditorPage } from './LessonEditorPage'
import { TestEditor } from './AdminPages'
import { useLeaveWarning } from './useLeaveWarning'

export function LearningItemEditorPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const item = useQuery({ queryKey: ['admin-item', id], queryFn: () => api<LearningItem>(`items/${id}/`) })
  const module = useQuery({ queryKey: ['admin-module', item.data?.module], queryFn: async () => (await apiAll<Module>('modules/')).find(entry => entry.id === item.data?.module), enabled: Boolean(item.data) })
  if (item.isLoading || module.isLoading) return <Loading/>
  if (item.error || module.error || !item.data) return <ErrorState error={item.error || module.error || new Error(t('Элемент не найден'))}/>
  if (item.data.type === 'LECTURE') return item.data.lesson_short_id ? <EditorPage lessonId={item.data.lesson_short_id} backLabel={module.data?.title}/> : <ErrorState error={new Error(t('Содержимое лекции не найдено'))}/>
  if (item.data.type === 'TEST') return <TestEditor itemId={item.data.short_id} backLabel={module.data?.title}/>
  return <PracticeEditorPage item={item.data} moduleTitle={module.data?.title}/>
}

function PracticeEditorPage({ item, moduleTitle }: { item: LearningItem; moduleTitle?: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [criteria, setCriteria] = useState((item.practice_criteria ?? []).join('\n'))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (!dirty) { setTitle(item.title); setDescription(item.description); setCriteria((item.practice_criteria ?? []).join('\n')) } }, [item, dirty])
  useLeaveWarning(dirty)
  const save = async () => {
    setBusy(true); setMessage('')
    try {
      await api(`items/${item.short_id}/`, 'PATCH', { title: title.trim(), description, practice_criteria: criteria.split('\n').map(value => value.trim()).filter(Boolean) })
      setDirty(false); setMessage(t('Черновик сохранён'))
      await qc.invalidateQueries({ queryKey: ['admin', 'items'] })
      await qc.invalidateQueries({ queryKey: ['admin-item', item.short_id] })
    } catch (error) { setMessage(error instanceof Error ? error.message : t('Не удалось сохранить')) }
    finally { setBusy(false) }
  }
  const publish = async () => {
    setBusy(true); setMessage('')
    try {
      await api(`items/${item.short_id}/`, 'PATCH', { title: title.trim(), description, practice_criteria: criteria.split('\n').map(value => value.trim()).filter(Boolean), status: 'PUBLISHED' })
      setDirty(false); setMessage(t('Практика опубликована'))
      await qc.invalidateQueries({ queryKey: ['admin', 'items'] })
      await qc.invalidateQueries({ queryKey: ['admin-item', item.short_id] })
    } catch (error) { setMessage(error instanceof Error ? error.message : t('Не удалось опубликовать')) }
    finally { setBusy(false) }
  }
  return <div className="practice-editor-page"><Link className="back" to="/admin/curriculum"><ArrowLeft size={16}/>{moduleTitle || t('Структура курса')}</Link><span className="eyebrow">{t('ПРАКТИЧЕСКАЯ РАБОТА')}</span><h1>{title || t('Новая практика')}</h1><p>{t('Опишите задание и критерии, по которым студент проверит выполненную работу.')}</p><div className="card form-card"><label>{t('Название')}<Input value={title} maxLength={200} onChange={event => { setTitle(event.target.value); setDirty(true) }}/></label><label>{t('Описание')}<Textarea rows={5} value={description} onChange={event => { setDescription(event.target.value); setDirty(true) }}/></label><label>{t('Критерии самопроверки — каждый с новой строки')}<Textarea rows={6} value={criteria} onChange={event => { setCriteria(event.target.value); setDirty(true) }}/></label><p>{t('До 30 критериев, не более 300 символов каждый. Результат самопроверки учитывается в готовности модуля.')}</p><div className="row"><Button variant="secondary" disabled={busy || !dirty || !title.trim()} onClick={() => void save()}>{t('Сохранить')}</Button><Button disabled={busy || !title.trim()} onClick={() => void publish()}>{t(item.status === 'PUBLISHED' ? 'Обновить публикацию' : 'Опубликовать')}</Button></div><Notice text={message} kind={message === t('Черновик сохранён') || message === t('Практика опубликована') ? 'success' : 'error'}/></div></div>
}
