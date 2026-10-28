export type BookletPage = { number: number } & (
  | { kind: 'cover' }
  | { kind: 'parameters'; parametersIndex: number }
  | { kind: 'contents'; contentsIndex: number }
  | { kind: 'content'; contentIndex: number }
  | { kind: 'blank' }
  | { kind: 'back-cover' }
)
export type BookletSide = {
  sheet: number
  side: 'front' | 'back'
  pages: [BookletPage, BookletPage]
}
export function bookletPlan(
  contentPages: number,
  contentsPages = 0,
  parametersPages = 1,
) {
  if (
    ![contentPages, contentsPages, parametersPages].every(
      (n) => Number.isInteger(n) && n >= 0,
    )
  )
    throw new Error('Booklet page count must be a nonnegative integer.')
  const contentStart = 2 + parametersPages + contentsPages
  const totalPages =
    Math.ceil((contentPages + contentsPages + parametersPages + 2) / 4) * 4
  const pages: BookletPage[] = Array.from(
    { length: totalPages },
    (_, index) => {
      const number = index + 1
      if (index === 0) return { number, kind: 'cover' }
      if (index <= parametersPages)
        return { number, kind: 'parameters', parametersIndex: index - 1 }
      if (number < contentStart)
        return {
          number,
          kind: 'contents',
          contentsIndex: index - parametersPages - 1,
        }
      if (number < contentStart + contentPages)
        return { number, kind: 'content', contentIndex: number - contentStart }
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
  return { totalPages, sheets: totalPages / 4, contentStart, sides }
}
