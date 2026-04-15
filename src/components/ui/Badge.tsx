import type { PropsWithChildren } from 'react'

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

function styles(variant: Variant) {
  switch (variant) {
    case 'success':
      return 'border-studio-success/40 bg-[#27AE6014] text-studio-success'
    case 'danger':
      return 'border-studio-danger/40 bg-studio-danger/14 text-studio-danger'
    case 'warning':
      return 'border-studio-accent/40 bg-[#F39C1214] text-studio-accent'
    case 'info':
      return 'border-studio-secondary/40 bg-[#2E86C114] text-studio-secondary'
    case 'neutral':
    default:
      return 'border-studio-border bg-studio-secondary/10 text-studio-muted'
  }
}

export function Badge({
  variant = 'neutral',
  children,
}: PropsWithChildren<{ variant?: Variant }>) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        styles(variant),
      ].join(' ')}
    >
      {children}
    </span>
  )
}

