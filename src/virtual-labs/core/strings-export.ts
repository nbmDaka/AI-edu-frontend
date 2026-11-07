/* Все строки описаний работ, которые видит пользователь (для словарей kz/en и проверки tools/check-i18n.mjs). */
import './works';
import { Registry } from './registry';

export function workStrings(): string[] {
  const out = new Set<string>();
  const add = (s: unknown) => { if (typeof s === 'string' && s.trim()) out.add(s); };
  for (const m of Registry.list()) {
    [m.title, m.short, m.category, m.goal, m.expected, m.block].forEach(add);
    m.instructions.forEach(add);
    for (const f of m.fields) { [f.label, f.placeholder, f.help].forEach(add); (f.options || []).forEach(add); (f.labels || []).forEach(add); }
    for (const s of m.sections) { add(s.title); add(s.hint); }
    for (const q of m.quiz) { add(q.q); q.options.forEach(add); }
  }
  return [...out];
}
