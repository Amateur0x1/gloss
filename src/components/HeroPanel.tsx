type HeroPanelProps = {
  globalStatus: string
}

export function HeroPanel({ globalStatus }: HeroPanelProps) {
  return (
    <section className="hero-panel">
      <div className="hero-copyblock">
        <p className="panel-tag">Workspace</p>
        <h2>把中译本与英文原文放在同一张桌面上。</h2>
        <p className="hero-copy">
          Gloss 会在本机完成文本抽取、切段与跨语言向量匹配。你只需要选中文片段，右侧就会定位最接近的英文段落。
        </p>
      </div>
      <aside className="hero-aside">
        <div className="hero-stat">
          <span>状态</span>
          <strong>{globalStatus}</strong>
        </div>
        <div className="hero-stat">
          <span>模型缓存</span>
          <strong>首次下载，后续复用</strong>
        </div>
      </aside>
    </section>
  )
}
