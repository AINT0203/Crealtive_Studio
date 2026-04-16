import type { PropsWithChildren } from 'react'

export function PageWrapper({ children }: PropsWithChildren) {
  return (
    <main className="min-h-screen px-8 py-7 animate-fadeIn">{children}</main>
  )
}

