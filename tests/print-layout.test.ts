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
test('photo grids preserve full rows, their spacing, and every species within page height', () => {
  const items = Array.from({ length: 37 }, (_, id) => ({ id, height: 80 }))
  const pages = packGrid(items, 3, 4, 260, 10)
  assert.deepEqual(
    pages.flat(),
    items.map((item) => item.id),
  )
  assert.deepEqual(
    pages.map((p) => p.length),
    [9, 9, 9, 9, 1],
  )
  assert.deepEqual(packGrid([], 3, 4, 260, 10), [])
  assert.deepEqual(
    packGrid(items, 1, 1, 1000, 10),
    items.map(({ id }) => [id]),
  )
  const variable = items.map((item) => ({
    ...item,
    height: item.id % 5 ? 70 : 110,
  }))
  const packed = packGrid(variable, 3, 3, 240, 12)
  assert.deepEqual(
    packed.flat(),
    items.map((item) => item.id),
  )
  for (const page of packed) {
    const heights = []
    for (let index = 0; index < page.length; index += 3)
      heights.push(
        Math.max(
          ...page.slice(index, index + 3).map((id) => variable[id].height),
        ),
      )
    assert.ok(heights.length <= 3)
    assert.ok(
      heights.reduce((sum, height) => sum + height, 0) +
        (heights.length - 1) * 12 <=
        240,
    )
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
