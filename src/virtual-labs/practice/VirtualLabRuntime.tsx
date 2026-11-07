/* Выполнение виртуальной работы внутри практики AI edu (шаг «Выполнение» в PracticeFlow).
   Слушатель проходит шаги 1–6 лаборатории; кнопка «Перейти к самопроверке» передаёт в AI edu итоговый материал.
   При сдаче сервер AI edu вызывает плагин apps/virtual_labs/practice.py, который заново проводит
   AI-экспертизу и ставит автоматическую оценку (AUTO_GRADING). */
import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useT } from '../i18n'
import { Lab, useLab } from '../store'
import { portfolioText } from '../logic'
import { Badge, Button, Loading, Markdown, Note, UIProvider, scoreTone } from '../components/ui'
import { LabView } from '../pages/Lab'
import '../virtual-labs.css'

/** Подмножество RuntimeProps из src/practice/types.ts AI edu, которое использует модуль */
export type RuntimeLikeProps = {
  state: { submission: { status: string; submission_data: Record<string, unknown> } | null }
  busy: boolean
  onReview?: (data: Record<string, unknown>, preview?: { title?: string; files?: { name: string; url: string }[] }) => void
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  onBackToTask?: () => void
  onActivityChange?: (active: boolean) => void
}

function Inner({ code, state, busy, onReview, onSubmit, onBackToTask }: RuntimeLikeProps & { code: string }) {
  useLab()
  const t = useT()
  useEffect(() => { void Lab.load() }, [])
  const submitted = !!state.submission && state.submission.status !== 'IN_PROGRESS'
  if (submitted) {
    const data = state.submission!.submission_data as { title?: string; text?: string; evaluation?: { total: number; level: string } }
    return <div className="vl-root vl-practice">
      {data.evaluation && <p><Badge tone={scoreTone(data.evaluation.total)}>{t('AI-экспертиза: {n} / 100', { n: data.evaluation.total })}</Badge> {t(data.evaluation.level)}</p>}
      <h2>{data.title}</h2><Markdown text={String(data.text || '')} className="vl-result"/>
      {onBackToTask && <Button variant="secondary" onClick={onBackToTask}><ArrowLeft size={16}/>{t('К заданию')}</Button>}
    </div>
  }
  if (Lab.status() === 'error') return <Note kind="error">{Lab.error()}</Note>
  if (Lab.status() !== 'ready') return <Loading/>
  return <div className="vl-root vl-practice">
    {onBackToTask && <Button variant="ghost" size="sm" onClick={onBackToTask}><ArrowLeft size={15}/>{t('К заданию')}</Button>}
    <LabView code={code} embedded onFinish={(m, s, v) => {
      const title = `${t(m.short || m.title)}: ${s.inputs.topic || s.inputs.discipline || ''}`.slice(0, 300)
      const data = { work: m.id, title, text: portfolioText(m, s), inputs: s.inputs }
      if (busy) return
      if (onReview) onReview(data, { title }); else void onSubmit(data)
      Lab.log('practice-review', m.id, { score: v.score })
    }}/>
  </div>
}

export function VirtualLabRuntime(props: RuntimeLikeProps & { code: string }) {
  return <UIProvider><Inner {...props}/></UIProvider>
}
