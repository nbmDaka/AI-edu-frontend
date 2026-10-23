import { describe, expect, it } from 'vitest'
import { withoutRepeatedLectureTitle } from './title'

describe('single lecture heading', () => {
  const heading = (text: string) => ({ type: 'heading', content: [{ type: 'text', text }] })
  it('omits only the leading matching document title without mutating the source', () => {
    const source = JSON.stringify({ type: 'doc', content: [heading('Лекция 1. Введение'), heading('Цель лекции'), heading('Лекция 1. Введение')] })
    const result = JSON.parse(withoutRepeatedLectureTitle(source, 'Лекция №1. Введение'))
    expect(result.content.map((node: { content: { text: string }[] }) => node.content[0].text)).toEqual(['Цель лекции', 'Лекция 1. Введение'])
    expect(JSON.parse(source).content).toHaveLength(3)
  })
  it('keeps unrelated section headings and another lecture number', () => {
    for (const title of ['Цель лекции', 'Лекция 2. Введение']) {
      const source = JSON.stringify({ type: 'doc', content: [heading(title)] })
      expect(withoutRepeatedLectureTitle(source, 'Лекция №1. Введение')).toBe(source)
    }
  })
  it('supports a legacy Markdown title', () => {
    expect(withoutRepeatedLectureTitle('# Лекция №1. Введение\n\nЦель лекции', 'Лекция 1. Введение')).toBe('\nЦель лекции')
  })
})
