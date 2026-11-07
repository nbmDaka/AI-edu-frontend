/* Recommendation Engine (ТЗ, п. 28) и адаптивный модуль (п. 30).
   Гибрид Rule-based: действия пользователя → учебные данные → анализ → трудности → рекомендация → следующее задание. */
import { PromptEngine } from './promptEngine';
import { Registry } from './registry';
import type { AppState, EvaluationResult, WorkModule } from './types';

export interface Recommendation { type: 'prompt' | 'content' | 'process'; text: string; action?: 'improve' | 'edit' }

// Рекомендуемая траектория для педагогов не IT-специальностей (Траектория 2):
// сначала навык составления промптов, затем базовые учебные материалы, затем мультимедиа, ассистенты и наука.
const TRAJECTORY = ['vw13', 'vw01', 'vw02', 'vw03', 'vw10', 'vw11', 'vw04', 'vw05', 'vw06', 'vw12', 'vw09', 'vw14', 'vw07', 'vw08'];

function forWork({ mod, prompt, evaluation, stats }: { mod?: WorkModule | null; prompt?: string; evaluation?: EvaluationResult | null; stats?: Partial<{ generations: number; promptImprovements: number; edits: number }> }): Recommendation[] {
  const out: Recommendation[] = [];
  const pa = prompt ? PromptEngine.analyze(prompt) : null;
  stats = stats || {};
  if (pa && pa.missing.length) {
    out.push({ type: 'prompt', text: `В промпте не хватает блоков: ${pa.missing.map(PromptEngine.label).join(', ')}. Нажмите «Улучшить промпт» — система добавит их из ваших исходных данных.`, action: 'improve' });
  }
  if (evaluation) {
    const weak = evaluation.criteria.filter((c) => c.score < 7).sort((a, b) => a.score - b.score).slice(0, 3);
    for (const c of weak) out.push({ type: 'content', text: `${c.name} (${c.score}/10): ${c.rec}` });
    if (evaluation.flags.length) out.push({ type: 'content', text: 'Перед сохранением проверьте фрагменты, отмеченные в блоке «Требует проверки».' });
    if (evaluation.total >= 85 && !weak.length) out.push({ type: 'process', text: 'Материал хорошего качества. Прочитайте его целиком, внесите авторские правки и сохраните в портфолио.' });
  }
  if ((stats.generations || 0) >= 3 && (stats.promptImprovements || 0) === 0)
    out.push({ type: 'process', text: 'Вы несколько раз перегенерировали материал без изменения промпта. Качество результата зависит прежде всего от промпта — измените его.', action: 'improve' });
  if ((stats.generations || 0) >= 1 && (stats.edits || 0) === 0 && evaluation && evaluation.total < 85)
    out.push({ type: 'process', text: 'Попробуйте отредактировать результат вручную: ИИ создаёт черновик, а финальную версию формирует преподаватель.', action: 'edit' });
  if (mod && mod.special === 'research')
    out.push({ type: 'content', text: 'Используйте поиск OpenAlex: в обзор включайте только реально существующие публикации.' });
  if (!out.length) out.push({ type: 'process', text: 'Замечаний нет. Сохраните итоговую версию в портфолио.' });
  return out;
}

// Адаптивный выбор следующего задания на основе прогресса
function nextWork(state: Pick<AppState, 'sessions'> | null | undefined): { id: string | null; reason: string } {
  const sessions = (state && state.sessions) || {};
  const done = new Set(Object.keys(sessions).filter((k) => sessions[k].completed));
  const all = Registry.list().map((m) => m.id);
  const order = TRAJECTORY.filter((id) => all.includes(id)).concat(all.filter((id) => !TRAJECTORY.includes(id)));
  const evals = Object.values(sessions).map((s) => s.lastEvaluation).filter(Boolean);
  const avgCrit = (key: string): number | null => {
    const v = evals.map((e) => e!.criteria.find((c) => c.key === key)?.score).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const promptScores = Object.values(sessions).map((s) => s.lastPromptScore).filter((x) => x != null);
  const avgPrompt = promptScores.length ? promptScores.reduce((a, b) => a + b, 0) / promptScores.length : null;

  if (avgPrompt != null && avgPrompt < 60 && !done.has('vw13') && all.includes('vw13'))
    return { id: 'vw13', reason: `Средняя оценка ваших промптов — ${Math.round(avgPrompt)}%. Промпт-лаборатория поможет освоить структуру запроса.` };
  const src = avgCrit('sources'), sci = avgCrit('science');
  if (((src != null && src < 7) || (sci != null && sci < 7)) && !done.has('vw14') && all.includes('vw14'))
    return { id: 'vw14', reason: 'В ваших материалах встречаются непроверенные источники или утверждения. Рекомендуем лабораторию AI-экспертизы.' };
  const id = order.find((x) => !done.has(x));
  if (!id) return { id: null, reason: 'Все виртуальные работы выполнены. Сформируйте итоговое портфолио и экспортируйте его.' };
  return { id, reason: done.size ? 'Следующая работа по рекомендуемой траектории.' : 'Начните с Промпт-лаборатории: это базовый навык для всех остальных работ.' };
}

export const Recommendations = { forWork, nextWork, TRAJECTORY };
