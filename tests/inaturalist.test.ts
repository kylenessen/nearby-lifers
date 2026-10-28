import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  areaQuery,
  buildSnapshot,
  countPolygonObservations,
  polygonObservations,
  queryParams,
} from '../src/inaturalist.ts'
import { defaults } from '../src/search.ts'

const taxon = { id: 1, name: 'Species one', iconic_taxon_name: 'Aves' }
test('all grades are explicit and removing casual preserves Research Grade and Needs ID', () => {
  const all = queryParams({})
  assert.equal(all.get('quality_grade'), 'research,needs_id,casual')
  assert.equal(all.get('verifiable'), 'any')
  const filtered = queryParams({ quality_grade: ['research', 'needs_id'] })
  assert.equal(filtered.get('quality_grade'), 'research,needs_id')
})
test('polygon observation counts roll subspecies into species and separate quality', () => {
  const counts = countPolygonObservations(
    [
      { id: 1, taxon, quality_grade: 'casual' },
      {
        id: 2,
        taxon: { ...taxon, id: 3, min_species_taxon_id: 1 },
        quality_grade: 'needs_id',
      },
      { id: 3, taxon, quality_grade: 'research' },
    ],
    [{ taxon, count: 3 }],
  )
  assert.deepEqual(counts.get(1), { count: 3, nonCasual: 2 })
})
test('API life lists are global, all dated, all groups, and union every supplied user', async (t) => {
  const requests: URL[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const request = new URL(url)
    requests.push(request)
    const results = request.pathname.includes('/users/')
      ? [
          {
            id: request.pathname.endsWith('one') ? 10 : 20,
            login: request.pathname.split('/').pop(),
          },
        ]
      : [{ taxon, count: 3 }]
    return new Response(
      JSON.stringify({ total_results: results.length, results }),
    )
  })
  const search = defaults().search
  search.users = 'one,two'
  search.groups = ['birds']
  search.excludeUserCasual = true
  const result = await buildSnapshot(search, 'Test area')
  assert.equal(result.species[0].observedByUser, true)
  const observed = requests.find((url) => url.searchParams.has('user_id'))!
  assert.equal(observed.searchParams.get('user_id'), '10,20')
  assert.equal(observed.searchParams.get('quality_grade'), 'research,needs_id')
  for (const key of [
    'month',
    'lat',
    'lng',
    'radius',
    'iconic_taxa',
    'place_id',
  ])
    assert.equal(observed.searchParams.has(key), false)
  assert.equal(areaQuery(search).iconic_taxa?.join(','), 'Aves')
})
test('polygon queries exclude points outside the shape and refuse oversized incomplete searches', async (t) => {
  let big = false
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          total_results: big ? 10001 : 2,
          results: [
            {
              id: 1,
              taxon,
              quality_grade: 'needs_id',
              geojson: { coordinates: [0.2, 0.2] },
            },
            {
              id: 2,
              taxon,
              quality_grade: 'research',
              geojson: { coordinates: [1.8, 1.8] },
            },
          ],
        }),
      ),
  )
  const points = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 2 },
    { lat: 2, lng: 0 },
  ]
  assert.deepEqual(
    (await polygonObservations({}, points)).map((o) => o.id),
    [1],
  )
  big = true
  await assert.rejects(
    () => polygonObservations({}, points),
    /more than 10,000/,
  )
})
