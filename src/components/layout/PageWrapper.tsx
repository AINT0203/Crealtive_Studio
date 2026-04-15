import type { PropsWithChildren } from 'react'

export function PageWrapper({ children }: PropsWithChildren) {
  return (
    <div className="pl-[240px]">
      <main className="min-h-screen px-8 py-7 animate-fadeIn">{children}</main>
    </div>
  )
}

