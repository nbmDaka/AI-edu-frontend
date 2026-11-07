/* AI Evaluation Engine (ТЗ, п. 23, 27): автоматическая экспертиза учебного материала.
   Формат результата: критерий → балл → комментарий → рекомендация.
   Используется гибрид: правила (работают всегда, без интернета) + LLM-заключение (при подключённом API). */
import { util } from './util';
import type { Criterion, EvaluationResult, Inputs, SectionCheck } from './types';

type EvalModule = { minWords?: number; sections: { title: string; keys?: string[] }[] };
const { stems, words, sentences } = util;

const GENERIC_OUTCOME = new Set(['знать', 'уметь', 'владет', 'понима', 'облада', 'должны', 'смогут', 'будут', 'обучаю', 'студен', 'умение', 'навыки', 'навык']);

function splitSections(text: unknown): { head: string; body: string; words: number }[] {
  const lines = String(text || '').split('\n');
  const out: { head: string; body: string[] }[] = []; let cur: { head: string; body: string[] } = { head: '', body: [] };
  for (const l of lines) {
    const m = l.match(/^\s*#{1,4}\s+(.+)$/) || l.match(/^\s*\*\*([^*]{3,80})\*\*\s*:?\s*$/);
    if (m) { out.push(cur); cur = { head: m[1].toLowerCase(), body: [] }; }
    else cur.body.push(l);
  }
  out.push(cur);
  return out.map((s) => ({ head: s.head, body: s.body.join('\n'), words: words(s.body.join(' ')).length }));
}

function checkSections(mod: EvalModule, text: unknown): SectionCheck[] {
  const secs = splitSections(text);
  const low = String(text || '').toLowerCase();
  return mod.sections.map((s) => {
    const keys = s.keys && s.keys.length ? s.keys : [s.title.toLowerCase().slice(0, 6)];
    const hit = secs.find((x) => x.head && keys.some((k) => x.head.includes(k)));
    let status: SectionCheck['status'], value: number;
    if (hit && hit.words >= 12) { status = 'ok'; value = 1; }
    else if (hit) { status = 'thin'; value = 0.6; }
    else if (keys.some((k) => low.includes(k))) { status = 'mention'; value = 0.4; }
    else { status = 'missing'; value = 0; }
    return { title: s.title, status, value, words: hit ? hit.words : 0 };
  });
}

const clamp = (x: number): number => Math.max(0, Math.min(10, Math.round(x * 10) / 10));

/** Настройки администратора (название, вес, включение критерия) — так же, как apply_config на сервере. */
export type CriteriaConfig = { key: string; name?: string; weight?: number; isActive?: boolean; is_active?: boolean }[];
function applyConfig(crit: Criterion[], config: CriteriaConfig): { crit: Criterion[]; total: number } {
  const byKey = new Map(config.map((c) => [c.key, c]));
  const out: Criterion[] = []; let weighted = 0, weights = 0;
  for (let c of crit) {
    const cfg = byKey.get(c.key);
    if (cfg && (cfg.isActive === false || cfg.is_active === false)) continue;
    const weight = cfg && cfg.weight != null ? Number(cfg.weight) : 1;
    if (cfg && cfg.name) c = { ...c, name: cfg.name };
    if (weight !== 1) c = { ...c, weight };
    out.push(c); weighted += c.score * weight; weights += weight;
  }
  return { crit: out, total: weights ? Math.round(weighted / weights * 10) : 0 };
}
/** Отличаются ли настройки от исходных (тогда итог пересчитывается с весами) */
export function criteriaChanged(config: CriteriaConfig | null | undefined, defaults: Record<string, string>): boolean {
  return !!config && config.some((c) => (c.weight ?? 1) !== 1 || c.isActive === false || c.is_active === false || (c.name && defaults[c.key] && c.name !== defaults[c.key]));
}

function evaluate(mod: EvalModule, text: unknown, inputs?: Inputs | null, config?: CriteriaConfig | null): EvaluationResult {
  inputs = inputs || {};
  const t = String(text || '');
  const low = t.toLowerCase();
  const W = words(t);
  const S = sentences(t.replace(/^#.*$/gm, '').replace(/^\s*[-*|].*$/gm, ''));
  const crit: Criterion[] = [];
  const flags: string[] = [];
  const add = (key: string, name: string, score: number, comment: string, rec: string) => crit.push({ key, name, score: clamp(score), comment, rec });

  // 1. Структура
  const secs = checkSections(mod, t);
  const secScore = secs.reduce((a, s) => a + s.value, 0) / secs.length * 10;
  const miss = secs.filter((s) => s.status === 'missing').map((s) => s.title);
  const thin = secs.filter((s) => s.status === 'thin' || s.status === 'mention').map((s) => s.title);
  add('structure', 'Структура', secScore,
    miss.length ? `Отсутствуют разделы: ${miss.join(', ')}.` : thin.length ? `Разделы раскрыты слабо: ${thin.join(', ')}.` : 'Все обязательные разделы присутствуют.',
    miss.length ? 'Добавьте в блок ФОРМАТ промпта перечень обязательных разделов и выполните перегенерацию.' :
      thin.length ? 'Попросите ИИ расширить слабые разделы или допишите их вручную в редакторе.' : 'Сохраните структуру как образец для следующих работ.');

  // 2. Полнота
  const ratio = W.length / (mod.minWords || 450);
  add('completeness', 'Полнота', ratio >= 1 ? 10 : ratio >= 0.75 ? 8 : ratio >= 0.5 ? 6 : ratio >= 0.25 ? 4 : 2,
    `Объём: ${W.length} слов (ожидается от ${mod.minWords || 450}).`,
    ratio >= 1 ? 'Объём достаточный; проверьте, нет ли повторов.' : 'Укажите в промпте требуемый объём и детализацию разделов.');

  // 3. Соответствие теме
  const topicSt = stems(inputs.topic);
  if (topicSt.length) {
    const hits = topicSt.filter((s) => low.includes(s));
    const freq = topicSt.reduce((a, s) => a + (low.split(s).length - 1), 0);
    const sc = hits.length / topicSt.length * 7 + Math.min(3, freq / 3);
    add('topic', 'Соответствие теме', sc,
      sc >= 8 ? 'Материал последовательно раскрывает заявленную тему.' : 'Тема раскрыта не полностью или упоминается редко.',
      sc >= 8 ? 'Сохраните формулировку темы.' : 'Уточните тему в блоке ЗАДАЧА и попросите привязать каждый раздел к теме.');
  } else add('topic', 'Соответствие теме', 6, 'Тема не указана в исходных данных.', 'Заполните поле «Тема».');

  // 4. Соответствие результатам обучения
  const outSt = stems(inputs.outcomes).filter((s) => !GENERIC_OUTCOME.has(s));
  if (outSt.length) {
    const hits = outSt.filter((s) => low.includes(s));
    const sc = hits.length / outSt.length * 10;
    add('outcomes', 'Соответствие результатам обучения', sc,
      `Отражено ключевых понятий из результатов обучения: ${hits.length} из ${outSt.length}.`,
      sc >= 8 ? 'Результаты обучения учтены.' : 'Добавьте блок ЦЕЛИ ОБУЧЕНИЯ и попросите связать задания с каждым результатом.');
  } else add('outcomes', 'Соответствие результатам обучения', 5, 'Результаты обучения не заданы — проверка невозможна.', 'Сформулируйте 2–4 измеримых результата обучения.');

  // 5. Соответствие аудитории
  const audSt = stems(inputs.audience).slice(0, 2);
  const audHit = audSt.some((s) => low.includes(s)) || /обучающ|студент|учащ|слушател|школьник|магистрант/.test(low);
  const lvlHit = inputs.difficulty ? low.includes(String(inputs.difficulty).toLowerCase().slice(0, 5)) : false;
  add('audience', 'Соответствие аудитории', (audHit ? 7 : 3) + (lvlHit ? 3 : 1),
    audHit ? 'Материал ориентирован на указанную аудиторию.' : 'Аудитория в тексте не учитывается.',
    audHit ? 'Проверьте сложность примеров для этой группы.' : 'Добавьте блок АУДИТОРИЯ с уровнем подготовки обучающихся.');

  // 6. Понятность
  const avg = S.length ? S.reduce((a, s) => a + words(s).length, 0) / S.length : 0;
  const longW = W.length ? W.filter((w) => w.length > 13).length / W.length : 0;
  let cl = avg === 0 ? 5 : avg <= 18 ? 10 : avg <= 24 ? 8 : avg <= 30 ? 6 : 4;
  if (longW > 0.12) cl -= 2;
  add('clarity', 'Понятность', cl, `Средняя длина предложения: ${avg.toFixed(1)} слов.`,
    cl >= 8 ? 'Изложение доступное.' : 'Попросите ИИ упростить формулировки и разбить длинные предложения.');

  // 7. Корректность терминов
  const defs = (t.match(/\s[—–-]\s?(это|является)\s|называ[а-яёa-z]+|понима[а-яёa-z]+ под|определя[а-яёa-z]+ как|\*\*[^*]+\*\*\s*[—–-]/gi) || []).length;
  add('terms', 'Корректность терминов', defs >= 4 ? 10 : defs >= 2 ? 8 : defs === 1 ? 6 : 4,
    `Найдено определений терминов: ${defs}.`,
    defs >= 2 ? 'Сверьте определения с учебником или стандартом.' : 'Добавьте глоссарий: термин — определение.');

  // 8. Педагогическая ценность
  const feats = [
    ['вопросы', (t.match(/\?/g) || []).length >= 3],
    ['задания', /задани|упражнен/.test(low)],
    ['примеры', /пример|кейс|ситуац/.test(low)],
    ['оценивание', /критери|балл|оценив/.test(low)],
    ['рефлексия / обсуждение', /рефлекс|обсужд|дискус/.test(low)]
  ];
  const has = feats.filter((f) => f[1]).map((f) => f[0]);
  const lack = feats.filter((f) => !f[1]).map((f) => f[0]);
  add('pedagogy', 'Педагогическая ценность', has.length * 2,
    has.length ? `Есть: ${has.join(', ')}.` : 'Нет активных элементов обучения.',
    lack.length ? `Добавьте: ${lack.join(', ')}.` : 'Материал методически насыщен.');

  // 9. Научная корректность
  const absolutes = (t.match(/(?<![а-яёa-z])(всегда|никогда|абсолютно|доказано|все без исключения|единственно верн[а-яё]+|гарантирует)(?![а-яёa-z])/gi) || []);
  const stats = (t.match(/\d+[.,]?\d*\s?%/g) || []);
  let sci = 10 - absolutes.length * 1.5 - (stats.length > 2 ? 2 : 0);
  if (absolutes.length) flags.push(`Категоричные утверждения (${absolutes.slice(0, 3).join(', ')}) — проверьте их обоснованность.`);
  if (stats.length) flags.push(`В тексте есть числовые данные (${stats.slice(0, 3).join(', ')}) — укажите источник или удалите.`);
  add('science', 'Научная корректность', sci,
    absolutes.length || stats.length ? 'Обнаружены утверждения, требующие обоснования.' : 'Явных некорректных утверждений не выявлено (требуется проверка преподавателем).',
    absolutes.length || stats.length ? 'Смягчите категоричность и подтвердите данные источниками.' : 'Проверьте факты по учебной литературе.');

  // 10. Достоверность и риск галлюцинаций
  const dois = t.match(/\b10\.\d{4,9}\/[^\s)]+/g) || [];
  const urls = t.match(/https?:\/\/[^\s)]+/g) || [];
  const cites = t.match(/\(([А-ЯЁA-Z][а-яёa-z]+(\s(et al\.|и др\.))?,?\s(19|20)\d{2})\)|[А-ЯЁ][а-яё]+\s[А-ЯЁ]\.\s?[А-ЯЁ]\.|[A-Z][a-z]+,\s[A-Z]\.\s/g) || [];
  const verified = /openalex|crossref|проверено по/i.test(t);
  const marked = /требует проверки|требуют проверки|проверить по/i.test(t);
  const refCount = dois.length + urls.length + cites.length;
  let src;
  if (!refCount) src = 10;
  else if (verified) src = 9;
  else if (marked) src = 8;
  else { src = 4; flags.push(`Найдено ссылок/DOI/авторов: ${refCount}. Сгенерированные ИИ библиографические данные могут быть вымышленными (галлюцинации) — проверьте по официальным базам.`); }
  add('sources', 'Достоверность и риск галлюцинаций', src,
    refCount ? `Ссылок на источники: ${refCount}${verified ? ' (часть проверена по OpenAlex/Crossref)' : ''}.` : 'Библиографических ссылок нет — риск вымышленных источников отсутствует.',
    refCount && !verified ? 'Проверьте каждую ссылку и DOI в OpenAlex, Crossref или в библиотеке вуза.' : 'При добавлении источников используйте только проверенные публикации.');

  let total = Math.round(crit.reduce((a, c) => a + c.score, 0) / crit.length * 10);
  let finalCrit = crit;
  if (config && config.length) ({ crit: finalCrit, total } = applyConfig(crit, config));
  const level = total >= 85 ? 'Отлично' : total >= 70 ? 'Хорошо' : total >= 50 ? 'Удовлетворительно' : 'Требует доработки';
  return { total, level, criteria: finalCrit, sections: secs, flags, stats: { words: W.length, sentences: S.length, avgSentence: +avg.toFixed(1) } };
}

// Отчёт экспертизы в Markdown (используется ВР №14 и при экспорте)
function toMarkdown(ev: EvaluationResult, title?: string): string {
  return `## Итоговая оценка\n**${ev.total} / 100 — ${ev.level}**${title ? ` (объект экспертизы: ${title})` : ''}\n\n` +
    '## Критерии\n| Критерий | Балл | Комментарий | Рекомендация |\n|---|---|---|---|\n' +
    ev.criteria.map((c) => `| ${c.name} | ${c.score}/10 | ${c.comment.replace(/\|/g, '/')} | ${c.rec.replace(/\|/g, '/')} |`).join('\n') +
    (ev.flags.length ? '\n\n## Требует проверки\n' + ev.flags.map((f) => `- ${f}`).join('\n') : '') +
    '\n\n## Вывод\nАвтоматическая экспертиза выявляет формальные и структурные недостатки. Научную и педагогическую корректность окончательно подтверждает преподаватель.';
}

export const Evaluation = { evaluate, checkSections, splitSections, toMarkdown };
