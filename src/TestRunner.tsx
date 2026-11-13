import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Circle, CircleX, ClipboardList, Clock3 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type Attempt, type AttemptQuestion, type LearningItem, type Lesson, type Page, type Test } from './api'
import { Button, ErrorState, Loading, Notice } from './components/ui'
import { AdaptiveResultCard, AttemptSummary } from './AdaptiveLearning'
import { NextItemAction } from './layouts/NextItemAction'
import { LanguageSelect, useI18n } from './i18n'
import './assessment.css'

type Props = { itemId: string; ownerId?: number; next?: LearningItem | Lesson; courseSlug?: string }
export function TestRunner(props: Props) {
  const { t } = useI18n()
  const testQuery = useQuery({ queryKey: ['test', props.itemId], queryFn: () => api<Test>(`items/${props.itemId}/test/`).catch(error => { if (error instanceof ApiError && error.status === 404) return null; throw error }) })
  if (testQuery.isLoading) return <Loading label={t('Загрузка теста…')}/>
  if (testQuery.error) return <section className="test-section"><ErrorState error={new Error(t('Не удалось загрузить тест'))}/><Button variant="secondary" onClick={() => void testQuery.refetch()}>{t('Повторить')}</Button></section>
  if (!testQuery.data) return <section className="empty-state"><h2>{t('Тест пока недоступен')}</h2></section>
  return <LoadedTestRunner key={`${props.itemId}:${testQuery.data.version}`} {...props} test={testQuery.data}/>
}

function LoadedTestRunner({ itemId, ownerId, next, courseSlug, test }: Props & { test: Test }) {
  const { t, locale } = useI18n(), qc = useQueryClient()
  const [search, setSearch] = useSearchParams()
  const view = search.get('view'), taking = view === 'assessment', reviewing = view === 'results'
  const storageKey = `assessment-draft:${ownerId ?? 'session'}:${itemId}:${test.version ?? 0}`
  const [answers, setAnswers] = useState<Record<number, number>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')
      return Object.fromEntries(test.questions.filter(question => question.options.some(option => option.id === saved[question.id!])).map(question => [question.id!, saved[question.id!]]))
    } catch { return {} }
  })
  const [submitting, setSubmitting] = useState(false), sending = useRef(false)
  const [confirm, setConfirm] = useState(false), [message, setMessage] = useState('')
  const [freshAttemptId, setFreshAttemptId] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState<Attempt | null>(null)
  const [historyPage, setHistoryPage] = useState(() => Math.max(1, Number.parseInt(search.get('history_page') ?? '1', 10) || 1))
  const attempts = useQuery({ queryKey: ['attempts', itemId, historyPage], queryFn: () => api<Page<Attempt>>(`items/${itemId}/attempts/${historyPage === 1 ? '' : `?page=${historyPage}`}`) })
  const used = attempts.data?.count
  const remaining = used === undefined || test.max_attempts === null ? undefined : Math.max(0, test.max_attempts - used)
  const exhausted = remaining === 0
  const resultId = Number(search.get('attempt'))
  const result = submitted?.id === resultId ? submitted : attempts.data?.results.find(attempt => attempt.id === resultId)
  const latest = attempts.data?.results[0]
  const canRetry = !exhausted && !attempts.isLoading
  const answered = test.questions.filter(question => answers[question.id!] !== undefined).length
  useEffect(() => { try { if (Object.keys(answers).length) sessionStorage.setItem(storageKey, JSON.stringify(answers)); else sessionStorage.removeItem(storageKey) } catch { /* Storage can be unavailable in private browsing. */ } }, [answers, storageKey])
  useEffect(() => { window.scrollTo?.(0, 0) }, [view, resultId])
  const go = (value?: 'assessment' | 'results', attempt?: Attempt, replace = false, page = historyPage) => {
    if (attempt) setSubmitted(attempt)
    setConfirm(false); setMessage('')
    setSearch(current => { const changed = new URLSearchParams(current); changed.delete('view'); changed.delete('attempt'); changed.delete('history_page'); if (page > 1) changed.set('history_page', String(page)); if (value) changed.set('view', value); if (attempt) changed.set('attempt', String(attempt.id)); return changed }, { replace })
  }
  const submit = async () => {
    if (sending.current || exhausted || answered !== test.questions.length) return
    sending.current = true; setSubmitting(true); setMessage('')
    try {
      const attempt = await api<Attempt>(`items/${itemId}/attempts/`, 'POST', { answers: test.questions.map(question => ({ question: question.id, option: answers[question.id!] })) })
      setFreshAttemptId(attempt.id)
      setSubmitted(attempt)
      setHistoryPage(1)
      setAnswers({}); go('results', attempt, true, 1)
      await Promise.all(['attempts', 'course-progress', 'learning-summary', 'learning-items', 'course-items', 'modules', 'attempts-all', 'program-journey', 'repeat-materials'].map(queryKey => qc.invalidateQueries({ queryKey: [queryKey] })))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('Не удалось отправить ответы')) }
    finally { sending.current = false; setSubmitting(false) }
  }
  const counts = <p className="attempt-count" aria-live="polite">{used !== undefined && <span>{t('Использовано попыток')}: {used}</span>}{remaining !== undefined && <span>{t('Осталось попыток')}: {remaining}</span>}{test.max_attempts === null && <span>{t('Количество попыток не ограничено')}</span>}</p>
  const history = attempts.data?.results.length ? <div className="assessment-history"><h3>{t('История попыток')}</h3>{attempts.data.results.map(attempt => <button type="button" key={attempt.id} onClick={() => go('results', attempt)}><Clock3 size={16}/><span>{new Date(attempt.completed_at).toLocaleString(locale === 'kz' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU')}</span><AttemptSummary attempt={attempt}/><span>{t('Посмотреть результат')}</span></button>)}</div> : null
  if (!taking && !reviewing) return <section className="test-section assessment-overview">
    <div className="assessment-intro-icon"><ClipboardList size={28}/></div><span className="eyebrow">{t('ТЕСТ')}</span><h1>{test.title}</h1>{test.description && <p className="assessment-description">{test.description}</p>}
    <div className="assessment-facts"><div><span>{t('Вопросов')}</span><strong>{test.questions.length}</strong></div><div><span>{t('Проходной балл')}</span><strong>{test.passing_percent}%</strong></div><div><span>{t('Попыток')}</span><strong>{test.max_attempts ?? '∞'}</strong></div></div>
    <p>{t('Ответьте на все вопросы. Перед отправкой вы сможете проверить ответы. После завершения увидите результат и разбор каждого вопроса.')}</p>
    {counts}{attempts.isLoading && <Loading variant="inline" label={t('Загрузка истории попыток…')}/>}
    {attempts.error && <><Notice kind="error" text={t('Не удалось загрузить историю попыток. Ограничения проверяются сервером.')}/><Button variant="secondary" onClick={() => void attempts.refetch()}>{t('Повторить загрузку истории')}</Button></>}
    {historyPage === 1 && latest?.adaptive_result && !latest.adaptive_result.module_completed && <AdaptiveResultCard result={latest.adaptive_result} historical/>}
    {exhausted ? <Notice kind="error" text={t('Лимит попыток исчерпан')}/> : <Button disabled={!test.questions.length || attempts.isLoading || !canRetry} onClick={() => go('assessment')}>{t(Object.keys(answers).length ? 'Продолжить тестирование' : 'Начать тестирование')}</Button>}
    {history}
    <div className="actions">{historyPage > 1 && <Button variant="secondary" onClick={() => setHistoryPage(page => page - 1)}>{t('Предыдущая страница')}</Button>}{attempts.data?.next && <Button variant="secondary" onClick={() => setHistoryPage(page => page + 1)}>{t('Следующая страница')}</Button>}</div>
  </section>

  return <section className="test-section assessment-screen">
    <div inert={confirm}>
      <header className="assessment-header"><button type="button" className="assessment-back" onClick={() => go()}><ArrowLeft size={20}/>{t('Назад')}</button><div><strong>{test.title}</strong><span>{t(reviewing ? 'Результаты тестирования' : 'Тестирование')}</span></div><LanguageSelect compact/></header>
      {taking ? <div className="assessment-content"><div className="assessment-answer-count" role="status">{t('Ответов')}: {answered} / {test.questions.length}</div>
        {exhausted ? <Notice kind="error" text={t('Лимит попыток исчерпан')}/> : <>
          <ol className="assessment-questions">{test.questions.map((question, index) => <li key={question.id}><fieldset className="assessment-question"><legend><span className="assessment-question-number">{index + 1}.</span><span>{question.text}</span></legend><span className="assessment-points">{question.points} {t('баллов')}</span><div className="assessment-options">{question.options.map(option => <label key={option.id} className={answers[question.id!] === option.id ? 'selected' : ''}><input type="radio" name={`q-${question.id}`} checked={answers[question.id!] === option.id} onChange={() => setAnswers(current => ({ ...current, [question.id!]: option.id! }))}/><span>{option.text}</span></label>)}</div></fieldset></li>)}</ol>
          <div className="assessment-submit"><p>{t('После отправки ответы изменить нельзя. Сначала убедитесь, что вы ответили на все вопросы.')}</p><Button disabled={submitting || !test.questions.length || answered !== test.questions.length} onClick={() => { setMessage(''); setConfirm(true) }}>{t('Отправить ответы')}</Button><Button variant="secondary" onClick={() => go()}>{t('Сохранить и выйти')}</Button></div>
        </>}
      </div> : attempts.isLoading && !result ? <Loading/> : result ? <>
        <div className={`assessment-result-banner ${result.adaptive_result ? 'adaptive-test-result' : result.passed ? 'passed' : 'failed'}`}><div><div><h1>{t(result.adaptive_result ? 'Результат теста' : 'Ваш результат')}: <strong>{result.percent}%</strong></h1><p>{t(result.passed ? 'Тест пройден!' : 'Тест не пройден')} · {result.earned_points} {t('из')} {result.total_points} {t('баллов')}{result.test_version === test.version && <> · {t('Проходной балл')} {test.passing_percent}%</>}</p>{counts}</div></div></div>
        <div className="assessment-content assessment-review">{result.adaptive_result && <AdaptiveResultCard result={result.adaptive_result} showNext={false} historical={freshAttemptId !== result.id}/>}
          <ol className="assessment-questions">{result.snapshot?.map((question, index) => <li key={index}><ReviewQuestion question={question} index={index}/></li>)}</ol>
          <div className="assessment-review-actions">{canRetry && <Button variant="secondary" disabled={submitting} onClick={() => { setAnswers({}); go('assessment') }}>{t('Пройти ещё раз')}</Button>}{exhausted && <p>{t('Лимит попыток исчерпан')}</p>}</div>
        </div>
      </> : <div className="assessment-content"><ErrorState error={new Error(t('Не удалось загрузить результат этой попытки'))}/><Button variant="secondary" onClick={() => go()}>{t('Вернуться к тесту')}</Button></div>}
      {reviewing && result && (!result.adaptive_result || result.adaptive_result.module_completed) && <div className="learning-next-bar"><NextItemAction next={result.adaptive_result && freshAttemptId !== result.id ? undefined : next} courseSlug={courseSlug} nextItemId={freshAttemptId === result.id ? result.adaptive_result?.next_item_short_id : undefined}/></div>}
    </div>
    {confirm && <SubmitConfirmation busy={submitting} message={message} onCancel={() => { if (!sending.current) setConfirm(false) }} onSubmit={() => void submit()}/>}
  </section>
}

function ReviewQuestion({ question, index }: { question: AttemptQuestion; index: number }) {
  const { t } = useI18n()
  const correct = question.is_correct ?? question.selected === question.correct
  return <article className="assessment-question assessment-reviewed-question"><h2><span className="assessment-question-number">{index + 1}.</span>{question.question}</h2><span className="assessment-points">{question.earned_points ?? (correct ? question.points : 0)} / {question.points} {t('баллов')}</span>
    {question.options?.length ? <div className="assessment-review-options">{question.options.map(option => {
      const selected = option.id === question.selected_option_id, right = option.id === question.correct_option_id
      return <div key={option.id} className={`assessment-review-option ${right ? 'is-correct' : selected ? 'is-incorrect' : ''}`}>{selected ? right ? <CheckCircle2 size={22}/> : <CircleX size={22}/> : <Circle size={22}/>}<span>{option.text}{selected && <small>{t('Ваш ответ')}</small>}{right && <small>{t('Правильный ответ')}</small>}</span></div>
    })}</div> : <div className="assessment-legacy-review"><p>{t('Ваш ответ')}: {question.selected}</p>{!correct && <p>{t('Правильный ответ')}: {question.correct}</p>}</div>}
    <div className={`assessment-feedback ${correct ? 'is-correct' : 'is-incorrect'}`}>{correct ? <CheckCircle2 size={20}/> : <CircleX size={20}/>}<span><strong>{t(correct ? 'Верно' : 'Неверно')}</strong><p>{t(correct ? 'Вы выбрали правильный ответ.' : 'Сравните ваш ответ с правильным вариантом и при необходимости повторите материал.')}</p></span></div>
  </article>
}

function SubmitConfirmation({ busy, message, onCancel, onSubmit }: { busy: boolean; message: string; onCancel: () => void; onSubmit: () => void }) {
  const { t } = useI18n(), dialog = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(onCancel); cancelRef.current = onCancel
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelRef.current() }
      if (event.key !== 'Tab') return
      const nodes = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!nodes?.length) { event.preventDefault(); return }
      const first = nodes[0]!, last = nodes[nodes.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keyboard)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keyboard); if (before?.isConnected) before.focus() }
  }, [])
  return <div className="assessment-confirm-backdrop"><div ref={dialog} className="assessment-confirm" role="dialog" aria-modal="true" aria-labelledby="assessment-confirm-title" aria-describedby="assessment-confirm-description"><h2 id="assessment-confirm-title">{t('Отправить ответы?')}</h2><p id="assessment-confirm-description">{t('После отправки вы увидите оценку и правильные ответы. Эта попытка будет завершена.')}</p><Notice kind="error" text={message}/><div><Button disabled={busy} onClick={onSubmit}>{t(busy ? 'Отправка ответов…' : 'Завершить тестирование')}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>{t('Вернуться к вопросам')}</Button></div></div></div>
}
