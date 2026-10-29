// Replaced by the Vite build. No manifest or installation UI is needed.
const SHELL_CACHE = __SHELL_CACHE__
const ASSETS = __ASSETS__
const PHOTO_PREFIX = 'nearby-lifers-photos-v1-'
const root = new URL('./', self.location.href)
const indexUrl = new URL('index.html', root).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll(
        ASSETS.map(
          (path) => new Request(new URL(path, root), { cache: 'reload' }),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep one previous shell for tabs still running its hashed assets.
      const old = (await caches.keys()).filter(
        (name) =>
          name.startsWith('nearby-lifers-shell-') && name !== SHELL_CACHE,
      )
      await Promise.all(old.slice(0, -1).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (!['CHECK_SHELL', 'REPAIR_SHELL'].includes(event.data)) return
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE)
        if (event.data === 'REPAIR_SHELL')
          await cache.addAll(
            ASSETS.map(
              (path) => new Request(new URL(path, root), { cache: 'reload' }),
            ),
          )
        const entries = await Promise.all(
          ASSETS.map((path) => cache.match(new URL(path, root).href)),
        )
        event.ports[0]?.postMessage(entries.every(Boolean))
      } catch {
        event.ports[0]?.postMessage(false)
      }
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Decode the exact saved response, including photos from hosts without CORS.
  // A unique local URL bypasses the browser's in-memory image cache.
  if (
    request.destination === 'image' &&
    url.origin === root.origin &&
    url.pathname === root.pathname + 'offline-photo-check'
  ) {
    const name = url.searchParams.get('cache') ?? ''
    const photo = url.searchParams.get('photo') ?? ''
    event.respondWith(
      (async () => {
        if (!name.startsWith(PHOTO_PREFIX)) return Response.error()
        return (
          (await (await caches.open(name)).match(photo)) ?? Response.error()
        )
      })(),
    )
    return
  }
  if (
    request.mode === 'navigate' &&
    url.origin === root.origin &&
    (url.pathname === root.pathname || url.href.split('?')[0] === indexUrl)
  ) {
    event.respondWith(
      (async () =>
        (await caches.open(SHELL_CACHE))
          .match(indexUrl)
          .then((response) => response ?? fetch(request)))(),
    )
    return
  }
  if (
    url.origin === root.origin &&
    ASSETS.some((path) => new URL(path, root).pathname === url.pathname)
  ) {
    event.respondWith(
      (async () =>
        (await caches.match(request, {
          ignoreSearch: true,
          ignoreVary: true,
        })) ?? fetch(request))(),
    )
    return
  }
  if (request.destination === 'image') {
    event.respondWith(
      (async () => {
        for (const name of (await caches.keys()).filter((name) =>
          name.startsWith(PHOTO_PREFIX),
        )) {
          const response = await (await caches.open(name)).match(request.url)
          if (response) return response
        }
        return fetch(request)
      })(),
    )
  }
})
