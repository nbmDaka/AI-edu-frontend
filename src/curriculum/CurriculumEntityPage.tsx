import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Save, X } from 'lucide-react'
import { api, apiAll, type Course, type Module, type Track } from '../api'
import { useI18n } from '../i18n'
import { Button, ErrorState, Input, Loading, Notice, Select, Textarea } from '../components/ui'
import { prepareImageForUpload } from '../utils/image'
import { useLeaveWarning } from '../useLeaveWarning'
import '../admin-curriculum.css'

type Kind = 'course' | 'module'
type Form = {
  title: string
  description: string
  position: number
  is_published: boolean
  learning_track: number | null
  course: number
  slug: string
  cover: number | null
  adaptive_learning_enabled: boolean
  adaptive_threshold: number
}

function toForm(item: Course | Module, kind: Kind): Form {
  return {
    title: item.title, description: item.description, position: item.position, is_published: item.is_published,
    learning_track: kind === 'course' ? (item as Course).learning_track : null,
    course: kind === 'module' ? (item as Module).course : 0,
    slug: kind === 'course' ? (item as Course).slug : '',
    cover: kind === 'course' ? (item as Course).cover : null,
    adaptive_learning_enabled: kind === 'course' ? (item as Course).adaptive_learning_enabled ?? false : false,
    adaptive_threshold: kind === 'module' ? (item as Module).adaptive_threshold ?? 60 : 60,
  }
}

export function CurriculumEntityPage({ kind }: { kind: Kind }) {
  const { t } = useI18n()
  const { courseId, moduleId } = useParams()
  const id = kind === 'course' ? courseId : moduleId
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['admin', kind, id], queryFn: () => api<Course | Module>(`${kind}s/${id}/`), enabled: Boolean(id) })
  const tracks = useQuery({ queryKey: ['admin', 'tracks'], queryFn: () => apiAll<Track>('tracks/') })
  const courses = useQuery({ queryKey: ['admin', 'courses'], queryFn: () => apiAll<Course>('courses/') })
  const [form, setForm] = useState<Form | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  useEffect(() => { if (detail.data && !dirty) setForm(toForm(detail.data, kind)) }, [detail.data, dirty, kind])
  useEffect(() => {
    if (kind === 'course' && detail.data && 'short_id' in detail.data && courseId !== detail.data.short_id) {
      const trackParam = params.get('track') ? `?track=${encodeURIComponent(params.get('track')!)}` : ''
      navigate(`/admin/curriculum/courses/${detail.data.short_id}${trackParam}`, { replace: true })
    }
  }, [kind, detail.data, courseId, params, navigate])
  useLeaveWarning(dirty)
  const update = (patch: Partial<Form>) => { setForm(current => current ? { ...current, ...patch } : current); setDirty(true); setMessage('') }
  const uploadCover = async (file: File) => {
    setUploading(true); setMessage('')
    try {
      const prepared = await prepareImageForUpload(file)
      const body = new FormData(); body.append('file', prepared)
      const media = await api<{ id: number; url: string }>('media/', 'POST', body)
      update({ cover: media.id })
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : t('Не удалось загрузить обложку'))
    } finally {
      setUploading(false)
    }
  }
  const save = async () => {
    if (!form || !id || busy || uploading) return
    setBusy(true); setMessage('')
    try {
      const payload = kind === 'course'
        ? { title: form.title.trim(), description: form.description, learning_track: form.learning_track, cover: form.cover, position: form.position, is_published: form.is_published, adaptive_learning_enabled: form.adaptive_learning_enabled }
        : { title: form.title.trim(), description: form.description, course: form.course, position: form.position, is_published: form.is_published, adaptive_threshold: form.adaptive_threshold }
      const saved = await api<Course | Module>(`${kind}s/${id}/`, 'PATCH', payload)
      setForm(toForm(saved, kind)); setDirty(false); setIsError(false); setMessage(t('Изменения сохранены'))
      await Promise.all(['courses', 'modules', 'items'].map(key => queryClient.invalidateQueries({ queryKey: ['admin', key] })))
      if (kind === 'course') {
        const nextId = (saved as Course).short_id
        if (nextId && nextId !== courseId) {
          navigate(`/admin/curriculum/courses/${nextId}${params.get('track') ? `?track=${encodeURIComponent(params.get('track')!)}` : ''}`, { replace: true })
        }
      }
    } catch (error) { setIsError(true); setMessage(error instanceof Error ? error.message : t('Не удалось сохранить изменения')) }
    finally { setBusy(false) }
  }
  if (detail.isLoading || tracks.isLoading || courses.isLoading) return <Loading/>
  if (detail.error || tracks.error || courses.error) return <ErrorState error={detail.error || tracks.error || courses.error}/>
  if (!form) return <Loading/>
  const parentCourse = kind === 'module' ? courses.data?.find(course => course.id === form.course) : null
  const currentTrackId = kind === 'course' ? form.learning_track : parentCourse?.learning_track
  const trackKey = tracks.data?.find(track => track.id === currentTrackId)?.short_id ?? params.get('track')
  const backHref = `/admin/curriculum${trackKey ? `?track=${encodeURIComponent(trackKey)}` : ''}`
  const title = t(kind === 'course' ? 'Настройки курса' : 'Настройки модуля')
  return <div className="curriculum-entity-page">
    <Link className="curriculum-entity-back" to={backHref}><ArrowLeft size={17}/> {t('Учебная структура')}</Link>
    <div className="curriculum-entity-heading"><div><span className="eyebrow">{t(kind === 'course' ? 'КУРС' : 'МОДУЛЬ')}</span><h1>{title}</h1><p>{t('Измените общие сведения и вернитесь к структуре учебной программы.')}</p></div><span className={`curriculum-status ${form.is_published ? 'is-published' : ''}`}>{t(form.is_published ? 'Опубликован' : 'Черновик')}</span></div>
    <div className="curriculum-entity-form">
      <section className="curriculum-form-section"><h2>{t('Основные сведения')}</h2><label>{t('Название')}<Input value={form.title} maxLength={200} onChange={event => update({ title: event.target.value })}/></label><label>{t('Описание')}<Textarea rows={5} value={form.description} onChange={event => update({ description: event.target.value })}/></label></section>
      <section className="curriculum-form-section"><h2>{t('Размещение и доступ')}</h2>{kind === 'course' ? (
        <label>{t('Траектория')}<Select value={form.learning_track ?? ''} onChange={event => update({ learning_track: Number(event.target.value) })}>{tracks.data?.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</Select></label>
      ) : <label>{t('Курс')}<Select value={form.course} onChange={event => update({ course: Number(event.target.value) })}>{courses.data?.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</Select></label>}
        <label>{t('Порядок отображения')}<Input type="number" min="0" value={form.position} onChange={event => update({ position: Math.max(0, Number(event.target.value) || 0) })}/></label>
        <label className="curriculum-publish-setting"><input type="checkbox" checked={form.is_published} onChange={event => update({ is_published: event.target.checked })}/><span><strong>{t('Опубликован')}</strong><small>{t('Материал станет доступен студентам, когда опубликованы его родительские разделы.')}</small></span></label>
      </section>
      <section className="curriculum-form-section"><h2>{t('Адаптивное обучение')}</h2>{kind === 'course' ? <label className="curriculum-publish-setting"><input type="checkbox" checked={form.adaptive_learning_enabled} onChange={event => update({ adaptive_learning_enabled: event.target.checked })}/><span><strong>{t('Открывать модули последовательно')}</strong><small>{t('Следующий модуль откроется после достижения порога готовности в итоговом тесте.')}</small></span></label> : <><label>{t('Порог готовности, %')}<Input type="number" min="40" max="80" value={form.adaptive_threshold} onChange={event => update({ adaptive_threshold: Number(event.target.value) })}/></label><p>{t('По умолчанию 60%. Допустимый диапазон: 40–80%. Настройка действует при включённом адаптивном обучении в курсе.')}</p></>}</section>
      {kind === 'course' && <section className="curriculum-form-section"><h2>{t('Обложка курса')}</h2><p>{t('Изображение показывается в каталоге студентам.')}</p>{form.cover && <div className="curriculum-cover-preview"><img src={`/api/v1/media/${form.cover}/`} alt={t('Обложка курса')}/><button aria-label={t('Убрать обложку')} onClick={() => update({ cover: null })}><X size={16}/></button></div>}<label className="curriculum-cover-upload"><ImagePlus size={18}/>{t(form.cover ? 'Заменить изображение' : 'Загрузить изображение')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.currentTarget.value = '' }}/></label></section>}
    </div>
    <div className="curriculum-form-footer"><span>{t(dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены')}</span><Button onClick={() => void save()} disabled={!dirty || busy || uploading || !form.title.trim() || (kind === 'course' && !form.learning_track)}><Save size={16}/>{busy ? t('Сохранение…') : t('Сохранить')}</Button></div>
    {message && <Notice text={message} kind={isError ? 'error' : 'success'}/>}
  </div>
}
