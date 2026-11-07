/* Портфолио преподавателя (ТЗ, п. 29): материалы по категориям, просмотр, экспорт DOCX/PDF/PPTX/TXT/MD. */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Trash2 } from 'lucide-react'
import { useT } from '../i18n'
import { Lab, useLab } from '../store'
import { useLabPath } from '../paths'
import { Badge, Button, Empty, Markdown, PageHead, fmtDate, scoreTone, useConfirm, useModal, useToast } from '../components/ui'
import { ExportButtons } from './Lab'

export const PORTFOLIO_CATS = ['Силлабус', 'Лекции', 'Практические работы', 'Семинары', 'Презентации', 'Изображения', 'Видео', 'Тесты',
  'Открытые уроки', 'Научные материалы', 'AI-ассистент', 'Промпты', 'Отчёты AI-экспертизы']

export function PortfolioPage() {
  useLab()
  const t = useT()
  const path = useLabPath()
  const open = useModal()
  const confirm = useConfirm()
  const toast = useToast()
  const [cat, setCat] = useState('')
  const items = Lab.portfolio()
  const cats = [...new Set(items.map(x => x.category))]
  const shown = cat ? items.filter(x => x.category === cat) : items
  const all = items.map(x => `# ${x.title}\n\n${x.text}`).join('\n\n---\n\n')
  return <>
    <PageHead eyebrow={t('Портфолио преподавателя')} title={t('Мои учебные материалы')}
      description={t('Итоговые версии, проверенные AI-экспертизой и вами. Материал можно скачать в DOCX, PDF, PPTX, TXT или Markdown.')}/>
    {!items.length ? <Empty><p>{t('Портфолио пока пусто. Выполните любую виртуальную работу и сохраните итоговую версию.')}</p>
      <Link className="button primary" to={path()}>{t('К лабораториям')}</Link></Empty> : <>
      <div className="card vl-mb"><div className="vl-row vl-spread"><div className="vl-chips">
        <button type="button" className={`vl-chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>{t('Все')} · {items.length}</button>
        {PORTFOLIO_CATS.filter(c => cats.includes(c)).concat(cats.filter(c => !PORTFOLIO_CATS.includes(c))).map(c =>
          <button key={c} type="button" className={`vl-chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{t(c)} · {items.filter(x => x.category === c).length}</button>)}</div></div>
        <ExportButtons title={t('Портфолио преподавателя')} text={all} code={null} meta={`AI edu · ${Lab.profile()?.fio || Lab.config().user.name} · ${fmtDate(Date.now(), t.locale)}`}/></div>
      <div className="vl-grid g2">{shown.map(it => {
        const m = Lab.module(it.modId)
        return <div key={it.id} className="card vl-pf-card">
          <div className="vl-row vl-spread"><Badge>{t(it.category)}</Badge>{it.score != null && <Badge tone={scoreTone(it.score)}>{t('Оценка: {n}', { n: it.score })}</Badge>}</div>
          <h3>{it.title}</h3>
          <p className="vl-help">{m ? `${t('ВР № {n}', { n: m.n })} · ` : ''}{t('версия {n}', { n: it.versionN })} · {fmtDate(it.ts, t.locale)}{it.promptScore != null ? ` · ${t('Промпт: {n}%', { n: it.promptScore })}` : ''}</p>
          <div className="vl-row">
            <Button variant="secondary" size="sm" onClick={() => open(close => <>
              <div className="vl-row vl-spread"><h2 className="vl-h2">{it.title}</h2><Button variant="ghost" size="sm" onClick={close}>{t('Закрыть')}</Button></div>
              <ExportButtons title={it.title} text={it.text} code={it.modId} meta={`AI edu · ${m ? t('ВР № {n}', { n: m.n }) + ' · ' : ''}${t('оценка экспертизы')} ${it.score ?? '—'}/100`}/>
              <Markdown text={it.text} className="vl-mt vl-result"/>
              {it.prompt && <details className="vl-mt"><summary>{t('Промпт')}</summary><pre className="vl-pre">{it.prompt}</pre></details>}
            </>, { wide: true })}><Eye size={15}/>{t('Открыть')}</Button>
            {m && <Link className="button secondary vl-sm" to={path(`lab/${m.id}`)}>{t('К работе')}</Link>}
            <Button variant="ghost" size="sm" onClick={() => confirm(t('Удалить материал «{title}» из портфолио?', { title: it.title }), t('Удалить'),
              () => Lab.removeFromPortfolio(it.id).catch(e => toast((e as Error).message, 'error')))}><Trash2 size={15}/>{t('Удалить')}</Button>
          </div></div>
      })}</div></>}
  </>
}
