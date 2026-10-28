import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeSettings,
  defaults,
  encodeSettings,
  insidePolygon,
  polygonError,
  searchKey,
} from '../src/search.ts'
import type { Area } from '../src/search.ts'

const triangle = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 2 },
  { lat: 2, lng: 0 },
]
test('every area and every view option round trips through a portable link', () => {
  const areas: Area[] = [
    { kind: 'circle', center: { lat: 0, lng: 0 } },
    {
      kind: 'rectangle',
      bounds: { sw: { lat: -1, lng: -2 }, ne: { lat: 3, lng: 4 } },
    },
    { kind: 'polygon', points: triangle },
    { kind: 'place', id: 123 },
  ]
  for (const area of areas) {
    const settings = defaults()
    Object.assign(settings.search, {
      area,
      users: 'one,two',
      months: [1, 12],
      groups: ['birds'],
      excludeUserCasual: true,
    })
    Object.assign(settings.view, {
      hideCasual: true,
      hideUnexpected: true,
      showObserved: true,
      layout: 'list',
      paper: 'a6',
      density: 'dense',
      sort: 'scientific',
      grouping: 'family',
      printMode: 'booklet',
      bookletTitle: 'Ducks & geese near Morro Bay',
      showPhotoCredits: true,
      bookletSheetLimit: 23,
    })
    assert.deepEqual(decodeSettings(encodeSettings(settings)), settings)
  }
})
test('old bookmarks default to forty sheets and malformed limits cannot disable warnings', () => {
  for (const query of [
    '',
    '?sheet_limit=0',
    '?sheet_limit=-1',
    '?sheet_limit=no',
    '?sheet_limit=1.5',
    '?sheet_limit=1001',
  ]) {
    const { view } = decodeSettings(query)
    assert.equal(view.bookletSheetLimit, 40)
    assert.equal(view.showPhotoCredits, false)
  }
  assert.equal(
    decodeSettings('?sheet_limit=1&credits=1').view.bookletSheetLimit,
    1,
  )
  assert.equal(
    decodeSettings('?sheet_limit=1&credits=1').view.showPhotoCredits,
    true,
  )
})
test('saved months stay fixed when a bookmark opens in a different season', () => {
  const winter = defaults(new Date(2026, 11, 15))
  assert.deepEqual(winter.search.months, [1, 11, 12])
  assert.deepEqual(
    decodeSettings(encodeSettings(winter), new Date(2027, 5, 15)).search.months,
    [1, 11, 12],
  )
})
test('invalid links cannot silently search a different location', () => {
  for (const query of [
    '?area=polygon&polygon=0,0;1,1',
    '?area=circle&lat=NaN&lng=0',
    '?area=rectangle&bounds=0,0,1,',
    '?area=place&place=-1',
    '?months=0,13',
    '?groups=invalid',
    '?v=2',
  ])
    assert.throws(() => decodeSettings(query))
})
test('canonical keys ignore ordering and username spacing', () => {
  const one = defaults(),
    two = defaults()
  two.search.months.reverse()
  two.search.groups.reverse()
  two.search.users = ' KYLENESSEN,kylenessen '
  assert.equal(searchKey(one.search), searchKey(two.search))
})
test('polygon inclusion handles concavity, edges, and bounding-box false positives', () => {
  assert.equal(insidePolygon({ lat: 1.5, lng: 1.5 }, triangle), false)
  assert.equal(insidePolygon({ lat: 0.5, lng: 0.5 }, triangle), true)
  assert.equal(insidePolygon({ lat: 1, lng: 1 }, triangle), true)
  assert.equal(insidePolygon({ lat: 0, lng: 0 }, triangle), true)
  const concave = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 3 },
    { lat: 1, lng: 1 },
    { lat: 3, lng: 0 },
  ]
  assert.equal(polygonError(concave), null)
  assert.equal(insidePolygon({ lat: 2, lng: 2 }, concave), false)
})
test('degenerate and crossing polygons are rejected', () => {
  assert.ok(
    polygonError([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ]),
  )
  assert.ok(
    polygonError([
      { lat: 0, lng: 0 },
      { lat: 3, lng: 2 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 0 },
    ]),
  )
  assert.equal(polygonError(triangle), null)
})
