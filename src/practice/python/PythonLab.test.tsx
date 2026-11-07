import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { getPracticePlugin } from '../registry'
import { passed, sameValue } from './protocol'
import { formatExpected, parseExpected, validatePythonLabConfig } from './PythonLabEditor'
import { PythonLab } from './PythonLab'
import type { PracticeState } from '../types'

afterEach(cleanup)

const config = { packages: ['pandas'], datasets: [], steps: [{ title: 'Load', instructions: 'Read the file', starter_code: 'import pandas as pd',
  checks: [{ title: 'Rows', expression: 'df.shape[0]', expected: 179, tolerance: 0, is_required: true }] }] }

test('the plugin is registered as a standalone runtime', () => {
  expect(getPracticePlugin('python_lab', '1.0.0')?.layout).toBe('standalone')
})

test('client verdict mirrors the server comparison', () => {
  expect(sameValue(7896089.39, 7896089.394, 0.01)).toBe(true)
  expect(sameValue(179, 178, 0)).toBe(false)
  expect(sameValue(['a', 'b'], ['a ', 'b'], 0)).toBe(true)
  expect(sameValue(1, true, 0)).toBe(false)
  expect(sameValue('179', 179, 0)).toBe(false)
  expect(passed(config.steps[0].checks[0], { error: 'NameError' })).toBe(false)
})

test('expected values are typed as JSON with a text fallback', () => {
  expect(parseExpected('179')).toBe(179)
  expect(parseExpected('["Year","Price"]')).toEqual(['Year', 'Price'])
  expect(parseExpected('Toyota')).toBe('Toyota')
  expect(parseExpected('[[1]]')).toBe('[[1]]')
  expect(formatExpected('179')).toBe('"179"')
  expect(formatExpected('Toyota')).toBe('Toyota')
})

test('config validation requires checks with one-line expressions', () => {
  expect(validatePythonLabConfig(config)).toBeNull()
  expect(validatePythonLabConfig({ ...config, steps: [{ ...config.steps[0], checks: [] }] })).toBeTruthy()
  expect(validatePythonLabConfig({ ...config, steps: [{ ...config.steps[0], checks: [{ ...config.steps[0].checks[0], expression: 'a\nb' }] }] })).toBeTruthy()
})

test('a submitted attempt shows the server verdict per check', () => {
  const state = { version: { id: 1, practice_definition: 1, practice_type: 'python_lab', plugin_version: '1.0.0', version_number: 1, title: 'Lab', description: '', config, status: 'PUBLISHED', published_at: null },
    current_version_id: 1, progress_percent: 100, is_completed: true,
    result: { self_assessment_score: null, automatic_score: 1, teacher_score: null, effective_score: 1, grading_source: 'AUTO_GRADING', psi_value: 1, psi_source: 'AUTO_GRADING' },
    submission: { id: 1, status: 'SUBMITTED', practice_version: 1, submission_data: { code: ['df = 1'], results: [{ value: 179 }] },
      criteria_snapshot: [{ id: 0, title: 'Rows', description: '', position: 0, is_required: true, checked: true }], started_at: '', submitted_at: '', completed_at: '' } } as PracticeState
  render(<PythonLab state={state} busy={false} onStart={async () => {}} onSubmit={async () => {}}/>)
  expect(screen.getByText('Практическая работа завершена')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Код шага 1' }) as HTMLTextAreaElement).value).toBe('df = 1')
  expect(screen.queryByRole('button', { name: /Запустить/ })).toBeNull()
})
