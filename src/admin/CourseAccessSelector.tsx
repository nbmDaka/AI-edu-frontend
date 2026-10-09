import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiAll, type Course, type CourseAccessMode, type Track } from '../api'
import { Button, ErrorState, Input, Loading, Select } from '../components/ui'
import { useI18n } from '../i18n'

export type AccessValues = { learning_track: number | null; course_access_mode: CourseAccessMode; course_ids: number[] }

export function CourseAccessSelector({ value, tracks, onChange, onUnavailableChange, warnOnTrackChange = false }: {
  value: AccessValues; tracks: Track[]; onChange: (value: AccessValues) => void
  onUnavailableChange: (unavailable: boolean) => void; warnOnTrackChange?: boolean
}) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [trackChanged, setTrackChanged] = useState(false)
  const courses = useQuery({ queryKey: ['admin-access-courses', value.learning_track],
    queryFn: () => apiAll<Course>(`courses/?learning_track=${value.learning_track}`), enabled: Boolean(value.learning_track) })
  const available = (courses.data ?? []).filter(course => course.is_published && course.learning_track === value.learning_track)
  const visible = available.filter(course => course.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const selected = available.filter(course => value.course_ids.includes(course.id)).length
  useEffect(() => { onUnavailableChange(Boolean(value.learning_track && value.course_access_mode === 'CUSTOM' && (courses.isLoading || courses.error))) }, [value.learning_track, value.course_access_mode, courses.isLoading, courses.error, onUnavailableChange])
  return <>
    <label>{t('Траектория обучения')}<Select required value={value.learning_track ?? ''} onChange={event => {
      onChange({ ...value, learning_track: event.target.value ? Number(event.target.value) : null, course_ids: [] })
      setSearch(''); setTrackChanged(true)
    }}><option value="">{t('Выберите траекторию обучения')}</option>{value.learning_track && !tracks.some(track => track.id === value.learning_track && track.is_active && track.is_published) && <option value={value.learning_track} disabled>{tracks.find(track => track.id === value.learning_track)?.title ?? t('Траектория недоступна')}</option>}{tracks.filter(track => track.is_active && track.is_published).map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</Select></label>
    {trackChanged && warnOnTrackChange && <p className="admin-form-note" role="status">{t('Траектория изменена. Проверьте список курсов перед сохранением. История обучения сохранится.')}</p>}
    <fieldset><legend>{t('Доступ к курсам')}</legend><div className="access-options">
      <label className="access-choice"><input type="radio" name="course-access-mode" checked={value.course_access_mode === 'TRACK_DEFAULT'} onChange={() => onChange({ ...value, course_access_mode: 'TRACK_DEFAULT' })}/>{t('Все опубликованные курсы траектории')}</label>
      <label className="access-choice"><input type="radio" name="course-access-mode" checked={value.course_access_mode === 'CUSTOM'} onChange={() => onChange({ ...value, course_access_mode: 'CUSTOM' })}/>{t('Выбранные курсы')}</label>
    </div></fieldset>
    {value.course_access_mode === 'CUSTOM' && <div className="course-selection">
      {!value.learning_track ? <p className="admin-form-note">{t('Сначала выберите траекторию')}</p> : courses.isLoading ? <Loading variant="inline"/> : courses.error ? <ErrorState error={courses.error}/> : <>
        <label>{t('Поиск курсов')}<Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Название курса')}/></label>
        <div className="course-selection-tools"><span>{t('Доступно')} {selected} {t('из')} {available.length} {t('курсов')}</span><Button type="button" variant="secondary" onClick={() => onChange({ ...value, course_ids: available.map(course => course.id) })}>{t('Выбрать все')}</Button><Button type="button" variant="secondary" onClick={() => onChange({ ...value, course_ids: [] })}>{t('Снять выбор')}</Button></div>
        <div className="course-selection-list">{visible.length ? visible.map(course => <label className="course-choice" key={course.id}><input type="checkbox" checked={value.course_ids.includes(course.id)} onChange={event => onChange({ ...value, course_ids: event.target.checked ? [...value.course_ids, course.id] : value.course_ids.filter(id => id !== course.id) })}/><span>{course.title}</span></label>) : <p className="management-empty">{t(search ? 'Ничего не найдено' : 'Нет опубликованных курсов')}</p>}</div>
      </>}
    </div>}
  </>
}
