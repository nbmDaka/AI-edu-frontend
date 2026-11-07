import type { PracticePlugin } from './types'
import { WorkshopChat } from '../workspace/WorkshopChat'
import { workshops } from '../workspace/workshops'
import { GuidedAssignment } from './GuidedAssignment'
import { AssignmentConfigEditor } from './AssignmentConfigEditor'
import { defaultTaskConfig, validateTaskConfig } from './commonTask'
import { registerVirtualLabPractices } from '../virtual-labs/practice/register'

const plugins = new Map<string, PracticePlugin>()
export function registerPractice(plugin: PracticePlugin) {
  const key = `${plugin.type}@${plugin.version}`
  if (plugins.has(key)) throw new Error(`Duplicate practice plugin: ${key}`)
  plugins.set(key, plugin)
}
export function getPracticePlugin(type: string, version: string) { return plugins.get(`${type}@${version}`) }

for (const type of [...Object.keys(workshops), 'checklist_practice']) {
  registerPractice({ type, version: '1.0.0', layout: 'workspace',
    initialConfig: defaultTaskConfig, ConfigEditor: AssignmentConfigEditor,
    StudentRuntime: WorkshopChat, validateConfig: validateTaskConfig,
  })
}

registerPractice({ type: 'guided_assignment', version: '1.0.0',
  initialConfig: () => ({ instructions: [JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })], criteria: [{ title: '', description: '', is_required: true }] }),
  ConfigEditor: AssignmentConfigEditor, StudentRuntime: GuidedAssignment,
  validateConfig: validateTaskConfig,
})

// Модуль «Виртуальные лаборатории»: работы № 4–14 как практики (типы virtual_lab_vw04 … virtual_lab_vw14)
registerVirtualLabPractices({ registerPractice, ConfigEditor: AssignmentConfigEditor,
  initialConfig: defaultTaskConfig, validateConfig: validateTaskConfig })
