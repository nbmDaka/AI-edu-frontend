import './adaptive-support.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useI18n } from './i18n'
import { api, apiAll, type LearningItem, type Module } from './api'
import { Button, ErrorState, Loading, Textarea } from './components/ui'
import { EditorPage } from './LessonEditorPage'
import { TestEditor } from './AdminPages'
import { PracticeEditorPage } from './practice/PracticeEditor'

export function LearningItemEditorPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const item = useQuery({ queryKey: ['admin-item', id], queryFn: () => api<LearningItem>(`items/${id}/`) })
  const module = useQuery({ queryKey: ['admin-module', item.data?.module], queryFn: async () => (await apiAll<Module>('modules/')).find(entry => entry.id === item.data?.module), enabled: Boolean(item.data) })
  if (item.isLoading || module.isLoading) return <Loading/>
  if (item.error || module.error || !item.data) return <ErrorState error={item.error || module.error || new Error(t('Элемент не найден'))}/>
  if (item.data.type === 'LECTURE') return item.data.lesson_short_id ? <><CompetencyMaterialsEditor key={item.data.short_id} item={item.data}/><EditorPage lessonId={item.data.lesson_short_id} backLabel={module.data?.title}/></> : <ErrorState error={new Error(t('Содержимое лекции не найдено'))}/>
  if (item.data.type === 'TEST') return <TestEditor itemId={item.data.short_id} backLabel={module.data?.title}/>
  return <><CompetencyMaterialsEditor key={item.data.short_id} item={item.data}/><PracticeEditorPage item={item.data} moduleTitle={module.data?.title}/></>
}

export function CompetencyMaterialsEditor({ item }: { item: LearningItem }) {
  const { t } = useI18n()
  const client = useQueryClient()
  const [value, setValue] = useState((item.competency_keys ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const updated = await api<LearningItem>(`items/${item.short_id}/`, 'PATCH', { competency_keys: value.split('\n').map(key => key.trim()).filter(Boolean) })
      setValue((updated.competency_keys ?? []).join('\n'))
      await client.invalidateQueries({ queryKey: ['admin-item', item.short_id] })
      setSaved(true)
    } catch (caught) { setError(caught) } finally { setBusy(false) }
  }
  return <section className="card competency-materials-editor"><h2>{t('Компетенции для рекомендаций')}</h2>
    <p>{t('Укажите компетенции вопросов теста: по одной на строку. Регистр не важен. Связи используются только для опубликованных материалов текущего модуля.')}</p>
    <label>{t('Ключи компетенций')}<Textarea rows={3} value={value} disabled={busy} onChange={event => { setValue(event.target.value); setSaved(false) }}/></label>
    {error != null && <ErrorState error={error}/>}<Button disabled={busy} onClick={() => void save()}>{t('Сохранить связи')}</Button>{saved && <p role="status">{t('Связи сохранены')}</p>}
  </section>
}
