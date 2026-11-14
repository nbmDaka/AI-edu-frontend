import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, apiAll, ApiError, type CourseLearningSummary, type LearningDashboard, type LearningItem, type User } from './api'
import { MyLearningPage } from './MyLearningPage'
import { CoursePage, LessonPage } from './StudentPages'
import { TestRunner } from './TestRunner'
import { LearningLayout } from './layouts/LearningLayout'
import { AttemptHistory } from './AttemptHistory'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: vi.fn(), apiAll: vi.fn() }))
const clients: QueryClient[] = []
const user: User = { id: 1, email: 'student@example.test', first_name: 'Ada', last_name: '', role: 'STUDENT', learning_track: { id: 1, short_id: 'track', title: 'IT' } }
const course: CourseLearningSummary = { id: 1, short_id: 'course', slug: 'course', title: 'AI basics', description: 'Introduction', cover: null, learning_track_title: 'IT', percent: 46, completed_items: 0, total_items: 1, is_started: true, is_completed: false, last_activity_at: '2026-10-12T00:00:00Z', resume_learning_item: { short_id: 'lecture', title: 'Introduction lecture', type: 'LECTURE' } }
const empty: LearningDashboard = { resume_course: null, active_courses: [], completed_courses: [], available_courses: [] }
const quiz = { id: 1, title: 'Quiz', description: '', passing_percent: 70, max_attempts: 2, questions: [{ id: 10, text: 'Question?', points: 1, position: 0, options: [{ id: 20, text: 'Yes', position: 0 }, { id: 21, text: 'No', position: 1 }] }] }

function mount(element: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={path.startsWith('/courses') ? '/courses/:slug' : path.startsWith('/lessons') ? '/lessons/:id' : '/'} element={element}/><Route path="/items/:id" element={<p>Current item page</p>}/></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(apiAll).mockReset().mockResolvedValue([]) })
afterEach(async () => { cleanup(); await Promise.all(clients.map(client => client.cancelQueries())); clients.splice(0).forEach(client => client.clear()); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals() })

describe('student learning journey', () => {
  it('shows the active course and directs resume to its saved item', async () => {
    vi.mocked(api).mockResolvedValue({ ...empty, resume_course: course, active_courses: [course] })
    mount(<MyLearningPage user={user}/>)
    const resume = await screen.findByRole('region', { name: 'AI basics' })
    expect(within(resume).getByText('46%')).toBeTruthy()
    expect(within(resume).getByRole('link', { name: 'Продолжить обучение' }).getAttribute('href')).toBe('/items/lecture')
    expect(screen.queryByRole('heading', { name: 'Мои курсы' })).toBeNull()
    expect(vi.mocked(api).mock.calls).toHaveLength(1)
  })

  it('keeps unstarted courses in onboarding and limits the preview', async () => {
    vi.mocked(api).mockResolvedValue({ ...empty, available_courses: Array.from({ length: 5 }, (_, index) => ({ ...course, id: index + 1, title: `Available ${index}`, is_started: false, percent: 0 })) })
    mount(<MyLearningPage user={user}/>)
    await screen.findByText('Выберите первый курс и начните обучение')
    expect(screen.queryByRole('heading', { name: 'Мои курсы' })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.queryByText('0%')).toBeNull()
  })

  it('shows completed courses without a Continue action', async () => {
    vi.mocked(api).mockResolvedValue({ ...empty, completed_courses: [{ ...course, is_completed: true, percent: 100, completed_items: 1, resume_learning_item: null }] })
    mount(<MyLearningPage user={user}/>)
    await screen.findByRole('heading', { name: 'Завершённые курсы' })
    expect(screen.getByText('Завершён')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Открыть курс' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Продолжить' })).toBeNull()
  })

  it.each([false, true])('shows course progress and the correct CTA for started=%s', async started => {
    vi.mocked(api).mockImplementation(async path => path.endsWith('/progress/') ? { ...course, is_started: started, percent: started ? 46 : 0, items: {} } as never : { ...course, learning_track: 1 } as never)
    mount(<CoursePage/>, '/courses/course')
    const button = await screen.findByRole('link', { name: started ? 'Продолжить' : 'Начать курс' })
    expect(button.getAttribute('href')).toBe('/items/lecture')
    expect(screen.getByRole('progressbar', { name: 'Прогресс курса' }).getAttribute('aria-valuenow')).toBe(started ? '46' : '0')
  })

  it('shows completion and the four item states on the course page', async () => {
    const item: LearningItem = { id: 1, short_id: 'lecture', title: 'Lecture', module: 1, description: '', type: 'LECTURE', position: 0, status: 'PUBLISHED', lesson: null, lesson_short_id: null, test: null, practice: null }
    vi.mocked(apiAll).mockImplementation(async path => path.startsWith('modules/') ? [{ id: 1, short_id: 'module', title: 'Module', position: 0 }, { id: 2, short_id: 'locked', title: 'Locked module', position: 1, is_locked: true }] as never : [item, { ...item, id: 2, short_id: 'test', type: 'TEST', title: 'Test', position: 1 }, { ...item, id: 3, short_id: 'practice', type: 'PRACTICE', title: 'Practice', position: 2 }, { ...item, id: 4, short_id: 'locked-item', module: 2, title: 'Locked lecture', is_locked: true }] as never)
    vi.mocked(api).mockImplementation(async path => path.endsWith('/progress/') ? { ...course, items: { lecture: { progress_percent: 46, is_completed: false }, test: { progress_percent: 100, is_completed: true } } } as never : course as never)
    mount(<CoursePage/>, '/courses/course')
    await screen.findByText('В процессе')
    expect(screen.getByText('Завершён')).toBeTruthy()
    expect(screen.getByText('Не начат')).toBeTruthy()
    expect(screen.getByText('Заблокирован')).toBeTruthy()
  })

  it('replaces the course CTA with completion when every item is completed', async () => {
    vi.mocked(api).mockImplementation(async path => path.endsWith('/progress/') ? { ...course, is_completed: true, completed_items: 1, percent: 100, resume_learning_item: null, items: {} } as never : course as never)
    mount(<CoursePage/>, '/courses/course')
    expect(await screen.findByText('Курс завершён')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Продолжить' })).toBeNull()
  })

  it('shows loading while the test request is pending', () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}))
    mount(<TestRunner itemId="quiz"/>)
    expect(screen.getByRole('status', { name: 'Загрузка теста…' })).toBeTruthy()
  })

  it('reports test API errors and permits reloading', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError('Server unavailable', 503))
    mount(<TestRunner itemId="quiz"/>)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Не удалось загрузить тест')
    vi.mocked(api).mockImplementation(async path => path.endsWith('/test/') ? quiz as never : { count: 0, results: [], next: null, previous: null } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('button', { name: 'Начать тестирование' })).toBeTruthy()
    expect(screen.queryByText('Question?')).toBeNull()
  })

  it('shows a missing test state', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError('Missing', 404))
    mount(<TestRunner itemId="quiz"/>)
    expect(await screen.findByText('Тест пока недоступен')).toBeTruthy()
  })

  it('keeps the test available when attempt history fails', async () => {
    vi.mocked(api).mockImplementation(async path => { if (path.endsWith('/test/')) return quiz as never; throw new ApiError('History unavailable', 503) })
    mount(<TestRunner itemId="quiz"/>)
    expect(await screen.findByText(/Не удалось загрузить историю попыток/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Начать тестирование' }))
    expect(await screen.findByLabelText('Yes')).toBeTruthy()
  })

  it('allows a retry and disables further attempts when the backend limit is reached', async () => {
    let count = 0
    vi.mocked(api).mockImplementation(async (path, method) => {
      if (path.endsWith('/test/')) return quiz as never
      if (method === 'POST') { count++; return { id: count, passed: true, percent: 100, earned_points: 1, total_points: 1, completed_at: '2026-10-12T00:00:00Z' } as never }
      return { count, results: [], next: null, previous: null } as never
    })
    mount(<TestRunner itemId="quiz"/>)
    await screen.findByText('Использовано попыток: 0')
    fireEvent.click(screen.getByRole('button', { name: 'Начать тестирование' }))
    fireEvent.click(screen.getByLabelText('Yes'))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
    const retry = await screen.findByRole('button', { name: 'Пройти ещё раз' })
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(retry)
    fireEvent.click(screen.getByLabelText('Yes'))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
    await screen.findByText('Лимит попыток исчерпан')
    expect(screen.queryByRole('button', { name: 'Пройти ещё раз' })).toBeNull()
    expect(await screen.findByText('Осталось попыток: 0')).toBeTruthy()
    expect(count).toBe(2)
    const requests = vi.mocked(api).mock.calls.filter(([, method]) => method === 'POST').map(([, , data]) => (data as { request_id: string }).request_id)
    expect(new Set(requests).size).toBe(2)
  })

  it('retains the request key after a lost response and a page reload', async () => {
    const requests: string[] = []
    vi.mocked(api).mockImplementation(async (path, method, data) => {
      if (path.endsWith('/test/')) return quiz as never
      if (method === 'POST') { requests.push((data as { request_id: string }).request_id); throw new Error('Lost response') }
      return { count: 0, results: [], next: null, previous: null } as never
    })
    const send = async () => {
      const resume = await screen.findByRole('button', { name: 'Продолжить тестирование' })
      await waitFor(() => expect((resume as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(resume)
      fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }))
      fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
      await screen.findByText('Lost response')
    }
    sessionStorage.setItem('assessment-draft:1:quiz:0', JSON.stringify({ 10: 20 }))
    sessionStorage.setItem('assessment-draft:1:quiz:0:request', JSON.stringify({ answers: JSON.stringify([{ question: 10, option: 20 }]), request_id: 'corrupted' }))
    mount(<TestRunner itemId="quiz" ownerId={1}/>)
    await send()
    cleanup()
    mount(<TestRunner itemId="quiz" ownerId={1}/>)
    await send()
    expect(requests).toHaveLength(2)
    expect(requests[0]).toBe(requests[1])
    expect(requests[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('redirects a legacy bookmark through its explicit LearningItem relation', async () => {
    vi.mocked(api).mockResolvedValue({ learning_item_short_id: 'lecture' })
    mount(<LessonPage/>, '/lessons/old')
    expect(await screen.findByText('Current item page')).toBeTruthy()
    expect(vi.mocked(api)).toHaveBeenCalledWith('lessons/old/')
  })

  it('reloads a historical result from its actual history page', async () => {
    vi.mocked(api).mockImplementation(async path => {
      if (path.endsWith('/test/')) return quiz as never
      if (path.endsWith('/attempts/?page=2')) return { count: 31, next: null, previous: '?page=1', results: [{ id: 31, passed: false, percent: 50, earned_points: 1, total_points: 2, snapshot: [] }] } as never
      throw new Error(`Unexpected request: ${path}`)
    })
    mount(<TestRunner itemId="quiz"/>, '/?view=results&attempt=31&history_page=2')
    expect(await screen.findByRole('heading', { name: 'Ваш результат: 50%' })).toBeTruthy()
    expect(vi.mocked(api)).toHaveBeenCalledWith('items/quiz/attempts/?page=2')
  })

  it('offers review without permanently blocking a retry after an adaptive failure', async () => {
    vi.mocked(apiAll).mockImplementation(async path => path.startsWith('modules/') ? [{ id: 1, short_id: 'module', is_published: true }] as never : [{ id: 1, module_short_id: 'module', short_id: 'lecture', title: 'Lecture', type: 'LECTURE', status: 'PUBLISHED' }] as never)
    vi.mocked(api).mockImplementation(async (path, method) => {
      if (path.endsWith('/test/')) return quiz as never
      if (method === 'POST') return { id: 1, passed: false, percent: 40, earned_points: 2, total_points: 5, adaptive_result: { readiness: 20, threshold: 60, module_passed: false, module_completed: false, theory: .4, practice: .2, errors: .6, competency: .3, competencies: {}, module_short_id: 'module', repeat_item_short_id: 'lecture', next_item_short_id: null } } as never
      return { count: 0, results: [], next: null, previous: null } as never
    })
    mount(<TestRunner itemId="quiz"/>)
    await screen.findByText('Использовано попыток: 0')
    fireEvent.click(screen.getByRole('button', { name: 'Начать тестирование' }))
    fireEvent.click(screen.getByLabelText('Yes'))
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ответы' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тестирование' }))
    const repeat = await screen.findByRole('link', { name: 'Повторить модуль' })
    expect(repeat.getAttribute('href')).toBe('/items/lecture')
    fireEvent.click(screen.getByRole('button', { name: 'Пройти ещё раз' }))
    expect(screen.getByLabelText('Yes')).toBeTruthy()
  })

  it('provides account controls, course return and keyboard focus in the drawer', () => {
    vi.stubGlobal('innerWidth', 390)
    const item: LearningItem = { id: 1, short_id: 'lecture', title: 'Lecture', module: 1, description: '', type: 'LECTURE', position: 0, status: 'PUBLISHED', lesson: null, lesson_short_id: null, test: null, practice: null }
    mount(<LearningLayout user={user} courseSlug="course" courseTitle="AI basics" moduleTitle="Module" lessonId="lecture" lessonTitle="Lecture" sections={[{ module: { id: 1, short_id: 'module', title: 'Module', course: 1, description: '', position: 0, is_published: true }, lessons: [item] }]}><p>Material</p></LearningLayout>)
    expect(screen.getAllByRole('link', { name: 'Вернуться к курсу' })[0].getAttribute('href')).toBe('/courses/course')
    fireEvent.click(screen.getByLabelText('Меню пользователя'))
    expect(screen.getByRole('link', { name: 'Профиль' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy()
    const trigger = screen.getByRole('button', { name: 'Содержание' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Содержание курса' })
    const close = within(dialog).getByRole('button', { name: 'Закрыть оглавление' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(within(dialog).getByRole('link', { name: /Lecture/ }))
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('loads further history pages with test and course titles', async () => {
    vi.mocked(api).mockImplementation(async path => ({ count: 2, next: path.endsWith('page=1') ? '/api/v1/attempts/?page=2' : null, previous: null, results: [{ id: path.endsWith('page=1') ? 1 : 2, test_title: path.endsWith('page=1') ? 'Quiz one' : 'Quiz two', course_title: 'AI basics', percent: 100, passed: true, completed_at: '2026-10-12T00:00:00Z' }] }) as never)
    mount(<AttemptHistory/>)
    await screen.findByText('Quiz one')
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByText('Quiz two')).toBeTruthy()
    expect(screen.getAllByText('AI basics')).toHaveLength(2)
  })
})
