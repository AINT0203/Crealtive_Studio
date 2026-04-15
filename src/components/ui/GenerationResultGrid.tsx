export type GeneratedResult = {
  id: string
  label: string
  /** Data URL or blob URL for a generated PNG from the API */
  imageSrc: string
  createdAt: number
  modelName: string
  savedToProjectId?: string
}

export function GenerationResultGrid({
  results,
  onSave,
  onDownload,
  onExpand,
}: {
  results: GeneratedResult[]
  onSave: (id: string) => void
  onDownload: (id: string) => void
  onExpand: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 max-[1024px]:grid-cols-1">
      {results.map((r) => (
        <div
          key={r.id}
          className="studio-card studio-hover-lift group relative overflow-hidden"
        >
          <div className="relative h-[210px] w-full overflow-hidden bg-studio-inset">
            <img
              src={r.imageSrc}
              alt={r.label}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-wrap items-center justify-center gap-2 px-4">
                <button
                  type="button"
                  onClick={() => onSave(r.id)}
                  className="studio-focus-ring rounded-lg bg-studio-primary px-3 py-2 text-xs font-semibold text-studio-text hover:bg-studio-secondary"
                >
                  💾 Save to Project
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(r.id)}
                  className="studio-focus-ring rounded-lg bg-studio-secondary/18 px-3 py-2 text-xs font-semibold text-studio-text hover:bg-studio-secondary/28"
                >
                  ⬇ Download
                </button>
                <button
                  type="button"
                  onClick={() => onExpand(r.id)}
                  className="studio-focus-ring rounded-lg bg-studio-secondary/18 px-3 py-2 text-xs font-semibold text-studio-text hover:bg-studio-secondary/28"
                >
                  🔍 Expand
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-studio-border px-3 py-2">
            <div className="text-xs font-semibold text-studio-text">{r.label}</div>
            <div className="flex items-center gap-2">
              {r.savedToProjectId ? (
                <span className="rounded-full border border-studio-success/40 bg-[#27AE6014] px-2 py-0.5 text-[10px] font-semibold text-studio-success">
                  Saved
                </span>
              ) : null}
              <span className="rounded-full border border-studio-border bg-studio-secondary/10 px-2 py-0.5 font-mono text-[10px] text-studio-muted">
                {r.modelName}
              </span>
              <span className="rounded-full border border-studio-border bg-studio-secondary/10 px-2 py-0.5 font-mono text-[10px] text-studio-muted">
                {new Date(r.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

