export type GenerateApiResponse = {
  images_b64: string[]
  mime_type: string
}

function apiRoot(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  return raw?.replace(/\/$/, '') ?? ''
}

function parseErrorDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Request failed'
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join('; ')
  }
  return 'Request failed'
}

export async function requestGenerate(
  input: {
    /** Sent in list order as repeated `images` multipart fields */
    images: File[]
    prompt: string
    numImages: number
    modelId: string
    geminiModelId?: string
    signal?: AbortSignal
  },
): Promise<GenerateApiResponse> {
  const fd = new FormData()
  for (const file of input.images) {
    fd.append('images', file)
  }
  fd.append('prompt', input.prompt)
  fd.append('num_images', String(input.numImages))
  fd.append('provider_id', input.modelId)
  if (input.geminiModelId) fd.append('model', input.geminiModelId)

  const url = `${apiRoot()}/api/generate`
  const res = await fetch(url, { method: 'POST', body: fd, signal: input.signal })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    throw new Error(parseErrorDetail(body) || res.statusText || `HTTP ${res.status}`)
  }
  const data = body as Partial<GenerateApiResponse>
  if (!data?.images_b64 || !Array.isArray(data.images_b64)) {
    throw new Error('Invalid response from server')
  }
  return data as GenerateApiResponse
}
