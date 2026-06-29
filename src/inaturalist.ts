const API_ROOT = 'https://api.inaturalist.org/v1'

type QueryValue = string | number | boolean | Array<string | number> | undefined

type INatListResponse<T> = {
  total_results: number
  page: number
  per_page: number
  results: T[]
}

export type INatUser = {
  id: number
  login: string
  name?: string
  species_count?: number
}

export type INatPhoto = {
  attribution?: string
  medium_url?: string
  square_url?: string
  url?: string
}

export type INatTaxon = {
  id: number
  name: string
  preferred_common_name?: string
  iconic_taxon_name?: string
  default_photo?: INatPhoto | null
}

export type SpeciesCountResult = {
  count: number
  taxon: INatTaxon
}

export type SpeciesCountQuery = {
  lat?: number
  lng?: number
  radius?: number
  months?: number[]
  iconicTaxa?: string[]
  userId?: number
  qualityGrades?: string[]
  expectedNearby?: boolean
}

function addParam(params: URLSearchParams, key: string, value: QueryValue) {
  if (value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      params.set(key, value.join(','))
    }
    return
  }

  params.set(key, String(value))
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`iNaturalist returned ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function resolveUser(login: string): Promise<INatUser> {
  const trimmedLogin = login.trim()

  if (!trimmedLogin) {
    throw new Error('Enter an iNaturalist username')
  }

  const data = await fetchJson<INatListResponse<INatUser>>(
    `${API_ROOT}/users/${encodeURIComponent(trimmedLogin)}`,
  )
  const user = data.results[0]

  if (!user) {
    throw new Error(`No iNaturalist user found for ${trimmedLogin}`)
  }

  return user
}

export async function fetchSpeciesCounts(query: SpeciesCountQuery) {
  const perPage = 500
  const results: SpeciesCountResult[] = []
  let page = 1
  let totalResults = 0
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams()
    addParam(params, 'page', page)
    addParam(params, 'per_page', perPage)
    addParam(params, 'lat', query.lat)
    addParam(params, 'lng', query.lng)
    addParam(params, 'radius', query.radius)
    addParam(params, 'month', query.months)
    addParam(params, 'iconic_taxa', query.iconicTaxa)
    addParam(params, 'user_id', query.userId)
    addParam(params, 'quality_grade', query.qualityGrades)
    addParam(params, 'expected_nearby', query.expectedNearby)

    const data = await fetchJson<INatListResponse<SpeciesCountResult>>(
      `${API_ROOT}/observations/species_counts?${params.toString()}`,
    )

    totalResults = data.total_results
    totalPages = Math.max(1, Math.ceil(data.total_results / perPage))
    results.push(...data.results)
    page += 1
  }

  return { results, totalResults }
}

export function getPhotoUrl(taxon: INatTaxon) {
  return (
    taxon.default_photo?.medium_url ??
    taxon.default_photo?.square_url ??
    taxon.default_photo?.url
  )
}
