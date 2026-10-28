import { boundsOf, GROUPS, insidePolygon, userNames } from './search.ts'
import type { Search, Point } from './search.ts'

const API_ROOT = 'https://api.inaturalist.org/v1'
const ALL_GRADES = ['research', 'needs_id', 'casual']
const MAX_POLYGON_OBSERVATIONS = 10000
// Space API requests, including parallel searches, below 100 requests per minute.
let nextRequestAt = 0

type ListResponse<T> = { total_results: number; results: T[] }
export type INatUser = { id: number; login: string; name?: string }
export type INatTaxon = {
  id: number
  name: string
  preferred_common_name?: string
  iconic_taxon_name?: string
  rank_level?: number
  min_species_taxon_id?: number
  ancestor_ids?: number[]
  ancestors?: TaxonAncestor[]
  default_photo?: {
    attribution?: string
    medium_url?: string
    square_url?: string
    url?: string
  } | null
}
export type TaxonAncestor = {
  id: number
  name: string
  rank: string
  preferred_common_name?: string
}
export type INatPlace = {
  id: number
  name: string
  display_name?: string
  geometry_geojson?: GeoJSON.GeoJsonObject | null
  bounding_box_geojson?: GeoJSON.GeoJsonObject | null
}
export type SpeciesCountResult = { count: number; taxon: INatTaxon }
export type SpeciesCountQuery = {
  lat?: number
  lng?: number
  radius?: number
  nelat?: number
  nelng?: number
  swlat?: number
  swlng?: number
  month?: number[]
  iconic_taxa?: string[]
  place_id?: number
  user_id?: number[]
  quality_grade?: string[]
  expected_nearby?: boolean
  include_ancestors?: boolean
}
export type Species = {
  id: number
  commonName: string
  scientificName: string
  count: number
  casualOnly: boolean
  expectedNearby: boolean
  iconicTaxon?: string
  family?: TaxonAncestor
  order?: TaxonAncestor
  photoUrl?: string
  photoCredit?: string
  observedByUser: boolean
}
export type Snapshot = {
  species: Species[]
  users: INatUser[]
  observedTotal: number
  areaLabel: string
  builtAt: string
  search: Search
  place?: INatPlace
}
type Observation = {
  id: number
  taxon?: INatTaxon
  geojson?: { coordinates: [number, number] } | null
  quality_grade: string
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const delay = Math.max(0, nextRequestAt - Date.now())
  nextRequestAt = Date.now() + delay + 650
  if (delay)
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }, delay)
      signal?.addEventListener('abort', abort, { once: true })
    })
  signal?.throwIfAborted()
  const response = await fetch(`${API_ROOT}${path}`, { signal })
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'iNaturalist is busy. Wait a moment and try again.'
        : `iNaturalist returned ${response.status}. Please try again.`,
    )
  return response.json() as Promise<T>
}
export async function resolveUser(login: string, signal?: AbortSignal) {
  const data = await fetchJson<ListResponse<INatUser>>(
    `/users/${encodeURIComponent(login.trim())}`,
    signal,
  )
  if (!data.results[0])
    throw new Error(`No iNaturalist user found for ${login}.`)
  return data.results[0]
}
export async function searchUsers(query: string, signal?: AbortSignal) {
  if (query.trim().length < 2) return []
  const data = await fetchJson<ListResponse<INatUser>>(
    `/users/autocomplete?${new URLSearchParams({ q: query.trim(), per_page: '8' })}`,
    signal,
  )
  return data.results
}
export async function searchPlaces(query: string, signal?: AbortSignal) {
  if (query.trim().length < 2) return []
  const data = await fetchJson<ListResponse<INatPlace>>(
    `/places/autocomplete?${new URLSearchParams({ q: query.trim(), per_page: '8' })}`,
    signal,
  )
  return data.results
}
export async function fetchPlaceDetails(id: number, signal?: AbortSignal) {
  const data = await fetchJson<ListResponse<INatPlace>>(`/places/${id}`, signal)
  if (!data.results[0])
    throw new Error('The iNaturalist place could not be found.')
  return data.results[0]
}
export function queryParams(query: SpeciesCountQuery) {
  const params = new URLSearchParams({
    verifiable: 'any',
    quality_grade: ALL_GRADES.join(','),
    hrank: 'species',
    spam: 'false',
  })
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined)
      params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  return params
}
export async function fetchSpeciesCounts(
  query: SpeciesCountQuery,
  signal?: AbortSignal,
) {
  const results: SpeciesCountResult[] = []
  let total = Infinity
  for (let page = 1; results.length < total; page++) {
    const params = queryParams(query)
    params.set('per_page', '500')
    params.set('page', String(page))
    const data = await fetchJson<ListResponse<SpeciesCountResult>>(
      `/observations/species_counts?${params}`,
      signal,
    )
    total = data.total_results
    if (!data.results.length && results.length < total)
      throw new Error(
        'iNaturalist returned an incomplete species list. Please try again.',
      )
    results.push(...data.results)
  }
  return results
}
export function areaQuery(search: Search): SpeciesCountQuery {
  const { area } = search
  const shared = {
    month: search.months,
    iconic_taxa: GROUPS.filter((g) => search.groups.includes(g.key)).flatMap(
      (g) => g.taxa,
    ),
  }
  if (area.kind === 'circle')
    return { ...shared, ...area.center, radius: search.radius }
  if (area.kind === 'place') return { ...shared, place_id: area.id }
  const bounds = area.kind === 'polygon' ? boundsOf(area.points) : area.bounds
  return {
    ...shared,
    nelat: bounds.ne.lat,
    nelng: bounds.ne.lng,
    swlat: bounds.sw.lat,
    swlng: bounds.sw.lng,
  }
}
export async function polygonObservations(
  query: SpeciesCountQuery,
  points: Point[],
  signal?: AbortSignal,
  progress?: (message: string) => void,
) {
  const observations: Observation[] = []
  let cursor = 0,
    scanned = 0
  while (true) {
    const params = queryParams(query)
    params.set('per_page', '200')
    params.set('order_by', 'id')
    params.set('order', 'asc')
    if (cursor) params.set('id_above', String(cursor))
    const data = await fetchJson<ListResponse<Observation>>(
      `/observations?${params}`,
      signal,
    )
    if (data.total_results + scanned > MAX_POLYGON_OBSERVATIONS)
      throw new Error(
        'This polygon covers more than 10,000 observations in its bounding rectangle. Draw a smaller area or choose fewer months or life groups.',
      )
    if (!data.results.length) break
    scanned += data.results.length
    for (const observation of data.results) {
      const coords = observation.geojson?.coordinates
      if (coords && insidePolygon({ lat: coords[1], lng: coords[0] }, points))
        observations.push(observation)
    }
    progress?.(
      `Checking polygon boundaries. ${scanned.toLocaleString()} observations checked${query.expected_nearby ? ' for expected range' : ''}.`,
    )
    const next = data.results[data.results.length - 1].id
    if (next <= cursor)
      throw new Error(
        'iNaturalist pagination did not advance. Please try again.',
      )
    cursor = next
    if (data.results.length < 200) break
  }
  return observations
}
export function countPolygonObservations(
  observations: Observation[],
  taxa: SpeciesCountResult[],
) {
  const counts = new Map<number, { count: number; nonCasual: number }>()
  const ids = new Set(taxa.map((result) => result.taxon.id))
  for (const observation of observations) {
    const taxon = observation.taxon
    if (!taxon) continue
    const id =
      taxon.min_species_taxon_id ??
      (ids.has(taxon.id)
        ? taxon.id
        : taxon.ancestor_ids?.findLast((ancestor) => ids.has(ancestor)))
    if (!id || !ids.has(id))
      throw new Error(
        'iNaturalist changed while this polygon was loading. Please run the search again.',
      )
    const row = counts.get(id) ?? { count: 0, nonCasual: 0 }
    row.count++
    if (observation.quality_grade !== 'casual') row.nonCasual++
    counts.set(id, row)
  }
  return counts
}
export async function buildSnapshot(
  search: Search,
  label: string,
  signal?: AbortSignal,
  progress?: (message: string) => void,
): Promise<Snapshot> {
  progress?.('Finding users and their worldwide life lists.')
  const users = await Promise.all(
    userNames(search.users).map((name) => resolveUser(name, signal)),
  )
  const query = areaQuery(search)
  // No area, month, or life-group restriction on the users' observed species.
  const observedPromise = fetchSpeciesCounts(
    {
      user_id: users.map((user) => user.id),
      quality_grade: search.excludeUserCasual
        ? ['research', 'needs_id']
        : ALL_GRADES,
    },
    signal,
  )
  const nearbyPromise = (async () => {
    if (search.area.kind === 'polygon') {
      const [taxa, observations, expected] = await Promise.all([
        fetchSpeciesCounts({ ...query, include_ancestors: true }, signal),
        polygonObservations(query, search.area.points, signal, progress),
        polygonObservations(
          { ...query, expected_nearby: true },
          search.area.points,
          signal,
        ),
      ])
      const counts = countPolygonObservations(observations, taxa)
      const expectedCounts = countPolygonObservations(expected, taxa)
      return taxa
        .filter((t) => counts.has(t.taxon.id))
        .map((t) => ({
          ...t,
          count: counts.get(t.taxon.id)!.count,
          nonCasual: counts.get(t.taxon.id)!.nonCasual,
          expected: expectedCounts.has(t.taxon.id),
        }))
    }
    const [nearby, nonCasual, expected] = await Promise.all([
      fetchSpeciesCounts({ ...query, include_ancestors: true }, signal),
      fetchSpeciesCounts(
        { ...query, quality_grade: ['research', 'needs_id'] },
        signal,
      ),
      fetchSpeciesCounts({ ...query, expected_nearby: true }, signal),
    ])
    const nonCasualIds = new Set(nonCasual.map((t) => t.taxon.id))
    const expectedIds = new Set(expected.map((t) => t.taxon.id))
    return nearby.map((t) => ({
      ...t,
      nonCasual: nonCasualIds.has(t.taxon.id) ? 1 : 0,
      expected: expectedIds.has(t.taxon.id),
    }))
  })()
  const [observed, nearby] = await Promise.all([observedPromise, nearbyPromise])
  const observedIds = new Set(observed.map((t) => t.taxon.id))
  return {
    users,
    search,
    observedTotal: observedIds.size,
    areaLabel: label,
    builtAt: new Date().toISOString(),
    species: nearby
      .map(({ taxon, count, nonCasual, expected }) => ({
        id: taxon.id,
        commonName: taxon.preferred_common_name ?? taxon.name,
        scientificName: taxon.name,
        count,
        casualOnly: nonCasual === 0,
        expectedNearby: expected,
        iconicTaxon: taxon.iconic_taxon_name,
        family: taxon.ancestors?.find((ancestor) => ancestor.rank === 'family'),
        order: taxon.ancestors?.find((ancestor) => ancestor.rank === 'order'),
        photoUrl:
          taxon.default_photo?.medium_url ??
          taxon.default_photo?.square_url ??
          taxon.default_photo?.url,
        photoCredit: taxon.default_photo?.attribution,
        observedByUser: observedIds.has(taxon.id),
      }))
      .sort(
        (a, b) => b.count - a.count || a.commonName.localeCompare(b.commonName),
      ),
  }
}
