import { theme, toggleTheme } from '../../store'

interface HeaderProps {
  onBrowseClick?: () => void
}

export function Header({ onBrowseClick }: HeaderProps) {
  return (
    <header>
      <div class="logo">
        SOCIAL PLANNER <span>Photo</span>
      </div>
      <div class="header-actions">
        {onBrowseClick && (
          <button class="theme-toggle" onClick={onBrowseClick} title="Add images">
            <span class="material-symbols-outlined" style={{ fontSize: '18px' }}>add_photo_alternate</span>
          </button>
        )}
        <button class="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
          {theme.value === 'dark' ? '\u2600' : '\u263D'}
        </button>
      </div>
    </header>
  )
}
