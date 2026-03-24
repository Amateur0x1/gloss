import { startTransition } from 'react'

import type { DocumentSegment, MatchResult, ParsedPdfDocument } from '../types'

type ReaderColumnsProps = {
  chineseDoc: ParsedPdfDocument
  englishDoc: ParsedPdfDocument
  selectedSourceIndex: number
  matches: MatchResult[]
  onSelectSource: (index: number) => void
}

export function ReaderColumns({
  chineseDoc,
  englishDoc,
  selectedSourceIndex,
  matches,
  onSelectSource,
}: ReaderColumnsProps) {
  return (
    <section className="reader-layout">
      <article className="reader-panel">
        <div className="reader-panel__header">
          <div>
            <p className="panel-tag">Chinese</p>
            <h2>中文句段</h2>
          </div>
          <p>点击左侧任意一句，右边会自动定位最相近的英文段落。</p>
        </div>
        <div className="segment-list">
          {chineseDoc.segments.map((segment) => (
            <button
              key={segment.id}
              className={`segment-card ${
                segment.index === selectedSourceIndex ? 'segment-card--active' : ''
              }`}
              onClick={() =>
                startTransition(() => {
                  onSelectSource(segment.index)
                })
              }
            >
              <span className="segment-page">P.{segment.page}</span>
              <span>{segment.text}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="reader-panel">
        <div className="reader-panel__header">
          <div>
            <p className="panel-tag">English</p>
            <h2>英文句段</h2>
          </div>
          <p>顶部给出最优命中，列表中保留 Top 候选，方便继续顺读和校正。</p>
        </div>

        <div className="match-list">
          {matches.map((match, index) => {
            const segment = englishDoc.segments[match.targetIndex]
            if (!segment) {
              return null
            }

            return (
              <div key={`${segment.id}-${index}`} className="match-chip">
                <span>Top {index + 1}</span>
                <strong>{(match.score * 100).toFixed(1)}%</strong>
                <span>
                  {segment.text.slice(0, 72)}
                  {segment.text.length > 72 ? '...' : ''}
                </span>
              </div>
            )
          })}
        </div>

        <div className="segment-list">
          {englishDoc.segments.map((segment) => {
            const rank = matches.findIndex((match) => match.targetIndex === segment.index)

            return (
              <TargetSegmentCard key={segment.id} segment={segment} rank={rank} />
            )
          })}
        </div>
      </article>
    </section>
  )
}

type TargetSegmentCardProps = {
  segment: DocumentSegment
  rank: number
}

function TargetSegmentCard({ segment, rank }: TargetSegmentCardProps) {
  return (
    <div
      data-target-segment={segment.index}
      className={`segment-card segment-card--static ${
        rank === 0 ? 'segment-card--matched' : ''
      } ${rank > 0 ? 'segment-card--secondary' : ''}`}
    >
      <div className="segment-topline">
        <span className="segment-page">P.{segment.page}</span>
        {rank >= 0 ? <span className="rank-badge">Top {rank + 1}</span> : null}
      </div>
      <span>{segment.text}</span>
    </div>
  )
}
