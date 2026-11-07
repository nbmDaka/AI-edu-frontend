import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Tags, X } from 'lucide-react'
import { api, type LearningItem } from '../api'
import { Button, Input, Notice } from '../components/ui'
import { useI18n } from '../i18n'
import './item-topics.css'

const MAX_TOPICS = 10

/** Topics a lecture or practice teaches. A learner weak in a topic is sent to the items tagged with it. */
export function ItemTopics({ item }: { item: LearningItem }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [saved, setSaved] = useState(item.competencies ?? [])
  const [topics, setTopics] = useState(saved)
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<{ busy: boolean; error: string; saved: boolean }>({ busy: false, error: '', saved: false })
  const changed = JSON.stringify(topics) !== JSON.stringify(saved)
  const add = () => {
    const value = draft.trim()
    if (!value || topics.length >= MAX_TOPICS) return
    if (!topics.some(topic => topic.toLocaleLowerCase() === value.toLocaleLowerCase())) setTopics([...topics, value])
    setDraft('')
  }
  async function save() {
    setState({ busy: true, error: '', saved: false })
    try {
      const result = await api<LearningItem>(`items/${item.short_id}/`, 'PATCH', { competencies: topics })
      qc.setQueryData(['admin-item', item.short_id], result)
      setSaved(result.competencies ?? [])
      setTopics(result.competencies ?? [])
      setState({ busy: false, error: '', saved: true })
    } catch (cause) { setState({ busy: false, error: t((cause as Error).message), saved: false }) }
  }
  return <section className="item-topics" aria-label={t('Темы материала')}>
    <div className="item-topics-head"><Tags size={16} aria-hidden="true"/><strong>{t('Темы материала')}</strong>
      <span>{t('Пишите так же, как компетенции в вопросах итогового теста. Студенту со слабой темой платформа предложит повторить этот материал.')}</span></div>
    <div className="item-topics-row">
      <ul>{topics.map(topic => <li key={topic}>{topic}<button type="button" aria-label={`${t('Убрать тему')} ${topic}`} onClick={() => setTopics(topics.filter(entry => entry !== topic))}><X size={13}/></button></li>)}</ul>
      <Input aria-label={t('Новая тема')} placeholder={t('Например, Корреляция')} maxLength={100} value={draft} disabled={topics.length >= MAX_TOPICS}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }}/>
      <Button variant="secondary" type="button" onClick={add} disabled={!draft.trim() || topics.length >= MAX_TOPICS}>{t('Добавить')}</Button>
      <Button type="button" onClick={() => void save()} disabled={!changed || state.busy}>{t(state.busy ? 'Сохранение…' : 'Сохранить темы')}</Button>
    </div>
    {state.saved && !changed && <p className="item-topics-saved">{t('Темы сохранены')}</p>}
    <Notice text={state.error} kind="error" onDismiss={() => setState({ ...state, error: '' })}/>
  </section>
}
