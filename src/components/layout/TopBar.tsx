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
        <h1 className="bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-xl bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-sm text-transparent">
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="pt-1 sm:pt-1.5">{right}</div> : null}
    </header>
  )
}

