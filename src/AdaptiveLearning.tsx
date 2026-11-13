import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiAll, type AdaptiveResult, type LearningItem, type Module } from './api'
import { Button, ErrorState, Loading } from './components/ui'
import { useI18n } from './i18n'

export function LearningItemLink({ item, locked = item.is_locked, children }: { item: LearningItem; locked?: boolean; children: ReactNode }) {
  const { t } = useI18n()
  return locked ? <div className="locked-learning-item" aria-disabled="true" title={t('Сначала завершите предыдущий модуль')}>{children}</div> : <Link to={`/items/${item.short_id}`}>{children}</Link>
}

export function AdaptiveResultCard({ result, showNext = true }: { result: AdaptiveResult; showNext?: boolean }) {
  const { t } = useI18n()
  return <div className={`result-card ${result.module_completed ? 'passed' : 'failed'}`}>
    <h3>{t(result.module_completed ? 'Модуль освоен' : 'Повторите модуль')}</h3>
    <strong>{result.readiness}%</strong><p>{t('Готовность')} · {t('Порог')} {result.threshold}%</p>
    <div className="adaptive-indicators">{([
      ['Теория', result.theory], ['Практика', result.practice], ['Ошибки', result.errors], ['Компетенции', result.competency],
    ] as const).map(([label, value]) => <span key={label}>{t(label)}: {Math.round(value * 100)}%</span>)}</div>
    <h4>{t('Результаты по компетенциям')}</h4>
    <p>{t('Переход определяется общей готовностью. Компетенции показаны от меньшего значения к большему.')}</p>
    {Object.keys(result.competencies).length ? <ul className="competency-results">{Object.entries(result.competencies).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([name, value]) => <li key={name}><span>{name}</span><strong>{Math.round(value * 100)}%</strong></li>)}</ul> : <p>{t('Нет данных по компетенциям для этой попытки.')}</p>}
    <p>{t(result.module_completed ? 'Можно продолжить обучение.' : 'Пройдите материалы и практику ещё раз, затем повторите итоговый тест.')}</p>
    {result.module_completed ? result.next_item_short_id ? showNext && <Link className="button" to={`/items/${result.next_item_short_id}`}>{t('Следующий модуль')}</Link> : <p>{t('Все опубликованные модули курса пройдены.')}</p> : null}
    {!result.module_completed && <RepeatMaterials result={result}/>}
  </div>
}

function RepeatMaterials({ result }: { result: AdaptiveResult }) {
  const { t } = useI18n()
  const materials = useQuery({ queryKey: ['repeat-materials', result.module_short_id, result.repeat_item_short_id], queryFn: async () => {
    const modules = await apiAll<Module>('modules/?page_size=100')
    const module = modules.find(entry => entry.short_id === result.module_short_id && entry.is_published && !entry.is_locked)
    if (!module) return []
    const items = await apiAll<LearningItem>(`items/?module=${module.id}&page_size=100`)
    return items.filter(item => item.module_short_id === result.module_short_id && item.type !== 'TEST' && item.status === 'PUBLISHED' && !item.is_locked).sort((a, b) => a.position - b.position || a.id - b.id)
  } })
  return <section className="repeat-materials"><h4>{t('Материалы для повторения')}</h4><p>{t('Повторите текущие опубликованные материалы модуля по порядку. Показатели выше сохранены на момент попытки.')}</p>
    {materials.isLoading ? <Loading/> : materials.error ? <><ErrorState error={materials.error}/><Button variant="secondary" onClick={() => void materials.refetch()}>{t('Повторить')}</Button></> : materials.data?.length ? <><Link className="button" to={`/items/${materials.data[0].short_id}`}>{t('Повторить модуль')}</Link><ol>{materials.data.map(item => <li key={item.id}><Link to={`/items/${item.short_id}`}>{item.title}</Link> · {t(item.type === 'LECTURE' ? 'Лекция' : 'Практика')}</li>)}</ol></> : <p>{t('Материалы для повторения сейчас недоступны.')}</p>}
  </section>
}

export { PracticeRunner } from './practice/PracticeRunner'
