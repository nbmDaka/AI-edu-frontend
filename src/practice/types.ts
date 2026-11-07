import type { ComponentType } from 'react'
import type { LearningItem } from '../api'

export type Criterion = { title: string; description: string; is_required: boolean }
export type PracticeConfig = Record<string, unknown>
export type ChecklistConfig = { criteria: Criterion[] }
export type PracticeManifest = {
  type: string; version: string; name: string; description: string; icon: string
  grading: string; capabilities: string[]; available: boolean; config_schema: Record<string, unknown>
  frontend_editor: string; student_runtime: string
}
export type PracticeVersion = {
  id: number; practice_definition: number; practice_type: string; plugin_version: string; version_number: number
  title: string; description: string; config: PracticeConfig; status: 'DRAFT' | 'PUBLISHED'; published_at: string | null
}
export type PracticeResult = {
  self_assessment_score: number | null; automatic_score: number | null; teacher_score: number | null
  effective_score: number; grading_source: string; psi_value: number; psi_source: string
}
export type PracticeState = {
  version: PracticeVersion | null; current_version_id: number | null
  submission: { id: number; document_id?: number | null; status: string; practice_version: number; submission_data: Record<string, unknown>
    criteria_snapshot: (Criterion & { id: number; position: number; checked: boolean })[]; started_at: string; submitted_at: string | null; completed_at: string | null } | null
  result: PracticeResult | null; progress_percent: number; is_completed: boolean
}
export type ConfigEditorProps = { config: PracticeConfig; onChange: (config: PracticeConfig) => void; disabled: boolean; itemId?: string; onUploadingChange?: (uploading: boolean) => void }
export type RuntimeProps = {
  state: PracticeState; busy: boolean
  item?: LearningItem; ownerId?: number
  onStart: () => Promise<void>; onSubmit: (data: Record<string, unknown>) => Promise<void>
  onBackToTask?: () => void
  onReview?: (data: Record<string, unknown>, preview?: WorkPreview) => void
  draft?: Record<string, unknown>; onDraftChange?: (draft: Record<string, unknown>) => void
  onActivityChange?: (active: boolean) => void
}
export type WorkPreview = { title?: string; files?: { name: string; url: string }[] }
export type PracticePlugin = {
  type: string; version: string; initialConfig: () => PracticeConfig
  layout?: 'workspace' | 'standalone'
  ConfigEditor: ComponentType<ConfigEditorProps>; StudentRuntime: ComponentType<RuntimeProps>
  validateConfig: (config: PracticeConfig) => string | null
}
