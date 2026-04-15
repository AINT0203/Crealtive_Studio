import { useApp } from '../../state/AppContext'

function variantStyles(variant: 'success' | 'error' | 'info') {
  switch (variant) {
    case 'success':
      return 'border-studio-success/45 bg-studio-success/12'
    case 'error':
      return 'border-studio-danger/45 bg-studio-danger/12'
    case 'info':
    default:
      return 'border-studio-secondary/40 bg-studio-secondary/12'
  }
}

export function ToastViewport() {
  const { toasts, dismissToast } = useApp()

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'studio-card',
            'animate-fadeIn',
            'border px-4 py-3 shadow-lift',
            variantStyles(t.variant),
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-studio-text">
                {t.title}
              </div>
              {t.message ? (
                <div className="mt-1 text-xs text-studio-muted">{t.message}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="rounded-md px-2 py-1 text-xs text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

