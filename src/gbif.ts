import { simplify } from '@turf/simplify'
import { createJsonClient } from './http.ts'
import { GROUPS, groupFor } from './search.ts'
import type { Search } from './search.ts'
import type { INatPlace, INatTaxon, Species } from './inaturalist.ts'

export const EBIRD_DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
const HOUR = 60 * 60 * 1000
const json = createJsonClient({ root: 'https://api.gbif.org/v1', name: 'GBIF', interval: 200 })
export type GbifTaxon = {
  key: number
  canonicalName: string
  rank: string
  kingdom?: string
  class?: string
  phylum?: string
}
export type ExternalSummary = {
  label: 'GBIF' | 'eBird'
  unmatched: { key: number; name: string; count: number }[]
  warnings: string[]
  retrievedAt: string
}
type FacetResponse = {
  count: number
  facets: { field: string; counts: { name: string; count: number }[] }[]
}

function ringText(ring: number[][], outer: boolean) {
  const points = ring.map((p) => p.slice(0, 2))
  if (points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1]) points.pop()
  if (points.length < 3 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90))
    throw new Error('The place boundary has invalid coordinates.')
  if (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) > 180)
    throw new Error('GBIF searches across the international date line are not supported. Draw a smaller area.')
  const area = points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length]
    return sum + p[0] * next[1] - next[0] * p[1]
  }, 0)
  if ((area > 0) !== outer) points.reverse()
  return '(' + [...points, points[0]].map(p => p.join(' ')).join(',') + ')'
}
export function geometryWkt(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  if (!polygons.length || polygons.some(p => !p.length)) throw new Error('The place has no searchable boundary.')
  const parts = polygons.map(p => '(' + p.map((r, i) => ringText(r, i === 0)).join(',') + ')')
  return geometry.type === 'Polygon' ? 'POLYGON' + parts[0] : 'MULTIPOLYGON(' + parts.join(',') + ')'
}
export function gbifArea(search: Search, place?: INatPlace) {
  const params = new URLSearchParams()
  const warnings: string[] = []
  const area = search.area
  if (area.kind === 'circle') {
    params.set('geoDistance', `${area.center.lat},${area.center.lng},${search.radius}km`)
  } else if (area.kind === 'rectangle') {
    params.set('decimalLatitude', `${area.bounds.sw.lat},${area.bounds.ne.lat}`)
    params.set('decimalLongitude', `${area.bounds.sw.lng},${area.bounds.ne.lng}`)
  } else {
    let geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
    if (area.kind === 'polygon') {
      const ring = area.points.map(p => [p.lng, p.lat])
      geometry = { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
    } else {
      const original = place?.geometry_geojson
      if (!original || !['Polygon', 'MultiPolygon'].includes(original.type))
        throw new Error('This place has no polygon boundary for GBIF. Draw a polygon or choose a radius.')
      geometry = original as GeoJSON.Polygon | GeoJSON.MultiPolygon
    }
    let wkt = geometryWkt(geometry)
    // GET requests have a practical URL limit. Keep user-drawn polygons exact.
    // Detailed place outlines use a bounded, disclosed approximation.
    if (area.kind === 'place' && encodeURIComponent(wkt).length > 6500) {
      let tolerance = 0
      for (const metres of [1, 5, 10, 25, 50]) {
        wkt = geometryWkt(simplify(geometry, { tolerance: metres / 111320, highQuality: true }))
        tolerance = metres
        if (encodeURIComponent(wkt).length <= 6500) break
      }
      if (encodeURIComponent(wkt).length > 6500)
        throw new Error('This place boundary is too detailed for GBIF. Draw a smaller polygon or choose a radius.')
      warnings.push(`GBIF uses a simplified place outline with about ${tolerance} m tolerance. Records near the boundary may differ from iNaturalist.`)
    }
    params.set('geometry', wkt)
  }
  return { params, warnings }
}

export async function mapConcurrent<T, R>(values: T[], action: (value: T, index: number) => Promise<R>, signal?: AbortSignal) {
  const results: R[] = new Array(values.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, values.length) }, async () => {
    while (next < values.length) {
      signal?.throwIfAborted()
      const index = next++
      results[index] = await action(values[index], index)
    }
  }))
  return results
}

export async function fetchGbifCounts(params: URLSearchParams, signal?: AbortSignal) {
  const counts = new Map<number, number>()
  const query = new URLSearchParams(params)
  query.set('limit', '0')
  query.set('facet', 'speciesKey')
  query.set('facetLimit', '1000')
  let total: number | undefined
  for (let offset = 0; ; ) {
    query.set('facetOffset', String(offset))
    const data = await json<FacetResponse>(`/occurrence/search?${query}`, signal, HOUR)
    if (total !== undefined && total !== data.count)
      throw new Error('GBIF changed while the species list was loading. Please try again in an hour or narrow the search.')
    total = data.count
    const facet = data.facets?.find(f => f.field === 'SPECIES_KEY')
    if (!facet && data.count) throw new Error('GBIF returned an incomplete species summary. Please try again.')
    const rows = facet?.counts ?? []
    if (!rows.length) break
    for (const row of rows) {
      const key = Number(row.name)
      if (!Number.isSafeInteger(key) || key <= 0 || !Number.isSafeInteger(row.count) || row.count < 0 || counts.has(key))
        throw new Error('GBIF returned inconsistent species pages. Please try again.')
      counts.set(key, row.count)
    }
    offset += rows.length
    // A short page may reflect an API cap. Fetch until an empty page.
  }
  return { counts, higherRankRecords: Math.max(0, (total ?? 0) - [...counts.values()].reduce((a, b) => a + b, 0)) }
}

export function gbifGroup(taxon: GbifTaxon) {
  const candidates = [taxon.class, taxon.phylum, taxon.kingdom]
  if (taxon.class === 'Actinopteri') return groupFor('Actinopterygii')
  return GROUPS.find(g => g.key !== 'other' && g.taxa.some(t => candidates.includes(t))) ?? groupFor('unknown')
}
export async function loadGbif(search: Search, place: INatPlace | undefined, signal?: AbortSignal, progress?: (message: string) => void) {
  const { params, warnings } = gbifArea(search, place)
  params.set('hasCoordinate', 'true')
  params.set('hasGeospatialIssue', 'false')
  params.set('occurrenceStatus', 'PRESENT')
  for (const month of [...search.months].sort((a, b) => a - b)) params.append('month', String(month))
  if (search.source === 'ebird') params.set('datasetKey', EBIRD_DATASET)
  if (!search.groups.includes('other')) {
    const names = GROUPS.filter(g => search.groups.includes(g.key)).flatMap(g => g.taxa)
    const keys = await mapConcurrent(names, async name => {
      const match = await json<{ usageKey?: number; matchType: string }>(`/species/match?${new URLSearchParams({ name, strict: 'true' })}`, signal, 24 * HOUR)
      if (!match.usageKey || match.matchType !== 'EXACT') throw new Error(`GBIF could not match the life group ${name}.`)
      return match.usageKey
    }, signal)
    for (const key of keys) params.append('taxonKey', String(key))
  }
  progress?.('Loading GBIF species counts. Large areas may take a minute.')
  const { counts, higherRankRecords } = await fetchGbifCounts(params, signal)
  if (higherRankRecords) warnings.push(`${higherRankRecords.toLocaleString()} GBIF records lack a species-level match and are excluded.`)
  let completed = 0
  const taxa = await mapConcurrent([...counts], async ([key, count]) => {
    const taxon = await json<GbifTaxon>(`/species/${key}`, signal, 24 * HOUR)
    progress?.(`Reading GBIF taxonomy. ${++completed} of ${counts.size.toLocaleString()} species.`)
    return { taxon, count }
  }, signal)
  return {
    rows: taxa.filter(({ taxon }) => search.groups.includes(gbifGroup(taxon).key)),
    warnings,
    retrievedAt: new Date().toISOString(),
    label: search.source === 'ebird' ? 'eBird' as const : 'GBIF' as const,
  }
}

export const normalizedName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
export function exactTaxonMatch(candidates: INatTaxon[], external: GbifTaxon) {
  const name = normalizedName(external.canonicalName)
  const matches = candidates.filter(t => t.is_active !== false && t.rank_level === 10 &&
    groupFor(t.iconic_taxon_name).key === gbifGroup(external).key &&
    [t.name, t.matched_term].some(n => n && normalizedName(n) === name))
  const unique = [...new Map(matches.map(t => [t.id, t])).values()]
  return unique.length === 1 ? unique[0] : undefined
}

export function mergeSourceCounts(species: Species[], external: { species: Species; count: number }[], label: 'GBIF' | 'eBird') {
  const merged = new Map(species.map(s => [s.id, { ...s, inatCount: s.count }]))
  for (const row of external) {
    const current: Species = merged.get(row.species.id) ?? { ...row.species, count: 0, inatCount: 0 }
    const externalCount = (current.externalCount ?? 0) + row.count
    const inatCount = current.inatCount ?? 0
    // Each GBIF facet bucket is disjoint. Merge taxonomic synonyms inside that
    // source, but never add the overlapping iNaturalist and GBIF totals.
    merged.set(current.id, {
      ...current,
      inatCount,
      externalCount,
      externalSource: label,
      count: Math.max(inatCount, externalCount),
      countSource: externalCount > inatCount ? label : 'iNaturalist',
    })
  }
  return [...merged.values()]
}
export function recordLabel(species: Species) {
  return `${species.count.toLocaleString()} ${species.countSource ?? ''}${species.countSource ? ' ' : ''}records`
}
export function recordDetails(species: Species) {
  return species.externalCount
    ? `${species.inatCount ?? 0} iNaturalist records. ${species.externalCount} ${species.externalSource} records. The larger source count is shown. Totals are not added.`
    : 'Reported iNaturalist observations in this area and selected months'
}
