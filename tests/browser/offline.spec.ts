import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaults, encodeSettings, searchKey } from '../../src/search'
import type { Snapshot } from '../../src/inaturalist'

let photoRoot = ''
let brokenPhoto = false
let downloads: string[] = []
const photoServer = createServer((request, response) => {
  downloads.push(request.url!)
  response.writeHead(200, {
    'content-type': 'image/svg+xml',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  })
  response.end(
    brokenPhoto && request.url?.endsWith('0.svg')
      ? 'not an image'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#74aff3"/><circle cx="200" cy="300" r="100" fill="#246956"/></svg>',
  )
})
test.beforeAll(async () => {
  await new Promise<void>((resolve) =>
    photoServer.listen(0, '127.0.0.1', resolve),
  )
  photoRoot = 'http://127.0.0.1:' + (photoServer.address() as AddressInfo).port
})
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    photoServer.close((error) => (error ? reject(error) : resolve())),
  )
})

const settings = defaults()
settings.search.groups = ['birds']
settings.search.source = 'ebird'
settings.search.area = { kind: 'place', id: 12 }
settings.view.printMode = 'booklet'
settings.view.bookletTitle = 'Offline field guide'
settings.view.hideUnexpected = false
const snapshot: Snapshot = {
  builtAt: '2020-01-02T12:00:00Z',
  search: settings.search,
  users: [{ id: 99, login: 'kylenessen' }],
  observedTotal: 100,
  areaLabel: 'Test Park',
  place: {
    id: 12,
    name: 'Test Park',
    geometry_geojson: {
      type: 'Polygon',
      coordinates: [
        [
          [-120.84, 35.32],
          [-120.83, 35.32],
          [-120.83, 35.33],
          [-120.84, 35.32],
        ],
      ],
    } as GeoJSON.GeoJsonObject,
  },
  external: {
    label: 'eBird',
    unmatched: [],
    warnings: [],
    retrievedAt: '2020-01-02T12:00:00Z',
  },
  species: Array.from({ length: 17 }, (_, index) => ({
    id: index + 1,
    commonName: ['Bufflehead', 'California Scrub-Jay', 'American Crow'][
      index % 3
    ],
    scientificName: [
      'Bucephala albeola',
      'Aphelocoma californica',
      'Corvus brachyrhynchos',
    ][index % 3],
    count: 100 - index,
    observedByUser: false,
    casualOnly: false,
    expectedNearby: true,
    photoUrl: `https://example.test/offline-photo-${index % 3}.svg`,
    photoCredit: 'A naturalist',
    family: {
      id: index % 3 ? 1 : 0,
      name: ['Anatidae', 'Corvidae', 'Corvidae'][index % 3],
      rank: 'family',
      preferred_common_name:
        index % 3 ? 'Crows and Jays' : 'Ducks, Geese, and Swans',
    },
  })),
}
const query = '?' + encodeSettings(settings)

async function openSaved(page: Page, broken = false) {
  brokenPhoto = broken
  const saved = {
    ...snapshot,
    species: snapshot.species.map((species) => ({
      ...species,
      photoUrl: species.photoUrl!.replace('https://example.test', photoRoot),
    })),
  }
  await page.goto('favicon.svg')
  await page.evaluate(
    async (entry) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('nearby-lifers-results', 1)
        request.onupgradeneeded = () =>
          request.result.createObjectStore('searches', { keyPath: 'key' })
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('searches', 'readwrite')
        tx.objectStore('searches').put(entry)
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
      })
      db.close()
    },
    { key: searchKey(settings.search), version: 1, snapshot: saved },
  )
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.abort(),
  )
  await page.goto('./' + query)
  await expect(
    page.getByText('17 species shown', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Saved on this device until you choose Refresh.', {
      exact: false,
    }),
  ).toBeVisible()
}

test('saved website, photos, maps and print layouts reopen on a phone with the network disabled', async ({
  page,
  context,
  browserName,
}) => {
  await openSaved(page)
  await page
    .getByRole('button', { name: 'Save for offline', exact: true })
    .click()
  await expect(page.getByText(/Offline download complete/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Saved for offline', exact: true }),
  ).toBeDisabled()
  const address = page.url()
  await page.close()
  await context.setOffline(true)
  const offline = await context.newPage()
  const errors: string[] = []
  offline.on('pageerror', (error) => errors.push(error.message))
  await offline.setViewportSize({ width: 390, height: 844 })
  const apiRequests: string[] = []
  offline.on('request', (request) => {
    if (/api\.(inaturalist|gbif)\.org/.test(request.url()))
      apiRequests.push(request.url())
  })
  await offline.goto(address)
  await expect(
    offline.getByText('17 species shown', { exact: true }),
  ).toBeVisible()
  await expect(offline.getByText(/Ready for offline use/)).toBeVisible()
  await expect(
    offline.getByRole('button', { name: 'Refresh results', exact: true }),
  ).toBeDisabled()
  await offline
    .getByRole('button', { name: 'Print options', exact: true })
    .click()
  await expect(offline.locator('.booklet-stack .print-card')).toHaveCount(17)
  await expect
    .poll(() =>
      offline
        .locator('.booklet-stack .print-photo img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  await expect(
    offline.locator('.booklet-stack .booklet-parameters-page'),
  ).toContainText('Results collected')
  await expect(
    offline.locator('.booklet-stack .booklet-parameters-page'),
  ).toContainText('Offline. Search boundary shown')
  await expect(
    offline.locator('.booklet-stack .print-map-canvas path'),
  ).not.toHaveCount(0)
  expect(
    await offline
      .locator('.booklet-parameters-page')
      .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true)
  await offline
    .locator('.booklet-stack [data-content-index="0"]')
    .screenshot({ path: 'test-results/offline-booklet-page.png' })
  await offline
    .locator('.booklet-stack .booklet-parameters-page')
    .screenshot({ path: 'test-results/offline-filters.png' })
  await offline.emulateMedia({ media: 'print' })
  if (browserName === 'chromium') {
    const pdf = await offline.pdf({
      path: 'test-results/offline-booklet.pdf',
      preferCSSPageSize: true,
      printBackground: true,
    })
    expect(pdf.length).toBeGreaterThan(10000)
  }
  await offline.emulateMedia({ media: 'screen' })
  await offline
    .getByRole('combobox', { name: 'Print as', exact: true })
    .selectOption('sheets')
  await expect(offline.locator('.sheet-stack .print-card')).toHaveCount(17)
  await expect
    .poll(() =>
      offline
        .locator('.sheet-stack .print-photo img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true)
  expect(apiRequests).toEqual([])
  expect(errors).toEqual([])
  await offline.reload()
  await expect(
    offline.getByText('17 species shown', { exact: true }),
  ).toBeVisible()
})

test('failed photo downloads stay incomplete and retry only the missing photos', async ({
  page,
}) => {
  await openSaved(page, true)
  await page
    .getByRole('button', { name: 'Save for offline', exact: true })
    .click()
  await expect(page.getByText(/1 photo downloads failed/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save for offline', exact: true }),
  ).toBeEnabled()
  downloads = []
  brokenPhoto = false
  await page
    .getByRole('button', { name: 'Save for offline', exact: true })
    .click()
  await expect(page.getByText(/Offline download complete/)).toBeVisible()
  expect(downloads).toEqual(['/offline-photo-0.svg'])
  // Eviction must not leave a false readiness claim. Saving repairs the shell.
  await page.evaluate(async () => {
    for (const key of await caches.keys())
      if (key.startsWith('nearby-lifers-shell-')) await caches.delete(key)
  })
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Save for offline', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Save for offline', exact: true })
    .click()
  await expect(page.getByText(/Offline download complete/)).toBeVisible()
  await page.getByText('Device storage', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Remove saved copy', exact: true })
    .click()
  await expect(page.getByText(/Saved copy and photos removed/)).toBeVisible()
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((key) =>
        key.startsWith('nearby-lifers-photos-'),
      ),
    ),
  ).toEqual([])
})
