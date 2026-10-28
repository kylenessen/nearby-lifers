import type { Paper, View } from './search.ts'

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

// Fixed cells fill the page. Group boundaries never create empty cells.
export function packGrid(
  ids: number[],
  columns: number,
  rows: number,
): number[][] {
  const pages: number[][] = []
  const capacity = columns * rows
  for (let index = 0; index < ids.length; index += capacity)
    pages.push(ids.slice(index, index + capacity))
  return pages
}
export function printGrid(view: View) {
  const preset = gridShape(
    view.printMode === 'booklet' ? 'half' : view.paper,
    view.density,
  )
  return {
    columns: view.gridColumns ?? preset.columns,
    rows: view.gridRows ?? preset.rows,
  }
}
export function gridShape(paper: Paper, density: View['density']) {
  const shapes = {
    letter: {
      dense: [5, 6],
      compact: [4, 5],
      comfortable: [3, 4],
      large: [2, 3],
    },
    half: {
      dense: [4, 4],
      compact: [3, 4],
      comfortable: [2, 3],
      large: [2, 2],
    },
    a5: { dense: [4, 4], compact: [3, 4], comfortable: [2, 3], large: [2, 2] },
    a6: { dense: [2, 4], compact: [2, 3], comfortable: [2, 2], large: [1, 2] },
  }
  const [columns, rows] = shapes[paper][density]
  return { columns, rows }
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
