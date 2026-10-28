import type { Paper, View } from './search.ts'
export function gridShape(paper: Paper, density: View['density']) {
  const shapes = {
    letter: {
      dense: [5, 6],
      compact: [4, 5],
      comfortable: [3, 4],
      large: [2, 3],
    },
    half: {
      dense: [3, 5],
      compact: [3, 4],
      comfortable: [2, 3],
      large: [2, 2],
    },
    a5: { dense: [3, 5], compact: [3, 4], comfortable: [2, 3], large: [2, 2] },
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
