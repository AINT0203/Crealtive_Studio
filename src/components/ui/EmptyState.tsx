export function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: string
  title: string
  subtitle: string
  ctaLabel?: string
  onCta?: () => void
}) {
  return (
    <div className="studio-card grid min-h-[340px] place-items-center p-8 text-center">
      <div className="max-w-[520px]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-studio-border bg-studio-secondary/12 text-2xl">
          {icon}
        </div>
        <div className="mt-4 text-lg font-semibold text-studio-text">{title}</div>
        <div className="mt-2 text-sm text-studio-muted">{subtitle}</div>
        {ctaLabel && onCta ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onCta}
              className="studio-focus-ring rounded-xl bg-studio-primary px-4 py-2 text-sm font-semibold text-studio-text shadow-glow hover:bg-studio-secondary"
            >
              {ctaLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

