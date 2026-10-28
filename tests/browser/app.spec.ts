import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaults, encodeSettings, PAPERS } from '../../src/search'

const names = [
  'American Avocet',
  'Black-crowned Night Heron',
  'Long-billed Dowitcher',
  'Red-winged Blackbird',
  'White-crowned Sparrow',
  'California Scrub-Jay',
  'Anna’s Hummingbird',
  'Great Blue Heron',
]
const species = Array.from({ length: 45 }, (_, i) => ({
  count: 100 - i,
  taxon: {
    id: i + 1,
    name: i % 3 ? 'Calidris melanotos' : 'Chroicocephalus philadelphia',
    preferred_common_name: names[i % names.length],
    iconic_taxon_name: i < 40 ? 'Aves' : 'Plantae',
    rank_level: 10,
    default_photo: {
      medium_url: 'https://example.test/photo.svg',
      attribution:
        '(c) A naturalist with a moderately long name, some rights reserved (CC BY-NC)',
    },
  },
}))
async function mockApi(page: Page) {
  const requests: URL[] = []
  await page.route('https://example.test/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#bfcec0"/><circle cx="150" cy="150" r="65" fill="#6a8165"/></svg>',
    }),
  )
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.abort(),
  )
  await page.route('https://api.inaturalist.org/v1/**', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    let results: unknown[] = []
    if (url.pathname.includes('/users/'))
      results = [{ id: 99, login: url.pathname.split('/').pop() }]
    else if (url.pathname.includes('/places/'))
      results = [
        {
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
          },
        },
      ]
    else if (url.pathname.endsWith('/observations'))
      results = [
        {
          id: 1,
          taxon: species[3].taxon,
          quality_grade: 'needs_id',
          geojson: { coordinates: [-120.839, 35.328] },
        },
      ]
    else if (url.searchParams.has('user_id'))
      results = species.slice(
        0,
        url.searchParams.get('quality_grade')?.includes('casual') ? 3 : 2,
      )
    else if (url.searchParams.get('expected_nearby'))
      results = species.slice(0, 44)
    else if (!url.searchParams.get('quality_grade')?.includes('casual'))
      results = species.slice(0, 43)
    else results = species
    await route.fulfill({ json: { total_results: results.length, results } })
  })
  return requests
}
async function load(page: Page) {
  await mockApi(page)
  await page.goto('/')
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
}

test('bookmarks restore all search inputs and presentation without local storage', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const requests = await mockApi(page)
  const settings = defaults(new Date(2026, 5, 1))
  settings.search.groups = ['birds']
  settings.search.excludeUserCasual = true
  settings.view = {
    ...settings.view,
    paper: 'a6',
    layout: 'list',
    density: 'compact',
    hideCasual: true,
  }
  await page.goto(`/?${encodeSettings(settings)}`)
  await expect(
    page.getByText('41 species shown', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Exclude users’ casual observations'),
  ).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Birds', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Plants', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(
    page.getByRole('button', { name: 'May', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Copy search link' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  )
  await page.reload()
  await expect(
    page.getByText('41 species shown', { exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0)
  const observed = requests.find((u) => u.searchParams.has('user_id'))!
  expect(observed.searchParams.get('quality_grade')).toBe('research,needs_id')
  expect(observed.searchParams.has('month')).toBe(false)
  expect(observed.searchParams.has('iconic_taxa')).toBe(false)
})

test('browser back and forward rebuild previous searches and pending settings cannot share stale results', async ({
  page,
}) => {
  await load(page)
  const original = page.url()
  await page.getByLabel('Username', { exact: true }).fill('another-user')
  await expect(
    page.getByRole('button', { name: 'Copy search link' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Find nearby lifers' }).click()
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('users')).toBe('another-user')
  await page.goBack()
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
    'kylenessen',
  )
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  expect(page.url()).toBe(original)
  await page.goForward()
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
    'another-user',
  )
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
})

test('polygon drawing supports undo, finish, edit, and URL restoration', async ({
  page,
}) => {
  await load(page)
  await page.getByRole('button', { name: 'Polygon', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Find nearby lifers' }),
  ).toBeDisabled()
  const map = page.locator('.map-preview')
  await map.click({ position: { x: 90, y: 80 } })
  await map.click({ position: { x: 230, y: 80 } })
  await map.click({ position: { x: 230, y: 210 } })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Finish polygon' }),
  ).toBeDisabled()
  await map.click({ position: { x: 100, y: 210 } })
  await page.getByRole('button', { name: 'Finish polygon' }).click()
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
  await page.getByRole('button', { name: 'Find nearby lifers' }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('area'))
    .toBe('polygon')
  const polygon = new URL(page.url()).searchParams.get('polygon')
  expect(polygon?.split(';')).toHaveLength(3)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('polygon')).toBe(polygon)
  await page.getByRole('button', { name: 'Edit polygon' }).click()
  await expect(page.locator('.map-vertex')).toHaveCount(3)
  await page.getByRole('button', { name: 'Cancel drawing' }).click()
})

test('mobile page uses natural scrolling without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await load(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  )
  expect(
    await page
      .locator('#root')
      .evaluate((el) => getComputedStyle(el).overflowY),
  ).not.toBe('auto')
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})

test('invalid polygon URL shows an error and makes no search request', async ({
  page,
}) => {
  const requests = await mockApi(page)
  await page.goto('/?area=polygon&polygon=0,0;1,1')
  await expect(page.getByRole('alert')).toContainText('at least three')
  expect(requests.length).toBe(0)
})

for (const layout of ['grid', 'list'] as const) {
  test(`${layout} prints every species once at all paper sizes and densities`, async ({
    page,
  }) => {
    await load(page)
    await page.getByRole('button', { name: 'Print options' }).click()
    await page
      .getByRole('button', {
        name: layout === 'grid' ? 'Photo grid' : 'Taxon checklist',
        exact: true,
      })
      .click()
    for (const paper of Object.keys(PAPERS))
      for (const density of ['comfortable', 'compact', 'large']) {
        await page
          .getByRole('combobox', { name: 'Paper size', exact: true })
          .selectOption(paper)
        await page
          .getByRole('combobox', { name: 'Density', exact: true })
          .selectOption(density)
        const output = page.locator('.sheet-stack')
        await expect(
          output.locator(layout === 'grid' ? '.print-card' : '.print-list-row'),
        ).toHaveCount(42)
        const issues = await output.evaluate((el, format) => {
          const errors: string[] = []
          for (const sheet of el.querySelectorAll<HTMLElement>(
            '.print-sheet',
          )) {
            if (sheet.scrollHeight > sheet.clientHeight + 1)
              errors.push('sheet overflow')
            const body = sheet
              .querySelector('.sheet-body')!
              .getBoundingClientRect()
            for (const item of sheet.querySelectorAll<HTMLElement>(
              format === 'grid' ? '.print-card' : '.print-list-row',
            )) {
              const box = item.getBoundingClientRect()
              if (
                box.bottom > body.bottom + 1 ||
                item.scrollHeight > item.clientHeight + 1
              )
                errors.push('item overflow')
              if (
                format === 'grid' &&
                item.querySelector('.print-photo')!.getBoundingClientRect()
                  .height < 10
              )
                errors.push('photo too small')
            }
          }
          return errors
        }, layout)
        expect(issues, `${paper} ${density} ${layout}`).toEqual([])
        if (density === 'comfortable') {
          const expectedPages = await output.locator('.print-sheet').count()
          const pdf = await page.pdf({
            path: `test-results/${paper}-${layout}.pdf`,
            preferCSSPageSize: true,
            printBackground: true,
          })
          const source = pdf.toString('latin1')
          expect(source.match(/\/Type \/Page\b/g)?.length).toBe(expectedPages)
          const box = source.match(
            /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/,
          )!
          const size = PAPERS[paper as keyof typeof PAPERS]
          expect(
            Math.abs(Number(box[1]) - (size.width * 72) / 25.4),
          ).toBeLessThan(1)
          expect(
            Math.abs(Number(box[2]) - (size.height * 72) / 25.4),
          ).toBeLessThan(1)
        }
      }
    await page
      .getByRole('combobox', { name: 'Paper size', exact: true })
      .selectOption('a6')
    await page
      .getByRole('combobox', { name: 'Density', exact: true })
      .selectOption('comfortable')
    await page
      .locator('.sheet-stack .print-sheet')
      .first()
      .screenshot({ path: `test-results/a6-${layout}.png` })
    const expectedPages = await page
      .locator('.sheet-stack .print-sheet')
      .count()
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({
      path: `test-results/a6-${layout}.pdf`,
      preferCSSPageSize: true,
      printBackground: true,
    })
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(
      expectedPages,
    )
  })
}

test('mobile bookmarks open directly to results with editable search settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto(`/?${encodeSettings(defaults())}`)
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeInViewport()
  await expect(
    page.getByRole('button', { name: 'Edit search', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Edit search', exact: true }).click()
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
    'kylenessen',
  )
  await expect(page.locator('.map-preview')).toBeVisible()
})
