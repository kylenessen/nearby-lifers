export type BookletPage = { number: number } & (
  | { kind: 'cover' }
  | { kind: 'content'; contentIndex: number }
  | { kind: 'blank' }
  | { kind: 'back-cover' }
)
export type BookletSide = {
  sheet: number
  side: 'front' | 'back'
  pages: [BookletPage, BookletPage]
}
export function bookletPlan(contentPages: number) {
  if (!Number.isInteger(contentPages) || contentPages < 0)
    throw new Error('Booklet page count must be a nonnegative integer.')
  const totalPages = Math.ceil((contentPages + 2) / 4) * 4
  const pages: BookletPage[] = Array.from(
    { length: totalPages },
    (_, index) => {
      const number = index + 1
      if (index === 0) return { number, kind: 'cover' }
      if (index <= contentPages)
        return { number, kind: 'content', contentIndex: index - 1 }
      return { number, kind: index === totalPages - 1 ? 'back-cover' : 'blank' }
    },
  )
  const sides: BookletSide[] = []
  for (let sheet = 0; sheet < totalPages / 4; sheet++) {
    sides.push({
      sheet: sheet + 1,
      side: 'front',
      pages: [pages[totalPages - 1 - 2 * sheet], pages[2 * sheet]],
    })
    sides.push({
      sheet: sheet + 1,
      side: 'back',
      pages: [pages[2 * sheet + 1], pages[totalPages - 2 - 2 * sheet]],
    })
  }
  return { totalPages, sheets: totalPages / 4, sides }
}
