/* Базовый адрес модуля внутри маршрутизатора платформы (по умолчанию /virtual-labs). */
import { createContext, useContext } from 'react'

export const BaseContext = createContext('/virtual-labs')

/** Адрес внутри модуля: path('lab/vw01') → /virtual-labs/lab/vw01 */
export function useLabPath() {
  const base = useContext(BaseContext)
  return (path = '') => (path ? `${base}/${path}` : base)
}
