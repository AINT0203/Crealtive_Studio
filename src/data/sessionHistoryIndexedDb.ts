import {
  type SessionHistoryEntry,
  loadSessionHistory,
  normalizeSessionHistoryArray,
  persistSessionHistory,
} from './sessionHistory'

const DB_NAME = 'creaitive-studio'
const DB_VERSION = 1
const STORE = 'sessionHistory'
const KEY = 'entries'

function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

export async function idbLoadSessionHistory(): Promise<SessionHistoryEntry[]> {
  try {
    const db = await openHistoryDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => {
        const raw = req.result
        if (typeof raw !== 'string') {
          resolve([])
          return
        }
        try {
          resolve(normalizeSessionHistoryArray(JSON.parse(raw) as unknown))
        } catch {
          resolve([])
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function idbSaveSessionHistory(entries: SessionHistoryEntry[]): Promise<boolean> {
  try {
    const db = await openHistoryDb()
    const payload = JSON.stringify(entries)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
      tx.objectStore(STORE).put(payload, KEY)
    })
  } catch {
    return false
  }
}

function slimNewestImages(entries: SessionHistoryEntry[]): SessionHistoryEntry[] {
  const [h, ...t] = entries
  if (!h) return entries
  return [{ ...h, imageSrcs: h.imageSrcs.slice(0, 1) }, ...t]
}

function stripNewestSource(entries: SessionHistoryEntry[]): SessionHistoryEntry[] {
  const [h, ...t] = entries
  if (!h) return entries
  const { sourceImageSrc: _removed, sourceImageSrcs: _removedMany, ...rest } = h
  return [rest as SessionHistoryEntry, ...t]
}

export type SessionHistorySaveMode = 'full' | 'slim_images' | 'slim_source' | 'local_only' | 'failed'

export type SessionHistorySaveResult = {
  mode: SessionHistorySaveMode
  /** Rows actually written (may be slimmed vs `entries`) */
  persisted?: SessionHistoryEntry[]
}

/**
 * IndexedDB holds large base64 payloads; localStorage is only a mirror when small enough.
 */
export async function saveSessionHistoryDurable(
  entries: SessionHistoryEntry[],
): Promise<SessionHistorySaveResult> {
  if (await idbSaveSessionHistory(entries)) {
    persistSessionHistory(entries)
    return { mode: 'full', persisted: entries }
  }

  const slim1 = slimNewestImages(entries)
  if (await idbSaveSessionHistory(slim1)) {
    persistSessionHistory(slim1)
    return { mode: 'slim_images', persisted: slim1 }
  }

  const slim2 = stripNewestSource(slim1)
  if (await idbSaveSessionHistory(slim2)) {
    persistSessionHistory(slim2)
    return { mode: 'slim_source', persisted: slim2 }
  }

  if (persistSessionHistory(entries)) {
    void idbSaveSessionHistory(entries)
    return { mode: 'local_only', persisted: entries }
  }

  return { mode: 'failed' }
}

/** Prefer IndexedDB; migrate legacy localStorage rows into IDB once. */
export async function hydrateSessionHistoryFromDisk(): Promise<SessionHistoryEntry[]> {
  const fromIdb = await idbLoadSessionHistory()
  if (fromIdb.length > 0) {
    persistSessionHistory(fromIdb)
    return fromIdb
  }

  const fromLs = loadSessionHistory()
  if (fromLs.length > 0) {
    await idbSaveSessionHistory(fromLs)
  }
  return fromLs
}
