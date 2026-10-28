import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gridShape,
  printGrid,
  packGrid,
  packList,
} from '../src/print-layout.ts'
import { defaults, PAPERS } from '../src/search.ts'
import type { Paper, View } from '../src/search.ts'
test('every sheet and density has a usable grid', () => {
  for (const paper of Object.keys(PAPERS) as Paper[])
    for (const density of [
      'compact',
      'comfortable',
      'large',
      'dense',
    ] as View['density'][]) {
      const { columns, rows } = gridShape(paper, density)
      assert.ok(columns > 0 && rows > 0)
    }
})
test('custom photo grids fill every page except the last without losing species', () => {
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
  view.gridColumns = null
  view.gridRows = null
  assert.deepEqual(printGrid(view), gridShape('half', 'large'))
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
