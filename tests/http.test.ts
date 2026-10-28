import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abortableDelay, createJsonClient } from '../src/http.ts'

const options = {
  root: 'https://example.test',
  name: 'Test API',
  interval: 0,
  retryDelay: 1,
  timeout: 100,
}
test('transient errors retry and successful cached data expires', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? new Response('', { status: 503 })
      : Response.json({ calls })
  })
  const json = createJsonClient(options)
  assert.deepEqual(await json('/a', undefined, 20), { calls: 2 })
  assert.deepEqual(await json('/a', undefined, 20), { calls: 2 })
  assert.equal(calls, 2)
  await abortableDelay(25)
  assert.deepEqual(await json('/a', undefined, 20), { calls: 3 })
})
test('permanent errors and failed requests are never cached', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? new Response('', { status: 400 })
      : Response.json({ ok: true })
  })
  const json = createJsonClient(options)
  await assert.rejects(() => json('/a', undefined, 1000), /400/)
  assert.equal(calls, 1)
  assert.deepEqual(await json('/a', undefined, 1000), { ok: true })
})
test('cancellation interrupts retry backoff and cached requests', async (t) => {
  const controller = new AbortController()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    setTimeout(() => controller.abort(), 5)
    return new Response('', { status: 429, headers: { 'Retry-After': '30' } })
  })
  const json = createJsonClient(options)
  await assert.rejects(() => json('/a', controller.signal, 1000), {
    name: 'AbortError',
  })
  assert.equal(calls, 1)
  await assert.rejects(() => json('/a', controller.signal, 1000), {
    name: 'AbortError',
  })
  assert.equal(calls, 1)
})
test('request timeouts retry only a bounded number of times', async (t) => {
  let calls = 0
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: string, init: RequestInit) => {
      calls++
      return new Promise<Response>((_resolve, reject) =>
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('Timed out', 'AbortError')),
        ),
      )
    },
  )
  const json = createJsonClient({ ...options, timeout: 5 })
  await assert.rejects(() => json('/a'), /could not finish/)
  assert.equal(calls, 3)
})
test('long Retry-After does not cause an early retry', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new Response('', { status: 429, headers: { 'Retry-After': '120' } })
  })
  await assert.rejects(() => createJsonClient(options)('/a'), /120 seconds/)
  assert.equal(calls, 1)
})
