import { test } from 'node:test'
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { PUBLIC_SITE_URL, qrGraphic } from '../src/qr.ts'

test('the back-cover QR decodes to the public website with a clear quiet zone', () => {
  const qr = qrGraphic(PUBLIC_SITE_URL)
  const scale = 6
  const width = qr.size * scale
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
  for (const match of qr.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]),
      y = Number(match[2])
    assert.ok(x >= 4 && x < qr.size - 4 && y >= 4 && y < qr.size - 4)
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const start = ((y * scale + dy) * width + x * scale + dx) * 4
        pixels.fill(0, start, start + 3)
      }
  }
  assert.equal(
    jsQR(pixels, width, width)?.data,
    'https://kylenessen.github.io/nearby-lifers/',
  )
})
