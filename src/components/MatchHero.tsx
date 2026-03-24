type MatchHeroProps = {
  sourceText: string
  sourcePage: number
  targetText: string
  targetPage: number
  score: number
}

export function MatchHero({
  sourceText,
  sourcePage,
  targetText,
  targetPage,
  score,
}: MatchHeroProps) {
  return (
    <section className="match-hero">
      <div className="match-card">
        <p className="panel-tag">当前中文片段</p>
        <p className="quote">{sourceText}</p>
        <p className="quote-meta">第 {sourcePage} 页</p>
      </div>
      <div className="match-card match-card--accent">
        <p className="panel-tag">最可能对应的英文原文</p>
        <p className="quote">{targetText}</p>
        <p className="quote-meta">第 {targetPage} 页 · 相关度 {(score * 100).toFixed(1)}%</p>
      </div>
    </section>
  )
}
