import type { ReactNode } from 'react'

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div>
        <h1 className="bg-gradient-to-r from-studio-text via-studio-secondary to-studio-muted bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-xl text-sm text-studio-muted">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="pt-1 sm:pt-1.5">{right}</div> : null}
    </header>
  )
}

