/* Prompt Engine (ТЗ, п. 25): хранение шаблонов, подстановка параметров,
   проверка структуры промпта и формирование улучшенного промпта.
   Структура: ROLE → CONTEXT → LEARNING OBJECTIVES → TASK → AUDIENCE → FORMAT → CONSTRAINTS → QUALITY CRITERIA */
import { util } from './util';
import type { Inputs, PromptAnalysis, WorkModule } from './types';
const { fill, splitList } = util;

const BLOCKS = [
  { key: 'role', label: 'РОЛЬ', en: 'ROLE',
    hint: 'Укажите, в какой роли должен выступать ИИ (например, «опытный методист вуза»).',
    re: [/(^|\n)\s*(роль|role)\s*:/i, /(^|[^а-яё])ты\s*[—–-]?\s*(опытн|эксперт|преподават|методист|учител|научн|специалист|редактор|сценарист|тьютор|наставник)/i, /выступи в роли|в роли /i] },
  { key: 'context', label: 'КОНТЕКСТ', en: 'CONTEXT',
    hint: 'Опишите дисциплину, курс, язык и условия проведения занятия.',
    re: [/(^|\n)\s*(контекст|context)\s*:/i, /дисциплин[аеыу]/i, /в рамках (курса|предмета)/i] },
  { key: 'objectives', label: 'ЦЕЛИ ОБУЧЕНИЯ', en: 'LEARNING OBJECTIVES',
    hint: 'Перечислите результаты обучения: что обучающиеся должны знать и уметь.',
    re: [/(^|\n)\s*(цели обучения|learning objectives)\s*:/i, /результат[а-яёa-z]* обучени/i, /(будут|должны) (знать|уметь)/i] },
  { key: 'task', label: 'ЗАДАЧА', en: 'TASK',
    hint: 'Сформулируйте конкретное действие: что именно нужно создать.',
    re: [/(^|\n)\s*(задача|task)\s*:/i, /(^|[^а-яё])(создай|разработай|сформируй|составь|подготовь|напиши|сгенерируй|оцени|проанализируй)/i] },
  { key: 'audience', label: 'АУДИТОРИЯ', en: 'AUDIENCE',
    hint: 'Укажите, для кого материал: уровень и возраст обучающихся.',
    re: [/(^|\n)\s*(аудитория|audience)\s*:/i, /для (студент|учащ|школьник|магистрант|слушател|преподават|учител)/i] },
  { key: 'format', label: 'ФОРМАТ', en: 'FORMAT',
    hint: 'Задайте структуру ответа: разделы, заголовки, таблицы, объём.',
    re: [/(^|\n)\s*(формат|format)\s*:/i, /(структур|раздел|заголов)[а-яёa-z]*/i, /в виде (таблиц|списк)/i] },
  { key: 'constraints', label: 'ОГРАНИЧЕНИЯ', en: 'CONSTRAINTS',
    hint: 'Добавьте ограничения: объём, язык, запрет выдуманных источников и фактов.',
    re: [/(^|\n)\s*(ограничения|constraints)\s*:/i, /не (выдумывай|придумывай|используй|добавляй)/i, /не более|объ[её]м/i] },
  { key: 'criteria', label: 'КРИТЕРИИ КАЧЕСТВА', en: 'QUALITY CRITERIA',
    hint: 'Опишите, по каким критериям будет проверяться результат.',
    re: [/(^|\n)\s*(критерии качества|quality criteria)\s*:/i, /критери[а-яёa-z]* (качеств|оцен)/i, /провер[а-яёa-z]* (себя|результат)/i] }
];

const COMMON_CONSTRAINTS = [
  'Не выдумывай факты, статистику, цитаты, авторов, DOI и библиографические ссылки; если источник нужен — укажи «требует проверки».',
  'Пиши ясно и доступно, без лишнего жаргона; термины объясняй при первом упоминании.',
  'Соблюдай академическую добросовестность: материал будет проверен преподавателем.'
];

function ctxFrom(mod: WorkModule, inputs: Inputs): Record<string, any> {
  const c: Record<string, any> = Object.assign({}, inputs);
  c.outcomesList = splitList(inputs.outcomes);
  c.workTitle = mod.title;
  return c;
}

type Builder = (m: WorkModule, c: Record<string, any>) => string;
const builders: Record<string, Builder> = {
  role: (m) => `Ты — ${m.role}.`,
  context: (m, c) => {
    const parts: string[] = [];
    if (c.discipline) parts.push(`Дисциплина: «${c.discipline}».`);
    if (c.course) parts.push(`Курс / класс: ${c.course}.`);
    if (c.duration) parts.push(`Продолжительность занятия: ${c.duration} мин.`);
    if (c.language) parts.push(`Язык материала: ${c.language}.`);
    if (c.organization) parts.push(`Организация образования: ${c.organization}.`);
    parts.push(`Материал создаётся в виртуальной лаборатории «${m.title}» обучающей системы AI edu.`);
    return parts.join(' ');
  },
  objectives: (_m, c) => c.outcomesList.length
    ? 'После занятия обучающиеся должны:\n' + c.outcomesList.map((o: string) => `- ${o}`).join('\n')
    : '- сформулируй 3–4 измеримых результата обучения по теме (знать, уметь, владеть).',
  task: (m, c) => fill(m.task, c),
  audience: (_m, c) => `${c.audience || 'Обучающиеся'}${c.difficulty ? `; уровень сложности — ${String(c.difficulty).toLowerCase()}` : ''}.`,
  format: (m) => 'Ответ оформи в Markdown. Используй заголовки второго уровня (##) строго для следующих разделов:\n' +
    m.sections.map((s, i) => `${i + 1}. ${s.title}${s.hint ? ' — ' + s.hint : ''}`).join('\n'),
  constraints: (m, c) => COMMON_CONSTRAINTS.concat(m.constraints || [])
    .concat(c.language && c.language !== 'Русский' ? [`Весь текст пиши на языке: ${c.language}.`] : [])
    .map((x) => `- ${x}`).join('\n'),
  criteria: (m) => ['полнота: присутствуют все разделы из блока ФОРМАТ',
    'соответствие теме и результатам обучения', 'научная корректность и отсутствие вымышленных сведений',
    'соответствие уровню аудитории', 'педагогическая ценность: примеры, задания, вопросы']
    .concat(m.criteria || []).map((x) => `- ${x}`).join('\n')
};

function buildBlock(key: string, mod: WorkModule, inputs: Inputs): string {
  const b = BLOCKS.find((x) => x.key === key)!;
  return `${b.label}:\n${builders[key](mod, ctxFrom(mod, inputs))}`;
}

const PromptEngine = {
  BLOCKS,
  // Полный структурированный промпт по шаблону модуля
  build(mod: WorkModule, inputs: Inputs): string {
    return BLOCKS.map((b) => buildBlock(b.key, mod, inputs)).join('\n\n');
  },
  // Короткий «наивный» промпт — отправная точка Промпт-лаборатории (ВР №13)
  simple(mod: WorkModule, inputs: Inputs): string {
    const what = (inputs.materialType || mod.short || 'учебный материал').toLowerCase();
    return `Напиши ${what} на тему «${inputs.topic || '…'}».`;
  },
  // Анализ структуры произвольного промпта
  analyze(text: unknown): PromptAnalysis {
    const t = String(text || '');
    const present: string[] = [], missing: string[] = [];
    for (const b of BLOCKS) (b.re.some((r) => r.test(t)) ? present : missing).push(b.key);
    const words = (t.match(/\S+/g) || []).length;
    let score = Math.round(present.length / BLOCKS.length * 100);
    if (words < 15) score = Math.min(score, 20);
    const tips = missing.map((k) => BLOCKS.find((b) => b.key === k)!.hint);
    if (words < 30) tips.push('Промпт слишком короткий: модель «додумает» недостающее сама, и результат будет шаблонным.');
    return { present, missing, score, words, tips };
  },
  // Улучшение: дописываем недостающие блоки на основе исходных данных
  improve(text: string, mod: WorkModule, inputs: Inputs): { text: string; added: string[] } {
    const a = PromptEngine.analyze(text);
    if (!a.missing.length) return { text, added: [] };
    const add = a.missing.map((k) => buildBlock(k, mod, inputs));
    const base = String(text || '').trim();
    return { text: (base ? base + '\n\n' : '') + add.join('\n\n'), added: a.missing };
  },
  label(key: string): string { const b = BLOCKS.find((x) => x.key === key); return b ? b.label : key; }
};

export { PromptEngine };
