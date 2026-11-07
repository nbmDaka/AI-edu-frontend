/* Регистрация работ как практик Practice Engine AI edu (src/practice/registry.ts основной платформы).
   Вызов в AI edu — одна строка после регистрации встроенных практик:

     import { registerVirtualLabPractices } from '../virtual-labs'
     registerVirtualLabPractices({ registerPractice, ConfigEditor: AssignmentConfigEditor,
       initialConfig: defaultTaskConfig, validateConfig: validateTaskConfig })

   Типы практик: virtual_lab_vw04 … virtual_lab_vw14 — те же, что регистрирует сервер (apps/virtual_labs/practice.py).
   Настройки задания (инструкция, критерии самопроверки, файлы) редактируются обычным редактором AI edu. */
import type { ComponentType } from 'react'
import { VirtualLabRuntime, type RuntimeLikeProps } from './VirtualLabRuntime'

export const PRACTICE_WORKS = ['vw04', 'vw05', 'vw06', 'vw07', 'vw08', 'vw09', 'vw10', 'vw11', 'vw12', 'vw13', 'vw14']
export const practiceType = (code: string) => `virtual_lab_${code}`

type Config = Record<string, unknown>
export type PracticeDeps = {
  registerPractice: (plugin: {
    type: string; version: string; initialConfig: () => Config
    ConfigEditor: ComponentType<any>; StudentRuntime: ComponentType<any>; validateConfig: (config: Config) => string | null
  }) => void
  ConfigEditor: ComponentType<any>
  initialConfig: () => Config
  validateConfig: (config: Config) => string | null
  works?: string[]
}

export function registerVirtualLabPractices(deps: PracticeDeps): number {
  const works = deps.works ?? PRACTICE_WORKS
  for (const code of works) {
    const Runtime = (props: RuntimeLikeProps) => <VirtualLabRuntime {...props} code={code}/>
    Runtime.displayName = `VirtualLabRuntime_${code}`
    deps.registerPractice({
      type: practiceType(code), version: '1.0.0', initialConfig: deps.initialConfig,
      ConfigEditor: deps.ConfigEditor, StudentRuntime: Runtime, validateConfig: deps.validateConfig,
    })
  }
  return works.length
}
