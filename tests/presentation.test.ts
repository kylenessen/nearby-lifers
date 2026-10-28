import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupSpecies, sortSpecies } from '../src/presentation.ts'
import type { Species } from '../src/inaturalist.ts'
const anatidae = {
  id: 1,
  name: 'Anatidae',
  rank: 'family',
  preferred_common_name: 'Ducks, Geese, and Swans',
}
const passeriformes = {
  id: 2,
  name: 'Passeriformes',
  rank: 'order',
  preferred_common_name: 'Perching Birds',
}
const species: Species[] = [
  {
    id: 1,
    commonName: 'Zebra Finch',
    scientificName: 'Taeniopygia guttata',
    count: 10,
    iconicTaxon: 'Aves',
    family: { id: 3, name: 'Estrildidae', rank: 'family' },
    order: passeriformes,
    casualOnly: false,
    expectedNearby: true,
    observedByUser: false,
  },
  {
    id: 2,
    commonName: 'Bufflehead',
    scientificName: 'Bucephala albeola',
    count: 30,
    iconicTaxon: 'Aves',
    family: anatidae,
    order: { id: 4, name: 'Anseriformes', rank: 'order' },
    casualOnly: false,
    expectedNearby: true,
    observedByUser: false,
  },
  {
    id: 3,
    commonName: 'American Wigeon',
    scientificName: 'Mareca americana',
    count: 20,
    iconicTaxon: 'Aves',
    family: anatidae,
    order: { id: 4, name: 'Anseriformes', rank: 'order' },
    casualOnly: false,
    expectedNearby: true,
    observedByUser: false,
  },
]
test('natural groups use actual families and bird orders', () => {
  const groups = groupSpecies(species, { sort: 'common', grouping: 'natural' })
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Ducks, Geese, and Swans', 'Perching Birds'],
  )
  assert.deepEqual(
    groups[0].species.map((s) => s.id),
    [3, 2],
  )
  assert.deepEqual(
    groupSpecies(species, { sort: 'frequency', grouping: 'family' }).map(
      (g) => g.key,
    ),
    ['family-1', 'family-3'],
  )
  assert.deepEqual(
    groupSpecies(species, { sort: 'frequency', grouping: 'order' }).map(
      (g) => g.key,
    ),
    ['order-4', 'order-2'],
  )
})
test('sort modes work globally or within groups without mutating data', () => {
  assert.deepEqual(
    sortSpecies(species, 'common').map((s) => s.id),
    [3, 2, 1],
  )
  assert.deepEqual(
    sortSpecies(species, 'scientific').map((s) => s.id),
    [2, 3, 1],
  )
  assert.deepEqual(
    sortSpecies(species, 'frequency').map((s) => s.id),
    [2, 3, 1],
  )
  assert.deepEqual(
    species.map((s) => s.id),
    [1, 2, 3],
  )
  assert.deepEqual(
    groupSpecies(species, { sort: 'common', grouping: 'none' })[0].species.map(
      (s) => s.id,
    ),
    [3, 2, 1],
  )
})
test('missing ancestry keeps species visible under their life group', () => {
  const missing = { ...species[0], family: undefined, order: undefined }
  assert.equal(
    groupSpecies([missing], { sort: 'common', grouping: 'natural' })[0].label,
    'Birds',
  )
})
