import { useEffect } from 'react'
import { useI18n } from './i18n'

export function useLeaveWarning(dirty: boolean) {
  const { t } = useI18n()
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      const currentRoute = window.location.pathname + window.location.hash.split('?')[0]
      const nextRoute = anchor && anchor.pathname + anchor.hash.split('?')[0]
      if (anchor && anchor.origin === window.location.origin && nextRoute !== currentRoute && !window.confirm(t('Есть несохранённые изменения. Покинуть страницу?'))) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', click, true) }
  }, [dirty, t])
}
