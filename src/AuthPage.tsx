import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { api, apiAll, type Track, type User } from './api'
import { Button, Input, Notice, TrackSelect } from './components/ui'
import { LanguageSelect, useI18n } from './i18n'

const makeSchema = (t: (key: string) => string) => z.object({
  email: z.email(t('Введите корректный email')),
  password: z.string().min(8, t('Минимум 8 символов')),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  learning_track: z.number().optional()
})

type Form = z.infer<ReturnType<typeof makeSchema>>

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n()
  const schema = useMemo(() => makeSchema(t), [t])
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<Form>({
    resolver: zodResolver(schema)
  })

  const tracks = useQuery({
    queryKey: ['registration-tracks'],
    queryFn: () => apiAll<Track>('tracks/'),
    enabled: mode === 'register'
  })

  const selectedTrackId = watch('learning_track')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()

  const submit = async (values: Form) => {
    setError('')
    if (mode === 'register' && !values.learning_track) {
      setError(t('Выберите траекторию обучения'))
      return
    }

    try {
      const user = await api<User>(
        `auth/${mode}/`,
        'POST',
        mode === 'register'
          ? values
          : { email: values.email, password: values.password }
      )
      qc.clear()
      qc.setQueryData(['me'], user)
      navigate(user.role === 'ADMIN' ? '/admin/curriculum' : '/')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-language"><LanguageSelect compact/></div>
      <div className="auth-side">
        <Link to="/" className="brand">
          AI<span>edu</span>
        </Link>
        <div>
          <div className="auth-icon">
            <BookOpen size={46} />
          </div>
          <h1>{t('Обучение начинается здесь.')}</h1>
          <p>{t('Создавайте свой путь в мире технологий и гуманитарных наук.')}</p>
        </div>
        <small>© AI Edu · {t('Образовательная платформа')}</small>
      </div>

      <div className="auth-form-wrap">
        <form
          className={`auth-form card ${mode === 'register' ? 'auth-form-register' : ''}`}
          onSubmit={handleSubmit(submit)}
        >
          <span className="eyebrow">{t('ДОБРО ПОЖАЛОВАТЬ')}</span>
          <h2>{mode === 'login' ? t('Вход в аккаунт') : t('Создать аккаунт')}</h2>
          <p>
            {mode === 'login'
              ? t('Продолжите обучение там, где остановились.')
              : t('Начните изучать новые траектории.')}
          </p>

          {mode === 'register' && (
            <div className="row">
              <label>
                {t('Имя')}
                <Input {...register('first_name')} placeholder={t('Имя')} />
              </label>
              <label>
                {t('Фамилия')}
                <Input {...register('last_name')} placeholder={t('Фамилия')} />
              </label>
            </div>
          )}

          <label>
            Email
            <Input
              type="email"
              autoComplete="email"
              placeholder="alex@example.com"
              {...register('email')}
            />
            <small className="field-error">{errors.email?.message}</small>
          </label>

          <label>
            {t('Пароль')}
            <Input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={t('Минимум 8 символов')}
              {...register('password')}
            />
            <small className="field-error">{errors.password?.message}</small>
          </label>

          {mode === 'register' && (
            <>
              {/* Hidden input keeps form state synchronized */}
              <input
                type="hidden"
                {...register('learning_track', { setValueAs: v => (v ? Number(v) : undefined) })}
                value={selectedTrackId ? String(selectedTrackId) : ''}
              />

              <TrackSelect
                tracks={tracks.data ?? []}
                selectedTrackId={selectedTrackId}
                onSelect={trackId => {
                  setValue('learning_track', trackId, { shouldValidate: true })
                  if (error === t('Выберите траекторию обучения')) setError('')
                }}
                isLoading={tracks.isLoading}
                error={tracks.error ? t('Не удалось загрузить траектории') : null}
                hasError={Boolean(error && !selectedTrackId)}
                errorMessage={error && !selectedTrackId ? error : null}
              />
            </>
          )}

          <Notice text={error} kind="error" />

          <Button
            type="submit"
            disabled={
              isSubmitting ||
              (mode === 'register' && (tracks.isLoading || !tracks.data?.length))
            }
            className="wide"
          >
            {isSubmitting
              ? t('Подождите…')
              : mode === 'login'
              ? t('Войти')
              : t('Зарегистрироваться')}
          </Button>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                {t('Нет аккаунта?')} <Link to="/register">{t('Зарегистрироваться')}</Link>
              </>
            ) : (
              <>
                {t('Уже есть аккаунт?')} <Link to="/login">{t('Войти')}</Link>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
