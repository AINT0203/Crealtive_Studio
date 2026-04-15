import type { PropsWithChildren, ReactNode } from 'react'
import { useEffect } from 'react'

export function Modal({
  open,
  title,
  onClose,
  footer,
  children,
  wide,
}: PropsWithChildren<{
  open: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  /** Wider panel for galleries / detail */
  wide?: boolean
}>) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={[
          'studio-card max-w-full overflow-hidden shadow-lift',
          wide ? 'w-[min(920px,calc(100vw-2rem))]' : 'w-[560px]',
        ].join(' ')}
      >
        <div className="flex items-start justify-between border-b border-studio-border px-5 py-4">
          <div className="text-sm font-semibold text-studio-text">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-studio-border px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

