import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/layout/TopBar'
import { EmptyState } from '../components/ui/EmptyState'
import { GenerationResultGrid, type GeneratedResult } from '../components/ui/GenerationResultGrid'
import { ImageUploadZone, type UploadedImage } from '../components/ui/ImageUploadZone'
import { MaskCanvas } from '../components/ui/MaskCanvas'
import { Modal } from '../components/ui/Modal'
import { ModelSelector } from '../components/ui/ModelSelector'
import { requestGenerate } from '../api/generate'
import { models } from '../data/models'
import { consumeRerunPayload, readRerunPayload } from '../data/rerunBridge'
import { useApp } from '../state/AppContext'

function safeId(prefix: string) {
  const cryptoId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${cryptoId}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

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

type EditorLocationState = {
  /** Points to sessionStorage payload (large images exceed history.state limits) */
  historyRerunKey?: string
  historyPrompt?: string
  historyModelId?: string
  historySourceImageSrc?: string
}

export function Editor() {
  const { credits, projects, addToast, deductCredits, addHistorySession, applyProjectUsage } = useApp()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const initialProjectId = params.get('projectId') ?? ''

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)

  const [uploaded, setUploaded] = useState<UploadedImage | null>(null)
  const [enableMask, setEnableMask] = useState(false)
  const [brushSize, setBrushSize] = useState(24)

  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('gemini-flash')
  const [count, setCount] = useState<1 | 2 | 3 | 4>(2)

  const [attemptedGenerate, setAttemptedGenerate] = useState(false)

  const [phase, setPhase] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<GeneratedResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const generateAbortRef = useRef<AbortController | null>(null)
  const consumedHistoryRerunKeyRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort()
    }
  }, [])

  useLayoutEffect(() => {
    const raw = location.state
    if (raw == null || typeof raw !== 'object') return
    const st = raw as EditorLocationState

    if (typeof st.historyRerunKey === 'string' && st.historyRerunKey.length > 0) {
      const storageKey = st.historyRerunKey
      if (consumedHistoryRerunKeyRef.current === storageKey) return
      consumedHistoryRerunKeyRef.current = storageKey

      const payload = readRerunPayload(storageKey)
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} })
      consumeRerunPayload(storageKey)

      if (!payload) {
        addToast({
          variant: 'error',
          title: 'Re-run data was missing',
          message: 'Go back to History and click Re-run again.',
        })
        return
      }

      if (payload.prompt) setPrompt(payload.prompt)
      if (payload.modelId && models.some((m) => m.id === payload.modelId)) {
        setModelId(payload.modelId)
      }

      if (!payload.sourceImageSrc) return

      const blob = dataUrlToBlob(payload.sourceImageSrc)
      if (!blob) {
        addToast({ variant: 'error', title: 'Could not decode image from history' })
        return
      }
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
      const file = new File([blob], `history-input.${ext}`, { type: blob.type || 'image/png' })
      const previewUrl = URL.createObjectURL(file)
      setUploaded((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { file, previewUrl }
      })
      return
    }

    if (!st.historyPrompt && !st.historySourceImageSrc) return

    const snapshot = {
      prompt: st.historyPrompt ?? '',
      modelId: st.historyModelId,
      source: st.historySourceImageSrc,
    }

    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} })

    if (snapshot.prompt) setPrompt(snapshot.prompt)
    if (snapshot.modelId && models.some((m) => m.id === snapshot.modelId)) {
      setModelId(snapshot.modelId)
    }

    if (!snapshot.source) return

    const blob = dataUrlToBlob(snapshot.source)
    if (!blob) {
      addToast({ variant: 'error', title: 'Could not restore image from history' })
      return
    }
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
    const file = new File([blob], `history-input.${ext}`, { type: blob.type || 'image/png' })
    const previewUrl = URL.createObjectURL(file)
    setUploaded((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return { file, previewUrl }
    })
  }, [location.state, location.pathname, location.search, navigate, addToast])

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId)!, [modelId])

  const estimatedCost = useMemo(() => {
    // Size is fixed (1024×1024) — dropdown removed
    return Math.round(count * selectedModel.costPerUnit)
  }, [count, selectedModel.costPerUnit])

  const chips = ['Change background', 'Add object', 'Adjust lighting', 'Change style']

  function canGenerate() {
    return Boolean(uploaded && prompt.trim().length > 0 && selectedModel.geminiModelId)
  }

  function stopGeneration() {
    generateAbortRef.current?.abort()
    generateAbortRef.current = null
    setPhase('idle')
    setErrorMsg(null)
  }

  async function onGenerate() {
    setAttemptedGenerate(true)

    if (!uploaded) return
    if (!prompt.trim()) return
    if (!selectedModel.geminiModelId) {
      setErrorMsg('This editor uses the Python backend with Gemini. Choose “Gemini Flash” as the model.')
      return
    }

    setErrorMsg(null)
    setPhase('generating')
    setResults([])

    generateAbortRef.current?.abort()
    const ac = new AbortController()
    generateAbortRef.current = ac

    try {
      const data = await requestGenerate({
        image: uploaded.file,
        prompt: prompt.trim(),
        numImages: count,
        geminiModelId: selectedModel.geminiModelId,
        signal: ac.signal,
      })

      const now = Date.now()
      const mime = data.mime_type || 'image/png'
      const nextResults: GeneratedResult[] = data.images_b64.map((b64, i) => ({
        id: safeId('r'),
        label: `Result ${i + 1}`,
        imageSrc: `data:${mime};base64,${b64}`,
        createdAt: now,
        modelName: selectedModel.name,
      }))

      setResults(nextResults)
      setPhase('done')

      const sourceImageSrc = await fileToDataUrl(uploaded.file)
      addHistorySession({
        status: 'success',
        prompt: prompt.trim(),
        modelName: selectedModel.name,
        modelId: selectedModel.id,
        imageCount: nextResults.length,
        imageSrcs: nextResults.map((r) => r.imageSrc),
        sourceImageSrc,
      })

      const total = estimatedCost
      if (selectedProjectId) {
        applyProjectUsage(selectedProjectId, {
          experiments: 1,
          credits: Math.max(0, total),
        })
      }
      if (total > 0) {
        deductCredits(total)
        addToast({
          variant: 'success',
          title: `⚡ ${total.toLocaleString()} credits used`,
          message: `Generation finished with ${nextResults.length} image(s).`,
        })
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setPhase('idle')
        return
      }
      const msg = e instanceof Error ? e.message : 'Generation failed'
      setPhase('error')
      setErrorMsg(`⚠ ${msg}. Credits were not deducted.`)
    } finally {
      if (generateAbortRef.current === ac) generateAbortRef.current = null
    }
  }

  function onSaveResult(resultId: string) {
    if (!selectedProjectId) {
      addToast({
        variant: 'error',
        title: 'Select a project before saving',
        message: 'Pick a project in the dropdown at the top of the editor.',
      })
      return
    }
    const existing = results.find((r) => r.id === resultId)
    if (existing?.savedToProjectId) {
      addToast({
        variant: 'info',
        title: 'Already saved',
        message: 'This result is already linked to a project.',
      })
      return
    }
    setResults((prev) =>
      prev.map((r) => (r.id === resultId ? { ...r, savedToProjectId: selectedProjectId } : r)),
    )
    applyProjectUsage(selectedProjectId, { images: 1 })
    addToast({ variant: 'success', title: 'Saved to project' })
  }

  function onDownloadResult(resultId: string) {
    const r = results.find((x) => x.id === resultId)
    if (!r) return

    const blob = dataUrlToBlob(r.imageSrc)
    if (!blob) {
      addToast({ variant: 'error', title: 'Could not prepare download' })
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `creaitive-${r.label.toLowerCase().replace(/\s+/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    addToast({ variant: 'info', title: 'Download started' })
  }

  const expanded = expandedId ? results.find((r) => r.id === expandedId) : null

  return (
    <div>
      <TopBar
        title="Editor"
        subtitle="Upload, mask, prompt, generate, and save variations"
        right={
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-studio-muted">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="studio-focus-ring rounded-xl border border-studio-border bg-studio-bg px-3 py-2 text-sm text-studio-text"
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {errorMsg ? (
        <div className="mb-4 studio-card border border-studio-danger/35 bg-studio-danger/10 px-4 py-3 text-sm text-studio-text">
          <div className="flex items-start justify-between gap-3">
            <div>{errorMsg}</div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="rounded-md px-2 py-1 text-xs text-studio-muted hover:bg-studio-danger/15 hover:text-studio-text"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,60fr)_minmax(0,40fr)] gap-5 max-[1024px]:grid-cols-1">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="studio-card p-4">
            <div className="text-sm font-semibold text-studio-text">Step 1 — Upload Image</div>
            <div className="mt-3">
              <ImageUploadZone value={uploaded} onChange={setUploaded} />
              {attemptedGenerate && !uploaded ? (
                <div className="mt-2 text-xs font-semibold text-studio-danger">
                  Please upload an image before generating
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold text-studio-text">
                <input
                  type="checkbox"
                  checked={enableMask}
                  onChange={(e) => setEnableMask(e.target.checked)}
                  className="h-4 w-4 accent-studio-accent"
                />
                Enable Mask
              </label>
            </div>

            <MaskCanvas
              enabled={enableMask}
              brushSize={brushSize}
              onBrushSizeChange={setBrushSize}
              onClear={() => addToast({ variant: 'info', title: 'Mask cleared' })}
            />
          </div>

          <div className="studio-card p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-studio-text">Step 2 — Edit Prompt</div>
                <div className="mt-1 text-xs text-studio-muted">
                  Be specific about what you want changed.
                </div>
              </div>
              <div className="font-mono text-xs text-studio-muted">
                {Math.min(1000, prompt.length)} / 1000
              </div>
            </div>

            <textarea
              rows={4}
              value={prompt}
              maxLength={1000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Add a glowing Halloween pumpkin in the lower-left background"
              className="studio-focus-ring mt-3 w-full resize-none rounded-xl border border-studio-border bg-studio-bg px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/60"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setPrompt((p) => (p ? `${p.trim()} • ${c}` : c))}
                  className="rounded-full border border-studio-border bg-studio-secondary/10 px-3 py-1.5 text-xs font-semibold text-studio-muted hover:border-studio-secondary/60 hover:text-studio-text"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-card p-4">
            <div className="text-sm font-semibold text-studio-text">Step 3 — Options</div>

            <div className="mt-3">
              <ModelSelector models={models} value={modelId} onChange={setModelId} />
              {!selectedModel.geminiModelId ? (
                <p className="mt-2 text-xs text-studio-muted">
                  Image generation runs on the server with Google Gemini. Switch to <span className="text-studio-text">Gemini Flash</span> to generate.
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="studio-card border border-studio-border bg-studio-inset p-3">
                <div className="text-xs font-semibold text-studio-muted">Count</div>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n as 1 | 2 | 3 | 4)}
                      className={[
                        'studio-focus-ring flex-1 rounded-lg px-3 py-2 text-sm font-semibold',
                        count === n
                          ? 'bg-studio-secondary text-studio-text shadow-glow'
                          : 'bg-studio-secondary/10 text-studio-muted hover:bg-studio-secondary/18 hover:text-studio-text',
                      ].join(' ')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-3 font-mono text-xs text-studio-muted">
                  Estimated cost: ⚡ {estimatedCost.toLocaleString()} credits
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate() || phase === 'generating'}
              className="studio-focus-ring mt-4 w-full rounded-xl bg-studio-accent px-4 py-3 text-sm font-semibold text-neutral-900 shadow-glowAccent hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ✨ Generate Images
            </button>
            {attemptedGenerate && !prompt.trim() ? (
              <div className="mt-2 text-xs font-semibold text-studio-danger">
                Please enter a prompt before generating
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT */}
        <div className="studio-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-studio-text">Results</div>
            {phase === 'generating' ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-md px-2 py-1 text-xs font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
              >
                ✕ Cancel
              </button>
            ) : null}
          </div>

          {phase === 'idle' ? (
            <div className="mt-4">
              <div className="animate-pulseSoft">
                <EmptyState
                  icon="🪄"
                  title="Your generated images will appear here"
                  subtitle="Upload an image, write a prompt, then generate variations."
                />
              </div>
            </div>
          ) : null}

          {phase === 'generating' ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3 text-xs text-studio-muted">
                  <div>
                    Generating with <span className="text-studio-text">{selectedModel.name}</span>…
                  </div>
                  <div className="font-mono text-studio-muted">…</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-studio-border bg-studio-inset">
                  <div className="h-full w-1/3 animate-shimmer rounded-full bg-studio-secondary bg-[length:200%_100%]" />
                </div>
                <p className="mt-2 text-xs text-studio-muted">This can take a little while depending on image count.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-[1024px]:grid-cols-1">
                {Array.from({ length: count }).map((_, i) => (
                  <div
                    key={i}
                    className="studio-card overflow-hidden border border-studio-border"
                  >
                    <div className="h-[210px] w-full bg-[linear-gradient(110deg,rgba(27,94,140,0.12),rgba(46,134,193,0.18),rgba(27,94,140,0.12))] bg-[length:200%_100%] animate-shimmer" />
                    <div className="border-t border-studio-border px-3 py-2">
                      <div className="h-3 w-24 rounded bg-studio-secondary/12" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {phase === 'error' ? (
            <div className="mt-4">
              <EmptyState
                icon="⚠"
                title="Generation failed"
                subtitle="Try again or switch models/parameters."
                ctaLabel="Run Again"
                onCta={() => {
                  setPhase('idle')
                  setErrorMsg(null)
                }}
              />
            </div>
          ) : null}

          {phase === 'done' ? (
            <div className="mt-4 space-y-4">
              <GenerationResultGrid
                results={results}
                onSave={onSaveResult}
                onDownload={onDownloadResult}
                onExpand={(id) => setExpandedId(id)}
              />

              <div className="flex items-center justify-between gap-3 border-t border-studio-border pt-4">
                <div className="text-sm text-studio-muted">
                  ⚡ {estimatedCost.toLocaleString()} credits used. Remaining:{' '}
                  <span className="font-mono text-studio-text">{credits.toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onGenerate()}
                  className="studio-focus-ring rounded-xl border border-studio-border bg-studio-secondary/10 px-4 py-2 text-sm font-semibold text-studio-text hover:bg-studio-secondary/18"
                >
                  Run Again
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={Boolean(expanded)}
        title={expanded ? `${expanded.label} — Expanded` : 'Expanded'}
        onClose={() => setExpandedId(null)}
        footer={
          expanded ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-studio-muted">
                <span className="font-mono">{selectedModel.name}</span> ·{' '}
                <span className="font-mono">1024×1024</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSaveResult(expanded.id)}
                  className="studio-focus-ring rounded-lg bg-studio-primary px-3 py-2 text-sm font-semibold text-studio-text hover:bg-studio-secondary"
                >
                  💾 Save
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadResult(expanded.id)}
                  className="studio-focus-ring rounded-lg border border-studio-border bg-studio-secondary/10 px-3 py-2 text-sm font-semibold text-studio-text hover:bg-studio-secondary/18"
                >
                  ⬇ Download
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {expanded ? (
          <div className="space-y-3">
            <div className="h-[420px] w-full overflow-hidden rounded-xl border border-studio-border bg-studio-inset">
              <img
                src={expanded.imageSrc}
                alt={expanded.label}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="text-xs font-semibold text-studio-muted">Prompt</div>
            <div className="rounded-xl border border-studio-border bg-studio-bg p-3 font-mono text-xs text-studio-muted">
              {prompt || '—'}
            </div>
          </div>
        ) : (
          <div />
        )}
      </Modal>
    </div>
  )
}

