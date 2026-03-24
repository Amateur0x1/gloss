import type { DocumentLanguage, DocumentSlotState } from '../types'

type ImportCardProps = {
  language: DocumentLanguage
  slot: DocumentSlotState
  title: string
  subtitle: string
  statusLabel: string
  onImport: () => void
}

export function ImportCard({
  language,
  slot,
  title,
  subtitle,
  statusLabel,
  onImport,
}: ImportCardProps) {
  return (
    <article className="import-card">
      <div className="import-card__header">
        <div>
          <p className="panel-tag">{language === 'zh' ? 'Source' : 'Target'}</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="primary-button" onClick={onImport}>
          {slot.document ? '重新导入' : '导入 PDF'}
        </button>
      </div>

      <dl className="meta-grid">
        <div>
          <dt>文件</dt>
          <dd>{slot.fileName ?? '未选择'}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>片段</dt>
          <dd>{slot.document?.segments.length ?? 0}</dd>
        </div>
        <div>
          <dt>页数</dt>
          <dd>{slot.document?.pageCount ?? 0}</dd>
        </div>
      </dl>

      <p className="slot-detail">{slot.detail}</p>
    </article>
  )
}
