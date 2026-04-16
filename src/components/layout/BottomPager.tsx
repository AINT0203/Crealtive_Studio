import { useLocation, useNavigate } from 'react-router-dom'

const FLOW: string[] = ['/projects', '/editor', '/history']

function indexOfPath(pathname: string): number {
  const idx = FLOW.indexOf(pathname)
  return idx
}

export function BottomPager() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const idx = indexOfPath(pathname)
  const canUseFlow = idx !== -1

  const prevPath = canUseFlow && idx > 0 ? FLOW[idx - 1]! : null
  const nextPath = canUseFlow && idx < FLOW.length - 1 ? FLOW[idx + 1]! : null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-6 pb-5 pt-3">
        <button
          type="button"
          onClick={() => {
            if (prevPath) navigate(prevPath)
          }}
          disabled={!prevPath}
          className={[
            'studio-focus-ring pointer-events-auto inline-flex items-center gap-2 rounded-lg',
            'border border-studio-border bg-studio-surface px-4 py-2 text-sm font-semibold',
            'text-studio-text shadow-sm',
            prevPath ? 'hover:border-studio-secondary/45 hover:bg-studio-secondary/10' : 'opacity-50',
          ].join(' ')}
        >
          <span className="text-lg leading-none">‹</span>
          Back
        </button>

        <button
          type="button"
          onClick={() => {
            if (nextPath) navigate(nextPath)
          }}
          disabled={!nextPath}
          className={[
            'studio-focus-ring pointer-events-auto inline-flex items-center gap-2 rounded-lg',
            'border border-studio-secondary/45 bg-studio-secondary px-4 py-2 text-sm font-semibold',
            'text-white shadow-sm',
            nextPath ? 'hover:brightness-110' : 'opacity-50',
          ].join(' ')}
        >
          Next
          <span className="text-lg leading-none">›</span>
        </button>
      </div>
    </div>
  )
}

