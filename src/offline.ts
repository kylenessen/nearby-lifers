import type { Snapshot } from './inaturalist'
import { searchKey } from './search'

const PREFIX = 'nearby-lifers-photos-v1-'
const workerUrl = new URL(
  import.meta.env.BASE_URL + 'offline-worker.js',
  location.origin,
).href
const scope = new URL('./', workerUrl).href
const photos = (snapshot: Snapshot) => [
  ...new Set(
    snapshot.species.flatMap((species) =>
      species.photoUrl ? [species.photoUrl] : [],
    ),
  ),
]

async function searchPrefix(snapshot: Snapshot) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(searchKey(snapshot.search)),
  )
  return (
    PREFIX +
    Array.from(new Uint8Array(hash))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('') +
    '-'
  )
}
async function cacheName(snapshot: Snapshot) {
  return (await searchPrefix(snapshot)) + Date.parse(snapshot.builtAt)
}
function verificationKey(photo: string) {
  const url = new URL('offline-photo-verified', scope)
  url.searchParams.set('photo', photo)
  return url.href
}
async function photoSaved(cache: Cache, url: string) {
  const response = await cache.match(url)
  // Interrupted opaque downloads must be verified again before reporting success.
  return Boolean(
    response &&
    (response.type !== 'opaque' || (await cache.match(verificationKey(url)))),
  )
}

function checkShell(worker: ServiceWorker, repair = false): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(
      () => {
        channel.port1.close()
        resolve(false)
      },
      repair ? 20000 : 5000,
    )
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(event.data === true)
    }
    worker.postMessage(repair ? 'REPAIR_SHELL' : 'CHECK_SHELL', [channel.port2])
  })
}

async function registerOffline() {
  if (!import.meta.env.PROD)
    throw new Error(
      'Offline downloads are available on the published website or a production preview.',
    )
  if (!('serviceWorker' in navigator) || !('caches' in window))
    throw new Error('This browser does not support saving the website offline.')
  const registration = await navigator.serviceWorker.register(workerUrl, {
    scope,
    updateViaCache: 'none',
  })
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (
      registration.active &&
      navigator.serviceWorker.controller?.scriptURL === workerUrl
    ) {
      if (
        (await checkShell(registration.active)) ||
        (await checkShell(registration.active, true))
      )
        return
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  // Repair a shell evicted independently of its registration on the next save.
  throw new Error(
    'The website files could not be saved. Reconnect and try Save for offline again.',
  )
}

// Update only an existing offline registration. Downloading is an explicit choice.
export async function updateOfflineWebsite() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration(scope)
    if (registration?.active?.scriptURL === workerUrl && navigator.onLine)
      await navigator.serviceWorker.register(workerUrl, {
        scope,
        updateViaCache: 'none',
      })
  } catch {
    /* The saved website continues to work without a connection. */
  }
}

export async function offlineReady(snapshot: Snapshot) {
  if (
    !import.meta.env.PROD ||
    !('serviceWorker' in navigator) ||
    !('caches' in window)
  )
    return false
  const registration = await navigator.serviceWorker.getRegistration(scope)
  if (
    !registration?.active ||
    registration.active.scriptURL !== workerUrl ||
    !(await checkShell(registration.active))
  )
    return false
  const name = await cacheName(snapshot)
  if (!(await caches.has(name))) return false
  const cache = await caches.open(name)
  const entries = await Promise.all(
    photos(snapshot).map((url) => photoSaved(cache, url)),
  )
  return entries.every(Boolean)
}

async function decodePhoto(url: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const image = new Image()
  const controller = AbortSignal.any([signal, AbortSignal.timeout(20000)])
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      image.src = ''
      reject(controller.reason)
    }
    controller.addEventListener('abort', abort, { once: true })
    image.src = url
    image
      .decode()
      .then(resolve, reject)
      .finally(() => controller.removeEventListener('abort', abort))
  })
}

async function downloadPhoto(
  cache: Cache,
  name: string,
  url: string,
  signal: AbortSignal,
) {
  let failure: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted()
    let stored = false
    try {
      const fetchPhoto = (mode: RequestMode) =>
        fetch(url, {
          mode,
          credentials: 'omit',
          signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        })
      // iNaturalist's static host serves displayable photos without CORS headers.
      let response: Response
      if (new URL(url).hostname === 'static.inaturalist.org')
        response = await fetchPhoto('no-cors')
      else {
        try {
          response = await fetchPhoto('cors')
        } catch {
          signal.throwIfAborted()
          response = await fetchPhoto('no-cors')
        }
      }
      if (response.type === 'opaque') {
        await cache.put(url, response)
        stored = true
        const check = new URL('offline-photo-check', scope)
        check.searchParams.set('cache', name)
        check.searchParams.set('photo', url)
        check.searchParams.set('check', crypto.randomUUID())
        await decodePhoto(check.href, signal)
        signal.throwIfAborted()
        await cache.put(verificationKey(url), new Response('verified'))
      } else {
        if (!response.ok) throw new Error('Photo download failed.')
        const objectUrl = URL.createObjectURL(await response.clone().blob())
        try {
          await decodePhoto(objectUrl, signal)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
        signal.throwIfAborted()
        await cache.put(url, response)
        stored = true
      }
      signal.throwIfAborted()
      return
    } catch (cause) {
      if (stored) {
        await cache.delete(url)
        await cache.delete(verificationKey(url))
      }
      signal.throwIfAborted()
      if (cause instanceof DOMException && cause.name === 'QuotaExceededError')
        throw cause
      failure = cause
      if (attempt < 2)
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer)
            reject(signal.reason)
          }
          const timer = setTimeout(
            () => {
              signal.removeEventListener('abort', abort)
              resolve()
            },
            500 * 2 ** attempt,
          )
          signal.addEventListener('abort', abort, { once: true })
        })
    }
  }
  throw failure
}

export async function saveOffline(
  snapshot: Snapshot,
  signal: AbortSignal,
  onProgress: (message: string) => void,
) {
  onProgress('Saving website files for offline use.')
  await registerOffline()
  signal.throwIfAborted()
  const name = await cacheName(snapshot)
  const cache = await caches.open(name)
  const urls = photos(snapshot)
  let next = 0
  let completed = 0
  let failed = 0
  let storageFull = false
  await Promise.all(
    Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (next < urls.length && !storageFull) {
        signal.throwIfAborted()
        const url = urls[next++]
        try {
          if (!(await photoSaved(cache, url))) {
            await downloadPhoto(cache, name, url, signal)
          }
          completed++
        } catch (cause) {
          signal.throwIfAborted()
          if (
            cause instanceof DOMException &&
            cause.name === 'QuotaExceededError'
          )
            storageFull = true
          failed++
        }
        onProgress(
          `Saved ${completed} of ${urls.length} photos${failed ? `. ${failed} failed` : ''}.`,
        )
      }
    }),
  )
  signal.throwIfAborted()
  if (storageFull)
    throw new Error(
      'Not enough device storage to finish the offline download. Remove an older saved search or free space, then try again.',
    )
  if (failed || !(await offlineReady(snapshot)))
    throw new Error(
      `${failed ? `${failed} photo downloads failed. ` : ''}Offline saving is incomplete. Reconnect and try again to download the missing files.`,
    )
  // Old versions remain usable until the replacement is fully downloaded.
  const prefix = await searchPrefix(snapshot)
  await Promise.all(
    (await caches.keys())
      .filter((key) => key.startsWith(prefix) && key !== name)
      .map((key) => caches.delete(key)),
  )
}

export async function removeOfflinePhotos(snapshot?: Snapshot) {
  if (!('caches' in window)) return
  const prefix = snapshot ? await searchPrefix(snapshot) : PREFIX
  await Promise.all(
    (await caches.keys())
      .filter((name) => name.startsWith(prefix))
      .map((name) => caches.delete(name)),
  )
}
