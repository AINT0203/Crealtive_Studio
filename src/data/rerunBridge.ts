/** Session key prefix — data is too large for history.pushState; use sessionStorage instead */
export const RERUN_SESSION_PREFIX = 'creaitive_rerun:v1:'

export type RerunPayload = {
  prompt: string
  modelId: string
  /** Data URL of the original upload, or first result as fallback */
  sourceImageSrc: string | null
}

export function writeRerunPayload(payload: RerunPayload): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const key = `${RERUN_SESSION_PREFIX}${id}`
  sessionStorage.setItem(key, JSON.stringify(payload))
  return key
}

export function readRerunPayload(key: string): RerunPayload | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return null
    const o = p as Record<string, unknown>
    const prompt = typeof o.prompt === 'string' ? o.prompt : ''
    const modelId = typeof o.modelId === 'string' ? o.modelId : ''
    const src = o.sourceImageSrc
    const sourceImageSrc = typeof src === 'string' && src.length > 0 ? src : null
    return { prompt, modelId, sourceImageSrc }
  } catch {
    return null
  }
}

export function consumeRerunPayload(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
