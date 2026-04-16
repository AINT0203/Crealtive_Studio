import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/layout/AppHeader'
import { TopBar } from '../components/layout/TopBar'
import { EmptyState } from '../components/ui/EmptyState'
import { GenerationResultGrid, type GeneratedResult } from '../components/ui/GenerationResultGrid'
import type { UploadedImage } from '../components/ui/ImageUploadZone'
import { Modal } from '../components/ui/Modal'
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
      // JPEG has no alpha support; fill background so transparent regions are not black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Could not process generated image'))
    img.src = imageSrc
  })
}

async function imageSrcToDownloadBlob(imageSrc: string, format: 'jpeg' | 'jpg' | 'png' | 'svg' | 'gif'): Promise<Blob> {
  if (format === 'svg') {
    const fetched = await fetch(imageSrc)
    const srcBlob = await fetched.blob()
    const srcDataUrl = await blobToDataUrl(srcBlob)
    const canvas = await renderImageToCanvas(imageSrc)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${srcDataUrl}" width="100%" height="100%"/></svg>`
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  }

  const canvas = await renderImageToCanvas(imageSrc)
  const requestedMime = format === 'png' ? 'image/png' : format === 'gif' ? 'image/gif' : 'image/jpeg'
  const encodedDataUrl = canvas.toDataURL(requestedMime)
  if (!encodedDataUrl.startsWith(`data:${requestedMime}`)) {
    throw new Error(`${format.toUpperCase()} export is not supported in this browser`)
  }
  const blob = dataUrlToBlob(encodedDataUrl)
  if (!blob) throw new Error('Could not prepare download')
  return blob
}

type EditorLocationState = {
  /** Points to sessionStorage payload (large images exceed history.state limits) */
  historyRerunKey?: string
  historyPrompt?: string
  historyModelId?: string
  historySourceImageSrc?: string
  historySourceImageSrcs?: string[]
}

type SourceLibraryItem = {
  id: string
  name: string
  dataUrl: string
  mimeType: string
  sizeBytes: number
  createdAt: number
}

const SOURCE_LIBRARY_KEY = 'creaitive_source_library_v1'
const RESOLUTION_OPTIONS = [
  { id: 'hd', label: 'HD', sizeText: '1280x720', width: 1280, height: 720 },
  { id: 'full-hd', label: 'Full HD', sizeText: '1920x1080', width: 1920, height: 1080 },
  { id: '2k', label: '2K Quad HD', sizeText: '2560x1440', width: 2560, height: 1440 },
  { id: '4k', label: '4K Ultra HD', sizeText: '3480x2160', width: 3480, height: 2160 },
  { id: '8k', label: '8K Full UHD', sizeText: '7680x4320', width: 7680, height: 4320 },
] as const
type ResolutionId = (typeof RESOLUTION_OPTIONS)[number]['id']

function loadSourceLibrary(): SourceLibraryItem[] {
  try {
    const raw = localStorage.getItem(SOURCE_LIBRARY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is SourceLibraryItem => {
      return (
        typeof x === 'object' &&
        x !== null &&
        typeof (x as SourceLibraryItem).id === 'string' &&
        typeof (x as SourceLibraryItem).name === 'string' &&
        typeof (x as SourceLibraryItem).dataUrl === 'string' &&
        typeof (x as SourceLibraryItem).mimeType === 'string' &&
        typeof (x as SourceLibraryItem).sizeBytes === 'number' &&
        typeof (x as SourceLibraryItem).createdAt === 'number'
      )
    })
  } catch {
    return []
  }
}

function persistSourceLibrary(items: SourceLibraryItem[]) {
  try {
    localStorage.setItem(SOURCE_LIBRARY_KEY, JSON.stringify(items))
  } catch {
    // ignore storage errors
  }
}

function resizeDataUrlToResolution(
  dataUrl: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not create canvas context'))
        return
      }

      // Keep complete image visible with centered letterboxing.
      ctx.clearRect(0, 0, width, height)
      const scale = Math.min(width / img.width, height / img.height)
      const drawW = Math.max(1, Math.round(img.width * scale))
      const drawH = Math.max(1, Math.round(img.height * scale))
      const x = Math.round((width - drawW) / 2)
      const y = Math.round((height - drawH) / 2)
      ctx.drawImage(img, x, y, drawW, drawH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not process generated image'))
    img.src = dataUrl
  })
}

function upsertUpload(list: UploadedImage[], item: UploadedImage): UploadedImage[] {
  return [item, ...list.filter((x) => x.previewUrl !== item.previewUrl)].slice(0, 60)
}

function toHistoryUploadFromDataUrl(dataUrl: string, index: number): UploadedImage | null {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
  const file = new File([blob], `history-input-${index + 1}.${ext}`, { type: blob.type || 'image/png' })
  return { file, previewUrl: dataUrl }
}

export function Editor() {
  const { credits, projects, sessionHistory, addToast, deductCredits, addHistorySession, applyProjectUsage } = useApp()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const initialProjectId = params.get('projectId') ?? ''

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [newUploads, setNewUploads] = useState<UploadedImage[]>([])
  const [, setSourceLibrary] = useState<SourceLibraryItem[]>(() => loadSourceLibrary())
  const [uploaded, setUploaded] = useState<UploadedImage | null>(null)
  const [uploadSourceMode, setUploadSourceMode] = useState<'new' | 'existing'>('new')

  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('gemini-flash')
  const [count, setCount] = useState<1 | 2 | 3 | 4>(2)
  const [resolutionId, setResolutionId] = useState<ResolutionId>('full-hd')

  const [attemptedGenerate, setAttemptedGenerate] = useState(false)

  const [phase, setPhase] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<GeneratedResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDownloadOpen, setExpandedDownloadOpen] = useState(false)

  const generateAbortRef = useRef<AbortController | null>(null)
  const consumedHistoryRerunKeyRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort()
      setNewUploads((prev) => {
        for (const x of prev) {
          if (x.previewUrl.startsWith('blob:')) URL.revokeObjectURL(x.previewUrl)
        }
        return prev
      })
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

      const many = payload.sourceImageSrcs?.length
        ? payload.sourceImageSrcs
        : payload.sourceImageSrc
          ? [payload.sourceImageSrc]
          : []
      if (!many.length) return

      const restored = many
        .map((src, idx) => toHistoryUploadFromDataUrl(src, idx))
        .filter((x): x is UploadedImage => x !== null)
      if (!restored.length) {
        addToast({ variant: 'error', title: 'Could not decode image from history' })
        return
      }
      setNewUploads((prev) => {
        let next = prev
        for (const item of restored) next = upsertUpload(next, item)
        return next
      })
      const first = restored[0]!
      setUploaded(first)
      return
    }

    if (!st.historyPrompt && !st.historySourceImageSrc) return

    const snapshot = {
      prompt: st.historyPrompt ?? '',
      modelId: st.historyModelId,
      source: st.historySourceImageSrc,
      sources: st.historySourceImageSrcs ?? [],
    }

    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} })

    if (snapshot.prompt) setPrompt(snapshot.prompt)
    if (snapshot.modelId && models.some((m) => m.id === snapshot.modelId)) {
      setModelId(snapshot.modelId)
    }

    const many = snapshot.sources.length ? snapshot.sources : snapshot.source ? [snapshot.source] : []
    if (!many.length) return

    const restored = many
      .map((src, idx) => toHistoryUploadFromDataUrl(src, idx))
      .filter((x): x is UploadedImage => x !== null)
    if (!restored.length) {
      addToast({ variant: 'error', title: 'Could not restore image from history' })
      return
    }
    setNewUploads((prev) => {
      let next = prev
      for (const item of restored) next = upsertUpload(next, item)
      return next
    })
    setUploaded(restored[0]!)
  }, [location.state, location.pathname, location.search, navigate, addToast])

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId)!, [modelId])
  const selectedProjectName = useMemo(
    () => projects.find((p) => p.id === selectedProjectId)?.name,
    [projects, selectedProjectId],
  )
  const existingProjectImages = useMemo(() => {
    if (!selectedProjectId) return []
    const byProject = sessionHistory.filter((s) => s.projectId === selectedProjectId)
    const fallbackByName = byProject.length
      ? byProject
      : selectedProjectName
        ? sessionHistory.filter((s) => s.projectName === selectedProjectName)
        : []
    const seen = new Set<string>()
    const out: string[] = []
    for (const session of fallbackByName) {
      const srcs =
        session.sourceImageSrcs && session.sourceImageSrcs.length > 0
          ? session.sourceImageSrcs
          : session.sourceImageSrc
            ? [session.sourceImageSrc]
            : []
      for (const src of srcs) {
        if (!src || seen.has(src)) continue
        seen.add(src)
        out.push(src)
      }
    }
    return out
  }, [selectedProjectId, selectedProjectName, sessionHistory])
  const editorModels = useMemo(() => models.filter((m) => m.id === 'gemini-flash' || m.id === 'gpt-image'), [])
  const selectedResolution = useMemo(
    () => RESOLUTION_OPTIONS.find((opt) => opt.id === resolutionId) ?? RESOLUTION_OPTIONS[1],
    [resolutionId],
  )

  const estimatedCost = useMemo(() => {
    return Math.round(count * selectedModel.costPerUnit)
  }, [count, selectedModel.costPerUnit])

  function canGenerate() {
    return Boolean(uploaded && prompt.trim().length > 0)
  }

  function selectExistingProjectImage(dataUrl: string) {
    const restored = toHistoryUploadFromDataUrl(dataUrl, 0)
    if (!restored) {
      addToast({ variant: 'error', title: 'Could not use existing image' })
      return
    }
    setNewUploads([restored])
    setUploaded(restored)
  }

  function stopGeneration() {
    generateAbortRef.current?.abort()
    generateAbortRef.current = null
    setPhase('idle')
    setErrorMsg(null)
  }

  async function addNewFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /^image\/(png|jpeg|jpg)$/.test(f.type))
    if (!arr.length) {
      addToast({
        variant: 'error',
        title: 'No supported images selected',
        message: 'Choose PNG, JPG, or JPEG files.',
      })
      return
    }

    const nextUploads = arr.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setNewUploads((prev) => [...nextUploads, ...prev].slice(0, 60))
    setUploaded((prev) => prev ?? nextUploads[0] ?? null)

    const libraryAdds: SourceLibraryItem[] = []
    for (const file of arr) {
      try {
        const dataUrl = await fileToDataUrl(file)
        libraryAdds.push({
          id: safeId('src'),
          name: file.name,
          dataUrl,
          mimeType: file.type || 'image/png',
          sizeBytes: file.size,
          createdAt: Date.now(),
        })
      } catch {
        // skip one bad file, continue others
      }
    }
    if (libraryAdds.length) {
      setSourceLibrary((prev) => {
        const next = [...libraryAdds, ...prev].slice(0, 200)
        persistSourceLibrary(next)
        return next
      })
    }
  }

  function removeUploadedItem(item: UploadedImage) {
    setNewUploads((prev) => prev.filter((x) => x.previewUrl !== item.previewUrl))
    if (uploaded?.previewUrl === item.previewUrl) {
      setUploaded(null)
    }
    if (item.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
  }

  async function onGenerate() {
    setAttemptedGenerate(true)

    if (!uploaded) return
    if (!prompt.trim()) return
    // Backend supports Gemini and Azure GPT Image (via modelId).

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
        modelId: selectedModel.id,
        geminiModelId: selectedModel.geminiModelId,
        signal: ac.signal,
      })

      const now = Date.now()
      const mime = data.mime_type || 'image/png'
      const resizedImageSrcs = await Promise.all(
        data.images_b64.map((b64) =>
          resizeDataUrlToResolution(
            `data:${mime};base64,${b64}`,
            selectedResolution.width,
            selectedResolution.height,
          ),
        ),
      )
      const nextResults: GeneratedResult[] = resizedImageSrcs.map((imageSrc, i) => ({
        id: safeId('r'),
        label: `Result ${i + 1}`,
        imageSrc,
        createdAt: now,
        modelName: selectedModel.name,
      }))

      setResults(nextResults)
      setPhase('done')

      const sourceImageSrc = await fileToDataUrl(uploaded.file)
      const sourceImageSrcs = await Promise.all(newUploads.map((u) => fileToDataUrl(u.file)))
      addHistorySession({
        status: 'success',
        projectId: selectedProjectId || undefined,
        projectName: selectedProjectName,
        prompt: prompt.trim(),
        modelName: selectedModel.name,
        modelId: selectedModel.id,
        imageCount: nextResults.length,
        imageSrcs: nextResults.map((r) => r.imageSrc),
        sourceImageSrc,
        sourceImageSrcs,
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

  async function onDownloadResult(resultId: string, format: 'jpeg' | 'jpg' | 'png' | 'svg' | 'gif' = 'png') {
    const r = results.find((x) => x.id === resultId)
    if (!r) return

    try {
      const blob = await imageSrcToDownloadBlob(r.imageSrc, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `creaitive-${r.label.toLowerCase().replace(/\s+/g, '-')}.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      addToast({ variant: 'info', title: `Download started (${format.toUpperCase()})` })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not prepare download'
      addToast({ variant: 'error', title: message })
      return
    }
  }

  const expanded = expandedId ? results.find((r) => r.id === expandedId) : null

  return (
    <div>
      <AppHeader />
      <TopBar
        title="Editor"
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

      <div className="grid overflow-hidden rounded-2xl border border-studio-border bg-studio-surface grid-cols-[minmax(0,52fr)_minmax(0,48fr)] max-[1024px]:grid-cols-1">
        {/* LEFT */}
        <div className="space-y-4 p-4 max-[1024px]:border-b max-[1024px]:border-studio-border">
          <div className="studio-card p-4">
            <div className="text-sm font-semibold text-studio-text">Uploads</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-studio-border/70 bg-studio-bg/50 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted">Model</label>
                    <div className="mt-1 flex items-center gap-1">
                      {editorModels.map((m) => (
                        <label
                          key={m.id}
                          className={[
                            'studio-focus-ring inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold',
                            modelId === m.id
                              ? 'border-[#7a0f33] bg-[#7a0f33]/12 text-[#7a0f33]'
                              : 'border-studio-border text-studio-muted hover:bg-studio-secondary/8',
                          ].join(' ')}
                        >
                          <input
                            type="radio"
                            name="model"
                            value={m.id}
                            checked={modelId === m.id}
                            onChange={() => setModelId(m.id)}
                            className="h-3 w-3 accent-[#7a0f33]"
                          />
                          <span>{m.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="count-select" className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                      Count
                    </label>
                    <select
                      id="count-select"
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value) as 1 | 2 | 3 | 4)}
                      className="studio-focus-ring mt-1 w-full rounded-md border border-studio-border bg-studio-bg px-2 py-1 text-xs text-studio-text"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="resolution-select"
                      className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted"
                    >
                      Resolution
                    </label>
                    <select
                      id="resolution-select"
                      value={resolutionId}
                      onChange={(e) => setResolutionId(e.target.value as ResolutionId)}
                      className="studio-focus-ring mt-1 w-full rounded-md border border-studio-border bg-studio-bg px-2 py-1 text-xs text-studio-text"
                    >
                      {RESOLUTION_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-studio-border/70 bg-studio-bg/50 p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadSourceMode('new')}
                    className={[
                      'studio-focus-ring rounded-md px-3 py-1 text-xs font-semibold',
                      uploadSourceMode === 'new'
                        ? 'bg-[#7a0f33] text-white'
                        : 'border border-studio-border text-studio-muted hover:bg-studio-secondary/10',
                    ].join(' ')}
                  >
                    New Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadSourceMode('existing')}
                    disabled={!selectedProjectId}
                    className={[
                      'studio-focus-ring rounded-md px-3 py-1 text-xs font-semibold',
                      uploadSourceMode === 'existing'
                        ? 'bg-[#7a0f33] text-white'
                        : 'border border-studio-border text-studio-muted hover:bg-studio-secondary/10',
                      !selectedProjectId ? 'cursor-not-allowed opacity-50' : '',
                    ].join(' ')}
                  >
                    Existing Image
                  </button>
                </div>
                {uploadSourceMode === 'existing' && !selectedProjectId ? (
                  <div className="mt-2 text-xs text-studio-muted">Select a project to view existing images.</div>
                ) : null}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (!e.target.files?.length) return
                  void addNewFiles(e.target.files)
                  e.currentTarget.value = ''
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadSourceMode !== 'new'}
                className="studio-focus-ring flex w-full flex-col items-center justify-center rounded-2xl border border-[#7a0f33]/25 bg-[#7a0f33]/5 px-4 py-8 text-center hover:bg-[#7a0f33]/10"
              >
                <div className="mb-3 rounded-2xl bg-[#7a0f33]/15 px-4 py-3 text-[#7a0f33]">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
                  </svg>
                </div>
                <div className="text-[28px] font-semibold leading-none text-studio-text">Upload Image</div>
              </button>

              {uploadSourceMode === 'new' ? (
                <div className="text-xs text-studio-muted">Select multiple PNG/JPG/JPEG images</div>
              ) : null}

              {uploadSourceMode === 'existing' ? (
                <div className="space-y-2">
                  {selectedProjectId && existingProjectImages.length > 0 ? (
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
                      {existingProjectImages.map((src, idx) => (
                        <button
                          key={`${selectedProjectId}-existing-${idx}`}
                          type="button"
                          onClick={() => selectExistingProjectImage(src)}
                          className={[
                            'studio-focus-ring overflow-hidden rounded-md border w-full bg-white',
                            uploaded?.previewUrl === src ? 'border-[#7a0f33] ring-1 ring-[#7a0f33]/35' : 'border-studio-border',
                          ].join(' ')}
                          title={`Existing image ${idx + 1}`}
                        >
                          <img src={src} alt={`Existing ${idx + 1}`} className="aspect-square w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : selectedProjectId ? (
                    <div className="rounded-lg border border-dashed border-studio-border px-3 py-2 text-xs text-studio-muted">
                      No existing images for this project yet. Use New Upload first.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {newUploads.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
                  {newUploads.map((x) => (
                    <div key={`${x.file.name}-${x.file.size}-${x.previewUrl}`} className="relative">
                      <button
                        type="button"
                        onClick={() => setUploaded(x)}
                        className={[
                          'studio-focus-ring overflow-hidden rounded-lg border w-full',
                          uploaded?.previewUrl === x.previewUrl
                            ? 'border-[#7a0f33] ring-1 ring-[#7a0f33]/35'
                            : 'border-studio-border',
                        ].join(' ')}
                      >
                        <img
                          src={x.previewUrl}
                          alt={x.file.name}
                          className="h-52 w-full bg-white object-contain"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${x.file.name}`}
                        onClick={() => removeUploadedItem(x)}
                        className="studio-focus-ring absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-sm font-bold leading-none text-white hover:bg-black/80"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {attemptedGenerate && !uploaded ? (
                <div className="mt-2 text-xs font-semibold text-studio-danger">
                  Please upload an image before generating
                </div>
              ) : null}

            </div>
          </div>

          <div className="studio-card p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-studio-text">Input Prompt</div>
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

            <div className="mt-3 font-mono text-xs text-studio-muted">
              Estimated cost: ⚡ {estimatedCost.toLocaleString()} credits
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate() || phase === 'generating'}
              className="studio-focus-ring mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[#7a0f33] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5e0c27] disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="border-l border-studio-border p-4 max-[1024px]:border-l-0">
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
                  <div className="h-full w-1/3 animate-shimmer rounded-full bg-[linear-gradient(90deg,#2b0614,#7a0f33,#3a1652)] bg-[length:200%_100%]" />
                </div>
                <p className="mt-2 text-xs text-studio-muted">This can take a little while depending on image count.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-[1024px]:grid-cols-1">
                {Array.from({ length: count }).map((_, i) => (
                  <div
                    key={i}
                    className="studio-card overflow-hidden border border-studio-border"
                  >
                    <div className="relative h-[210px] w-full bg-[linear-gradient(110deg,rgba(27,94,140,0.12),rgba(46,134,193,0.18),rgba(27,94,140,0.12))] bg-[length:200%_100%] animate-shimmer">
                      <div className="absolute inset-0 grid place-items-center">
                        <div
                          className="h-10 w-10 animate-spin rounded-full border-2 border-white/35 border-t-white/90"
                          aria-label="Loading"
                        />
                      </div>
                    </div>
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
                  className="studio-focus-ring rounded-xl border border-[#7a0f33] bg-[#7a0f33]/10 px-4 py-2 text-sm font-semibold text-[#7a0f33] hover:bg-[#7a0f33]/18"
                >
                  Run Again
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="studio-focus-ring inline-flex items-center gap-2 rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-5 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
        >
          <span className="text-lg leading-none">‹</span>
          Back
        </button>
        <button
          type="button"
          onClick={() =>
            selectedProjectId
              ? navigate(`/history?projectId=${encodeURIComponent(selectedProjectId)}`)
              : navigate('/history')
          }
          className="studio-focus-ring inline-flex items-center gap-2 rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-5 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
        >
          Next
          <span className="text-lg leading-none">›</span>
        </button>
      </div>

      <Modal
        open={Boolean(expanded)}
        title={expanded ? `${expanded.label} — Expanded` : 'Expanded'}
        onClose={() => {
          setExpandedId(null)
          setExpandedDownloadOpen(false)
        }}
        footer={
          expanded ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-studio-muted">
                <span className="font-mono">{selectedModel.name}</span> ·{' '}
                <span className="font-mono">{selectedResolution.sizeText}</span>
              </div>
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSaveResult(expanded.id)}
                  className="studio-focus-ring rounded-lg bg-[#7a0f33] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5e0c27]"
                >
                  💾 Save
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedDownloadOpen((prev) => !prev)}
                  className="studio-focus-ring rounded-lg border border-[#7a0f33] bg-[#7a0f33]/10 px-3 py-2 text-sm font-semibold text-[#7a0f33] hover:bg-[#7a0f33]/18"
                >
                  ⬇ Download
                </button>
                {expandedDownloadOpen ? (
                  <div className="absolute bottom-full right-0 z-20 mb-2 w-32 rounded-lg border border-studio-border bg-white p-1 shadow-lg">
                    {(['jpeg', 'jpg', 'png', 'svg', 'gif'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => {
                          void onDownloadResult(expanded.id, fmt)
                          setExpandedDownloadOpen(false)
                        }}
                        className="studio-focus-ring w-full rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-studio-text hover:bg-studio-secondary/12"
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                ) : null}
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

