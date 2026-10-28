import type { View } from './search.ts'

// ColorBrewer Pastel1, as published by d3-scale-chromatic.
// https://d3js.org/d3-scale-chromatic/categorical#schemePastel1
export const GROUP_COLORS = [
  '#fbb4ae',
  '#b3cde3',
  '#ccebc5',
  '#decbe4',
  '#fed9a6',
  '#ffffcc',
  '#e5d8bd',
  '#fddaec',
  '#f2f2f2',
]

// Keep full-width photos and complete rows together, up to the requested row limit.
export function packGrid(
  items: { id: number; height: number }[],
  columns: number,
  rows: number,
  capacity: number,
  gap: number,
): number[][] {
  const pages: number[][] = []
  let page: number[] = []
  let used = 0
  let rowCount = 0
  for (let index = 0; index < items.length; index += columns) {
    const row = items.slice(index, index + columns)
    const height = Math.max(...row.map((item) => item.height))
    if (page.length && (rowCount === rows || used + gap + height > capacity)) {
      pages.push(page)
      page = []
      used = 0
      rowCount = 0
    }
    used += (rowCount ? gap : 0) + height
    rowCount++
    page.push(...row.map((item) => item.id))
  }
  if (page.length) pages.push(page)
  return pages
}
export function printGrid(view: View) {
  return {
    columns: view.gridColumns ?? 3,
    rows: view.gridRows ?? 4,
  }
}
export type ListItem = { id: number; group: string; height: number }
export type ListColumn = { group: string; ids: number[] }[]
// Pack measured rows. Repeat a heading when its group continues in a new column.
export function packList(
  items: ListItem[],
  capacity: number,
  headingHeight: number | Map<string, number>,
): ListColumn[] {
  const columns: ListColumn[] = []
  let column: ListColumn = [],
    used = 0
  for (const item of items) {
    let group: ListColumn[number] | undefined = column[column.length - 1]
    const height =
      typeof headingHeight === 'number'
        ? headingHeight
        : (headingHeight.get(item.group) ?? 0)
    const additionalHeading = !group || group.group !== item.group
    const needed = item.height + (additionalHeading ? height : 0)
    if (used + needed > capacity && column.length) {
      columns.push(column)
      column = []
      used = 0
      group = undefined
    }
    if (!group || group.group !== item.group) {
      group = { group: item.group, ids: [] }
      column.push(group)
      used += height
    }
    group.ids.push(item.id)
    used += item.height
  }
  if (column.length) columns.push(column)
  return columns
}
