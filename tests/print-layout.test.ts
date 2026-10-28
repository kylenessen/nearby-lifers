import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gridShape, packList } from '../src/print-layout.ts'
import { PAPERS } from '../src/search.ts'
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
