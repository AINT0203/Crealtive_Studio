import { useState } from 'react'

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
  onDownload: (id: string, format: 'jpeg' | 'jpg' | 'png' | 'svg' | 'gif') => void
  onExpand: (id: string) => void
}) {
  const [downloadMenuForId, setDownloadMenuForId] = useState<string | null>(null)

  function triggerDownload(id: string, format: 'jpeg' | 'jpg' | 'png' | 'svg' | 'gif') {
    onDownload(id, format)
    setDownloadMenuForId(null)
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-[1024px]:grid-cols-1">
      {results.map((r) => (
        <div
          key={r.id}
          className="studio-card studio-hover-lift relative overflow-hidden"
        >
          <div className="relative h-[210px] w-full overflow-hidden bg-studio-inset">
            <img
              src={r.imageSrc}
              alt={r.label}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-studio-border px-3 py-2">
            <div className="text-xs font-semibold text-studio-text">{r.label}</div>
            <div className="relative flex items-center gap-2">
              {r.savedToProjectId ? (
                <span className="rounded-full border border-studio-success/40 bg-[#27AE6014] px-2 py-0.5 text-[10px] font-semibold text-studio-success">
                  Saved
                </span>
              ) : null}
              <button
                type="button"
                title="Download"
                aria-label="Download"
                onClick={() => setDownloadMenuForId((prev) => (prev === r.id ? null : r.id))}
                className="studio-focus-ring rounded-lg border border-black/20 bg-white px-2 py-1 text-black shadow-sm transition hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v11" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M4 20h16" />
                </svg>
              </button>
              {downloadMenuForId === r.id ? (
                <div className="absolute bottom-full right-0 z-20 mb-2 w-32 rounded-lg border border-studio-border bg-white p-1 shadow-lg">
                  {(['jpeg', 'jpg', 'png', 'svg', 'gif'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => triggerDownload(r.id, fmt)}
                      className="studio-focus-ring w-full rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-studio-text hover:bg-studio-secondary/12"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                title="Save"
                aria-label="Save"
                onClick={() => onSave(r.id)}
                className="studio-focus-ring rounded-lg border border-black/20 bg-white px-2 py-1 text-black shadow-sm transition hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 4h12l2 2v14H5z" />
                  <path d="M8 4v6h8V4" />
                  <path d="M8 20v-6h8v6" />
                </svg>
              </button>
              <button
                type="button"
                title="Expand"
                aria-label="Expand"
                onClick={() => onExpand(r.id)}
                className="studio-focus-ring rounded-lg border border-black/20 bg-white px-2 py-1 text-black shadow-sm transition hover:bg-black/5"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H3v5" />
                  <path d="M16 3h5v5" />
                  <path d="M8 21H3v-5" />
                  <path d="M16 21h5v-5" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

