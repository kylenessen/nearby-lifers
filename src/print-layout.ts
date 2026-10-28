import type { View } from './search.ts'

export const GROUP_COLORS = [
  '#cf4da8',
  '#75ab3d',
  '#8d67cb',
  '#b68f40',
  '#6592cf',
  '#cc5a43',
  '#54a676',
  '#c26186',
]

// Keep the full-page grid on every page, leaving unused final cells empty.
export function packGrid(
  ids: number[],
  columns: number,
  rows: number,
): number[][] {
  const pages: number[][] = []
  const capacity = columns * rows
  for (let offset = 0; offset < ids.length; offset += capacity)
    pages.push(ids.slice(offset, offset + capacity))
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
