import { NavLink, useNavigate } from 'react-router-dom'
import { setSessionAuthenticated } from '../../auth/session'
import { useApp } from '../../state/AppContext'
import { CreaitiveMark } from '../brand/CreaitiveMark'
import { CreditPill } from '../ui/CreditPill'

function Logo() {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <CreaitiveMark imgClassName="h-8 w-8 object-contain" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide text-studio-secondary">
          Affine Analytics
        </div>
        <div className="text-[11px] text-studio-muted">CreAItive Studio workspace</div>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: string
  icon: string
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-lg px-4 py-2 text-sm',
          'transition-colors',
          isActive
            ? 'bg-studio-secondary/18 text-studio-text'
            : 'text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={[
              'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r',
              isActive ? 'bg-studio-accent' : 'bg-transparent',
            ].join(' ')}
          />
          <span className="text-base">{icon}</span>
          <span className="font-medium">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const navigate = useNavigate()
  const { credits, uiTheme, toggleUiTheme } = useApp()

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-[240px] flex-col border-r border-studio-border bg-studio-bg">
      <Logo />

      <nav className="px-2 pt-2">
        <div className="space-y-1">
          <NavItem to="/projects" icon="📁" label="Projects" />
          <NavItem to="/editor" icon="🎨" label="Editor" />
          <NavItem to="/history" icon="📜" label="History" />
        </div>
      </nav>

      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-studio-border bg-studio-secondary/8 px-3 py-2">
          <span className="text-[11px] font-semibold leading-tight text-studio-muted">
            Light
            <br />
            <span className="font-normal text-studio-muted/80">interface</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={uiTheme === 'light'}
            aria-label={uiTheme === 'light' ? 'Switch to dark interface' : 'Switch to light interface'}
            onClick={toggleUiTheme}
            className={[
              'studio-focus-ring relative h-7 w-12 shrink-0 rounded-full border border-studio-border bg-studio-surface transition-colors',
              uiTheme === 'light' ? 'border-studio-secondary/45 bg-studio-secondary/20' : '',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out',
                uiTheme === 'light' ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <div className="mt-auto border-t border-studio-border p-4">
        <div className="mb-3">
          <CreditPill credits={credits} />
        </div>

        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-studio-secondary/18 text-sm font-semibold text-studio-text">
            OM
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-studio-text">Omkar</div>
            <div className="truncate text-xs text-studio-muted">omkar@affine.ai</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setSessionAuthenticated(false)
            navigate('/login', { replace: true })
          }}
          className="studio-focus-ring mt-3 w-full rounded-lg border border-studio-border py-2 text-xs font-semibold text-studio-muted transition-colors hover:border-studio-danger/40 hover:bg-studio-danger/10 hover:text-studio-text"
        >
          Sign out
        </button>

        <div className="mt-3 text-[10px] leading-relaxed text-studio-muted">
          Affine Analytics — CreAItive Studio v1.0
        </div>
      </div>
    </aside>
  )
}

