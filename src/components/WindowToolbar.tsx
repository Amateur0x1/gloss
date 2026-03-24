type WindowToolbarProps = {
  platformLabel: string
}

export function WindowToolbar({ platformLabel }: WindowToolbarProps) {
  return (
    <header className="window-toolbar">
      <div className="traffic-lights" aria-hidden="true">
        <span className="traffic-lights__dot traffic-lights__dot--close" />
        <span className="traffic-lights__dot traffic-lights__dot--minimize" />
        <span className="traffic-lights__dot traffic-lights__dot--expand" />
      </div>
      <div className="toolbar-copy">
        <p className="eyebrow">Gloss Reader</p>
        <h1>多语言对读器</h1>
      </div>
      <div className="status-cluster">
        <span className="status-pill">{platformLabel}</span>
        <span className="status-pill">On-device PDF</span>
        <span className="status-pill accent">MiniLM</span>
      </div>
    </header>
  )
}
