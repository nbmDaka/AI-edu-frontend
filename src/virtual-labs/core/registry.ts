/* Module Registry — реестр подключаемых виртуальных работ (ТЗ, п. 6, 42).
   Новая виртуальная работа добавляется вызовом AIEdu.Registry.register({...})
   без изменения ядра системы. */
import type { WorkModule } from './types';

const modules = new Map<string, WorkModule>();

// Обязательный программный интерфейс модуля VirtualWork
const REQUIRED = ['id', 'n', 'title', 'goal', 'instructions', 'expected', 'fields', 'sections', 'category', 'task', 'role'];

const DEFAULTS = {
  block: 'Педагогическая деятельность',
  service: 'llm',            // тип AI-сервиса для AI Orchestrator
  special: null,             // особый виджет: chat | research | slides | tts | quiz | compare | expertise
  initialPrompt: 'full',     // full — структурированный промпт; simple — короткий (Промпт-лаборатория)
  minWords: 450,             // ожидаемый минимальный объём результата
  quiz: [],                  // контрольные вопросы по лабораторной работе
  exportFormats: ['txt', 'doc', 'md', 'pdf']
};

function validate(def: any): void {
  const missing = REQUIRED.filter((k) => !(k in def));
  if (missing.length) throw new Error(`Модуль «${def.id || '?'}»: отсутствуют поля ${missing.join(', ')}`);
  if (!Array.isArray(def.fields) || !def.fields.length) throw new Error(`Модуль ${def.id}: пустой список полей`);
  if (!Array.isArray(def.sections) || !def.sections.length) throw new Error(`Модуль ${def.id}: пустой список разделов`);
  for (const q of def.quiz || []) {
    if (!q.q || !Array.isArray(q.options) || q.answer == null || !q.options[q.answer])
      throw new Error(`Модуль ${def.id}: некорректный контрольный вопрос «${q.q}»`);
  }
}

export const Registry = {
  register(def: Partial<WorkModule> & Record<string, any>): WorkModule {
    validate(def);
    if (modules.has(def.id!)) throw new Error(`Модуль ${def.id} уже зарегистрирован`);
    const mod = Object.freeze(Object.assign({}, DEFAULTS, def)) as WorkModule;
    modules.set(mod.id, mod);
    return mod;
  },
  get(id: string | null | undefined): WorkModule | null { if (!id) return null; return modules.get(id) || null; },
  list(): WorkModule[] { return [...modules.values()].sort((a, b) => a.n - b.n); },
  count(): number { return modules.size; },
  has(id: string): boolean { return modules.has(id); },
  _clear() { modules.clear(); } // только для тестов
};
