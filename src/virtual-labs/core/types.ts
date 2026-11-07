/* Типы данных обучающей системы AI edu (сущности ТЗ, п. 31). */

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'filetext' | 'portfolio';

/** Поле формы «Исходные данные» */
export interface Field {
  key: string;
  label: string;
  type: FieldType | string;
  required?: boolean;
  profile?: string;          // подставляется из профиля преподавателя
  placeholder?: string;
  options?: string[];
  labels?: string[];         // подписи вариантов select, если они отличаются от значений
  default?: string | number;
  rows?: number;
  help?: string;
  min?: number;
  max?: number;
  category?: string;     // для поля «portfolio»: категория материалов
}

/** Обязательный раздел учебного материала */
export interface Section {
  title: string;
  kind: string;
  keys?: string[];
  hint?: string;
}

export interface QuizQuestion { q: string; options: string[]; answer: number }

export type Special = 'chat' | 'research' | 'slides' | 'tts' | 'quiz' | 'compare' | 'expertise' | null;

/** Модуль VirtualWork — декларативное описание виртуальной работы */
export interface WorkModule {
  id: string;
  n: number;
  title: string;
  short?: string;
  category: string;
  icon?: string;
  block: string;
  goal: string;
  instructions: string[];
  expected: string;
  role: string;
  fields: Field[];
  task: string;
  sections: Section[];
  service: string;
  special: Special | string | null;
  initialPrompt: 'full' | 'simple' | string;
  minWords: number;
  quiz: QuizQuestion[];
  exportFormats: string[];
  constraints?: string[];
  criteria?: string[];
}

export type Inputs = Record<string, any>;

export interface Criterion { key: string; name: string; score: number; comment: string; rec: string; weight?: number }
export interface SectionCheck { title: string; status: 'ok' | 'thin' | 'mention' | 'missing'; value: number; words: number }

/** Результат AI-экспертизы: критерий → балл → комментарий → рекомендация */
export interface EvaluationResult {
  total: number;
  level: string;
  criteria: Criterion[];
  sections: SectionCheck[];
  flags: string[];
  stats: { words: number; sentences: number; avgSentence: number };
  engine?: string;
}

export interface PromptAnalysis { present: string[]; missing: string[]; score: number; words: number; tips: string[] }

/** Версия промпта и результата (Prompt v1 / Result v1 …) */
export interface Version {
  id: string;
  n: number;
  ts: number;
  kind: 'generation' | 'edit' | string;
  prompt: string;
  promptScore: number | null;
  text: string;
  score: number;
  provider?: string;
  model?: string;
  ms?: number;
  error?: string | null;
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

/** Прохождение виртуальной работы (TrainingSession) */
export interface Session {
  inputs: Inputs;
  prompt: string;
  promptVersions: { text: string; score: number; kind: string; ts: number }[];
  versions: Version[];
  currentVersionId: string | null;
  startedAt: number;
  timeSpent: number;
  step: number;
  stats: { generations: number; promptImprovements: number; edits: number };
  completed: boolean;
  lastEvaluation: EvaluationResult | null;
  lastPromptScore: number | null;
  quiz: { score: number; answers: number[]; ts?: number } | null;
  chat: ChatMessage[];
  research: any[];
  [extra: string]: any;
}

export interface PortfolioItem {
  id: string;
  ts: number;
  modId: string;
  title: string;
  category: string;
  text: string;
  score: number;
  promptScore: number | null;
  prompt: string;
  versionN: number;
}

export interface Settings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  rememberKey: boolean;
  ttsProvider: string;
  elevenKey: string;
  ttsVoice: string;
  theme?: 'auto' | 'light' | 'dark';
}

export interface Profile {
  fio?: string;
  organization?: string;
  position?: string;
  discipline?: string;
  program?: string;
  level?: string;
  audience?: string;
  course?: string;
  language?: string;
  duration?: number | string;
  [key: string]: any;
}

export interface AppEvent { ts: number; type: string; modId: string | null; data: any }

export interface AppState {
  version: number;
  profile: Profile | null;
  settings: Settings;
  sessions: Record<string, Session>;
  portfolio: PortfolioItem[];
  events: AppEvent[];
}

export interface Analytics {
  started: number;
  completed: number;
  generations: number;
  promptImprovements: number;
  edits: number;
  timeSpent: number;
  avgScore: number | null;
  avgQuiz: number | null;
  portfolio: number;
  perWork: { id: string; completed: boolean; score: number | null; firstScore: number | null; generations: number; promptScore: number | null; quiz: number | null; time: number }[];
}

export interface GenerationResult { text: string; provider: string; model: string; ms: number; error: string | null }

export interface ServerUser { id: number; login: string; role: 'teacher' | 'tutor' }

export interface ServerInfo {
  status: string;
  version: string;
  database: string;
  ai: { configured: boolean; provider: string; model: string };
  tts: { configured: boolean; provider: string };
}

export interface TutorRow {
  login: string;
  fio: string;
  started: number;
  completed: number;
  generations: number;
  promptImprovements: number;
  edits: number;
  timeSpentMs: number;
  avgScore: number | null;
  avgQuiz: number | null;
  portfolio: number;
  events: number;
  aiRequests: number;
  perWork: { modId: string; completed: boolean; firstScore: number | null; score: number | null; generations: number; promptScore: number | null; timeSpentMs: number }[];
}
