/** YYYY-MM-DD in the user's local timezone (avoid UTC day-shift from `toISOString()`) */
export function localCalendarDateISO(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type ProjectStatus = 'active' | 'archived'

export type Project = {
  id: string
  name: string
  description: string
  status: ProjectStatus
  images: number
  experiments: number
  credits: number
  /** Calendar date (YYYY-MM-DD) when the project was created */
  created: string
  /** Calendar date (YYYY-MM-DD) of last Editor activity for this project (generate / save) */
  updated: string
}

export const PROJECTS_STORAGE_KEY = 'creaitive_user_projects_v1'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseProject(x: unknown): Project | null {
  if (!isRecord(x)) return null
  const id = x.id
  const name = x.name
  const description = x.description
  const status = x.status
  const images = x.images
  const experiments = x.experiments
  const credits = x.credits
  const created = x.created
  const updatedRaw = x.updated
  if (typeof id !== 'string' || typeof name !== 'string' || typeof description !== 'string') return null
  if (status !== 'active' && status !== 'archived') return null
  if (typeof images !== 'number' || typeof experiments !== 'number' || typeof credits !== 'number') return null
  if (typeof created !== 'string') return null
  const updated = typeof updatedRaw === 'string' && updatedRaw.length >= 8 ? updatedRaw : created
  return { id, name, description, status, images, experiments, credits, created, updated }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: Project[] = []
    const seen = new Set<string>()
    for (const row of parsed) {
      const p = parseProject(row)
      if (!p || seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    return out
  } catch {
    return []
  }
}

export function persistProjects(projects: Project[]): boolean {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
    return true
  } catch {
    return false
  }
}
