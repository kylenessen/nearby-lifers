import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { defaults, encodeSettings, PAPERS } from '../../src/search'
import type { Paper, View } from '../../src/search'

const fontSizes = { dense: 6, compact: 8, comfortable: 10, large: 12 }
async function setPrintTextSize(page: Page, layout: string, density: string) {
  if (layout === 'grid')
    await page
      .getByLabel('Font size (pt)', { exact: true })
      .fill(String(fontSizes[density as keyof typeof fontSizes]))
  else
    await page
      .getByRole('combobox', { name: 'Density', exact: true })
      .selectOption(density)
}
function gridShape(paper: Paper, density: View['density']) {
  const shapes =
    paper === 'letter'
      ? { dense: [5, 6], compact: [4, 5], comfortable: [3, 4], large: [2, 3] }
      : paper === 'a6'
        ? { dense: [2, 3], compact: [2, 2], comfortable: [2, 2], large: [2, 2] }
        : {
            dense: [4, 4],
            compact: [3, 4],
            comfortable: [3, 3],
            large: [2, 3],
          }
  const [columns, rows] = shapes[density]
  return { columns, rows }
}

const names = [
  'Bufflehead',
  'Black-crowned Night Heron',
  'Long-billed Dowitcher',
  'Red-winged Blackbird',
  'White-crowned Sparrow',
  'California Scrub-Jay',
  'Anna’s Hummingbird',
  'Great Blue Heron',
]
const families = [
  'Anatidae',
  'Ardeidae',
  'Scolopacidae',
  'Icteridae',
  'Passerellidae',
  'Corvidae',
  'Trochilidae',
  'Ardeidae',
]
const orders = [
  'Anseriformes',
  'Pelecaniformes',
  'Charadriiformes',
  'Passeriformes',
  'Passeriformes',
  'Passeriformes',
  'Apodiformes',
  'Pelecaniformes',
]
const species = Array.from({ length: 45 }, (_, i) => ({
  count: 100 - i,
  taxon: {
    id: i + 1,
    name: i % 3 ? 'Calidris melanotos' : 'Chroicocephalus philadelphia',
    preferred_common_name: names[i % names.length],
    iconic_taxon_name: i < 40 ? 'Aves' : 'Plantae',
    rank_level: 10,
    ancestors: [
      {
        id: 1000 + orders.indexOf(orders[i % 8]),
        rank: 'order',
        name: orders[i % 8],
        preferred_common_name:
          orders[i % 8] === 'Passeriformes' ? 'Perching Birds' : orders[i % 8],
      },
      {
        id: 2000 + families.indexOf(families[i % 8]),
        rank: 'family',
        name: families[i % 8],
        preferred_common_name:
          families[i % 8] === 'Anatidae'
            ? 'Ducks, Geese, and Swans'
            : families[i % 8] === 'Ardeidae'
              ? 'Herons, Egrets, and Bitterns'
              : families[i % 8],
      },
    ],
    default_photo: {
      medium_url: `https://example.test/photo-${i % 3}.svg`,
      attribution:
        '(c) A naturalist with a moderately long name, some rights reserved (CC BY-NC)',
    },
  },
}))
async function mockApi(page: Page) {
  const requests: URL[] = []
  await page.route('https://example.test/**', (route) => {
    const [width, height] = route.request().url().includes('photo-1')
      ? [450, 300]
      : route.request().url().includes('photo-2')
        ? [200, 400]
        : [300, 300]
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#bfcec0"/><circle cx="${width / 2}" cy="${height / 2}" r="65" fill="#6a8165"/></svg>`,
    })
  })
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.abort(),
  )
  await page.route('https://api.inaturalist.org/v1/**', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    let results: unknown[] = []
    if (url.pathname.endsWith('/users/autocomplete'))
      results = [
        { id: 99, login: 'kylenessen', name: 'Kyle Nessen' },
        { id: 100, login: 'kyle-test', name: 'Kyle Test' },
      ]
    else if (url.pathname.includes('/users/'))
      results = [
        { id: 99, login: url.pathname.split('/').pop(), name: 'Kyle Nessen' },
      ]
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

test('username search supports keyboard and pointer selection without submitting the form', async ({
  page,
}) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  const username = page.getByRole('combobox', {
    name: 'Username',
    exact: true,
  })
  await username.fill('Kyle')
  await expect(
    page.getByRole('option', { name: 'kylenessen Kyle Nessen' }),
  ).toBeVisible()
  await username.press('ArrowDown')
  await username.press('ArrowDown')
  await username.press('Enter')
  await expect(username).toHaveValue('kyle-test')
  expect(new URL(page.url()).searchParams.get('users')).toBe('kylenessen')
  await username.fill('Kyle Nessen')
  await expect(
    page.getByRole('option', { name: 'kylenessen Kyle Nessen' }),
  ).toBeVisible()
  await page.getByRole('option', { name: 'kylenessen Kyle Nessen' }).click()
  await expect(username).toHaveValue('kylenessen')
  await expect(username).toHaveAttribute('aria-expanded', 'false')
  expect(
    requests.some(
      (url) =>
        url.pathname.endsWith('/users/autocomplete') &&
        url.searchParams.get('q') === 'Kyle Nessen',
    ),
  ).toBe(true)
})

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
      .getByLabel('Guide title', { exact: true })
      .fill('Morro Bay field guide')
    await page
      .getByRole('button', {
        name: layout === 'grid' ? 'Photo grid' : 'Taxon checklist',
        exact: true,
      })
      .click()
    for (const paper of Object.keys(PAPERS))
      for (const density of ['comfortable', 'compact', 'large', 'dense']) {
        await page
          .getByRole('combobox', { name: 'Paper size', exact: true })
          .selectOption(paper)
        await setPrintTextSize(page, layout, density)
        if (layout === 'grid') {
          const shape = gridShape(paper as Paper, density as View['density'])
          await page
            .getByLabel('Columns per page', { exact: true })
            .fill(String(shape.columns))
          await page
            .getByLabel('Rows per page (maximum)', { exact: true })
            .fill(String(shape.rows))
        }
        const output = page.locator('.sheet-stack')
        await expect(
          output.locator(layout === 'grid' ? '.print-card' : '.print-list-row'),
        ).toHaveCount(42)
        const issues = await output.evaluate((el, format) => {
          const errors: string[] = []
          const photoHeights: number[] = []
          for (const sheet of el.querySelectorAll<HTMLElement>(
            '.print-sheet',
          )) {
            if (sheet.querySelector('.sheet-header'))
              errors.push('large header remains')
            const footer = sheet.querySelector('.sheet-footer')!
            if (getComputedStyle(footer).fontSize !== '12px')
              errors.push('footer is not nine points')
            if (footer.children[0].textContent !== 'Morro Bay field guide')
              errors.push('footer title missing')
            if (!/^\d+$/.test(footer.children[1].textContent ?? ''))
              errors.push('footer shows more than the page number')
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
              if (format === 'grid') {
                photoHeights.push(
                  item.querySelector('.print-photo')!.getBoundingClientRect()
                    .height,
                )
                if (item.querySelector('.paper-checkbox, .print-card-group'))
                  errors.push('old photo labels remain')
                if (
                  getComputedStyle(item.querySelector('.print-photo img')!)
                    .objectFit !== 'cover'
                )
                  errors.push('photo does not crop to its frame')
              }
            }
          }
          if (
            photoHeights.length &&
            Math.max(...photoHeights) - Math.min(...photoHeights) > 1
          )
            errors.push('partial pages resize photos')
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
    await setPrintTextSize(page, layout, 'comfortable')
    if (layout === 'grid')
      await page
        .getByLabel('Rows per page (maximum)', { exact: true })
        .fill('2')
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

test('taxonomic grouping, all sort modes, and dense presentation survive a bookmark', async ({
  page,
}) => {
  await load(page)
  await page
    .getByRole('button', { name: 'Taxon checklist', exact: true })
    .click()
  await expect(
    page
      .locator('.taxon-checklist')
      .getByRole('heading', { name: /Ducks, Geese, and Swans/ }),
  ).toBeVisible()
  await expect(
    page
      .locator('.taxon-checklist')
      .getByRole('heading', { name: /Perching Birds/ }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Group by', exact: true })
    .selectOption('none')
  await page
    .getByRole('combobox', { name: /Sort (by|within groups)/, exact: true })
    .selectOption('common')
  const names = await page.locator('.taxon-checklist li a').allTextContents()
  expect(names).toEqual(
    [...names].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }),
    ),
  )
  await page
    .getByRole('combobox', { name: /Sort (by|within groups)/, exact: true })
    .selectOption('scientific')
  const scientific = await page
    .locator('.taxon-checklist li i')
    .allTextContents()
  expect(scientific).toEqual([...scientific].sort((a, b) => a.localeCompare(b)))
  await page
    .getByRole('combobox', { name: /Sort (by|within groups)/, exact: true })
    .selectOption('frequency')
  const counts = (
    await page.locator('.taxon-checklist .record-count').allTextContents()
  ).map(Number.parseFloat)
  expect(counts).toEqual([...counts].sort((a, b) => b - a))
  await page
    .getByRole('combobox', { name: /^(Density|Photo grid text size)$/ })
    .selectOption('dense')
  const denseHeight = await page
    .locator('.taxon-checklist')
    .evaluate((el) => el.getBoundingClientRect().height)
  await page
    .getByRole('combobox', { name: /^(Density|Photo grid text size)$/ })
    .selectOption('compact')
  expect(
    await page
      .locator('.taxon-checklist')
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThan(denseHeight)
  await page
    .getByRole('combobox', { name: /^(Density|Photo grid text size)$/ })
    .selectOption('dense')
  await page.reload()
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: /^(Density|Photo grid text size)$/ }),
  ).toHaveValue('dense')
  await expect(
    page.getByRole('combobox', { name: 'Group by', exact: true }),
  ).toHaveValue('none')
  await expect(
    page.getByRole('combobox', {
      name: /Sort (by|within groups)/,
      exact: true,
    }),
  ).toHaveValue('frequency')
})

for (const layout of ['grid', 'list'] as const) {
  test(`${layout} booklet prints landscape Letter with covers and every species in folding order`, async ({
    page,
  }) => {
    await load(page)
    await page
      .getByRole('button', {
        name: layout === 'list' ? 'Taxon checklist' : 'Photo grid',
        exact: true,
      })
      .click()
    await page.getByRole('button', { name: 'Print options' }).click()
    await page
      .getByRole('combobox', { name: 'Paper size', exact: true })
      .selectOption('a6')
    await setPrintTextSize(page, layout, 'dense')
    await page
      .getByRole('combobox', { name: 'Print as', exact: true })
      .selectOption('booklet')
    await expect(
      page.getByRole('combobox', { name: 'Paper size', exact: true }),
    ).toBeDisabled()
    await page
      .getByLabel('Cover title', { exact: true })
      .fill('Morro Bay birds & other discoveries')
    const stack = page.locator('.booklet-stack')
    await expect(
      stack.locator(layout === 'grid' ? '.print-card' : '.print-list-row'),
    ).toHaveCount(42)
    const sides = await stack.locator('.booklet-side').evaluateAll((elements) =>
      elements.map((side) =>
        Array.from(side.querySelectorAll<HTMLElement>('.booklet-slot')).map(
          (slot) => ({
            number: Number(slot.dataset.pageNumber),
            kind: slot.dataset.pageKind,
          }),
        ),
      ),
    )
    const total = sides.length * 2
    expect(total % 4).toBe(0)
    expect(sides[0]).toEqual([
      { number: total, kind: 'back-cover' },
      { number: 1, kind: 'cover' },
    ])
    for (let sheet = 0; sheet < sides.length / 2; sheet++) {
      expect(sides[sheet * 2].map((p) => p.number)).toEqual([
        total - 2 * sheet,
        1 + 2 * sheet,
      ])
      expect(sides[sheet * 2 + 1].map((p) => p.number)).toEqual([
        2 + 2 * sheet,
        total - 1 - 2 * sheet,
      ])
    }
    const overflow = await stack.evaluate((el) =>
      Array.from(el.querySelectorAll<HTMLElement>('.print-sheet')).some(
        (sheet) => sheet.scrollHeight > sheet.clientHeight + 1,
      ),
    )
    expect(overflow).toBe(false)
    await expect(
      stack.locator('[data-page-kind="content"] .sheet-header'),
    ).toHaveCount(0)
    for (const slot of await stack
      .locator('[data-page-kind="content"]')
      .all()) {
      await expect(slot.locator('.sheet-footer span').first()).toHaveText(
        'Morro Bay birds & other discoveries',
      )
      await expect(slot.locator('.sheet-footer span').last()).toHaveText(
        (await slot.getAttribute('data-page-number'))!,
      )
    }
    await expect(stack.locator('.booklet-cover h1')).toHaveText(
      'Morro Bay birds & other discoveries',
    )
    await expect(stack.locator('.booklet-owner')).toHaveText('@kylenessen’s')
    await expect(stack.locator('.booklet-date')).not.toContainText('Generated')
    await expect(stack.locator('.booklet-tool-name')).toHaveText(
      'Nearby Lifers for:',
    )
    expect(
      await stack.locator('.booklet-cover').evaluate((el) => {
        const owner = el.querySelector('.booklet-owner')!
        const tool = el.querySelector('.booklet-tool-name')!
        return {
          sameFont:
            getComputedStyle(owner).font === getComputedStyle(tool).font,
          ownerAbove:
            owner.getBoundingClientRect().bottom <
            tool.getBoundingClientRect().top,
        }
      }),
    ).toEqual({ sameFont: true, ownerAbove: true })
    const parameters = stack.locator('[data-page-number="2"]')
    await expect(parameters).toHaveAttribute('data-page-kind', 'parameters')
    await expect(parameters).toContainText('Search Filters')
    await expect(
      stack
        .locator('.booklet-parameters')
        .filter({ hasText: 'All dates and locations' }),
    ).toHaveCount(1)
    await expect(parameters).toContainText('Generated on')
    await expect(
      parameters.locator('.booklet-print-instructions'),
    ).toContainText('landscape')
    await expect(
      parameters.locator('.booklet-print-instructions'),
    ).toContainText('Print both sides and flip on the short edge')
    expect(
      await parameters.evaluate(
        (el) =>
          el
            .querySelector('.booklet-print-instructions')!
            .getBoundingClientRect().top >=
          el.querySelector('.booklet-parameters')!.getBoundingClientRect()
            .bottom,
      ),
    ).toBe(true)
    await expect(parameters.locator('.print-map-canvas svg path')).toHaveCount(
      1,
    )
    const contents = stack.locator('[data-page-kind="contents"]')
    await expect(contents).toHaveAttribute('data-page-kind', 'contents')
    const references = await contents
      .locator('.contents-entry')
      .evaluateAll((rows) =>
        rows.map((row) => ({
          key: (row as HTMLElement).dataset.group!,
          page: Number(row.querySelector('strong')!.textContent),
        })),
      )
    for (const reference of references) {
      const pages = await stack
        .locator(
          `[data-page-kind="content"]:has([data-group="${reference.key}"])`,
        )
        .evaluateAll((slots) =>
          slots.map((slot) => Number((slot as HTMLElement).dataset.pageNumber)),
        )
      expect(reference.page).toBe(Math.min(...pages))
    }
    const marks = await stack
      .locator('.booklet-side')
      .first()
      .locator('.staple-guide')
      .evaluateAll((guides) =>
        guides.map((guide) => {
          const rect = guide.querySelector('path')!.getBoundingClientRect()
          const side = guide.closest('.booklet-side')!.getBoundingClientRect()
          return {
            length: rect.height / 96,
            center: (rect.top + rect.height / 2 - side.top) / 96,
          }
        }),
      )
    await expect(
      stack.locator('.booklet-side').first().locator('.staple-guide circle'),
    ).toHaveCount(6)
    expect(marks).toHaveLength(3)
    for (let i = 0; i < 3; i++) {
      expect(marks[i].length).toBeCloseTo(0.5, 2)
      expect(marks[i].center).toBeCloseTo([1.5, 4.25, 7][i], 2)
    }
    if (layout === 'grid') {
      const gridPages = await stack
        .locator('[data-page-kind="content"]')
        .evaluateAll((slots) =>
          slots
            .map((slot) => ({
              page: Number((slot as HTMLElement).dataset.pageNumber),
              cards: Array.from(
                slot.querySelectorAll<HTMLElement>('.print-card'),
              ).map((card) => ({
                group: card.dataset.group,
                count: Number(
                  card
                    .querySelector('.print-records')!
                    .textContent!.split(' ')[0],
                ),
              })),
            }))
            .sort((a, b) => a.page - b.page),
        )
      const cards = gridPages.flatMap((p) => p.cards)
      const closedGroups = new Set<string>()
      for (let i = 1; i < cards.length; i++) {
        if (cards[i].group === cards[i - 1].group)
          expect(cards[i].count).toBeLessThanOrEqual(cards[i - 1].count)
        else {
          closedGroups.add(cards[i - 1].group!)
          expect(closedGroups.has(cards[i].group!)).toBe(false)
        }
      }
      const gridColumns = await stack
        .locator('.print-grid')
        .first()
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
        )
      expect(
        gridPages
          .slice(0, -1)
          .every(
            (p) => p.cards.length > 0 && p.cards.length % gridColumns === 0,
          ),
      ).toBe(true)
    }
    expect(new URL(page.url()).searchParams.get('print')).toBe('booklet')
    expect(new URL(page.url()).searchParams.get('title')).toBe(
      'Morro Bay birds & other discoveries',
    )
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.printed = 'yes'
      }
    })
    await page.getByRole('button', { name: 'Print or save PDF' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-printed', 'yes')
    await stack
      .locator('.booklet-side')
      .first()
      .screenshot({ path: `test-results/booklet-${layout}-cover.png` })
    await stack
      .locator('.booklet-side')
      .nth(1)
      .screenshot({ path: `test-results/booklet-${layout}-inside.png` })
    await page.emulateMedia({ media: 'print' })
    await expect(stack.locator('.staple-guide').first()).toBeVisible()
    await expect(stack.locator('[data-page-kind="back-cover"]')).toContainText(
      'Generated with the Nearby Lifers tool',
    )
    await expect(stack.locator('.booklet-qr')).toBeVisible()
    const pdf = (
      await page.pdf({
        path: `test-results/booklet-${layout}.pdf`,
        preferCSSPageSize: true,
        printBackground: true,
      })
    ).toString('latin1')
    expect(pdf.match(/\/Type \/Page\b/g)?.length).toBe(sides.length)
    const dimensions = pdf.match(
      /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/,
    )!
    expect(Math.abs(Number(dimensions[1]) - 792)).toBeLessThan(1)
    expect(Math.abs(Number(dimensions[2]) - 612)).toBeLessThan(1)
    await page.emulateMedia({ media: 'screen' })
    await page
      .getByRole('combobox', { name: 'Print as', exact: true })
      .selectOption('sheets')
    await expect(
      page.getByRole('combobox', { name: 'Paper size', exact: true }),
    ).toHaveValue('a6')
    await page
      .getByRole('combobox', { name: 'Print as', exact: true })
      .selectOption('booklet')
    await page.reload()
    await expect(
      page.getByText('42 species shown', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Print options' }).click()
    await expect(
      page.getByRole('combobox', { name: 'Print as', exact: true }),
    ).toHaveValue('booklet')
    await expect(page.getByLabel('Cover title', { exact: true })).toHaveValue(
      'Morro Bay birds & other discoveries',
    )
    await page
      .getByRole('combobox', { name: 'Group by', exact: true })
      .selectOption('none')
    await expect(stack.locator('[data-page-kind="contents"]')).toHaveCount(0)
    await expect(stack.locator('.page-group-header')).toHaveCount(0)
    const firstContent = await stack
      .locator('[data-content-index="0"]')
      .evaluate((el) =>
        Number((el.closest('.booklet-slot') as HTMLElement).dataset.pageNumber),
      )
    expect(firstContent).toBe(
      2 + (await stack.locator('[data-page-kind="parameters"]').count()),
    )
  })
}

test('booklet maps preserve the searched place, rectangle, and polygon', async ({
  page,
}) => {
  await mockApi(page)
  const areas = [
    { kind: 'place' as const, id: 12 },
    {
      kind: 'rectangle' as const,
      bounds: {
        sw: { lat: 35.32, lng: -120.84 },
        ne: { lat: 35.33, lng: -120.83 },
      },
    },
    {
      kind: 'polygon' as const,
      points: [
        { lat: 35.32, lng: -120.84 },
        { lat: 35.32, lng: -120.83 },
        { lat: 35.34, lng: -120.84 },
      ],
    },
  ]
  for (const area of areas) {
    const settings = defaults()
    settings.search.area = area
    settings.view.printMode = 'booklet'
    settings.view.layout = 'list'
    await page.goto(`/?${encodeSettings(settings)}`)
    await page
      .getByRole('button', { name: 'Print options', exact: true })
      .click()
    const parameters = page.locator('.booklet-stack .booklet-parameters-page')
    await expect(parameters.locator('.print-map-canvas svg path')).toHaveCount(
      1,
    )
    await expect(parameters).toHaveCount(1)
    await expect(
      parameters.locator('.booklet-search-qr, .booklet-search-access'),
    ).toHaveCount(0)
    await expect(parameters.locator('.booklet-page-title')).toHaveText(
      'Search Filters',
    )
    await expect(
      parameters.locator('.booklet-parameters').filter({ hasText: 'Area' }),
    ).toContainText(
      area.kind === 'place'
        ? 'iNaturalist place 12'
        : area.kind === 'polygon'
          ? 'Polygon with 3 corners'
          : 'Rectangle from',
    )
    expect(
      await parameters.evaluateAll((pages) =>
        pages.some((el) => el.scrollHeight > el.clientHeight + 1),
      ),
    ).toBe(false)
  }
})

test('long contents paginate without losing groups or shifting their references', async ({
  page,
}) => {
  await mockApi(page)
  const manyGroups = Array.from({ length: 60 }, (_, index) => ({
    ...species[index % species.length],
    taxon: {
      ...species[index % species.length].taxon,
      id: index + 100,
      iconic_taxon_name: 'Aves',
      ancestors: [
        {
          id: index + 3000,
          rank: 'family',
          name: `Family${index}`,
          preferred_common_name: `Group ${index} with a long descriptive taxonomic name for wrapping`,
        },
      ],
    },
  }))
  await page.route(
    'https://api.inaturalist.org/v1/observations/species_counts**',
    (route) => {
      const results = new URL(route.request().url()).searchParams.has('user_id')
        ? []
        : manyGroups
      return route.fulfill({
        json: { total_results: results.length, results },
      })
    },
  )
  const settings = defaults()
  settings.view.printMode = 'booklet'
  settings.view.grouping = 'family'
  settings.view.layout = 'list'
  await page.goto(`/?${encodeSettings(settings)}`)
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  const stack = page.locator('.booklet-stack')
  const contentsCount = await stack
    .locator('[data-page-kind="contents"]')
    .count()
  expect(contentsCount).toBeGreaterThan(1)
  await expect(stack.locator('.contents-entry')).toHaveCount(60)
  const entries = await stack.locator('.contents-entry').evaluateAll((rows) =>
    rows.map((row) => ({
      key: (row as HTMLElement).dataset.group!,
      page: Number(row.querySelector('strong')!.textContent),
    })),
  )
  for (const entry of entries) {
    const slots = await stack
      .locator(`[data-page-kind="content"]:has([data-group="${entry.key}"])`)
      .evaluateAll((elements) =>
        elements.map((el) => Number((el as HTMLElement).dataset.pageNumber)),
      )
    expect(entry.page).toBe(Math.min(...slots))
  }
  expect(
    await stack
      .locator('.booklet-contents')
      .evaluateAll((sheets) =>
        sheets.some((el) => el.scrollHeight > el.clientHeight + 1),
      ),
  ).toBe(false)
  await page
    .getByRole('combobox', { name: /^(Density|Photo grid text size)$/ })
    .selectOption('dense')
  expect(
    await stack.locator('[data-page-kind="contents"]').count(),
  ).toBeLessThan(contentsCount)
  await expect(stack.locator('.contents-entry')).toHaveCount(60)
  const denseEntries = await stack
    .locator('.contents-entry')
    .evaluateAll((rows) =>
      rows.map((row) => ({
        key: (row as HTMLElement).dataset.group!,
        page: Number(row.querySelector('strong')!.textContent),
      })),
    )
  for (const entry of denseEntries) {
    const slots = await stack
      .locator(`[data-page-kind="content"]:has([data-group="${entry.key}"])`)
      .evaluateAll((elements) =>
        elements.map((el) => Number((el as HTMLElement).dataset.pageNumber)),
      )
    expect(entry.page).toBe(Math.min(...slots))
  }
  await page.getByRole('button', { name: 'Photo grid', exact: true }).click()
  const wrappedHeaders = await stack
    .locator('[data-page-kind="content"] .page-group-header')
    .evaluateAll((headers) =>
      headers.map((header) => ({
        height: header.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(header).lineHeight),
        overlaps:
          header.getBoundingClientRect().bottom >
          header
            .parentElement!.querySelector('.print-grid')!
            .getBoundingClientRect().top,
      })),
    )
  expect(wrappedHeaders.length).toBeGreaterThan(1)
  expect(wrappedHeaders.every((header) => header.height > header.line)).toBe(
    true,
  )
  expect(wrappedHeaders.some((header) => header.overlaps)).toBe(false)
  const photoHeights = await stack
    .locator('.print-photo')
    .evaluateAll((photos) =>
      photos.map((photo) => photo.getBoundingClientRect().height),
    )
  expect(Math.max(...photoHeights) - Math.min(...photoHeights)).toBeLessThan(1)
})

test('booklet photo controls preserve photo proportions and physical-sheet warnings', async ({
  page,
}) => {
  const requests = await mockApi(page)
  const settings = defaults()
  settings.view.printMode = 'booklet'
  settings.view.density = 'dense'
  await page.goto(`/?${encodeSettings(settings)}`)
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  const stack = page.locator('.booklet-stack')
  const credits = page.getByRole('checkbox', {
    name: 'Show photo credits',
    exact: true,
  })
  const limit = page.getByRole('spinbutton', {
    name: 'Warn above this many sheets',
  })
  await expect(credits).not.toBeChecked()
  await expect(limit).toHaveValue('40')
  await expect(stack.locator('.print-credit')).toHaveCount(0)
  const searchRequests = requests.filter((r) =>
    r.pathname.includes('/observations'),
  ).length
  for (const density of ['dense', 'compact', 'comfortable', 'large']) {
    await setPrintTextSize(page, 'grid', density)
    const shape = gridShape('half', density as View['density'])
    await page
      .getByLabel('Columns per page', { exact: true })
      .fill(String(shape.columns))
    await page
      .getByLabel('Rows per page (maximum)', { exact: true })
      .fill(String(shape.rows))
    for (const showCredits of [false, true]) {
      await page
        .getByLabel('Rows per page (maximum)', { exact: true })
        .fill(String(shape.rows - (showCredits ? 1 : 0)))
      await credits.setChecked(showCredits)
      await expect(stack.locator('.print-credit')).toHaveCount(
        showCredits ? 42 : 0,
      )
      const errors = await stack.evaluate((root) => {
        const errors: string[] = []
        for (const card of root.querySelectorAll<HTMLElement>('.print-card')) {
          const photo = card
            .querySelector('.print-photo')!
            .getBoundingClientRect()
          if (
            getComputedStyle(card.querySelector('.print-photo img')!)
              .objectFit !== 'cover'
          )
            errors.push('photo does not crop to its frame')
          const body = card.closest('.sheet-body')!.getBoundingClientRect()
          if (
            card.getBoundingClientRect().bottom > body.bottom + 1 ||
            card.scrollHeight > card.clientHeight + 1
          )
            errors.push('overflow')
          const records = card
            .querySelector('.print-records')!
            .getBoundingClientRect()
          if (
            records.top < photo.top ||
            records.bottom > photo.bottom ||
            records.right > photo.right ||
            records.left < photo.left
          )
            errors.push('record badge is outside the photo')
          if (
            Math.abs(photo.right - records.right - 96 / 25.4) > 1 ||
            Math.abs(photo.bottom - records.bottom - 96 / 25.4) > 1
          )
            errors.push('record badge is not at the bottom right')
          const badgeStyle = getComputedStyle(
            card.querySelector('.print-records')!,
          )
          if (
            badgeStyle.backgroundColor !== 'rgb(255, 255, 255)' ||
            badgeStyle.opacity !== '1'
          )
            errors.push('record badge background is not opaque white')
          if (photo.height < (8 * 96) / 25.4 - 1) errors.push('photo too short')
          if (card.querySelector('.print-card-group'))
            errors.push('card still repeats its group')
        }
        return errors
      })
      expect(errors, `${density}, credits ${showCredits}`).toEqual([])
    }
  }
  const sheets = (await stack.locator('.booklet-side').count()) / 2
  await limit.fill(String(sheets))
  await expect(page.locator('.sheet-warning')).toHaveCount(0)
  await limit.fill(String(sheets - 1))
  await expect(page.locator('.sheet-warning')).toContainText(
    `uses ${sheets} physical sheets`,
  )
  await expect(
    page.getByRole('button', { name: 'Print or save PDF' }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Taxon checklist', exact: true })
    .click()
  const listSheets = (await stack.locator('.booklet-side').count()) / 2
  expect(listSheets).toBeLessThan(sheets)
  await expect(page.locator('.sheet-warning')).toHaveCount(0)
  await page.getByRole('button', { name: 'Photo grid', exact: true }).click()
  await expect(page.locator('.sheet-warning')).toContainText(
    `uses ${sheets} physical sheets`,
  )
  expect(
    requests.filter((r) => r.pathname.includes('/observations')).length,
  ).toBe(searchRequests)
  expect(new URL(page.url()).searchParams.get('credits')).toBe('1')
  expect(new URL(page.url()).searchParams.get('sheet_limit')).toBe(
    String(sheets - 1),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  await expect(credits).toBeChecked()
  await expect(limit).toHaveValue(String(sheets - 1))
  await expect(page.locator('.sheet-warning')).toContainText(
    `uses ${sheets} physical sheets`,
  )
  await credits.uncheck()
  await page.getByLabel('Font size (pt)', { exact: true }).fill('6')
  await stack
    .locator('[data-content-index="0"]')
    .screenshot({ path: 'test-results/booklet-fitted-photos.png' })
})

test('booklet photo gallery crops to fill the page, preserves readable text, and mirrors the spine margin', async ({
  page,
}) => {
  const requests = await mockApi(page)
  const settings = defaults()
  settings.view.printMode = 'booklet'
  settings.view.density = 'comfortable'
  settings.view.bookletTitle = 'Morro Bay field guide'
  await page.goto(`/?${encodeSettings(settings)}`)
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  const columns = page.getByLabel('Columns per page', { exact: true })
  const rows = page.getByLabel('Rows per page (maximum)', { exact: true })
  const textSize = page.getByLabel('Font size (pt)', { exact: true })
  const stack = page.locator('.booklet-stack')
  await expect(stack.locator('.print-card')).toHaveCount(42)
  await expect(columns).toHaveValue('3')
  await expect(rows).toHaveValue('4')
  await expect(textSize).toHaveValue('9')
  await expect(
    page.getByRole('combobox', { name: 'Photo grid text size', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.grid-dimensions')).toContainText('Font size (pt)')
  await expect(stack.locator('.print-card .paper-checkbox')).toHaveCount(0)
  const supportingSizes = await stack.evaluate((root) => ({
    filters: getComputedStyle(root.querySelector('.booklet-parameters')!)
      .fontSize,
    footer: getComputedStyle(root.querySelector('.sheet-footer')!).fontSize,
    contents: getComputedStyle(root.querySelector('.contents-entry')!).fontSize,
  }))
  expect(supportingSizes).toEqual({
    filters: '12px',
    footer: '12px',
    contents: '16px',
  })
  const searchRequests = requests.filter((r) =>
    r.pathname.includes('/observations'),
  ).length
  for (const [cols, rowCount, size] of [
    [3, 4, '9'],
    [2, 3, '10'],
    [4, 4, '8'],
    [1, 2, '14'],
  ] as const) {
    await columns.fill(String(cols))
    await rows.fill(String(rowCount))
    await textSize.fill(size)
    await expect(columns).toHaveValue(String(cols))
    await expect(rows).toHaveValue(String(rowCount))
    const textStyles = await stack
      .locator('.print-card')
      .evaluateAll((cards) =>
        cards.flatMap((card) =>
          Array.from(
            card.querySelectorAll(
              '.print-names strong, .print-names i, .print-records',
            ),
          ).map((el) => getComputedStyle(el).fontSize),
        ),
      )
    expect([...new Set(textStyles)].map(parseFloat)).toEqual(
      [(Number(size) * 96) / 72].map((value) => Number(value.toFixed(4))),
    )
    const photos = await stack.locator('.print-photo').evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect()
        return [r.width, r.height]
      }),
    )
    expect(photos.every(([width, height]) => width > 0 && height > 0)).toBe(
      true,
    )
    expect(photos.some(([width, height]) => Math.abs(width - height) > 2)).toBe(
      true,
    )
    expect(
      Math.max(...photos.map(([width]) => width)) -
        Math.min(...photos.map(([width]) => width)),
    ).toBeLessThan(1)
    expect(
      Math.max(...photos.map(([, height]) => height)) -
        Math.min(...photos.map(([, height]) => height)),
    ).toBeLessThan(1)
    await expect(stack.locator('.print-card-group')).toHaveCount(0)
    const headerIssues = await stack.evaluate((root) => {
      const labels = new Map(
        Array.from(root.querySelectorAll<HTMLElement>('.contents-entry')).map(
          (row) => [row.dataset.group, row.querySelector('span')!.textContent],
        ),
      )
      return Array.from(
        root.querySelectorAll<HTMLElement>('[data-content-index]'),
      ).flatMap((sheet) => {
        const cards = Array.from(
          sheet.querySelectorAll<HTMLElement>('.print-card'),
        )
        const first = labels.get(cards[0].dataset.group)
        const last = labels.get(cards[cards.length - 1].dataset.group)
        const expected = first === last ? first : first + ' through ' + last
        const header = sheet.querySelector('.page-group-header')!
        const errors = []
        if (header.textContent !== expected) errors.push('wrong group range')
        if (
          getComputedStyle(header).fontSize !==
          getComputedStyle(sheet.querySelector('.sheet-footer')!).fontSize
        )
          errors.push('header font differs from footer')
        if (
          header.getBoundingClientRect().bottom >
          sheet.querySelector('.print-grid')!.getBoundingClientRect().top
        )
          errors.push('header overlaps photos')
        return errors
      })
    })
    expect(headerIssues).toEqual([])
    const galleryIssues = await stack
      .locator('.print-card')
      .evaluateAll((cards) =>
        cards.flatMap((card) => {
          const errors = []
          const frame = card.getBoundingClientRect()
          const photo = card
            .querySelector('.print-photo')!
            .getBoundingClientRect()
          const names = card
            .querySelector('.print-names')!
            .getBoundingClientRect()
          if (Math.abs(photo.width - frame.width) > 1)
            errors.push('photo does not fill the card')
          const peer = Array.from(card.parentElement!.children).find(
            (item) =>
              Math.abs(item.getBoundingClientRect().top - frame.top) < 1,
          )!
          const peerPhoto = peer
            .querySelector('.print-photo')!
            .getBoundingClientRect()
          if (
            Math.abs(photo.top - peerPhoto.top) > 1 ||
            Math.abs(photo.bottom - peerPhoto.bottom) > 1
          )
            errors.push('photos do not align within their row')
          if (Math.abs(photo.top - frame.top) > 1)
            errors.push('photo still reserves a group bar')
          if (names.top < photo.bottom || names.top - photo.bottom > 6)
            errors.push('names are not just below the photo')
          if (parseFloat(getComputedStyle(card).borderTopWidth) > 0)
            errors.push('card still has a border')
          if (parseFloat(getComputedStyle(card.parentElement!).columnGap) <= 0)
            errors.push('cards have no white spacing')
          return errors
        }),
      )
    expect(galleryIssues).toEqual([])
    await expect(page.locator('.grid-warning')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Print or save PDF' }),
    ).toBeEnabled()
    const pages = await stack
      .locator('[data-content-index]')
      .evaluateAll((sheets) =>
        sheets
          .map((sheet) => {
            const body = sheet
              .querySelector('.print-grid')!
              .getBoundingClientRect()
            const cards = Array.from(
              sheet.querySelectorAll<HTMLElement>('.print-card'),
            )
            const slot = sheet.closest('.booklet-slot')!
            const pageBox = sheet.getBoundingClientRect()
            const leftPage = slot === slot.parentElement!.firstElementChild
            return {
              index: Number((sheet as HTMLElement).dataset.contentIndex),
              ids: cards.map((c) => Number(c.dataset.speciesId)),
              bottomGap:
                body.bottom -
                cards[cards.length - 1].getBoundingClientRect().bottom,
              innerMargin: leftPage
                ? pageBox.right - body.right
                : body.left - pageBox.left,
              outerMargin: leftPage
                ? body.left - pageBox.left
                : pageBox.right - body.right,
              heights: cards.map((c) => c.getBoundingClientRect().height),
              overflow: cards.some((c) => c.scrollHeight > c.clientHeight + 1),
              fits: cards.every(
                (c) =>
                  getComputedStyle(c.querySelector('img')!).objectFit ===
                  'cover',
              ),
            }
          })
          .sort((a, b) => a.index - b.index),
      )
    expect(new Set(pages.flatMap((p) => p.ids)).size).toBe(42)
    for (const p of pages.slice(0, -1)) {
      expect(p.ids.length).toBeGreaterThan(0)
      expect(p.ids.length).toBe(cols * rowCount)
      expect(p.ids.length % cols).toBe(0)
      expect(Math.abs(p.bottomGap)).toBeLessThan(1)
    }
    for (const p of pages) {
      const emptyRows = rowCount - Math.ceil(p.ids.length / cols)
      expect(p.bottomGap).toBeCloseTo(
        emptyRows * (p.heights[0] + (3 * 96) / 25.4),
        0,
      )
      expect(Math.abs(p.heights[0] - pages[0].heights[0])).toBeLessThan(1)
      expect(p.overflow).toBe(false)
      expect(p.fits).toBe(true)
      expect(p.heights.every((height) => height > 0)).toBe(true)
      expect((p.innerMargin * 25.4) / 96).toBeCloseTo(14, 1)
      expect((p.outerMargin * 25.4) / 96).toBeCloseTo(9, 1)
    }
  }
  await columns.fill('8')
  await rows.fill('8')
  await textSize.fill('24')
  await expect(page.locator('.grid-warning')).toContainText('need more room')
  await expect(
    page.getByRole('button', { name: 'Print or save PDF' }),
  ).toBeDisabled()
  await columns.fill('4')
  await rows.fill('4')
  await textSize.fill('8')
  await expect(page.locator('.grid-warning')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Print or save PDF' }),
  ).toBeEnabled()
  expect(
    requests.filter((r) => r.pathname.includes('/observations')).length,
  ).toBe(searchRequests)
  expect(new URL(page.url()).searchParams.get('columns')).toBe('4')
  expect(new URL(page.url()).searchParams.get('rows')).toBe('4')
  expect(new URL(page.url()).searchParams.get('font_size')).toBe('8')
  await page.reload()
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  await expect(textSize).toHaveValue('8')
  await expect(columns).toHaveValue('4')
  await expect(rows).toHaveValue('4')
  await expect(stack.locator('.print-card')).toHaveCount(42)
  await stack
    .locator('[data-content-index="0"]')
    .screenshot({ path: 'test-results/booklet-photo-gallery.png' })
  await stack
    .locator('.booklet-parameters-page')
    .screenshot({ path: 'test-results/booklet-search-filters.png' })
  const sides = await stack.locator('.booklet-side').count()
  await page.emulateMedia({ media: 'print' })
  const pdf = await page.pdf({
    path: 'test-results/booklet-photo-gallery.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  })
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(sides)
})

test('detailed polygon filters stay on one page with all settings at nine points', async ({
  page,
}) => {
  await mockApi(page)
  const settings = defaults()
  settings.search.area = {
    kind: 'polygon',
    points: Array.from({ length: 100 }, (_, i) => ({
      lat: 35.327632 + 0.1 * Math.sin((i * Math.PI * 2) / 100),
      lng: -120.839097 + 0.1 * Math.cos((i * Math.PI * 2) / 100),
    })),
  }
  settings.view.printMode = 'booklet'
  const query = encodeSettings(settings)
  await page.goto(`/?${query}`)
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  const parameters = page.locator('.booklet-stack .booklet-parameters-page')
  await expect(parameters.first()).toContainText('Search Filters')
  await expect(parameters.locator('.booklet-search-qr')).toHaveCount(0)
  await expect(parameters).toHaveCount(1)
  await expect(parameters.locator('.booklet-parameters dt')).toHaveCount(11)
  expect(
    await parameters
      .locator('.booklet-parameters')
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('12px')
  expect(
    await parameters.evaluate((el) => el.scrollHeight > el.clientHeight + 1),
  ).toBe(false)
  expect(
    await parameters.evaluate(
      (el) =>
        el.querySelector('.booklet-parameters')!.getBoundingClientRect()
          .bottom >
        el.querySelector('.sheet-footer')!.getBoundingClientRect().top,
    ),
  ).toBe(false)
  await expect(parameters.locator('.booklet-search-access a')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Print or save PDF' }),
  ).toBeEnabled()
})

async function mockExternalSources(page: Page, fail = false) {
  await mockApi(page)
  const requests: URL[] = []
  const taxa = [
    {
      ...species[0].taxon,
      id: 80,
      name: 'Corvus brachyrhynchos',
      preferred_common_name: 'American Crow',
    },
    {
      ...species[1].taxon,
      id: 81,
      name: 'Bucephala albeola',
      preferred_common_name: 'Bufflehead',
    },
    {
      ...species[2].taxon,
      id: 82,
      name: 'Anas platyrhynchos',
      preferred_common_name: 'Mallard',
    },
  ]
  await page.route(
    'https://api.inaturalist.org/v1/observations/species_counts**',
    (route) => {
      const u = new URL(route.request().url())
      const results = u.searchParams.has('user_id')
        ? [{ count: 1, taxon: taxa[0] }]
        : [{ count: 20, taxon: taxa[1] }]
      return route.fulfill({
        json: { total_results: results.length, results },
      })
    },
  )
  await page.route('https://api.inaturalist.org/v1/taxa**', (route) => {
    const u = new URL(route.request().url())
    const results = taxa.filter((t) => t.name === u.searchParams.get('q'))
    return route.fulfill({ json: { total_results: results.length, results } })
  })
  let attempted = false
  await page.route('https://api.gbif.org/v1/**', (route) => {
    const u = new URL(route.request().url())
    requests.push(u)
    if (u.pathname.endsWith('/species/match'))
      return route.fulfill({ json: { usageKey: 212, matchType: 'EXACT' } })
    if (u.pathname.endsWith('/occurrence/search')) {
      if (fail) return route.fulfill({ status: 400, body: 'Unavailable' })
      if (!attempted) {
        attempted = true
        return route.fulfill({ status: 503, body: 'Busy' })
      }
      return route.fulfill({
        json: {
          count: 185,
          facets: [
            {
              field: 'SPECIES_KEY',
              counts:
                u.searchParams.get('facetOffset') === '0'
                  ? [
                      { name: '101', count: 100 },
                      { name: '102', count: 50 },
                      { name: '103', count: 30 },
                      { name: '104', count: 5 },
                    ]
                  : [],
            },
          ],
        },
      })
    }
    const key = Number(u.pathname.split('/').pop())
    return route.fulfill({
      json: {
        key,
        canonicalName: taxa[key - 101]?.name ?? 'Unmatched bird',
        rank: 'SPECIES',
        class: 'Aves',
      },
    })
  })
  return requests
}

test('GBIF sources restore from URLs, retry, preserve photos and life lists, and print without duplicate totals', async ({
  page,
}) => {
  const requests = await mockExternalSources(page)
  const settings = defaults()
  settings.search.source = 'ebird'
  settings.search.groups = ['birds']
  settings.view.hideCasual = true
  settings.view.hideUnexpected = true
  settings.view.printMode = 'booklet'
  await page.goto(`/?${encodeSettings(settings)}`)
  await expect(page.getByLabel('Nearby record sources')).toHaveValue('ebird')
  await expect(page.locator('.species-card')).toHaveCount(2)
  await expect(
    page.locator('.species-card').filter({ hasText: 'American Crow' }),
  ).toHaveCount(0)
  const duck = page.locator('.species-card').filter({ hasText: 'Bufflehead' })
  await expect(duck.locator('.count-pill')).toHaveText('50 eBird records')
  await duck.getByText('Record sources', { exact: true }).click()
  await expect(duck).toContainText('20 iNaturalist records. 50 eBird records.')
  await expect(duck.locator('img')).toHaveAttribute('src', /example.test/)
  await expect(
    page.getByText('1 GBIF taxa need review and are excluded from the guide'),
  ).toBeVisible()
  await expect(page.locator('.source-summary')).toContainText(
    'larger source count',
  )
  const queries = requests.filter((u) =>
    u.pathname.endsWith('/occurrence/search'),
  )
  expect(queries.length).toBe(3)
  expect(
    queries.every(
      (u) =>
        u.searchParams.get('datasetKey') ===
        '4fa7b334-ce0d-4e88-aaae-2e0c138d049e',
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Print options', exact: true }).click()
  const filters = page.locator('.booklet-stack .booklet-parameters-page')
  await expect(filters).toContainText('iNaturalist + eBird via GBIF')
  await expect(filters).toContainText('Larger source count shown')
  expect(
    await filters.evaluate((el) => el.scrollHeight > el.clientHeight + 1),
  ).toBe(false)
  expect(
    await filters.evaluate(
      (el) =>
        el.querySelector('.booklet-print-instructions')!.getBoundingClientRect()
          .bottom >
        el.querySelector('.sheet-footer')!.getBoundingClientRect().top,
    ),
  ).toBe(false)
  await expect(page.locator('.booklet-stack .print-card')).toHaveCount(2)
  await filters.screenshot({ path: 'test-results/gbif-search-filters.png' })
  const before = requests.length
  await page.getByLabel('Nearby record sources').selectOption('inaturalist')
  await page
    .getByRole('button', { name: 'Find nearby lifers', exact: true })
    .click()
  await expect(page.locator('.species-card')).toHaveCount(1)
  expect(new URL(page.url()).searchParams.get('source')).toBe('inaturalist')
  expect(requests.length).toBe(before)
  await page.goBack()
  await expect(page.locator('.species-card')).toHaveCount(2)
  await expect(page.getByLabel('Nearby record sources')).toHaveValue('ebird')
  expect(requests.length).toBe(before)
  await page.getByLabel('Nearby record sources').selectOption('gbif')
  await page
    .getByRole('button', { name: 'Find nearby lifers', exact: true })
    .click()
  await expect(page.locator('.count-pill').first()).toContainText(
    'GBIF records',
  )
  expect(
    requests
      .slice(before)
      .filter((u) => u.pathname.endsWith('/occurrence/search'))
      .every((u) => !u.searchParams.has('datasetKey')),
  ).toBe(true)
  expect(new URL(page.url()).searchParams.get('source')).toBe('gbif')
})

test('a failed selected GBIF source never silently becomes an iNaturalist-only guide', async ({
  page,
}) => {
  const requests = await mockExternalSources(page, true)
  const settings = defaults()
  settings.search.source = 'gbif'
  settings.search.groups = ['birds']
  await page.goto(`/?${encodeSettings(settings)}`)
  await expect(page.getByRole('alert')).toContainText('GBIF could not finish')
  await expect(page.locator('.species-card')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Print options', exact: true }),
  ).toBeDisabled()
  expect(
    requests.filter((u) => u.pathname.endsWith('/occurrence/search')).length,
  ).toBe(1)
})

test('saved results survive reloads, new tabs and old collection dates without API requests', async ({
  page,
  context,
}) => {
  const requests: URL[] = []
  page.on('request', (request) => {
    if (request.url().includes('api.inaturalist.org'))
      requests.push(new URL(request.url()))
  })
  const external = await mockExternalSources(page)
  const settings = defaults()
  settings.search.source = 'ebird'
  settings.search.groups = ['birds']
  settings.search.area = { kind: 'place', id: 12 }
  await page.goto(`/?${encodeSettings(settings)}`)
  await expect(
    page.getByText('Saved on this device until you choose Refresh.', {
      exact: false,
    }),
  ).toBeVisible()
  const count = requests.length
  const externalCount = external.length
  // Age alone must never trigger a rebuild.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('nearby-lifers-results', 1)
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise<void>((resolve) => {
      const tx = db.transaction('searches', 'readwrite')
      const store = tx.objectStore('searches')
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const entry = cursor.value
          entry.snapshot.builtAt = '2020-01-02T12:00:00Z'
          cursor.update(entry)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
    })
    db.close()
  })
  await page.reload()
  await expect(page.locator('.saved-results time')).toHaveAttribute(
    'datetime',
    '2020-01-02T12:00:00Z',
  )
  expect(requests.length).toBe(count)
  expect(external.length).toBe(externalCount)
  const tab = await context.newPage()
  const tabRequests: URL[] = []
  tab.on('request', (request) => {
    if (request.url().includes('api.inaturalist.org'))
      tabRequests.push(new URL(request.url()))
  })
  const tabExternal = await mockExternalSources(tab)
  await tab.goto(page.url())
  await expect(tab.locator('.saved-results time')).toHaveAttribute(
    'datetime',
    '2020-01-02T12:00:00Z',
  )
  expect(tabRequests).toHaveLength(0)
  expect(tabExternal).toHaveLength(0)
  // Refresh must bypass the existing in-memory GBIF count cache as well.
  await tab
    .getByRole('button', { name: 'Refresh results', exact: true })
    .click()
  await expect(tab.locator('.saved-results time')).not.toHaveAttribute(
    'datetime',
    '2020-01-02T12:00:00Z',
  )
  await expect(
    tab.getByRole('button', { name: 'Refresh results', exact: true }),
  ).toBeEnabled()
  expect(tabRequests.some((url) => url.searchParams.has('user_id'))).toBe(true)
  expect(
    tabExternal.some((url) => url.pathname.endsWith('/occurrence/search')),
  ).toBe(true)
  const firstRefresh = tabExternal.filter((url) =>
    url.pathname.endsWith('/occurrence/search'),
  ).length
  await tab
    .getByRole('button', { name: 'Refresh results', exact: true })
    .click()
  await expect(
    tab.getByRole('button', { name: 'Refresh results', exact: true }),
  ).toBeEnabled()
  await expect
    .poll(
      () =>
        tabExternal.filter((url) => url.pathname.endsWith('/occurrence/search'))
          .length,
    )
    .toBeGreaterThan(firstRefresh)
})

test('failed and canceled refreshes preserve the completed search on disk', async ({
  page,
}) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await expect(
    page.getByText('Saved on this device until you choose Refresh.', {
      exact: false,
    }),
  ).toBeVisible()
  const collected = await page
    .locator('.saved-results time')
    .getAttribute('datetime')
  await page.route(
    'https://api.inaturalist.org/v1/observations/species_counts**',
    (route) => route.fulfill({ status: 400, json: { error: 'test failure' } }),
  )
  await page
    .getByRole('button', { name: 'Refresh results', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Your previous results have been kept.',
  )
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.saved-results time')).toHaveAttribute(
    'datetime',
    collected!,
  )
  await page.reload()
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.route(
    'https://api.inaturalist.org/v1/observations/species_counts**',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route
        .fulfill({ json: { total_results: 0, results: [] } })
        .catch(() => {})
    },
  )
  await page
    .getByRole('button', { name: 'Refresh results', exact: true })
    .click()
  await page
    .locator('.loading')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page.reload()
  await expect(page.locator('.saved-results time')).toHaveAttribute(
    'datetime',
    collected!,
  )
  await expect(
    page.getByText('42 species shown', { exact: true }),
  ).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
})

test('removing saved results rebuilds on the next visit and unavailable storage stays usable', async ({
  page,
  context,
}) => {
  const requests = await mockApi(page)
  await page.goto('/')
  await expect(
    page.getByText('Saved on this device until you choose Refresh.', {
      exact: false,
    }),
  ).toBeVisible()
  await page.getByText('Device storage', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Remove saved copy', exact: true })
    .click()
  await expect(page.getByText(/Saved copy and photos removed/)).toBeVisible()
  const count = requests.length
  await page.reload()
  await expect(
    page.getByText('Saved on this device until you choose Refresh.', {
      exact: false,
    }),
  ).toBeVisible()
  expect(requests.length).toBeGreaterThan(count)
  await page.getByText('Device storage', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Clear all saved searches', exact: true })
    .click()
  await expect(
    page.getByText(/All saved searches and photos removed/),
  ).toBeVisible()
  const tab = await context.newPage()
  await tab.addInitScript(() =>
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('Storage unavailable', 'SecurityError')
      },
    }),
  )
  await mockApi(tab)
  await tab.goto(page.url())
  await expect(tab.getByText('42 species shown', { exact: true })).toBeVisible()
  await expect(
    tab.getByText(
      /Results are available, but this browser could not save them/,
    ),
  ).toBeVisible()
  await expect(
    tab.getByRole('button', { name: 'Print options', exact: true }),
  ).toBeEnabled()
})
