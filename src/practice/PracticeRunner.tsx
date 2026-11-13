import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type LearningItem } from '../api'
import { ErrorState, Loading, Notice } from '../components/ui'
import { useI18n } from '../i18n'
import { getPracticePlugin } from './registry'
import type { PracticeState } from './types'
import { PracticeFlow } from './PracticeFlow'
import './practice.css'

export function PracticeRunner({ item, ownerId, onWorkspaceChange }: { item: LearningItem; ownerId?: number; onWorkspaceChange?: (enabled: boolean) => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const key = ['practice', item.short_id]
  const path = `items/${item.short_id}/practice/`
  const state = useQuery({ queryKey: key, queryFn: () => api<PracticeState>(path) })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const plugin = state.data?.version ? getPracticePlugin(state.data.version.practice_type, state.data.version.plugin_version) : undefined
  const perform = async (start: boolean, data?: Record<string, unknown>) => {
    setBusy(true); setNotice('')
    try {
      let current = state.data!
      if (!start && !current.submission) current = await api<PracticeState>(`${path}start/`, 'POST')
      const next = start ? await api<PracticeState>(`${path}start/`, 'POST')
        : await api<PracticeState>(path, 'POST', { submission_id: current.submission!.id, submission_data: data })
      qc.setQueryData(key, next)
      await Promise.all(['course-progress', 'learning-summary', 'program-journey', 'learning-items', 'course-items', 'repeat-materials'].map(key => qc.invalidateQueries({ queryKey: [key] })))
      setFailed(false); if (!start) setNotice(t('Практическая работа завершена'))
      return true
    } catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : t('Не удалось сохранить')); return false }
    finally { setBusy(false) }
  }
  if (state.isLoading) return <Loading/>
  if (state.error) return <ErrorState error={state.error}/>
  if (!state.data?.version) return <div className="card"><p>{t('Практическая работа ещё не настроена.')}</p></div>
  if (!plugin) return <ErrorState error={new Error(t('Этот тип практики пока недоступен'))}/>
  return <><PracticeFlow key={state.data.version.id} state={state.data} plugin={plugin} item={item} ownerId={ownerId} busy={busy}
    start={() => perform(true)} submit={data => perform(false, data)} onWorkspaceChange={onWorkspaceChange}/><Notice text={notice} onDismiss={() => setNotice('')} kind={failed ? 'error' : 'success'}/></>
}
