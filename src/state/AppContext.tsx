import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { creditData } from '../data/credits'
import { type Project, loadProjects, localCalendarDateISO, persistProjects } from '../data/projects'
import {
  MAX_SESSION_HISTORY,
  type SessionHistoryEntry,
  loadSessionHistory,
  makeSessionDisplayId,
  mergeSessionHistoryWithDisk,
} from '../data/sessionHistory'
import {
  hydrateSessionHistoryFromDisk,
  saveSessionHistoryDurable,
} from '../data/sessionHistoryIndexedDb'

export type UiTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'creaitive-ui-theme'

function readStoredTheme(): UiTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode */
  }
  return 'dark'
}

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  createdAt: number
}

type AppState = {
  uiTheme: UiTheme
  setUiTheme: (theme: UiTheme) => void
  toggleUiTheme: () => void
  credits: number
  projects: Project[]
  toasts: ToastItem[]
  sessionHistory: SessionHistoryEntry[]
  createProject: (input: { name: string; description: string }) => void
  deleteProject: (projectId: string) => Promise<void>
  addToast: (toast: Omit<ToastItem, 'id' | 'createdAt'>) => void
  dismissToast: (toastId: string) => void
  deductCredits: (amount: number) => void
  /** Add usage counts to a project when generating or saving from the Editor */
  applyProjectUsage: (
    projectId: string,
    delta: { images?: number; experiments?: number; credits?: number },
  ) => void
  addHistorySession: (payload: {
    status: SessionHistoryEntry['status']
    prompt: string
    modelName: string
    modelId: string
    imageCount: number
    imageSrcs: string[]
    sourceImageSrc?: string
  }) => void
  deleteHistorySession: (sessionId: string) => void
}

const AppContext = createContext<AppState | null>(null)

function safeId(prefix: string) {
  const cryptoId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${cryptoId}`
}

export function AppProvider({ children }: PropsWithChildren) {
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => readStoredTheme())
  const [credits, setCredits] = useState<number>(creditData.balence)
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>(() => loadSessionHistory())
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const fromDisk = await hydrateSessionHistoryFromDisk()
      if (cancelled) return
      setSessionHistory((current) => mergeSessionHistoryWithDisk(fromDisk, current))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme
    document.documentElement.style.colorScheme = uiTheme === 'light' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, uiTheme)
    } catch {
      /* private mode */
    }
  }, [uiTheme])

  const toggleUiTheme = useCallback(() => {
    setUiTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId))
    const handle = toastTimeoutsRef.current.get(toastId)
    if (handle) window.clearTimeout(handle)
    toastTimeoutsRef.current.delete(toastId)
  }, [])

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = safeId('toast')
      const item: ToastItem = { id, createdAt: Date.now(), ...toast }
      setToasts((prev) => [item, ...prev].slice(0, 5))
      const handle = window.setTimeout(() => dismissToast(id), 3000)
      toastTimeoutsRef.current.set(id, handle)
    },
    [dismissToast],
  )

  const createProject = useCallback(
    (input: { name: string; description: string }) => {
      const name = input.name.trim()
      const description = input.description.trim()
      const nameKey = name.toLowerCase()

      setProjects((prev) => {
        if (prev.some((p) => p.name.trim().toLowerCase() === nameKey)) {
          queueMicrotask(() =>
            addToast({
              variant: 'error',
              title: 'Project name already exists',
              message: 'Use a different name so each project stays unique.',
            }),
          )
          return prev
        }

        const created = localCalendarDateISO()
        const newProject: Project = {
          id: safeId('p'),
          name,
          description,
          status: 'active',
          images: 0,
          experiments: 0,
          credits: 0,
          created,
          updated: created,
        }
        const next = [newProject, ...prev]
        if (!persistProjects(next)) {
          queueMicrotask(() =>
            addToast({
              variant: 'error',
              title: 'Could not save project',
              message: 'Browser storage may be full or unavailable.',
            }),
          )
          return prev
        }
        queueMicrotask(() =>
          addToast({
            variant: 'success',
            title: 'Project created successfully',
          }),
        )
        return next
      })
    },
    [addToast],
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      await new Promise((r) => window.setTimeout(r, 200))
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== projectId)
        if (!persistProjects(next)) {
          queueMicrotask(() =>
            addToast({ variant: 'error', title: 'Could not update saved projects after delete.' }),
          )
          return prev
        }
        queueMicrotask(() => addToast({ variant: 'info', title: 'Project deleted' }))
        return next
      })
    },
    [addToast],
  )

  const deductCredits = useCallback((amount: number) => {
    setCredits((prev) => Math.max(0, prev - amount))
  }, [])

  const applyProjectUsage = useCallback(
    (projectId: string, delta: { images?: number; experiments?: number; credits?: number }) => {
      const di = Math.max(0, Math.floor(delta.images ?? 0))
      const de = Math.max(0, Math.floor(delta.experiments ?? 0))
      const dc = Math.max(0, Math.floor(delta.credits ?? 0))
      if (di === 0 && de === 0 && dc === 0) return

      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === projectId)
        if (idx === -1) return prev
        const p = prev[idx]!
        const today = localCalendarDateISO()
        const next = [...prev]
        next[idx] = {
          ...p,
          images: p.images + di,
          experiments: p.experiments + de,
          credits: p.credits + dc,
          updated: today,
        }
        if (!persistProjects(next)) {
          queueMicrotask(() =>
            addToast({
              variant: 'error',
              title: 'Could not save project stats',
              message: 'Your workspace totals may be out of sync until storage is available.',
            }),
          )
          return prev
        }
        return next
      })
    },
    [addToast],
  )

  const addHistorySession = useCallback(
    (payload: {
      status: SessionHistoryEntry['status']
      prompt: string
      modelName: string
      modelId: string
      imageCount: number
      imageSrcs: string[]
      sourceImageSrc?: string
    }) => {
      const fullEntry: SessionHistoryEntry = {
        id: makeSessionDisplayId(),
        createdAt: Date.now(),
        status: payload.status,
        prompt: payload.prompt,
        modelName: payload.modelName,
        modelId: payload.modelId,
        imageCount: payload.imageCount,
        imageSrcs: payload.imageSrcs,
        ...(payload.sourceImageSrc ? { sourceImageSrc: payload.sourceImageSrc } : {}),
      }

      setSessionHistory((prev) => {
        const next = [fullEntry, ...prev].slice(0, MAX_SESSION_HISTORY)
        queueMicrotask(() => {
          void saveSessionHistoryDurable(next).then(({ mode, persisted }) => {
            if (persisted && (mode === 'slim_images' || mode === 'slim_source')) {
              setSessionHistory(persisted)
            }
            if (mode === 'slim_images') {
              addToast({
                variant: 'info',
                title: 'History stored with preview only',
                message: 'Latest run was compacted so it stays saved across sessions.',
              })
            } else if (mode === 'slim_source') {
              addToast({
                variant: 'info',
                title: 'History stored without original upload',
                message: 'Re-run may not restore the source image for that session.',
              })
            } else if (mode === 'failed') {
              addToast({
                variant: 'error',
                title: 'Could not persist history',
                message: 'This run is visible until you refresh or clear site data.',
              })
            }
          })
        })
        return next
      })
    },
    [addToast],
  )

  const deleteHistorySession = useCallback(
    (sessionId: string) => {
      setSessionHistory((prev) => {
        const next = prev.filter((e) => e.id !== sessionId)
        queueMicrotask(() => {
          void saveSessionHistoryDurable(next).then(({ mode }) => {
            if (mode === 'failed') {
              addToast({
                variant: 'error',
                title: 'Could not save history after delete',
                message: 'Refresh the page to reload from storage.',
              })
            } else {
              addToast({ variant: 'info', title: 'Session removed from history' })
            }
          })
        })
        return next
      })
    },
    [addToast],
  )

  const value = useMemo<AppState>(
    () => ({
      uiTheme,
      setUiTheme,
      toggleUiTheme,
      credits,
      projects,
      toasts,
      sessionHistory,
      createProject,
      deleteProject,
      addToast,
      dismissToast,
      deductCredits,
      applyProjectUsage,
      addHistorySession,
      deleteHistorySession,
    }),
    [
      uiTheme,
      toggleUiTheme,
      credits,
      projects,
      toasts,
      sessionHistory,
      createProject,
      deleteProject,
      addToast,
      dismissToast,
      deductCredits,
      applyProjectUsage,
      addHistorySession,
      deleteHistorySession,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

