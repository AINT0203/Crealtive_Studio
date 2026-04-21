import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/layout/AppHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import type { SessionHistoryEntry } from '../data/sessionHistory'
import { writeRerunPayload } from '../data/rerunBridge'
import { useApp } from '../state/AppContext'

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s)
  if (!m?.[2]) return null
  try {
    const binary = atob(m[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: m[1] || 'image/png' })
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

async function renderImageToCanvas(imageSrc: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not create canvas context'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Could not process generated image'))
    img.src = imageSrc
  })
}

async function imageSrcToDownloadBlob(imageSrc: string, format: 'jpeg' | 'jpg' | 'png' | 'svg'): Promise<Blob> {
  if (format === 'svg') {
    const fetched = await fetch(imageSrc)
    const srcBlob = await fetched.blob()
    const srcDataUrl = await blobToDataUrl(srcBlob)
    const canvas = await renderImageToCanvas(imageSrc)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${srcDataUrl}" width="100%" height="100%"/></svg>`
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  }

  const canvas = await renderImageToCanvas(imageSrc)
  const requestedMime = format === 'png' ? 'image/png' : 'image/jpeg'
  const encodedDataUrl = canvas.toDataURL(requestedMime)
  if (!encodedDataUrl.startsWith(`data:${requestedMime}`)) {
    throw new Error(`${format.toUpperCase()} export is not supported in this browser`)
  }
  const blob = dataUrlToBlob(encodedDataUrl)
  if (!blob) throw new Error('Could not prepare download')
  return blob
}

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

function sessionModelBadge(session: SessionHistoryEntry): string {
  const fromName = (session.modelName || '').toLowerCase()
  const fromId = (session.modelId || '').toLowerCase()
  if (fromId.includes('gpt') || fromName.includes('gpt')) return 'GPT'
  if (fromId.includes('gemini') || fromName.includes('gemini')) return 'Gemini'
  return session.modelName || session.modelId || (session.status === 'success' ? 'Success' : session.status)
}

export function History() {
  const { projects, sessionHistory, addToast, deleteHistorySession } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [detail, setDetail] = useState<SessionHistoryEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SessionHistoryEntry | null>(null)
  const [detailDownloadOpen, setDetailDownloadOpen] = useState(false)
  const selectedProjectId = params.get('projectId') ?? ''
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const sorted = useMemo(
    () =>
      [...sessionHistory]
        .filter((s) => {
          if (!selectedProjectId) return true
          if (s.projectId === selectedProjectId) return true
          return Boolean(selectedProject?.name && s.projectName === selectedProject.name)
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [sessionHistory, selectedProjectId, selectedProject],
  )

  async function downloadGeneratedImage(
    session: SessionHistoryEntry,
    src: string,
    imageIndex: number,
    format: 'jpeg' | 'jpg' | 'png' | 'svg',
  ) {
    try {
      const blob = await imageSrcToDownloadBlob(src, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(session.projectName || 'session').replace(/\s+/g, '-')}-result-${imageIndex + 1}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      addToast({ variant: 'info', title: `Download started (${format.toUpperCase()})` })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not prepare download'
      addToast({ variant: 'error', title: message })
    }
  }

  async function downloadAllGeneratedImages(session: SessionHistoryEntry, format: 'jpeg' | 'jpg' | 'png' | 'svg') {
    if (!session.imageSrcs.length) {
      addToast({ variant: 'error', title: 'Nothing to download', message: 'No generated image for this session.' })
      return
    }
    for (let i = 0; i < session.imageSrcs.length; i++) {
      const src = session.imageSrcs[i]
      if (!src) continue
      await downloadGeneratedImage(session, src, i, format)
    }
  }

  function onRerun(session: SessionHistoryEntry) {
    const sourceImageSrc =
      session.sourceImageSrc ?? (session.imageSrcs[0] ? session.imageSrcs[0] : null)
    const sourceImageSrcs =
      session.sourceImageSrcs && session.sourceImageSrcs.length > 0
        ? session.sourceImageSrcs
        : sourceImageSrc
          ? [sourceImageSrc]
          : []
    try {
      const key = writeRerunPayload({
        prompt: session.prompt,
        modelId: session.modelId,
        sourceImageSrc,
        sourceImageSrcs,
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
      <AppHeader />
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            {selectedProject ? `${selectedProject.name} History` : 'Session History'}
          </h1>
        
        </div>
        <button
          type="button"
          onClick={() =>
            selectedProjectId
              ? navigate(`/editor?projectId=${encodeURIComponent(selectedProjectId)}`)
              : navigate('/editor')
          }
          className="studio-focus-ring shrink-0 self-start rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-4 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
        >
          New Session
        </button>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          icon="📜"
          title={selectedProject ? 'No sessions for this project yet' : 'No sessions yet'}
          subtitle={
            selectedProject
              ? 'Run a generation from the Editor with this project selected — successful runs show up here.'
              : 'Generate images in the Editor — successful runs appear here automatically.'
          }
          ctaLabel="Open Editor"
          onCta={() =>
            selectedProjectId
              ? navigate(`/editor?projectId=${encodeURIComponent(selectedProjectId)}`)
              : navigate('/editor')
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sorted.map((session) => (
            <article
              key={session.id}
              className="studio-card studio-hover-lift flex flex-col overflow-hidden border border-studio-border/90"
            >
              <div className="relative bg-studio-inset px-2.5 pb-3 pt-2.5">
                <span className="absolute right-2.5 top-2.5 z-10 rounded border border-emerald-900/40 bg-emerald-950/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100/95">
                  {sessionModelBadge(session)}
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
                  <div className="truncate text-sm font-bold text-studio-text">
                    {session.projectName || 'Untitled Project'}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] leading-tight text-studio-muted">
                    {formatSessionWhen(session.createdAt)}
                  </div>
                </div>

                <div className="mt-auto flex gap-1.5">
                  <button
                    type="button"
                    title="View details"
                    onClick={() => setDetail(session)}
                    className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-[#7a0f33]/35 bg-transparent px-0.5 py-2 text-[10px] font-semibold leading-tight text-[#7a0f33] transition-colors hover:border-[#7a0f33] hover:bg-[#7a0f33]/12"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    title="Open in Editor"
                    onClick={() => onRerun(session)}
                    className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-[#7a0f33] bg-[#7a0f33] px-0.5 py-2 text-[10px] font-semibold leading-tight text-white shadow-sm transition-colors hover:bg-[#5e0c27]"
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    title="Delete session"
                    onClick={() => setDeleteTarget(session)}
                    className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-studio-danger/45 px-0.5 py-2 text-[10px] font-semibold leading-tight text-studio-danger transition-colors hover:bg-studio-danger/12"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-start">
        <button
          type="button"
          onClick={() =>
            selectedProjectId
              ? navigate(`/projects`)
              : navigate('/editor')
          }
          className="studio-focus-ring inline-flex items-center gap-2 rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-5 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
        >
          <span className="text-lg leading-none">‹</span>
          Back
        </button>
      </div>

      <Modal
        open={Boolean(detail)}
        title={detail ? `${detail.projectName || 'Untitled Project'} — details` : 'Details'}
        wide
        onClose={() => {
          setDetail(null)
          setDetailDownloadOpen(false)
        }}
        footer={
          detail ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(detail)
                  setDetail(null)
                }}
                className="studio-focus-ring rounded-lg border border-[#2b0614]/45 px-4 py-2 text-sm font-semibold text-[#2b0614] hover:bg-[#2b0614]/10"
              >
                Delete session
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDetailDownloadOpen((prev) => !prev)}
                    className="studio-focus-ring rounded-lg border border-[#7a0f33]/35 bg-transparent px-4 py-2 text-sm font-semibold text-[#7a0f33] hover:bg-[#7a0f33]/12"
                  >
                    ⬇ Download
                  </button>
                  {detailDownloadOpen ? (
                    <div className="absolute bottom-full right-0 z-20 mb-2 w-28 rounded-lg border border-studio-border bg-white p-1 shadow-lg">
                      {(['jpeg', 'jpg', 'png', 'svg'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => {
                            void downloadAllGeneratedImages(detail, fmt)
                            setDetailDownloadOpen(false)
                          }}
                          className="studio-focus-ring w-full rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-studio-text hover:bg-studio-secondary/12"
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onRerun(detail)
                    setDetail(null)
                  }}
                  className="studio-focus-ring rounded-lg border border-[#7a0f33] bg-[#7a0f33] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#5e0c27]"
                >
                  ▶ Editor
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div className="max-h-[min(62vh,520px)] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-studio-muted">Input Images</div>
              {(detail.sourceImageSrcs && detail.sourceImageSrcs.length > 0) || detail.sourceImageSrc ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(detail.sourceImageSrcs && detail.sourceImageSrcs.length > 0
                    ? detail.sourceImageSrcs
                    : detail.sourceImageSrc
                      ? [detail.sourceImageSrc]
                      : []
                  ).map((src, i) => (
                    <div
                      key={`${detail.id}-input-${i}`}
                      className="w-full overflow-hidden rounded-lg border border-studio-border bg-studio-bg"
                    >
                      <img src={src} alt={`Input ${i + 1}`} className="h-36 w-full object-contain" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-studio-border bg-studio-inset p-3 text-xs text-studio-muted">
                  No input image stored for this session.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-studio-muted">Generated Images</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {detail.imageSrcs.map((src, i) => (
                  <div
                    key={`${detail.id}-img-${i}`}
                    className="overflow-hidden rounded-lg border border-studio-border bg-studio-bg"
                  >
                    <img src={src} alt={`Result ${i + 1}`} className="h-36 w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-studio-muted">Prompt</div>
              <p className="mt-1 rounded-lg border border-studio-border bg-studio-bg p-2.5 text-sm text-studio-text">
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

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete session?"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteTarget) return
                deleteHistorySession(deleteTarget.id)
                setDeleteTarget(null)
              }}
              className="studio-focus-ring rounded-lg bg-[#2b0614] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4b071d]"
            >
              Delete
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm text-studio-text">
            This will permanently delete{' '}
            <span className="font-semibold">{deleteTarget?.projectName || 'this session'}</span>.
          </div>
          <div className="text-sm text-studio-muted">This action cannot be undone.</div>
        </div>
      </Modal>
    </div>
  )
}
