import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import type { SessionHistoryEntry } from '../data/sessionHistory'
import { writeRerunPayload } from '../data/rerunBridge'
import { useApp } from '../state/AppContext'

function formatSessionWhen(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function History() {
  const { sessionHistory, addToast, deleteHistorySession } = useApp()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<SessionHistoryEntry | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...sessionHistory].sort((a, b) => b.createdAt - a.createdAt),
    [sessionHistory],
  )

  function onRerun(session: SessionHistoryEntry) {
    const sourceImageSrc =
      session.sourceImageSrc ?? (session.imageSrcs[0] ? session.imageSrcs[0] : null)
    try {
      const key = writeRerunPayload({
        prompt: session.prompt,
        modelId: session.modelId,
        sourceImageSrc,
      })
      navigate('/editor', { state: { historyRerunKey: key } })
    } catch {
      addToast({
        variant: 'error',
        title: 'Could not prepare re-run',
        message: 'The image or prompt may be too large for this browser tab storage.',
      })
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-studio-text via-studio-secondary to-studio-muted bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Session History
          </h1>
          <p className="mt-2 max-w-xl text-sm text-studio-muted">
            Browse past runs, previews, and re-open details from the API.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-studio-border bg-studio-surface px-3 py-1.5 text-xs font-semibold text-studio-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-studio-secondary/75 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-studio-secondary" />
          </span>
          Live Session
        </div>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          icon="📜"
          title="No sessions yet"
          subtitle="Generate images in the Editor — successful runs appear here automatically."
          ctaLabel="Open Editor"
          onCta={() => navigate('/editor')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((session) => (
            <article
              key={session.id}
              className="studio-card studio-hover-lift flex flex-col overflow-hidden border border-studio-border/90"
            >
              <div className="relative bg-studio-inset px-2.5 pb-3 pt-2.5">
                <span className="absolute right-2.5 top-2.5 z-10 rounded border border-emerald-900/40 bg-emerald-950/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100/95">
                  {session.status === 'success' ? 'Success' : session.status}
                </span>
                <div className="mx-auto flex aspect-[4/5] w-full max-w-[188px] items-center justify-center overflow-hidden rounded-lg border border-studio-border bg-studio-inset">
                  {session.imageSrcs[0] ? (
                    <img
                      src={session.imageSrcs[0]}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <span className="px-2 text-[10px] text-studio-muted">No preview</span>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 border-t border-studio-border px-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs font-semibold text-studio-muted">{session.id}</div>
                  <div className="mt-0.5 truncate text-[10px] leading-tight text-studio-muted">
                    {formatSessionWhen(session.createdAt)}
                  </div>
                </div>

                {confirmingDeleteId === session.id ? (
                  <div className="rounded-lg border border-studio-danger/35 bg-studio-danger/10 p-2">
                    <p className="text-[10px] leading-snug text-studio-muted">Remove this session?</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          deleteHistorySession(session.id)
                          setConfirmingDeleteId(null)
                          if (detail?.id === session.id) setDetail(null)
                        }}
                        className="studio-focus-ring flex-1 rounded-md bg-studio-danger px-2 py-1.5 text-[11px] font-semibold text-studio-text hover:brightness-110"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="studio-focus-ring flex-1 rounded-md border border-studio-border px-2 py-1.5 text-[11px] font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex gap-1.5">
                    <button
                      type="button"
                      title="View details"
                      onClick={() => setDetail(session)}
                      className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-studio-border bg-transparent px-0.5 py-2 text-[10px] font-semibold leading-tight text-studio-text transition-colors hover:border-studio-secondary/50 hover:bg-studio-secondary/12"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      title="Re-run in Editor"
                      onClick={() => onRerun(session)}
                      className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-studio-primary bg-gradient-to-b from-studio-primary to-studio-secondary px-0.5 py-2 text-[10px] font-semibold leading-tight text-white shadow-sm transition-colors hover:brightness-110"
                    >
                      Re-run
                    </button>
                    <button
                      type="button"
                      title="Delete session"
                      onClick={() => setConfirmingDeleteId(session.id)}
                      className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-studio-danger/45 px-0.5 py-2 text-[10px] font-semibold leading-tight text-studio-danger transition-colors hover:bg-studio-danger/12"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(detail)}
        title={detail ? `${detail.id} — details` : 'Details'}
        wide
        onClose={() => setDetail(null)}
        footer={
          detail ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Remove this session from history? This cannot be undone.')) return
                  deleteHistorySession(detail.id)
                  setDetail(null)
                  setConfirmingDeleteId(null)
                }}
                className="studio-focus-ring rounded-lg border border-studio-danger/45 px-4 py-2 text-sm font-semibold text-studio-danger hover:bg-studio-danger/12"
              >
                Delete session
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="studio-focus-ring rounded-lg border border-studio-border px-4 py-2 text-sm font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRerun(detail)
                    setDetail(null)
                  }}
                  className="studio-focus-ring rounded-lg border border-studio-primary bg-gradient-to-b from-studio-primary to-studio-secondary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                >
                  ▶ Re-run in Editor
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div className="max-h-[min(70vh,640px)] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {detail.imageSrcs.map((src, i) => (
                <div
                  key={`${detail.id}-img-${i}`}
                  className="overflow-hidden rounded-xl border border-studio-border bg-studio-inset"
                >
                  <img src={src} alt={`Result ${i + 1}`} className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-studio-muted">Prompt</div>
              <p className="mt-1 rounded-xl border border-studio-border bg-studio-bg p-3 text-sm text-studio-text">
                {detail.prompt}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-studio-muted">
              <span>
                Model: <span className="font-mono text-studio-text">{detail.modelName}</span>
              </span>
              <span>
                Images: <span className="font-mono text-studio-text">{detail.imageCount}</span>
              </span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
