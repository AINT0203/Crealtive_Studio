export const SESSION_HISTORY_STORAGE_KEY = 'creaitive_session_history_v1'
export const MAX_SESSION_HISTORY = 40

export type SessionHistoryEntry = {
  id: string
  projectId?: string
  projectName?: string
  createdAt: number
  status: 'success' | 'error'
  prompt: string
  modelName: string
  modelId: string
  imageCount: number
  /** Data URLs (PNG) for previews and detail view */
  imageSrcs: string[]
  /** Original upload used for this run (data URL); enables Re-run in Editor */
  sourceImageSrc?: string
  /** All uploads present in Editor during that run (for restoring multi-input context) */
  sourceImageSrcs?: string[]
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseEntry(x: unknown): SessionHistoryEntry | null {
  if (!isRecord(x)) return null
  const id = x.id
  const createdAt = x.createdAt
  const projectName = x.projectName
  const projectId = x.projectId
  const status = x.status
  const prompt = x.prompt
  const modelName = x.modelName
  const modelId = x.modelId
  const imageCount = x.imageCount
  const imageSrcs = x.imageSrcs
  const sourceImageSrc = x.sourceImageSrc
  const sourceImageSrcs = x.sourceImageSrcs
  if (typeof id !== 'string' || typeof createdAt !== 'number') return null
  if (status !== 'success' && status !== 'error') return null
  if (typeof prompt !== 'string' || typeof modelName !== 'string' || typeof modelId !== 'string') return null
  if (typeof imageCount !== 'number' || !Array.isArray(imageSrcs)) return null
  if (!imageSrcs.every((s) => typeof s === 'string')) return null
  const out: SessionHistoryEntry = {
    id,
    createdAt,
    status,
    prompt,
    modelName,
    modelId,
    imageCount,
    imageSrcs,
  }
  if (typeof projectId === 'string' && projectId.trim().length > 0) {
    out.projectId = projectId.trim()
  }
  if (typeof projectName === 'string' && projectName.trim().length > 0) {
    out.projectName = projectName.trim()
  }
  if (typeof sourceImageSrc === 'string' && sourceImageSrc.length > 0) {
    out.sourceImageSrc = sourceImageSrc
  }
  if (Array.isArray(sourceImageSrcs)) {
    const cleaned = sourceImageSrcs.filter((s): s is string => typeof s === 'string' && s.length > 0)
    if (cleaned.length > 0) out.sourceImageSrcs = cleaned
  }
  return out
}

export function normalizeSessionHistoryArray(raw: unknown): SessionHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseEntry).filter((e): e is SessionHistoryEntry => e !== null)
}

/** Disk wins on id clashes; keeps rows that exist only in memory (e.g. not persisted yet). */
export function mergeSessionHistoryWithDisk(
  fromDisk: SessionHistoryEntry[],
  current: SessionHistoryEntry[],
): SessionHistoryEntry[] {
  const byId = new Map<string, SessionHistoryEntry>()
  for (const e of fromDisk) byId.set(e.id, e)
  for (const e of current) {
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SESSION_HISTORY)
}

export function loadSessionHistory(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return normalizeSessionHistoryArray(parsed)
  } catch {
    return []
  }
}

export function makeSessionDisplayId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `VTO-${s}`
}

export function persistSessionHistory(entries: SessionHistoryEntry[]): boolean {
  try {
    localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(entries))
    return true
  } catch {
    return false
  }
}
