/* Данные каталога для сервера (используется tools/make-catalog.mjs и тестом синхронизации). */
import './works';
import { Registry } from './registry';

export function catalog() {
  return {
    version: 1,
    works: Registry.list().map((m) => ({
      id: m.id, n: m.n, title: m.title, short: m.short, category: m.category, goal: m.goal, expected: m.expected,
      service: m.service, special: m.special, minWords: m.minWords, role: m.role, task: m.task,
      sections: m.sections.map((s) => ({ title: s.title, kind: s.kind, keys: s.keys })),
      fields: m.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
      exportFormats: m.exportFormats
    }))
  };
}
