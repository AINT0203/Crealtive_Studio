import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setSessionAuthenticated } from '../../auth/session'
import { CreaitiveMark } from '../brand/CreaitiveMark'

export function AppHeader({
  rightExtra,
  onNewProject,
}: {
  /** Optional extra UI injected before History/New Project/Account */
  rightExtra?: ReactNode
  /** If omitted, navigates to /projects?new=1 */
  onNewProject?: () => void
}) {
  const navigate = useNavigate()

  return (
    <header className="relative -mx-8 -mt-7 mb-8 overflow-visible">
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-[#070c14] via-[#0f1f3c] to-[#3a1652]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-fuchsia-500/12 to-cyan-400/14" />
      </div>

      <div className="relative flex flex-col gap-3 px-8 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:py-5">
        <div className="flex items-start gap-3 sm:items-center">
          <CreaitiveMark imgClassName="h-8 w-8 object-contain" className="mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-wide text-white/90 drop-shadow">
              Affine Analytics
            </div>
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75 drop-shadow">
              CREALTIVE STUDIO
            </div>
          </div>
        </div>

        <div className="pointer-events-none hidden flex-1 overflow-hidden sm:flex sm:justify-center">
          <span className="select-none whitespace-nowrap text-[clamp(26px,5.2vw,96px)] font-extrabold uppercase tracking-[0.12em] text-white/10">
            CREALTIVE STUDIO
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pt-1.5">
          {rightExtra ? rightExtra : null}

          <button
            type="button"
            onClick={() => navigate('/history')}
            aria-label="History"
            title="History"
            className="studio-focus-ring inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 3v6h6" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onNewProject) onNewProject()
              else navigate('/projects?new=1')
            }}
            className="studio-focus-ring rounded-xl bg-white/15 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-white/20"
          >
            + New Project
          </button>

          <details className="group relative">
            <summary className="studio-focus-ring list-none cursor-pointer rounded-full border border-white/25 bg-white/10 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition hover:bg-white/15">
              <span className="sr-only">Account</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#2b0614] via-[#7a0f33] to-[#3a1652] text-xs font-extrabold tracking-wide text-white">
                OM
              </span>
            </summary>

            <div
              className="pointer-events-none absolute right-[14px] top-[46px] hidden h-4 w-4 rotate-45 group-open:block"
              aria-hidden="true"
            >
              <div className="absolute inset-0 bg-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.35)]" />
              <div className="absolute inset-[1px] bg-black/60" />
            </div>

            <div className="absolute right-0 mt-2 w-[260px] overflow-hidden rounded-2xl border border-white/20 bg-black/60 p-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
              <div className="flex items-center gap-3 px-2 py-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-sm font-extrabold text-white">
                  OM
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">Omkar</div>
                  <div className="truncate text-xs text-white/70">omkar@affine.ai</div>
                </div>
              </div>
              <div className="h-px bg-white/10" />
              <button
                type="button"
                onClick={() => {
                  setSessionAuthenticated(false)
                  navigate('/login', { replace: true })
                }}
                className="mt-1 w-full rounded-xl px-2 py-2 text-left text-sm font-semibold text-white/95 transition hover:bg-white/10"
              >
                Logout
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

