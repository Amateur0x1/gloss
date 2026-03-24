import type { DocumentLanguage, LibraryDocument } from '../types'

type LibraryShelfProps = {
  works: LibraryWork[]
  preferredLanguage: DocumentLanguage
  onPreferredLanguageChange: (language: DocumentLanguage) => void
  onOpen: (work: LibraryWork) => void
  onDelete: (work: LibraryWork) => void
}

export type LibraryWork = {
  id: string
  title: string
  documents: Partial<Record<DocumentLanguage, LibraryDocument>>
  updatedAt: string
}

export function LibraryShelf({
  works,
  preferredLanguage,
  onPreferredLanguageChange,
  onOpen,
  onDelete,
}: LibraryShelfProps) {
  return (
    <section className="library-panel">
      <div className="library-panel__header">
        <div>
          <p className="panel-tag">Library</p>
          <h2>已处理书架</h2>
        </div>
        <div className="library-panel__controls">
          <div className="language-toggle" role="tablist" aria-label="书架主语言">
            {(['zh', 'en'] as DocumentLanguage[]).map((language) => (
              <button
                key={language}
                type="button"
                className={`language-toggle__button ${
                  preferredLanguage === language ? 'language-toggle__button--active' : ''
                }`}
                onClick={() => onPreferredLanguageChange(language)}
              >
                {language === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
          <p>
            当前按{preferredLanguage === 'zh' ? '中文' : '英文'}作为主展示语言。点一部作品后，
            Gloss 会把这部作品下已缓存好的多语言版本一起载入到对读区。
          </p>
        </div>
      </div>

      {works.length > 0 ? (
        <div className="library-grid">
          {works.map((work) => (
            <button
              key={work.id}
              type="button"
              className="library-card"
              onClick={() => onOpen(work)}
            >
              <div className="library-card__topline">
                <span className="library-language">{renderLanguages(work.documents)}</span>
                <div className="library-card__actions">
                  <span className="library-updated">{formatUpdatedAt(work.updatedAt)}</span>
                  <button
                    type="button"
                    className="library-delete"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(work)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
              <strong>{resolveDisplayTitle(work, preferredLanguage)}</strong>
              <p>
                {renderSummary(work.documents)}
              </p>
              <span className="library-open">
                载入这部作品的已缓存版本
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <p>还没有已处理的文档。先导入一本书，后面它就会出现在这里。</p>
        </div>
      )}
    </section>
  )
}

function renderLanguages(documents: Partial<Record<DocumentLanguage, LibraryDocument>>) {
  const labels = (['zh', 'en'] as DocumentLanguage[])
    .filter((language) => documents[language])
    .map((language) => (language === 'zh' ? '中文' : 'English'))

  return labels.join(' · ')
}

function renderSummary(documents: Partial<Record<DocumentLanguage, LibraryDocument>>) {
  const values = Object.values(documents)
  const pageCount = values.reduce((total, item) => total + (item?.pageCount ?? 0), 0)
  const segmentCount = values.reduce((total, item) => total + (item?.segmentCount ?? 0), 0)
  return `${values.length} 个版本 · ${pageCount} 页 · ${segmentCount} 个片段`
}

function resolveDisplayTitle(work: LibraryWork, preferredLanguage: DocumentLanguage) {
  const preferredDocument = work.documents[preferredLanguage]
  if (preferredLanguage === 'zh' && preferredDocument?.workTitleZh) {
    return preferredDocument.workTitleZh
  }
  if (preferredLanguage === 'en' && preferredDocument?.workTitleEn) {
    return preferredDocument.workTitleEn
  }
  if (preferredDocument?.workTitle) {
    return preferredDocument.workTitle
  }

  const fallbackLanguage: DocumentLanguage = preferredLanguage === 'zh' ? 'en' : 'zh'
  const fallbackDocument = work.documents[fallbackLanguage]
  if (fallbackLanguage === 'zh' && fallbackDocument?.workTitleZh) {
    return fallbackDocument.workTitleZh
  }
  if (fallbackLanguage === 'en' && fallbackDocument?.workTitleEn) {
    return fallbackDocument.workTitleEn
  }
  if (fallbackDocument?.workTitle) {
    return fallbackDocument.workTitle
  }

  return work.title
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
