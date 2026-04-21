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
import type { SessionHistoryEntry } from '../data/sessionHistory'
import { consumeRerunPayload, readRerunPayload } from '../data/rerunBridge'
import { useApp } from '../state/AppContext'

/** Maximum images user can keep selected at once */
const MAX_UPLOAD_IMAGES = 5

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

const STYLE_GROUPS = [
  { id: 'lighting', label: 'Lighting', options: ['Low Lighting', 'Studio Lighting', 'Dynamic Lighting', 'Back Lighting'] },
  { id: 'cameraAngle', label: 'Camera Angle', options: ['Close Up', 'Wide Angle', 'Macro', 'Blurry Backdrop'] },
  { id: 'colorTone', label: 'Color & Tone', options: ['Black & White', 'Warm Tone', 'Cool Tone', 'Vibrant Tone'] },
  { id: 'sceneOfDay', label: 'Scene of the Day', options: ['Morning', 'Evening', 'Sunny', 'Night'] },
] as const

type StyleGroupId = (typeof STYLE_GROUPS)[number]['id']
type StyleSelections = Record<StyleGroupId, string>

const DEFAULT_STYLE_SELECTIONS: StyleSelections = {
  lighting: '',
  cameraAngle: '',
  colorTone: '',
  sceneOfDay: '',
}

const STYLE_DIRECTIVES_PREFIX = 'Style directives:'

function styleDirectivesSuffix(styles: StyleSelections): string {
  const items = [
    styles.lighting ? `Lighting: ${styles.lighting}` : null,
    styles.cameraAngle ? `Camera Angle: ${styles.cameraAngle}` : null,
    styles.colorTone ? `Color & Tone: ${styles.colorTone}` : null,
    styles.sceneOfDay ? `Scene of the Day: ${styles.sceneOfDay}` : null,
  ].filter((x): x is string => Boolean(x))
  return items.join('; ')
}

function stripStyleDirectives(promptText: string): string {
  const lines = promptText.split('\n')
  const kept = lines.filter((line) => !line.trimStart().startsWith(STYLE_DIRECTIVES_PREFIX))
  return kept.join('\n').replace(/\s+$/, '')
}

/** Full prompt sent to the API; user-facing textarea stays `userPrompt` only. */
function composePromptForApi(userPrompt: string, styles: StyleSelections): string {
  const base = userPrompt.trim()
  const suffix = styleDirectivesSuffix(styles)
  if (!suffix) return base
  if (!base) return `${STYLE_DIRECTIVES_PREFIX} ${suffix}`
  return `${base}\n\n${STYLE_DIRECTIVES_PREFIX} ${suffix}`
}

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
  return [item, ...list.filter((x) => x.previewUrl !== item.previewUrl)].slice(0, MAX_UPLOAD_IMAGES)
}

function toHistoryUploadFromDataUrl(dataUrl: string, index: number): UploadedImage | null {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
  const file = new File([blob], `history-input-${index + 1}.${ext}`, { type: blob.type || 'image/png' })
  return { file, previewUrl: dataUrl }
}

function formatSessionWhen(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function Editor() {
  const { credits, projects, sessionHistory, addToast, deductCredits, addHistorySession, applyProjectUsage, deleteHistorySession } =
    useApp()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const initialProjectId = params.get('projectId') ?? ''

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [newUploads, setNewUploads] = useState<UploadedImage[]>([])
  const [resultEditBackupUploads, setResultEditBackupUploads] = useState<UploadedImage[] | null>(null)
  const [, setSourceLibrary] = useState<SourceLibraryItem[]>(() => loadSourceLibrary())
  const [uploadSourceMode, setUploadSourceMode] = useState<'new' | 'existing'>('new')

  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('gemini-flash')
  const [count, setCount] = useState<1 | 2 | 3 | 4>(2)
  const [resolutionId, setResolutionId] = useState<ResolutionId>('full-hd')
  const [styleSelections, setStyleSelections] = useState<StyleSelections>(DEFAULT_STYLE_SELECTIONS)

  const [attemptedGenerate, setAttemptedGenerate] = useState(false)

  const [phase, setPhase] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<GeneratedResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [historyDetail, setHistoryDetail] = useState<SessionHistoryEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SessionHistoryEntry | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDownloadOpen, setExpandedDownloadOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'results' | 'history'>('results')

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

      if (payload.prompt) setPrompt(stripStyleDirectives(payload.prompt))
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

    if (snapshot.prompt) setPrompt(stripStyleDirectives(snapshot.prompt))
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
  const editorHistorySessions = useMemo(() => {
    const filtered = sessionHistory.filter((s) => {
      if (!selectedProjectId) return false
      if (s.projectId === selectedProjectId) return true
      return Boolean(selectedProjectName && s.projectName === selectedProjectName)
    })
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt)
  }, [sessionHistory, selectedProjectId, selectedProjectName])
  const selectedResolution = useMemo(
    () => RESOLUTION_OPTIONS.find((opt) => opt.id === resolutionId) ?? RESOLUTION_OPTIONS[1],
    [resolutionId],
  )
  const hasSelectedImages = newUploads.length > 0
  const selectedPreviewUrls = useMemo(() => new Set(newUploads.map((u) => u.previewUrl)), [newUploads])

  const estimatedCost = useMemo(() => {
    return Math.round(count * selectedModel.costPerUnit)
  }, [count, selectedModel.costPerUnit])

  function canGenerate() {
    const hasUserPrompt = prompt.trim().length > 0
    const hasStyles = Boolean(styleDirectivesSuffix(styleSelections))
    return Boolean(newUploads.length > 0 && (hasUserPrompt || hasStyles))
  }

  function selectExistingProjectImage(dataUrl: string) {
    const restored = toHistoryUploadFromDataUrl(dataUrl, 0)
    if (!restored) {
      addToast({ variant: 'error', title: 'Could not use existing image' })
      return
    }
    const alreadySelected = selectedPreviewUrls.has(restored.previewUrl)
    if (alreadySelected) {
      setNewUploads((prev) => prev.filter((x) => x.previewUrl !== restored.previewUrl))
      return
    }
    if (newUploads.length >= MAX_UPLOAD_IMAGES) {
      addToast({
        variant: 'info',
        title: `Maximum ${MAX_UPLOAD_IMAGES} images allowed`,
        message: 'Remove one selected image to add another.',
      })
      return
    }
    setNewUploads((prev) => {
      return upsertUpload(prev, restored)
    })
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
    const remainingSlots = Math.max(0, MAX_UPLOAD_IMAGES - newUploads.length)
    if (remainingSlots === 0) {
      addToast({
        variant: 'info',
        title: `Maximum ${MAX_UPLOAD_IMAGES} images allowed`,
        message: 'Remove one selected image to add another.',
      })
      return
    }
    const accepted = arr.slice(0, remainingSlots)
    if (arr.length > accepted.length) {
      addToast({
        variant: 'info',
        title: `Only ${MAX_UPLOAD_IMAGES} images can be selected`,
        message: `${accepted.length} image(s) were added.`,
      })
    }

    const nextUploads = accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setNewUploads((prev) => [...nextUploads, ...prev].slice(0, MAX_UPLOAD_IMAGES))

    const libraryAdds: SourceLibraryItem[] = []
    for (const file of accepted) {
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
    if (item.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
    setNewUploads((prev) => {
      const next = prev.filter((x) => x.previewUrl !== item.previewUrl)
      const shouldRestoreBackup =
        Boolean(resultEditBackupUploads && resultEditBackupUploads.length > 0) &&
        prev.length === 1 &&
        prev[0]?.previewUrl === item.previewUrl

      if (shouldRestoreBackup) {
        setResultEditBackupUploads(null)
        return resultEditBackupUploads!
      }

      return next
    })
  }

  function useSessionInEditor(session: SessionHistoryEntry) {
    if (session.prompt) setPrompt(stripStyleDirectives(session.prompt))
    if (session.modelId && models.some((m) => m.id === session.modelId)) {
      setModelId(session.modelId)
    }

    const many = session.sourceImageSrcs?.length ? session.sourceImageSrcs : session.sourceImageSrc ? [session.sourceImageSrc] : []
    const restored = many
      .map((src, idx) => toHistoryUploadFromDataUrl(src, idx))
      .filter((x): x is UploadedImage => x !== null)
    if (restored.length > 0) {
      setUploadSourceMode('new')
      setNewUploads((prev) => {
        let next = prev
        for (const item of restored) next = upsertUpload(next, item)
        return next
      })
    }
    setRightPanelTab('results')
  }

  async function onGenerate() {
    setAttemptedGenerate(true)

    if (!newUploads.length) return
    const apiPrompt = composePromptForApi(prompt, styleSelections)
    if (!apiPrompt) return

    const inputImages = newUploads.slice(0, MAX_UPLOAD_IMAGES)
    if (newUploads.length > MAX_UPLOAD_IMAGES) {
      addToast({
        variant: 'info',
        title: 'Image limit',
        message: `Only the first ${MAX_UPLOAD_IMAGES} images are sent per request. Remove extras or run again.`,
      })
    }

    // Backend supports Gemini and Azure GPT Image (via modelId).

    setErrorMsg(null)
    setPhase('generating')
    setResults([])

    generateAbortRef.current?.abort()
    const ac = new AbortController()
    generateAbortRef.current = ac

    try {
      const data = await requestGenerate({
        images: inputImages.map((u) => u.file),
        prompt: apiPrompt,
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

      const sourceImageSrc = await fileToDataUrl(inputImages[0]!.file)
      const sourceImageSrcs = await Promise.all(inputImages.map((u) => fileToDataUrl(u.file)))
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

  async function onEditResult(resultId: string) {
    const result = results.find((r) => r.id === resultId)
    if (!result) return
    const blob = dataUrlToBlob(result.imageSrc)
    if (!blob) {
      addToast({ variant: 'error', title: 'Could not load result for editing' })
      return
    }
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
    const file = new File([blob], `result-edit-${result.id}.${ext}`, { type: blob.type || 'image/png' })
    const nextUpload: UploadedImage = { file, previewUrl: result.imageSrc }
    setUploadSourceMode('new')
    setResultEditBackupUploads(newUploads)
    setNewUploads([nextUpload])
    addToast({ variant: 'success', title: 'Result loaded into upload for editing' })
  }

  async function onDownloadResult(resultId: string, format: 'jpeg' | 'jpg' | 'png' | 'svg' = 'png') {
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
        <div className="scrollbar-hidden max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto p-4 pr-2 max-[1024px]:max-h-none max-[1024px]:overflow-visible max-[1024px]:border-b max-[1024px]:border-studio-border">
          <div>
            <div className="text-sm font-semibold text-studio-text">Uploads</div>
            <div className="mt-3 space-y-3">
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

              {!hasSelectedImages ? (
                <div className="flex justify-center">
                  <div className="flex flex-wrap items-stretch justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUploadSourceMode('new')
                        fileInputRef.current?.click()
                      }}
                      className={[
                        'studio-focus-ring group flex min-h-[4.5rem] w-auto min-w-[5.75rem] flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center transition',
                        uploadSourceMode === 'new'
                          ? 'border-[#7a0f33]/50 bg-[#7a0f33]/16 ring-1 ring-[#7a0f33]/25'
                          : 'border-studio-border bg-studio-surface hover:border-[#7a0f33]/30 hover:bg-[#7a0f33]/8',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'mb-0.5 rounded-md px-1 py-0.5 text-[#7a0f33] transition',
                          uploadSourceMode === 'new' ? 'bg-[#7a0f33]/15' : 'bg-studio-secondary/8 group-hover:bg-[#7a0f33]/12',
                        ].join(' ')}
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 16V4" />
                          <path d="m7 9 5-5 5 5" />
                          <path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
                        </svg>
                      </div>
                      <div
                        className={[
                          'text-xs font-semibold leading-tight',
                          uploadSourceMode === 'new' ? 'text-[#7a0f33]' : 'text-studio-text',
                        ].join(' ')}
                      >
                        Upload
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUploadSourceMode('existing')}
                      disabled={!selectedProjectId}
                      className={[
                        'studio-focus-ring group flex min-h-[4.5rem] w-auto min-w-[5.75rem] flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center transition',
                        uploadSourceMode === 'existing'
                          ? 'border-[#7a0f33]/60 bg-transparent text-[#7a0f33] ring-1 ring-[#7a0f33]/30'
                          : 'border-studio-border bg-transparent text-studio-muted hover:border-[#7a0f33]/30',
                        !selectedProjectId ? 'cursor-not-allowed opacity-50' : '',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'mb-0.5 rounded-md p-0.5 text-[#7a0f33] transition',
                          uploadSourceMode === 'existing' ? 'bg-[#7a0f33]/12' : 'bg-studio-secondary/8 group-hover:bg-[#7a0f33]/12',
                        ].join(' ')}
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" />
                          <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        </svg>
                      </div>
                      <div
                        className={[
                          'px-0.5 text-[11px] font-semibold leading-tight',
                          uploadSourceMode === 'existing' ? 'text-[#7a0f33]' : 'text-studio-text',
                        ].join(' ')}
                      >
                        Library
                      </div>
                      {!selectedProjectId ? (
                        <div
                          className={[
                            'mt-1 text-[10px] leading-tight',
                            uploadSourceMode === 'existing' ? 'text-[#7a0f33]/80' : 'text-studio-muted',
                          ].join(' ')}
                        ></div>
                      ) : null}
                    </button>
                  </div>
                </div>
              ) : null}

              {uploadSourceMode === 'existing' && !selectedProjectId ? (
                <div className="text-xs text-studio-muted">Select a project to view existing images.</div>
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
                            selectedPreviewUrls.has(src) ? 'border-[#7a0f33] ring-1 ring-[#7a0f33]/35' : 'border-studio-border',
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
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1">
                  {newUploads.map((x) => (
                    <div key={`${x.file.name}-${x.file.size}-${x.previewUrl}`} className="relative mx-auto w-fit max-w-full">
                      <button
                        type="button"
                        className={[
                          'studio-focus-ring block overflow-hidden rounded-lg border',
                          'border-[#7a0f33] ring-1 ring-[#7a0f33]/35',
                        ].join(' ')}
                      >
                        <img
                          src={x.previewUrl}
                          alt={x.file.name}
                          className="block h-auto max-h-52 w-auto max-w-full bg-white object-contain"
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
                </div>
              ) : null}

              {attemptedGenerate && !newUploads.length ? (
                <div className="mt-2 text-xs font-semibold text-studio-danger">
                  Please upload at least one image before generating
                </div>
              ) : null}

            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-studio-text">Input Prompt</div>

            <textarea
              rows={4}
              value={prompt}
              maxLength={1000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Add your prompt here"
              className="studio-focus-ring mt-3 w-full resize-none rounded-xl border border-studio-border bg-studio-bg px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/60"
            />

            <div className="mt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label htmlFor="model-select" className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                    Model
                  </label>
                  <select
                    id="model-select"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="studio-focus-ring mt-1 w-full rounded-md border border-studio-border bg-studio-bg px-2 py-1 text-xs text-studio-text"
                  >
                    {editorModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
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

            <div className="mt-5 space-y-3 rounded-xl border border-studio-border bg-studio-bg/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-studio-text">Image Styles</div>
                <button
                  type="button"
                  onClick={() => {
                    setStyleSelections(DEFAULT_STYLE_SELECTIONS)
                  }}
                  className="studio-focus-ring inline-flex items-center gap-1 rounded-md border border-studio-border bg-studio-surface px-2 py-1 text-xs font-semibold text-studio-muted hover:bg-studio-secondary/8 hover:text-studio-text"
                >
                  ↻ Redo
                </button>
              </div>

              {STYLE_GROUPS.map((group) => (
                <div key={group.id}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-studio-muted">{group.label}</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {group.options.map((option) => {
                      const active = styleSelections[group.id] === option
                      return (
                        <button
                          key={`${group.id}-${option}`}
                          type="button"
                          onClick={() => {
                            const nextValue = styleSelections[group.id] === option ? '' : option
                            const nextStyles = {
                              ...styleSelections,
                              [group.id]: nextValue,
                            }
                            setStyleSelections(nextStyles)
                          }}
                          className={[
                            'studio-focus-ring rounded-md border px-3 py-2 text-xs font-semibold transition',
                            active
                              ? 'border-[#7a0f33]/45 bg-[#7a0f33]/14 text-[#7a0f33]'
                              : 'border-studio-border bg-studio-surface text-studio-muted hover:bg-studio-secondary/8 hover:text-studio-text',
                          ].join(' ')}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 font-mono text-xs text-studio-muted">
              Estimated cost: ⚡ {estimatedCost.toLocaleString()} credits
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate() || phase === 'generating'}
              className="studio-focus-ring mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[#7a0f33] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#5e0c27] disabled:cursor-not-allowed disabled:opacity-60"
            >
               ⚡GENERATE
            </button>
            {attemptedGenerate && !prompt.trim() && !styleDirectivesSuffix(styleSelections) ? (
              <div className="mt-2 text-xs font-semibold text-studio-danger">
                Please enter a prompt or choose at least one image style
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex min-h-[calc(100vh-12rem)] flex-col border-l border-studio-border p-4 max-[1024px]:min-h-0 max-[1024px]:border-l-0">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-lg border border-studio-border bg-studio-inset p-1">
              <button
                type="button"
                onClick={() => setRightPanelTab('results')}
                className={[
                  'studio-focus-ring rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                  rightPanelTab === 'results'
                    ? 'bg-[#7a0f33]/14 text-[#7a0f33]'
                    : 'text-studio-muted hover:bg-studio-secondary/10 hover:text-studio-text',
                ].join(' ')}
              >
                Results
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('history')}
                className={[
                  'studio-focus-ring rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                  rightPanelTab === 'history'
                    ? 'bg-[#7a0f33]/14 text-[#7a0f33]'
                    : 'text-studio-muted hover:bg-studio-secondary/10 hover:text-studio-text',
                ].join(' ')}
              >
                History
              </button>
            </div>
            {rightPanelTab === 'results' && phase === 'generating' ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-md px-2 py-1 text-xs font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
              >
                ✕ Cancel
              </button>
            ) : null}
          </div>

          {rightPanelTab === 'results' ? (
            <>
              {phase === 'idle' ? (
                <div className="mt-4 flex-1">
                  <div className="h-full animate-pulseSoft">
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
                        <div className="relative h-[260px] w-full bg-[linear-gradient(110deg,rgba(27,94,140,0.12),rgba(46,134,193,0.18),rgba(27,94,140,0.12))] bg-[length:200%_100%] animate-shimmer">
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
                    onEdit={onEditResult}
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
            </>
          ) : (
            <div className="mt-4">
              {editorHistorySessions.length === 0 ? (
                <EmptyState
                  icon="📜"
                  title={selectedProjectId ? 'No history for this project yet' : 'Select a project to view history'}
                  subtitle={
                    selectedProjectId
                      ? 'Generated sessions for the selected project will appear here.'
                      : 'Pick a project from the Project dropdown to see its history here.'
                  }
                />
              ) : (
                <div className="grid grid-cols-3 gap-3 max-[1200px]:grid-cols-2 max-[768px]:grid-cols-1">
                  {editorHistorySessions.map((session) => (
                    <div key={session.id} className="studio-card overflow-hidden border border-studio-border">
                      <div className="relative h-[190px] w-full overflow-hidden bg-studio-inset">
                        {session.imageSrcs[0] ? (
                          <img src={session.imageSrcs[0]} alt={session.projectName || 'History preview'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-studio-muted">No preview</div>
                        )}
                      </div>
                      <div className="space-y-2 border-t border-studio-border px-3 py-2">
                        <div className="text-[11px] text-studio-muted">{formatSessionWhen(session.createdAt)}</div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            title="View"
                            onClick={() => setHistoryDetail(session)}
                            className="studio-focus-ring min-w-0 flex-1 rounded-lg border border-studio-border bg-studio-surface px-0.5 py-2 text-[10px] font-semibold leading-tight text-studio-text transition-colors hover:bg-studio-secondary/12"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            title="Open in Editor"
                            onClick={() => useSessionInEditor(session)}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
        open={Boolean(historyDetail)}
        title={historyDetail ? `${historyDetail.projectName || 'Untitled Project'} — details` : 'Details'}
        wide
        onClose={() => setHistoryDetail(null)}
        footer={
          historyDetail ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHistoryDetail(null)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  useSessionInEditor(historyDetail)
                  setHistoryDetail(null)
                }}
                className="studio-focus-ring rounded-lg border border-[#7a0f33] bg-[#7a0f33] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#5e0c27]"
              >
                ▶ Editor
              </button>
            </div>
          ) : null
        }
      >
        {historyDetail ? (
          <div className="max-h-[min(62vh,520px)] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-studio-muted">Input Images</div>
              {(historyDetail.sourceImageSrcs && historyDetail.sourceImageSrcs.length > 0) || historyDetail.sourceImageSrc ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(historyDetail.sourceImageSrcs && historyDetail.sourceImageSrcs.length > 0
                    ? historyDetail.sourceImageSrcs
                    : historyDetail.sourceImageSrc
                      ? [historyDetail.sourceImageSrc]
                      : []
                  ).map((src, i) => (
                    <div
                      key={`${historyDetail.id}-input-${i}`}
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
                {historyDetail.imageSrcs.map((src, i) => (
                  <div
                    key={`${historyDetail.id}-img-${i}`}
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
                {historyDetail.prompt}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-studio-muted">
              <span>
                Model: <span className="font-mono text-studio-text">{historyDetail.modelName}</span>
              </span>
              <span>
                Images: <span className="font-mono text-studio-text">{historyDetail.imageCount}</span>
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(expanded)}
        title={expanded ? `${expanded.label} — Expanded` : 'Expanded'}
        onClose={() => {
          setExpandedId(null)
          setExpandedDownloadOpen(false)
        }}
        headerRight={
          expanded ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setExpandedDownloadOpen((prev) => !prev)}
                className="studio-focus-ring rounded-md border border-studio-border px-2 py-1 text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
                title="Download"
                aria-label="Download"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v11" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M4 20h16" />
                </svg>
              </button>
              {expandedDownloadOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-32 rounded-lg border border-studio-border bg-white p-1 shadow-lg">
                  {(['jpeg', 'jpg', 'png', 'svg'] as const).map((fmt) => (
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
          ) : null
        }
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
                  onClick={() => {
                    void onEditResult(expanded.id)
                    setExpandedId(null)
                  }}
                  className="studio-focus-ring rounded-lg bg-[#7a0f33] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5e0c27]"
                >
                  ✏ Edit
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {expanded ? (
          <div className="space-y-3">
            <div className="relative mx-auto h-[340px] w-full max-w-[640px] overflow-hidden rounded-xl border border-studio-border bg-studio-inset">
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
                if (historyDetail?.id === deleteTarget.id) setHistoryDetail(null)
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
            This will permanently delete <span className="font-semibold">{deleteTarget?.projectName || 'this session'}</span>.
          </div>
          <div className="text-sm text-studio-muted">This action cannot be undone.</div>
        </div>
      </Modal>
    </div>
  )
}

