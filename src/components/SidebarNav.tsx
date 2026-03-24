type AppPage = 'library' | 'import' | 'reader'

type SidebarNavProps = {
  activePage: AppPage
  onChange: (page: AppPage) => void
}

const ITEMS: Array<{ id: AppPage; label: string; description: string }> = [
  { id: 'library', label: '书架', description: '已处理作品' },
  { id: 'import', label: '导入', description: '导入并建库' },
  { id: 'reader', label: '阅读', description: '对读视图' },
]

export function SidebarNav({ activePage, onChange }: SidebarNavProps) {
  return (
    <aside className="sidebar-nav">
      <div className="sidebar-nav__section">
        <p className="panel-tag">Navigate</p>
        <div className="sidebar-nav__list">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav__item ${
                activePage === item.id ? 'sidebar-nav__item--active' : ''
              }`}
              onClick={() => onChange(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
