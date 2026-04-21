import type { PropsWithChildren, ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Modal({
  open,
  title,
  onClose,
  footer,
  headerRight,
  children,
  wide,
}: PropsWithChildren<{
  open: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  headerRight?: ReactNode
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

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return createPortal(
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
          <div className="flex items-center gap-2">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="studio-focus-ring rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6 18 18" />
                <path d="M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-studio-border px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

