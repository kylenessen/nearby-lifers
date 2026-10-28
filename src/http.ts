// Public API data stays in memory. No search or account state is persisted.
export function abortableDelay(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function createJsonClient({
  root,
  name,
  interval = 200,
  timeout = 30000,
  retries = 2,
  retryDelay = 1000,
  maxEntries = 2000,
}: {
  root: string
  name: string
  interval?: number
  timeout?: number
  retries?: number
  retryDelay?: number
  maxEntries?: number
}) {
  let nextRequestAt = 0
  const cache = new Map<string, { expires: number; value: unknown }>()
  return async function json<T>(path: string, signal?: AbortSignal, ttl = 0): Promise<T> {
    signal?.throwIfAborted()
    const cached = cache.get(path)
    if (ttl && cached && cached.expires > Date.now()) return cached.value as T
    cache.delete(path)
    for (let attempt = 0; ; attempt++) {
      const delay = Math.max(0, nextRequestAt - Date.now())
      nextRequestAt = Date.now() + delay + interval
      await abortableDelay(delay, signal)
      signal?.throwIfAborted()
      const controller = new AbortController()
      const abort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeout)
      let retryAfter = 0
      let retryable = true
      try {
        const response = await fetch(root + path, { signal: controller.signal })
        if (!response.ok) {
          retryable = response.status === 429 || response.status === 408 || response.status >= 500
          const header = response.headers.get('retry-after')
          if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now())
          throw new Error(`${name} returned ${response.status}.`)
        }
        const value = await response.json() as T
        signal?.throwIfAborted()
        if (ttl) {
          while (cache.size >= maxEntries) cache.delete(cache.keys().next().value!)
          cache.set(path, { value, expires: Date.now() + ttl })
        }
        return value
      } catch (error) {
        signal?.throwIfAborted()
        if (!retryable || attempt >= retries)
          throw new Error(`${name} could not finish the request. Please try again. ${error instanceof Error ? error.message : ''}`)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      // Honor long Retry-After periods by failing visibly, never retrying early.
      if (retryAfter > 60000)
        throw new Error(`${name} is busy. Please try again after ${Math.ceil(retryAfter / 1000)} seconds.`)
      await abortableDelay(Math.max(retryAfter, retryDelay * 2 ** attempt), signal)
    }
  }
}
