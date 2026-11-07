/* Локализация модуля. Строки — русский текст (как в AI edu), переводы — в locales/kz.json и locales/en.json.
   Язык берётся у основной платформы (useI18n из ../i18n): переключатель языка в шапке AI edu меняет и модуль.
   Если перевода в словаре модуля нет, строка ищется в словаре платформы, затем показывается по-русски. */
import { useMemo } from 'react'
import { useI18n } from '../i18n'
import kz from './locales/kz.json'
import en from './locales/en.json'

export type LabLocale = 'ru' | 'kz' | 'en'
const dictionaries: Record<string, Record<string, string>> = { kz, en }

export function normalizeLocale(value: unknown): LabLocale {
  return value === 'kz' || value === 'kk' ? 'kz' : value === 'en' ? 'en' : 'ru'
}

export function translate(locale: LabLocale, key: string, fallback?: (key: string) => string): string {
  if (!key) return key
  const own = dictionaries[locale]?.[key]
  if (own) return own
  return fallback ? fallback(key) : key
}

/** Подставляет значения: tf('Работа № {n}', { n: 5 }) */
export function format(text: string, values?: Record<string, string | number | null | undefined>): string {
  return values ? text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? '')) : text
}

export type T = ((key: string, values?: Record<string, string | number | null | undefined>) => string) & { locale: LabLocale }

export function useT(): T {
  const host = useI18n()
  const locale = normalizeLocale(host.locale)
  return useMemo(() => {
    const t = ((key: string, values?: Record<string, string | number | null | undefined>) =>
      format(translate(locale, key, host.t), values)) as T
    t.locale = locale
    return t
  }, [locale, host.t])
}

/** Для кода вне компонентов (сообщения об ошибках API) */
export function currentLocale(): LabLocale {
  try { return normalizeLocale(localStorage.getItem('ai-edu-locale')) } catch { return 'ru' }
}
export const tr = (key: string, values?: Record<string, string | number | null | undefined>) => format(translate(currentLocale(), key), values)

export const dateLocale = (l: LabLocale) => (l === 'kz' ? 'kk-KZ' : l === 'en' ? 'en-GB' : 'ru-RU')
