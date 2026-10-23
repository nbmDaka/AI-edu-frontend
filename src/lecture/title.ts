const normalize = (text: string) => text.toLocaleLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')
const lectureNumber = (text: string) => /^лекция\s*№?\s*(\d+)\b/i.exec(text.trim())?.[1]

export function withoutRepeatedLectureTitle(value: string, title: string): string {
  const isTitle = (text: string) => normalize(text) === normalize(title)
    || Boolean(lectureNumber(title) && lectureNumber(text) === lectureNumber(title))
  try {
    const doc = JSON.parse(value)
    if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return value
    const index = doc.content.findIndex((node: { content?: unknown[] }) => node.content?.length)
    const first = doc.content[index]
    const text = (first?.content ?? []).map((node: { text?: string }) => node.text ?? '').join('')
    if (first?.type === 'heading' && isTitle(text)) {
      return JSON.stringify({ ...doc, content: doc.content.filter((_: unknown, position: number) => position !== index) })
    }
  } catch {
    const heading = /^(?:\s*\n)*#{1,2}\s+([^\n]+)\n?/.exec(value)
    if (heading && isTitle(heading[1])) return value.slice(heading[0].length)
  }
  return value
}
