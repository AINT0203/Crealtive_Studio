export function CreditPill({ credits }: { credits: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-studio-accent/40 bg-[#F39C1214] px-3 py-1.5 text-xs font-semibold text-studio-accent">
      <span aria-hidden="true">⚡</span>
      <span>{credits.toLocaleString()} credits</span>
    </div>
  )
}

