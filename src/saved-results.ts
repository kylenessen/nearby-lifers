import type { Snapshot } from './inaturalist'
import { searchKey, validateSearch } from './search'
import type { Search } from './search'

const DATABASE = 'nearby-lifers-results'
const STORE = 'searches'
const VERSION = 1

// Completed results have no expiry. View settings always come from the URL.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    let expired = false
    const timer = setTimeout(() => {
      expired = true
      reject(new Error('Saved results storage is unavailable.'))
    }, 3000)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onerror = () => {
      clearTimeout(timer)
      reject(request.error)
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (expired) return request.result.close()
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  const db = await openDatabase()
  try {
    signal?.throwIfAborted()
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const abort = () => tx.abort()
      const timer = setTimeout(abort, 5000)
      signal?.addEventListener('abort', abort, { once: true })
      const clean = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      tx.onabort = () => {
        clean()
        reject(
          signal?.reason ??
            tx.error ??
            new Error('Could not save results on this device.'),
        )
      }
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => {
        clean()
        resolve(request.result)
      }
    })
  } finally {
    db.close()
  }
}

function validSnapshot(value: Snapshot, key: string): boolean {
  try {
    return Boolean(
      value &&
      !validateSearch(value.search) &&
      searchKey(value.search) === key &&
      Number.isFinite(Date.parse(value.builtAt)) &&
      typeof value.areaLabel === 'string' &&
      Number.isFinite(value.observedTotal) &&
      Array.isArray(value.users) &&
      value.users.every(
        (user) => Number.isFinite(user.id) && typeof user.login === 'string',
      ) &&
      Array.isArray(value.species) &&
      value.species.every(
        (species) =>
          Number.isFinite(species.id) &&
          Number.isFinite(species.count) &&
          typeof species.commonName === 'string' &&
          typeof species.scientificName === 'string' &&
          typeof species.observedByUser === 'boolean' &&
          typeof species.casualOnly === 'boolean' &&
          typeof species.expectedNearby === 'boolean',
      ) &&
      (!value.external ||
        (Array.isArray(value.external.unmatched) &&
          Array.isArray(value.external.warnings))),
    )
  } catch {
    return false
  }
}

export async function readSavedResults(
  search: Search,
  signal?: AbortSignal,
): Promise<Snapshot | null> {
  const key = searchKey(search)
  const entry = await transaction('readonly', (store) => store.get(key), signal)
  if (!entry) return null
  if (entry.version !== VERSION || !validSnapshot(entry.snapshot, key))
    throw new Error('This saved search needs to be rebuilt.')
  return entry.snapshot
}

export async function saveResults(snapshot: Snapshot, signal?: AbortSignal) {
  await transaction(
    'readwrite',
    (store) =>
      store.put({
        key: searchKey(snapshot.search),
        version: VERSION,
        snapshot,
      }),
    signal,
  )
}

export async function removeSavedResults(search: Search) {
  await transaction('readwrite', (store) => store.delete(searchKey(search)))
}

export async function clearSavedResults() {
  await transaction('readwrite', (store) => store.clear())
}
