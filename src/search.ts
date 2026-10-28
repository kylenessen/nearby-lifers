export type Point = { lat: number; lng: number }
export type Bounds = { sw: Point; ne: Point }
export type Area =
  | { kind: 'circle'; center: Point }
  | { kind: 'rectangle'; bounds: Bounds }
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'place'; id: number }

export const GROUPS = [
  { key: 'birds', label: 'Birds', taxa: ['Aves'] },
  { key: 'plants', label: 'Plants', taxa: ['Plantae'] },
  { key: 'mammals', label: 'Mammals', taxa: ['Mammalia'] },
  { key: 'reptiles', label: 'Reptiles', taxa: ['Reptilia'] },
  { key: 'amphibians', label: 'Amphibians', taxa: ['Amphibia'] },
  { key: 'insects', label: 'Insects', taxa: ['Insecta'] },
  { key: 'spiders', label: 'Arachnids', taxa: ['Arachnida'] },
  { key: 'fish', label: 'Fish', taxa: ['Actinopterygii'] },
  { key: 'fungi', label: 'Fungi', taxa: ['Fungi'] },
  { key: 'mollusks', label: 'Mollusks', taxa: ['Mollusca'] },
  {
    key: 'other',
    label: 'Other animals & life',
    taxa: ['Animalia', 'Chromista', 'Protozoa', 'unknown'],
  },
]
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
export const PAPERS = {
  letter: {
    label: 'Letter',
    dimensions: '8.5 × 11 in',
    width: 215.9,
    height: 279.4,
  },
  half: {
    label: 'Half Letter',
    dimensions: '5.5 × 8.5 in',
    width: 139.7,
    height: 215.9,
  },
  a5: { label: 'A5', dimensions: '148 × 210 mm', width: 148, height: 210 },
  a6: { label: 'A6', dimensions: '105 × 148 mm', width: 105, height: 148 },
}
export type Paper = keyof typeof PAPERS
export type Search = {
  users: string
  area: Area
  radius: number
  months: number[]
  groups: string[]
  excludeUserCasual: boolean
}
export type View = {
  hideCasual: boolean
  hideUnexpected: boolean
  showObserved: boolean
  layout: 'grid' | 'list'
  paper: Paper
  density: 'comfortable' | 'compact' | 'large'
}
export type Settings = { search: Search; view: View }
export const DEFAULT_CENTER = { lat: 35.327632, lng: -120.839097 }
export const MAX_VERTICES = 100

export function defaults(date = new Date()): Settings {
  const month = date.getMonth()
  return {
    search: {
      users: 'kylenessen',
      area: { kind: 'circle', center: DEFAULT_CENTER },
      radius: 1,
      months: [((month + 11) % 12) + 1, month + 1, ((month + 1) % 12) + 1].sort(
        (a, b) => a - b,
      ),
      groups: GROUPS.map((g) => g.key),
      excludeUserCasual: false,
    },
    view: {
      hideCasual: false,
      hideUnexpected: false,
      showObserved: false,
      layout: 'grid',
      paper: 'letter',
      density: 'comfortable',
    },
  }
}
export function userNames(users: string) {
  return [
    ...new Set(
      users
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}
export function groupFor(taxon?: string) {
  return (
    GROUPS.find((g) => g.taxa.includes(taxon ?? 'unknown')) ??
    GROUPS[GROUPS.length - 1]
  )
}
export function boundsOf(points: Point[]): Bounds {
  return {
    sw: {
      lat: Math.min(...points.map((p) => p.lat)),
      lng: Math.min(...points.map((p) => p.lng)),
    },
    ne: {
      lat: Math.max(...points.map((p) => p.lat)),
      lng: Math.max(...points.map((p) => p.lng)),
    },
  }
}
export function validPoint(p: Point) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  )
}
function cross(a: Point, b: Point, c: Point) {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
}
function onSegment(p: Point, a: Point, b: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-10 &&
    p.lng >= Math.min(a.lng, b.lng) - 1e-10 &&
    p.lng <= Math.max(a.lng, b.lng) + 1e-10 &&
    p.lat >= Math.min(a.lat, b.lat) - 1e-10 &&
    p.lat <= Math.max(a.lat, b.lat) + 1e-10
  )
}
export function insidePolygon(p: Point, points: Point[]) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j],
      b = points[i]
    if (onSegment(p, a, b)) return true
    if (
      a.lat > p.lat !== b.lat > p.lat &&
      p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng
    )
      inside = !inside
  }
  return inside
}
export function polygonError(points: Point[]) {
  if (points.length < 3) return 'Add at least three corners to your polygon.'
  if (points.length > MAX_VERTICES)
    return `Use at most ${MAX_VERTICES} corners.`
  if (!points.every(validPoint))
    return 'The polygon contains invalid coordinates.'
  const bounds = boundsOf(points)
  if (bounds.ne.lng - bounds.sw.lng > 180)
    return 'Draw a polygon on one side of the international date line.'
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]
    return sum + p.lng * q.lat - q.lng * p.lat
  }, 0)
  if (Math.abs(area) < 1e-10) return 'Draw a polygon with a visible area.'
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length]
    if (a.lat === b.lat && a.lng === b.lng)
      return 'Remove repeated corners from the polygon.'
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      const c = points[j],
        d = points[(j + 1) % points.length]
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(c, a, b) ||
        onSegment(d, a, b) ||
        onSegment(a, c, d) ||
        onSegment(b, c, d)
      )
        return 'Polygon edges cannot cross. Undo a corner and try again.'
    }
  }
  return null
}
export function validateSearch(search: Search) {
  const names = userNames(search.users)
  if (
    !names.length ||
    names.length > 10 ||
    names.some((n) => !/^[a-z0-9_-]+$/i.test(n))
  )
    return 'Enter one to ten iNaturalist usernames, separated by commas.'
  if (
    !search.months.length ||
    search.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)
  )
    return 'Choose at least one valid month.'
  if (
    !search.groups.length ||
    search.groups.some((g) => !GROUPS.some((item) => item.key === g))
  )
    return 'Choose at least one life group.'
  if (
    !Number.isFinite(search.radius) ||
    search.radius < 0.1 ||
    search.radius > 100
  )
    return 'Choose a radius from 0.1 to 100 km.'
  const area = search.area
  if (area.kind === 'circle' && !validPoint(area.center))
    return 'Choose a valid map center.'
  if (
    area.kind === 'rectangle' &&
    (!validPoint(area.bounds.sw) ||
      !validPoint(area.bounds.ne) ||
      area.bounds.sw.lat >= area.bounds.ne.lat ||
      area.bounds.sw.lng >= area.bounds.ne.lng)
  )
    return 'Choose two opposite corners with a visible area.'
  if (area.kind === 'place' && (!Number.isInteger(area.id) || area.id <= 0))
    return 'Choose a valid iNaturalist place.'
  if (area.kind === 'polygon') return polygonError(area.points)
  return null
}
export function encodeSettings({ search, view }: Settings) {
  const p = new URLSearchParams({
    v: '1',
    users: userNames(search.users).join(','),
    area: search.area.kind,
  })
  const area = search.area
  if (area.kind === 'circle') {
    p.set('lat', String(area.center.lat))
    p.set('lng', String(area.center.lng))
  } else if (area.kind === 'rectangle') {
    p.set(
      'bounds',
      [
        area.bounds.sw.lat,
        area.bounds.sw.lng,
        area.bounds.ne.lat,
        area.bounds.ne.lng,
      ].join(','),
    )
  } else if (area.kind === 'polygon') {
    p.set(
      'polygon',
      area.points.map((point) => `${point.lat},${point.lng}`).join(';'),
    )
  } else p.set('place', String(area.id))
  p.set('radius', String(search.radius))
  p.set('months', [...search.months].sort((a, b) => a - b).join(','))
  p.set(
    'groups',
    GROUPS.filter((g) => search.groups.includes(g.key))
      .map((g) => g.key)
      .join(','),
  )
  if (search.excludeUserCasual) p.set('user_casual', 'exclude')
  if (view.hideCasual) p.set('hide_casual', '1')
  if (view.hideUnexpected) p.set('hide_unexpected', '1')
  if (view.showObserved) p.set('show_observed', '1')
  p.set('layout', view.layout)
  p.set('paper', view.paper)
  p.set('density', view.density)
  return p.toString()
}
export function decodeSettings(query: string, date = new Date()): Settings {
  const settings = defaults(date)
  const p = new URLSearchParams(query)
  if (p.has('v') && p.get('v') !== '1')
    throw new Error('This search link uses an unsupported version.')
  const { search, view } = settings
  const number = (key: string) => {
    if (!p.get(key)?.trim())
      throw new Error(`The search link is missing ${key}.`)
    return Number(p.get(key))
  }
  if (p.has('users')) search.users = p.get('users')!
  if (p.has('radius')) search.radius = number('radius')
  if (p.has('months'))
    search.months = [...new Set(p.get('months')!.split(',').map(Number))]
  if (p.has('groups')) search.groups = [...new Set(p.get('groups')!.split(','))]
  if (p.has('area')) {
    const kind = p.get('area')
    if (kind === 'circle')
      search.area = { kind, center: { lat: number('lat'), lng: number('lng') } }
    else if (kind === 'place') search.area = { kind, id: number('place') }
    else if (kind === 'rectangle') {
      const values = p.get('bounds')?.split(',')
      if (values?.length !== 4 || values.some((v) => !v.trim()))
        throw new Error('The search link has invalid rectangle coordinates.')
      const [a, b, c, d] = values.map(Number)
      search.area = {
        kind,
        bounds: { sw: { lat: a, lng: b }, ne: { lat: c, lng: d } },
      }
    } else if (kind === 'polygon') {
      const points =
        p
          .get('polygon')
          ?.split(';')
          .map((pair) => {
            const coordinates = pair.split(',')
            if (coordinates.length !== 2 || coordinates.some((v) => !v.trim()))
              throw new Error(
                'The search link has invalid polygon coordinates.',
              )
            return { lat: Number(coordinates[0]), lng: Number(coordinates[1]) }
          }) ?? []
      search.area = { kind, points }
    } else throw new Error('The search link has an unknown area type.')
  }
  search.excludeUserCasual = p.get('user_casual') === 'exclude'
  view.hideCasual = p.get('hide_casual') === '1'
  view.hideUnexpected = p.get('hide_unexpected') === '1'
  view.showObserved = p.get('show_observed') === '1'
  if (p.get('layout') === 'list') view.layout = 'list'
  const paper = p.get('paper')
  if (paper && Object.hasOwn(PAPERS, paper)) view.paper = paper as Paper
  if (p.get('density') === 'compact' || p.get('density') === 'large')
    view.density = p.get('density') as View['density']
  const error = validateSearch(search)
  if (error) throw new Error(error)
  return settings
}
export function searchKey(search: Search) {
  return encodeSettings({ search, view: defaults().view })
}
export function areaLabel(area: Area, radius: number) {
  if (area.kind === 'circle')
    return `${radius} km around ${area.center.lat.toFixed(4)}, ${area.center.lng.toFixed(4)}`
  if (area.kind === 'polygon')
    return `Custom polygon with ${area.points.length} corners`
  if (area.kind === 'rectangle') return 'Drawn rectangle'
  return `iNaturalist place ${area.id}`
}
