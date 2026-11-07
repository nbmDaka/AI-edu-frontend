/* Профиль преподавателя и файловое хранилище документов (ТЗ, п. 9, 34.4):
   силлабусы, лекции, учебники и презентации в DOCX/PDF/PPTX; текст извлекается сервером и подставляется в работы. */
import { useEffect, useState } from 'react'
import { Download, Eye, Trash2 } from 'lucide-react'
import { labApi, type UploadedDoc } from '../api'
import { useT } from '../i18n'
import { DOC_KINDS } from '../logic'
import { Lab, useLab } from '../store'
import { Badge, Button, Empty, PageHead, fmtDate, fmtSize, useConfirm, useModal, useToast } from '../components/ui'
import { ProfileForm, UploadButton } from '../components/forms'

export function ProfilePage() {
  useLab()
  const t = useT()
  const toast = useToast()
  const open = useModal()
  const confirm = useConfirm()
  const [docs, setDocs] = useState<UploadedDoc[]>([])
  const [kind, setKind] = useState('syllabus')
  const load = () => labApi<UploadedDoc[]>('files/').then(setDocs, e => toast((e as Error).message, 'error'))
  useEffect(() => { void load() }, [])
  const cfg = Lab.config()
  const kindName = (k: string) => t(DOC_KINDS.find(x => x[0] === k)?.[1] || k)
  const show = async (d: UploadedDoc) => {
    try {
      const full = await labApi<UploadedDoc>(`files/${d.id}/`)
      open(close => <><div className="vl-row vl-spread"><h2 className="vl-h2">{full.name}</h2><Button variant="ghost" size="sm" onClick={close}>{t('Закрыть')}</Button></div>
        <p className="vl-help">{t('Извлечённый текст ({n} символов). Его можно вставить в поле работы кнопкой «Вставить из моих документов».', { n: full.chars })}</p>
        <pre className="vl-pre vl-doc-text">{full.text || t('Текст не найден (например, документ состоит из сканов).')}</pre></>, { wide: true })
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return <>
    <PageHead eyebrow={t('Профиль и документы')} title={cfg.user.name} description={t('Данные профиля подставляются в исходные данные всех работ.')}/>
    <section className="card"><h2>{t('Профиль преподавателя')}</h2>
      <ProfileForm key={JSON.stringify(Lab.profile())} initial={Lab.profile() || {}} submitLabel={t('Сохранить профиль')}
        onSave={async p => { await Lab.saveProfile(p); toast(t('Профиль сохранён')) }}/></section>
    <section className="card vl-mt2"><div className="vl-row vl-spread"><div><h2 className="vl-h2">{t('Мои документы')}</h2>
      <p className="vl-help">{t('Файлы хранятся на сервере. Допустимы DOCX, PDF, PPTX, TXT и MD до {n} МБ; документы с макросами, скриптами и вложениями отклоняются.', { n: Math.round(cfg.features.maxUploadBytes / 1048576) })}</p></div>
      <div className="vl-row"><select className="input vl-auto" value={kind} onChange={e => setKind(e.target.value)} aria-label={t('Тип документа')}>
        {DOC_KINDS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}</select>
        <UploadButton kind={kind} onUploaded={() => void load()}/></div></div>
      {!docs.length ? <Empty>{t('Документов пока нет. Загрузите силлабус, лекцию или учебное пособие — их текст можно будет использовать в работах.')}</Empty>
        : <div className="vl-table-wrap vl-mt"><table className="vl-table"><thead><tr><th>{t('Документ')}</th><th>{t('Тип')}</th><th>{t('Размер')}</th><th>{t('Загружен')}</th><th/></tr></thead>
          <tbody>{docs.map(d => <tr key={d.id}><td><b>{d.name}</b><small className="vl-help"> · {d.pages ? t('{n} стр.', { n: d.pages }) + ' · ' : ''}{t('{n} символов', { n: d.chars })}</small></td>
            <td><select className="input vl-auto" value={d.kind} aria-label={t('Тип документа')} onChange={async e => {
              try { await labApi(`files/${d.id}/`, 'PATCH', { kind: e.target.value }); void load() } catch (err) { toast((err as Error).message, 'error') }
            }}>{DOC_KINDS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}</select></td>
            <td>{fmtSize(d.size)}</td><td className="vl-help">{fmtDate(d.createdAt, t.locale)}</td>
            <td><div className="vl-row vl-nowrap"><Button variant="ghost" size="sm" onClick={() => void show(d)} title={t('Текст')}><Eye size={15}/></Button>
              <a className="button ghost vl-sm" href={d.url} title={t('Скачать')}><Download size={15}/></a>
              <Button variant="ghost" size="sm" title={t('Удалить')} onClick={() => confirm(t('Удалить документ «{name}»?', { name: d.name }), t('Удалить'),
                () => labApi(`files/${d.id}/`, 'DELETE').then(load, e => toast((e as Error).message, 'error')))}><Trash2 size={15}/></Button></div></td></tr>)}</tbody></table>
          <p className="vl-help vl-mt">{docs.map(d => kindName(d.kind)).filter((v, i, a) => a.indexOf(v) === i).map(k => k).join(' · ')}</p></div>}
      <Badge>{t('Хранилище: {n} файлов', { n: docs.length })}</Badge>
    </section>
  </>
}
