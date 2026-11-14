import './adaptive-support.css'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiAll, type Attempt, type AdaptiveResult, type LearningItem, type Module } from './api'
import { Button, ErrorState, Loading } from './components/ui'
import { useI18n } from './i18n'

export function LearningItemLink({ item, locked = item.is_locked, children }: { item: LearningItem; locked?: boolean; children: ReactNode }) {
  const { t } = useI18n()
  return locked ? <div className="locked-learning-item" aria-disabled="true" title={t('Сначала завершите предыдущий модуль')}>{children}</div> : <Link to={`/items/${item.short_id}`}>{children}</Link>
}

export function AttemptSummary({ attempt }: { attempt: Attempt }) {
  const { t } = useI18n()
  const result = attempt.adaptive_result
  return <span className="attempt-summary">
    <span>{result && `${t('Результат теста')}: `}<strong>{attempt.percent}%</strong> · <span className={attempt.passed ? 'good' : 'bad'}>{t(attempt.passed ? 'Тест пройден!' : 'Тест не пройден')}</span></span>
    {result && <span>
      {t('Результат модуля')}: {t('Готовность')} {result.readiness}% · {t('Порог')} {result.threshold}% · <span className={result.module_passed ? 'good' : 'bad'}>{t(result.module_passed ? 'Порог готовности достигнут' : 'Порог готовности не достигнут')}</span>
      <small>{t('На момент попытки')}: {t(result.module_completed ? 'Модуль освоен' : 'Повторите модуль')}</small>
    </span>}
  </span>
}

export function AdaptiveResultCard({ result, showNext = true, historical = false }: { result: AdaptiveResult; showNext?: boolean; historical?: boolean }) {
  const { t } = useI18n()
  return <div className={`result-card ${result.module_completed ? 'passed' : 'failed'}`}>
    <h3>{t('Результат модуля')}</h3><h4>{t(result.module_passed ? 'Порог готовности достигнут' : 'Порог готовности не достигнут')}</h4>
    <strong>{result.readiness}%</strong><p>{t('Готовность')} · {t('Порог')} {result.threshold}%</p>
    <p>{t(historical ? 'Состояние сохранено на момент попытки. Текущую доступность смотрите в курсе.' : 'Решение сервера по этой попытке.')}</p>
    <p>{t(result.module_passed ? 'Модуль освоен' : result.module_completed ? 'Модуль был освоен ранее. Эта попытка не отменяет завершение.' : 'Повторите модуль')}</p>
    {!historical && <p>{t(result.module_completed ? 'Можно продолжить обучение.' : 'Пройдите материалы и практику ещё раз, затем повторите итоговый тест.')}</p>}
    <div className="adaptive-indicators">{([
      ['Теория', result.theory], ['Практика', result.practice], ['Ошибки', result.errors], ['Компетенции', result.competency],
    ] as const).map(([label, value]) => <span key={label}>{t(label)}: {Math.round(value * 100)}%</span>)}</div>
    <h4>{t('Результаты по компетенциям')}</h4>
    <p>{t('Переход определяется общей готовностью. Компетенции показаны от меньшего значения к большему.')}</p>
    {Object.keys(result.competencies).length ? <ul className="competency-results">{Object.entries(result.competencies).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([name, value]) => <li key={name}><span>{name}</span><strong>{Math.round(value * 100)}%</strong></li>)}</ul> : <p>{t('Нет данных по компетенциям для этой попытки.')}</p>}
    <TargetedRecommendations result={result}/>
    {!historical && result.module_completed ? result.next_item_short_id ? showNext && <Link className="button" to={`/items/${result.next_item_short_id}`}>{t('Следующий модуль')}</Link> : <p>{t('Все опубликованные модули курса пройдены.')}</p> : null}
    {!result.module_completed && <RepeatMaterials result={result}/>}
  </div>
}

function TargetedRecommendations({ result }: { result: AdaptiveResult }) {
  const { t } = useI18n()
  const advice = result.recommendations
  return <section className="targeted-recommendations"><h4>{t('Адресные рекомендации')}</h4>
    <p>{t('Рекомендации сохранены с попыткой. Доступность ссылок проверяется сейчас.')}</p>
    {advice ? <>
      <p>{t('Ориентир для рекомендаций')}: {Math.round(advice.reference_score * 100)}%. {t('Он не меняет порог допуска и не является минимумом каждой компетенции.')}</p>
      {advice.groups.map(group => <div key={group.competency}><h5>{group.competency}</h5><p>{t('Показатель на момент попытки')}: {Number((group.score * 100).toFixed(2))}% · {t('ниже ориентира')} {Math.round(advice.reference_score * 100)}%</p>
        {group.materials.length ? <ul>{group.materials.map(material => <li key={material.item_id}>{material.available_item_short_id ? <Link to={`/items/${material.available_item_short_id}`}>{material.title}</Link> : <span>{material.title} · {t('Материал сейчас недоступен')}</span>} · {t(material.type === 'LECTURE' ? 'Лекция' : 'Практика')}</li>)}</ul> : <p>{t('Для этой компетенции нет связанных опубликованных материалов.')}</p>}
      </div>)}
      {advice.fallback && <p>{t(advice.fallback === 'no_weak_competencies' ? 'По этому ориентиру слабые компетенции не выделены. При необходимости повторите модуль.' : 'Адресных материалов недостаточно. Используйте общее повторение модуля.')}</p>}
    </> : <p>{t('Для этой попытки адресные рекомендации не сохранялись. Используйте общее повторение модуля.')}</p>}
    {result.module_completed && (!advice || advice.fallback || advice.groups.some(group => group.materials.some(material => !material.available_item_short_id))) && <RepeatMaterials result={result}/>}
  </section>
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
