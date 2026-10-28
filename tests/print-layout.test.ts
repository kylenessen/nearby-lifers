import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printGrid, packGrid, packList } from '../src/print-layout.ts'
import { defaults, PAPERS } from '../src/search.ts'
import type { Paper, View } from '../src/search.ts'
test('every sheet and density defaults to three columns and four rows', () => {
  for (const paper of Object.keys(PAPERS) as Paper[])
    for (const density of [
      'compact',
      'comfortable',
      'large',
      'dense',
    ] as View['density'][]) {
      const view = { ...defaults().view, paper, density }
      assert.deepEqual(printGrid(view), { columns: 3, rows: 4 })
      view.printMode = 'booklet'
      assert.deepEqual(printGrid(view), { columns: 3, rows: 4 })
    }
})
test('photo grids keep full pages and leave the final empty cells unfilled', () => {
  const ids = Array.from({ length: 37 }, (_, id) => id)
  const pages = packGrid(ids, 3, 4)
  assert.deepEqual(pages.flat(), ids)
  assert.deepEqual(
    pages.map((p) => p.length),
    [12, 12, 12, 1],
  )
  assert.deepEqual(packGrid([], 3, 4), [])
  assert.deepEqual(
    packGrid(ids, 1, 1),
    ids.map((id) => [id]),
  )
  for (const count of [1, 3, 4, 15, 16, 17, 42, 83]) {
    const species = Array.from({ length: count }, (_, id) => id)
    const packed = packGrid(species, 4, 4)
    assert.deepEqual(packed.flat(), species)
    assert.equal(packed.length, Math.ceil(count / 16))
    assert.ok(packed.slice(0, -1).every((page) => page.length === 16))
    const rows = packed.map((page) => Math.ceil(page.length / 4))
    assert.ok(Math.max(...rows) <= 4)
  }
})
test('explicit print grids survive paper, mode, and text-size changes', () => {
  const view = defaults().view
  view.gridColumns = 3
  view.gridRows = 4
  for (const paper of Object.keys(PAPERS) as Paper[]) {
    view.paper = paper
    view.density = 'large'
    assert.deepEqual(printGrid(view), { columns: 3, rows: 4 })
    view.printMode = 'booklet'
    assert.deepEqual(printGrid(view), { columns: 3, rows: 4 })
  }
})
test('measured checklist packing repeats headings and never loses a species', () => {
  const items = Array.from({ length: 29 }, (_, i) => ({
    id: i,
    group: i < 21 ? 'Birds' : 'Plants',
    height: i % 2 ? 21 : 43,
  }))
  const columns = packList(items, 160, 20)
  assert.deepEqual(
    columns.flatMap((col) => col.flatMap((group) => group.ids)),
    items.map((i) => i.id),
  )
  for (const column of columns) {
    const height =
      column.length * 20 +
      column
        .flatMap((g) => g.ids)
        .reduce((total, id) => total + items[id].height, 0)
    assert.ok(height <= 160)
    assert.ok(column.every((group) => group.ids.length > 0))
  }
})
