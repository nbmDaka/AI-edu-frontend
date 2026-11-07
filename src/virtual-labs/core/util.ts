/* AI edu Virtual Labs — общие утилиты */

export const esc = (s: unknown): string => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Слова текста (кириллица + латиница + цифры), в нижнем регистре
export const words = (s: unknown): string[] => (String(s || '').toLowerCase().match(/[a-zа-яёәғқңөұүһі0-9]+/gi) || []);

const STOP = new Set(('и в во на по с со к ко о об от до для из у за над под при про без через как что это ' +
  'а но или ли же бы не ни то так также the of and to in for on with a an is are be by').split(' '));

// Простейший стемминг: первые 5 символов значимого слова
export const stems = (s: unknown, min = 4): string[] => {
  const out: string[] = [];
  for (const w of words(s)) {
    if (w.length < min || STOP.has(w)) continue;
    const st = w.slice(0, Math.min(6, Math.max(4, w.length - 2)));
    if (!out.includes(st)) out.push(st);
  }
  return out;
};

export const splitList = (s: unknown): string[] => String(s || '')
  .split(/\n|;|•/).map((x) => x.replace(/^[\s\-–—*\d.)]+/, '').trim()).filter(Boolean);

export const sentences = (s: unknown): string[] => String(s || '').replace(/\s+/g, ' ')
  .split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ«"(])/).map((x) => x.trim()).filter((x) => x.length > 2);

export const uid = (p = 'id'): string => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const fmtDate = (ts: number | string): string => {
  try { return new Date(ts).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); }
  catch (e) { return String(ts); }
};

export const fmtDuration = (ms: number | null | undefined): string => {
  const m = Math.round((ms || 0) / 60000);
  if (m < 1) return '< 1 мин';
  if (m < 60) return m + ' мин';
  return Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
};

export const fill = (tpl: string, data: Record<string, any>): string => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) =>
  data[k] != null && data[k] !== '' ? data[k] : '…');

// Минимальный Markdown → HTML (заголовки, списки, таблицы, жирный, курсив, код)
export function md(src: unknown): string {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', list: 'ul' | 'ol' | null = null, para: string[] = [], table: string[] | null = null;
  const inline = (t: string) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const flushPara = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
    html += '<div class="table-wrap"><table><thead><tr>' + cells(rows[0]).map((c) => `<th>${c}</th>`).join('') +
      '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + cells(r).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
    table = null;
  };
  let code: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      if (code) { html += '<pre class="code"><code>' + esc(code.join('\n')) + '</code></pre>'; code = null; }
      else { flushPara(); flushList(); flushTable(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) { flushPara(); flushList(); (table = table || []).push(line); continue; }
    flushTable();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); flushList();
      const lvl = Math.min(4, m[1].length + 1);
      html += `<h${lvl}>${inline(m[2])}</h${lvl}>`; continue;
    }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara(); if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara(); if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); html += '<hr>'; continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    flushList(); para.push(line);
  }
  if (code) html += '<pre class="code"><code>' + esc(code.join('\n')) + '</code></pre>';
  flushPara(); flushList(); flushTable();
  return html;
}

// Построчное сравнение двух текстов (LCS) для «Сравнить версии»
export type DiffLine = { t: 'eq' | 'del' | 'add'; s: string };
export function diffLines(a: unknown, b: unknown): DiffLine[] {
  const x = String(a || '').split('\n'), y = String(b || '').split('\n');
  const n = x.length, m = y.length;
  if (n * m > 400000) return [{ t: 'del', s: String(a) }, { t: 'add', s: String(b) }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ t: 'eq', s: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', s: x[i++] });
    else out.push({ t: 'add', s: y[j++] });
  }
  while (i < n) out.push({ t: 'del', s: x[i++] });
  while (j < m) out.push({ t: 'add', s: y[j++] });
  return out;
}

// Детерминированный «случайный» выбор — чтобы демо-результат был воспроизводим
export const hash = (s: unknown): number => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const pick = <T>(arr: T[], seed: unknown): T => arr[hash(seed) % arr.length];

export const util = { esc, words, stems, splitList, sentences, uid, fmtDate, fmtDuration, fill, md, diffLines, hash, pick };
