import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookletPlan } from '../src/booklet.ts'

test('eight-page booklet puts covers outside and centers pages four and five', () => {
  const plan = bookletPlan(5)
  assert.equal(plan.sheets, 2)
  assert.deepEqual(
    plan.sides.map((side) => side.pages.map((p) => p.number)),
    [
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ],
  )
  assert.equal(plan.sides[0].pages[0].kind, 'back-cover')
  assert.equal(plan.sides[0].pages[1].kind, 'cover')
  assert.equal(plan.sides[1].pages[1].kind, 'blank')
})
test('any checklist length pads to whole sheets and retains every page once', () => {
  for (let contentPages = 0; contentPages <= 100; contentPages++) {
    const plan = bookletPlan(contentPages)
    const printed = plan.sides.flatMap((side) => side.pages)
    assert.equal(plan.totalPages % 4, 0)
    assert.equal(new Set(printed.map((p) => p.number)).size, plan.totalPages)
    assert.equal(printed.filter((p) => p.kind === 'cover').length, 1)
    assert.equal(printed.filter((p) => p.kind === 'back-cover').length, 1)
    assert.deepEqual(
      printed
        .filter((p) => p.kind === 'content')
        .map((p) => p.contentIndex)
        .sort((a, b) => a - b),
      Array.from({ length: contentPages }, (_, i) => i),
    )
    for (const side of plan.sides)
      assert.equal(
        side.pages[0].number + side.pages[1].number,
        plan.totalPages + 1,
      )
  }
})
