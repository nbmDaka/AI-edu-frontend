import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { LearningItem, Module } from '../api'
import { LearningLayout } from './LearningLayout'

const module: Module = { id: 1, short_id: 'module-1', course: 1, title: 'Введение', description: '', position: 0, is_published: true }
const base: LearningItem = { id: 1, short_id: 'lecture-1', module: 1, type: 'LECTURE', title: 'Лекция', description: '', position: 0, status: 'PUBLISHED', lesson: 1, lesson_short_id: 'old-lesson', test: null, practice: null }
const practice: LearningItem = { ...base, id: 2, short_id: 'practice-2', type: 'PRACTICE', title: 'Практика', position: 1, lesson: null, lesson_short_id: null, practice: 2 }
const test: LearningItem = { ...base, id: 3, short_id: 'test-3', type: 'TEST', title: 'Тест', position: 2, lesson: null, lesson_short_id: null, test: 3 }

describe('learning item navigation', () => {
  it('shows one visible material title and resizes the tutor in ordinary lectures', () => {
    render(<MemoryRouter><LearningLayout tutor={<div>Чат</div>} courseTitle="Курс" lessonId={base.short_id} lessonTitle="Уникальное название" sections={[{ module, lessons: [{ ...base, title: 'Уникальное название' }] }]}><h1>Уникальное название</h1></LearningLayout></MemoryRouter>)
    expect(screen.getAllByText('Уникальное название')).toHaveLength(1)
    vi.spyOn(document.querySelector('.learning-center')!, 'getBoundingClientRect').mockReturnValue({ width: 800 } as DOMRect)
    vi.spyOn(document.querySelector('.learning-tutor')!, 'getBoundingClientRect').mockReturnValue({ width: 340 } as DOMRect)
    const handle = screen.getByRole('separator')
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(localStorage.getItem('learning-tutor-width')).toBe('300')
    fireEvent.keyDown(handle, { key: 'End' })
    expect(Number(localStorage.getItem('learning-tutor-width'))).toBeLessThanOrEqual(560)
    fireEvent.doubleClick(handle)
    expect(localStorage.getItem('learning-tutor-width')).toBe('340')
  })
  it('moves from a lecture to a practice and then a test', () => {
    render(<MemoryRouter><LearningLayout courseTitle="Курс" lessonId={base.short_id} lessonTitle={base.title} sections={[{ module, lessons: [base, practice, test] }]} currentIndex={0} totalLessons={3} next={practice}><p>Содержание</p></LearningLayout></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Перейти к следующему материалу' }).getAttribute('href')).toBe('/items/practice-2')
    expect(screen.queryByText('1 из 3')).toBeNull()
    expect(screen.queryByRole('link', { name: /Предыдущий элемент/ })).toBeNull()
  })
})
