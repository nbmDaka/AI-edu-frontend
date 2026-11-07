export type AnalyticsUsage = {
  started_students: number; active_students: number; completed_students: number; completion_rate: number
}
export type AnalyticsCourse = AnalyticsUsage & {
  id: number; short_id: string; title: string; learning_track_id: number; module_count: number; item_count: number
}
export type ModuleRecommendations = {
  attempts: number; tested_students: number; next_students: number; repeat_students: number; next_rate: number
  average_readiness: number | null; readiness_values: number[]; weak_topics: { competency: string; title: string; students: number }[]
}
export type AnalyticsModule = AnalyticsUsage & { id: number; short_id: string; title: string; course_id: number; item_count: number; threshold?: number; recommendations?: ModuleRecommendations }
export type LearningAnalytics = {
  generated_at: string; period: string; since: string | null
  filters: { track: number | null; course: number | null }
  options: {
    tracks: { id: number; title: string }[]
    courses: { id: number; short_id: string; title: string; learning_track_id: number }[]
  }
  summary: {
    total_students: number; started_students: number; active_students: number; completed_students: number
    course_count: number; module_count: number; item_count: number
  }
  tracks: { id: number; title: string; assigned_students: number; started_students: number; active_students: number }[]
  courses: AnalyticsCourse[]; modules: AnalyticsModule[]
}

// Quote spreadsheet formulas as text, as well as escaping CSV delimiters/quotes.
export function analyticsCsv(rows: (string | number)[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value)
    const safe = /^[\s]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }).join(';')).join('\r\n')
}
