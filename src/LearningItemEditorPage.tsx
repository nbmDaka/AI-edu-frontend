import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useI18n } from './i18n'
import { api, apiAll, type LearningItem, type Module } from './api'
import { ErrorState, Loading } from './components/ui'
import { EditorPage } from './LessonEditorPage'
import { TestEditor } from './AdminPages'
import { PracticeEditorPage } from './practice/PracticeEditor'
import { ItemTopics } from './curriculum/ItemTopics'

export function LearningItemEditorPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const item = useQuery({ queryKey: ['admin-item', id], queryFn: () => api<LearningItem>(`items/${id}/`) })
  const module = useQuery({ queryKey: ['admin-module', item.data?.module], queryFn: async () => (await apiAll<Module>('modules/')).find(entry => entry.id === item.data?.module), enabled: Boolean(item.data) })
  if (item.isLoading || module.isLoading) return <Loading/>
  if (item.error || module.error || !item.data) return <ErrorState error={item.error || module.error || new Error(t('Элемент не найден'))}/>
  if (item.data.type === 'LECTURE') return item.data.lesson_short_id ? <><ItemTopics key={item.data.short_id} item={item.data}/><EditorPage lessonId={item.data.lesson_short_id} backLabel={module.data?.title}/></> : <ErrorState error={new Error(t('Содержимое лекции не найдено'))}/>
  if (item.data.type === 'TEST') return <TestEditor itemId={item.data.short_id} backLabel={module.data?.title}/>
  return <><ItemTopics key={item.data.short_id} item={item.data}/><PracticeEditorPage item={item.data} moduleTitle={module.data?.title}/></>
}
