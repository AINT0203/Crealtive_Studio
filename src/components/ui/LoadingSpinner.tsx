export function LoadingSpinner({
  size = 'md',
  label,
}: {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  const px = size === 'sm' ? 18 : size === 'lg' ? 34 : 24

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-full border-2 border-studio-border border-t-studio-secondary animate-spinSlow"
        style={{ width: px, height: px }}
        aria-label={label ?? 'Loading'}
        role="status"
      />
      {label ? <div className="text-sm text-studio-muted">{label}</div> : null}
    </div>
  )
}

