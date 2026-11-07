import type { LessonAttachment } from '../../api'

export type Scalar = number | string | boolean | null
export type CheckValue = Scalar | Scalar[]
export type CheckResult = { value: CheckValue } | { error: string }
export type PythonCheck = { title: string; expression: string; expected: CheckValue; tolerance: number; is_required: boolean }
export type PythonStep = { title: string; instructions: string; starter_code: string; checks: PythonCheck[] }
export type PythonLabConfig = { steps: PythonStep[]; datasets: LessonAttachment[]; packages: string[] }

export type RunRequest = {
  id: number; baseUrl: string; packages: string[]; datasets: LessonAttachment[]
  steps: { code: string; checks: string[] }[]
}
export type StepOutput = { stdout: string; error: string; figures: string[]; results: CheckResult[] }
export type WorkerMessage = { id: number; ok: true; steps: StepOutput[] } | { id: number; ok: false; error: string }

export const PACKAGES = ['numpy', 'pandas', 'scikit-learn', 'matplotlib', 'scipy']

/** Mirrors `same` in apps/activities/python_lab.py so learners see the verdict the server will give. */
export function sameValue(expected: CheckValue, actual: CheckValue, tolerance: number): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((value, index) => sameValue(value, actual[index], tolerance))
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) <= tolerance
  if (typeof expected === 'string' && typeof actual === 'string') return expected.trim() === actual.trim()
  return expected === actual
}

export function passed(check: PythonCheck, result?: CheckResult) {
  return !!result && 'value' in result && sameValue(check.expected, result.value, check.tolerance)
}
