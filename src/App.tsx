import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import {
  ArrowUp,
  Check,
  Circle,
  LocateFixed,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react'
import './App.css'
import { LocationMap, type LatLngPoint, type SearchArea } from './LocationMap'
import {
  type INatGeoJson,
  type INatPlace,
  type INatUser,
  type SpeciesCountBounds,
  fetchPlaceDetails,
  fetchSpeciesCounts,
  getPhotoUrl,
  resolveUser,
  searchPlaces,
} from './inaturalist'

const DEFAULT_USERNAME = 'kylenessen'
const DEFAULT_CENTER = {
  lat: 35.32763176091517,
  lng: -120.83909699047472,
}
const DEFAULT_RADIUS = 1
const DEFAULT_COLUMNS = 3

const MONTH_NAMES = [
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

const TAXON_GROUPS = [
  { key: 'plants', label: 'Plants', taxa: ['Plantae'] },
  { key: 'birds', label: 'Birds', taxa: ['Aves'] },
  { key: 'mammals', label: 'Mammals', taxa: ['Mammalia'] },
  { key: 'reptiles', label: 'Reptiles', taxa: ['Reptilia'] },
  { key: 'amphibians', label: 'Amphibians', taxa: ['Amphibia'] },
  { key: 'insects', label: 'Insects', taxa: ['Insecta'] },
  { key: 'spiders', label: 'Spiders', taxa: ['Arachnida'] },
  { key: 'fish', label: 'Fish', taxa: ['Actinopterygii'] },
  { key: 'fungi', label: 'Fungi', taxa: ['Fungi'] },
  { key: 'mollusks', label: 'Mollusks', taxa: ['Mollusca'] },
  {
    key: 'other',
    label: 'Other',
    taxa: ['Animalia', 'Chromista', 'Protozoa', 'unknown'],
  },
]

const ICONIC_TAXON_TO_GROUP = new Map(
  TAXON_GROUPS.flatMap((group) =>
    group.taxa.map((taxon) => [taxon, group.key] as const),
  ),
)

type SpeciesCard = {
  id: number
  commonName: string
  scientificName: string
  count: number
  nonCasualCount: number
  casualOnly: boolean
  expectedNearby: boolean
  iconicTaxon?: string
  photoUrl?: string
  observedByUser: boolean
}

type Snapshot = {
  builtAt: string
  user: INatUser
  areaLabel: string
  months: number[]
  observedTotal: number
  species: SpeciesCard[]
}

function getSeasonMonths(date = new Date()) {
  const currentMonth = date.getMonth() + 1
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1

  return [previousMonth, currentMonth, nextMonth]
}

function formatMonths(months: number[]) {
  return months.map((month) => MONTH_NAMES[month - 1]).join(', ')
}

function getFallbackLabel(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function getSpeciesGroup(iconicTaxon?: string) {
  return ICONIC_TAXON_TO_GROUP.get(iconicTaxon ?? 'unknown') ?? 'other'
}

function findGeoJsonBounds(geoJson?: INatGeoJson | null) {
  if (!geoJson) {
    return null
  }

  const points: LatLngPoint[] = []

  function collectCoordinates(value: unknown) {
    if (!Array.isArray(value)) {
      return
    }

    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      points.push({ lat: value[1], lng: value[0] })
      return
    }

    value.forEach(collectCoordinates)
  }

  collectCoordinates('coordinates' in geoJson ? geoJson.coordinates : null)

  if (points.length === 0) {
    return null
  }

  return {
    sw: {
      lat: Math.min(...points.map((point) => point.lat)),
      lng: Math.min(...points.map((point) => point.lng)),
    },
    ne: {
      lat: Math.max(...points.map((point) => point.lat)),
      lng: Math.max(...points.map((point) => point.lng)),
    },
  }
}

function boundsToSpeciesCountBounds(bounds: {
  sw: LatLngPoint
  ne: LatLngPoint
}): SpeciesCountBounds {
  return {
    nelat: bounds.ne.lat,
    nelng: bounds.ne.lng,
    swlat: bounds.sw.lat,
    swlng: bounds.sw.lng,
  }
}

function getAreaLabel(area: SearchArea, radiusKm: number) {
  if (area.kind === 'circle') {
    return `${radiusKm} km radius`
  }

  if (area.kind === 'rectangle') {
    return 'Drawn rectangle'
  }

  return area.place.display_name ?? area.place.name
}

function getAreaQuery(area: SearchArea, radiusKm: number) {
  if (area.kind === 'circle') {
    return {
      lat: area.center.lat,
      lng: area.center.lng,
      radius: radiusKm,
    }
  }

  if (area.kind === 'rectangle') {
    return {
      bounds: boundsToSpeciesCountBounds(area.bounds),
    }
  }

  return {
    placeIds: [area.place.id],
  }
}

function getPlaceName(place: INatPlace) {
  return place.display_name ?? place.name
}

function App() {
  const defaultMonths = useMemo(() => getSeasonMonths(), [])
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS))
  const [searchMode, setSearchMode] = useState<'circle' | 'rectangle'>('circle')
  const [searchArea, setSearchArea] = useState<SearchArea>({
    kind: 'circle',
    center: DEFAULT_CENTER,
  })
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<INatPlace[]>([])
  const [placeDropdownOpen, setPlaceDropdownOpen] = useState(false)
  const [placeActiveIndex, setPlaceActiveIndex] = useState(-1)
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [selectedMonths, setSelectedMonths] = useState(
    () => new Set(defaultMonths),
  )
  const [selectedGroups, setSelectedGroups] = useState(
    () => new Set(TAXON_GROUPS.map((group) => group.key)),
  )
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [showHiddenSpecies, setShowHiddenSpecies] = useState(false)
  const [hideCasualOnly, setHideCasualOnly] = useState(false)
  const [hideUnexpected, setHideUnexpected] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [localDone, setLocalDone] = useState(() => new Set<number>())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const didAutoBuild = useRef(false)
  const placeSearchRequestId = useRef(0)

  const radiusKm = Number(radius)
  const selectedMonthsArray = useMemo(
    () => Array.from(selectedMonths).sort((a, b) => a - b),
    [selectedMonths],
  )

  const handleCircleCenterSelected = useCallback((point: LatLngPoint) => {
    setSearchArea({ kind: 'circle', center: point })
  }, [])

  const handleRectangleSelected = useCallback(
    (bounds: { sw: LatLngPoint; ne: LatLngPoint }) => {
      setSearchArea({ kind: 'rectangle', bounds })
    },
    [],
  )

  const buildSnapshot = useCallback(async () => {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      setError('Radius needs to be greater than zero')
      return
    }

    if (selectedMonthsArray.length === 0) {
      setError('Choose at least one month')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const user = await resolveUser(username)
      const areaQuery = getAreaQuery(searchArea, radiusKm)
      const [nearbyCounts, nonCasualCounts, expectedNearbyCounts, observedCounts] =
        await Promise.all([
          fetchSpeciesCounts({
            ...areaQuery,
            months: selectedMonthsArray,
          }),
          fetchSpeciesCounts({
            ...areaQuery,
            months: selectedMonthsArray,
            qualityGrades: ['needs_id', 'research'],
          }),
          fetchSpeciesCounts({
            ...areaQuery,
            months: selectedMonthsArray,
            expectedNearby: true,
          }),
          fetchSpeciesCounts({ userId: user.id }),
        ])

      const nonCasualCountsByTaxon = new Map(
        nonCasualCounts.results.map((result) => [result.taxon.id, result.count]),
      )
      const expectedNearbyTaxa = new Set(
        expectedNearbyCounts.results.map((result) => result.taxon.id),
      )
      const observedTaxa = new Set(
        observedCounts.results.map((result) => result.taxon.id),
      )
      const species = nearbyCounts.results.map((result) => {
        const commonName =
          result.taxon.preferred_common_name ?? result.taxon.name
        const nonCasualCount = nonCasualCountsByTaxon.get(result.taxon.id) ?? 0

        return {
          id: result.taxon.id,
          commonName,
          scientificName: result.taxon.name,
          count: result.count,
          nonCasualCount,
          casualOnly: nonCasualCount === 0,
          expectedNearby: expectedNearbyTaxa.has(result.taxon.id),
          iconicTaxon: result.taxon.iconic_taxon_name,
          photoUrl: getPhotoUrl(result.taxon),
          observedByUser: observedTaxa.has(result.taxon.id),
        }
      })

      setLocalDone(new Set())
      setSnapshot({
        builtAt: new Date().toISOString(),
        user,
        areaLabel: getAreaLabel(searchArea, radiusKm),
        months: selectedMonthsArray,
        observedTotal: observedCounts.totalResults,
        species,
      })
    } catch (snapshotError) {
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : 'Could not build the snapshot',
      )
    } finally {
      setIsLoading(false)
    }
  }, [radiusKm, searchArea, selectedMonthsArray, username])

  useEffect(() => {
    if (didAutoBuild.current) {
      return
    }

    didAutoBuild.current = true
    void buildSnapshot()
  }, [buildSnapshot])

  useEffect(() => {
    const selectedPlaceName =
      searchArea.kind === 'place' ? getPlaceName(searchArea.place) : ''
    const query = placeQuery.trim()

    if (query.length < 2 || query === selectedPlaceName) {
      setPlaceResults([])
      setPlaceDropdownOpen(false)
      setPlaceActiveIndex(-1)
      setIsSearchingPlaces(false)
      return
    }

    const requestId = ++placeSearchRequestId.current
    setIsSearchingPlaces(true)

    const timeoutId = window.setTimeout(() => {
      void searchPlaces(query)
        .then((results) => {
          if (requestId !== placeSearchRequestId.current) {
            return
          }

          setPlaceResults(results)
          setPlaceDropdownOpen(results.length > 0)
          setPlaceActiveIndex(-1)
        })
        .catch(() => {
          if (requestId !== placeSearchRequestId.current) {
            return
          }

          setPlaceResults([])
          setPlaceDropdownOpen(false)
        })
        .finally(() => {
          if (requestId === placeSearchRequestId.current) {
            setIsSearchingPlaces(false)
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [placeQuery, searchArea])

  useEffect(() => {
    const root = document.getElementById('root')

    function updateBackToTop() {
      const rootScrollTop = root?.scrollTop ?? 0
      setShowBackToTop(Math.max(rootScrollTop, window.scrollY) > 700)
    }

    root?.addEventListener('scroll', updateBackToTop, { passive: true })
    window.addEventListener('scroll', updateBackToTop, { passive: true })
    updateBackToTop()

    return () => {
      root?.removeEventListener('scroll', updateBackToTop)
      window.removeEventListener('scroll', updateBackToTop)
    }
  }, [])

  function toggleGroup(groupKey: string) {
    setSelectedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups)

      if (nextGroups.has(groupKey)) {
        nextGroups.delete(groupKey)
      } else {
        nextGroups.add(groupKey)
      }

      return nextGroups
    })
  }

  function toggleMonth(month: number) {
    setSelectedMonths((currentMonths) => {
      const nextMonths = new Set(currentMonths)

      if (nextMonths.has(month)) {
        nextMonths.delete(month)
      } else {
        nextMonths.add(month)
      }

      return nextMonths
    })
  }

  function toggleLocalDone(species: SpeciesCard) {
    if (species.observedByUser) {
      return
    }

    setLocalDone((currentDone) => {
      const nextDone = new Set(currentDone)

      if (nextDone.has(species.id)) {
        nextDone.delete(species.id)
      } else {
        nextDone.add(species.id)
      }

      return nextDone
    })
  }

  async function handlePlaceSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const query = placeQuery.trim()

    if (placeActiveIndex >= 0 && placeResults[placeActiveIndex]) {
      await selectPlace(placeResults[placeActiveIndex])
      return
    }

    setIsSearchingPlaces(true)
    setError(null)

    try {
      if (/^\d+$/.test(query)) {
        await selectPlace(await fetchPlaceDetails(Number(query)))
        return
      }

      const results = await searchPlaces(query)
      setPlaceResults(results)
      setPlaceDropdownOpen(results.length > 0)
      setPlaceActiveIndex(-1)
    } catch (placeError) {
      setError(
        placeError instanceof Error
          ? placeError.message
          : 'Could not search iNaturalist places',
      )
    } finally {
      setIsSearchingPlaces(false)
    }
  }

  function handlePlaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!placeDropdownOpen || placeResults.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setPlaceActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, placeResults.length - 1),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setPlaceActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0))
    } else if (event.key === 'Enter' && placeActiveIndex >= 0) {
      event.preventDefault()
      void selectPlace(placeResults[placeActiveIndex])
    } else if (event.key === 'Escape') {
      setPlaceDropdownOpen(false)
      setPlaceActiveIndex(-1)
    }
  }

  async function selectPlace(place: INatPlace) {
    const requestId = ++placeSearchRequestId.current
    setIsSearchingPlaces(true)
    setError(null)

    try {
      let selectedPlace = place
      let bounds =
        findGeoJsonBounds(selectedPlace.bounding_box_geojson) ??
        findGeoJsonBounds(selectedPlace.geometry_geojson)

      if (!bounds) {
        selectedPlace = await fetchPlaceDetails(place.id)
        bounds =
          findGeoJsonBounds(selectedPlace.bounding_box_geojson) ??
          findGeoJsonBounds(selectedPlace.geometry_geojson)
      }

      if (requestId !== placeSearchRequestId.current) {
        return
      }

      setSearchArea({ kind: 'place', place: selectedPlace, bounds })
      setPlaceQuery(getPlaceName(selectedPlace))
      setPlaceResults([])
      setPlaceDropdownOpen(false)
      setPlaceActiveIndex(-1)
    } catch (placeError) {
      setError(
        placeError instanceof Error
          ? placeError.message
          : 'Could not load the iNaturalist place',
      )
    } finally {
      if (requestId === placeSearchRequestId.current) {
        setIsSearchingPlaces(false)
      }
    }
  }

  function scrollToTop() {
    document.getElementById('root')?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser does not support location lookup')
      return
    }

    setIsLocating(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchMode('circle')
        setSearchArea({
          kind: 'circle',
          center: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        })
        setIsLocating(false)
      },
      () => {
        setError('Could not get your location')
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    )
  }

  const groupFilteredSpecies = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return snapshot.species.filter((species) =>
      selectedGroups.has(getSpeciesGroup(species.iconicTaxon)),
    )
  }, [selectedGroups, snapshot])

  const locallyFilteredSpecies = useMemo(
    () =>
      groupFilteredSpecies.filter(
        (species) =>
          (!hideCasualOnly || !species.casualOnly) &&
          (!hideUnexpected || species.expectedNearby),
      ),
    [groupFilteredSpecies, hideCasualOnly, hideUnexpected],
  )

  const visibleSpecies = useMemo(
    () =>
      locallyFilteredSpecies.filter((species) => {
        const isHidden =
          species.observedByUser || localDone.has(species.id)
        return showHiddenSpecies || !isHidden
      }),
    [localDone, locallyFilteredSpecies, showHiddenSpecies],
  )

  const lifeListCount = locallyFilteredSpecies.filter(
    (species) => species.observedByUser,
  ).length
  const hiddenThisHikeCount = locallyFilteredSpecies.filter((species) =>
    localDone.has(species.id),
  ).length
  const targetCount =
    locallyFilteredSpecies.length - lifeListCount - hiddenThisHikeCount
  const casualHiddenCount =
    hideCasualOnly && snapshot
      ? groupFilteredSpecies.filter((species) => species.casualOnly).length
      : 0
  const unexpectedHiddenCount =
    hideUnexpected && snapshot
      ? groupFilteredSpecies.filter((species) => !species.expectedNearby).length
      : 0
  const builtAt = snapshot
    ? new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(snapshot.builtAt))
    : null

  return (
    <div className="app-shell">
      <header className="settings">
        <div className="settings-panel">
          <div className="settings-heading">
            <div>
              <p className="eyebrow">Nearby Lifers</p>
              <h1>Snapshot builder</h1>
            </div>
          </div>

          <div className="control-grid">
            <label>
              iNaturalist user
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="radius-control">
              <span>Radius {Number.isFinite(radiusKm) ? radiusKm.toFixed(1) : '1.0'} km</span>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={radius}
                disabled={searchArea.kind !== 'circle'}
                onChange={(event) => setRadius(event.target.value)}
              />
            </label>
          </div>

          <div className="location-panel">
            <div className="map-toolbar">
              <button
                type="button"
                className="location-button"
                onClick={useMyLocation}
                disabled={isLocating}
              >
                {isLocating ? (
                  <LoaderCircle size={18} aria-hidden="true" />
                ) : (
                  <LocateFixed size={18} aria-hidden="true" />
                )}
                Use my location
              </button>
              <div className="segmented-control">
                <button
                  type="button"
                  className={searchMode === 'circle' ? 'is-selected' : ''}
                  onClick={() => setSearchMode('circle')}
                >
                  Point
                </button>
                <button
                  type="button"
                  className={searchMode === 'rectangle' ? 'is-selected' : ''}
                  onClick={() => setSearchMode('rectangle')}
                >
                  Rectangle
                </button>
              </div>
            </div>

            <LocationMap
              area={searchArea}
              mode={searchMode}
              radiusKm={Number.isFinite(radiusKm) ? radiusKm : DEFAULT_RADIUS}
              onCircleCenterSelected={handleCircleCenterSelected}
              onRectangleSelected={handleRectangleSelected}
            />

            <form className="place-search" onSubmit={handlePlaceSearch}>
              <div className="place-search-field">
                <label>
                  iNaturalist place
                  <div className="input-action">
                    <input
                      value={placeQuery}
                      onBlur={() => {
                        window.setTimeout(() => setPlaceDropdownOpen(false), 150)
                      }}
                      onChange={(event) => {
                        setPlaceQuery(event.target.value)
                        setPlaceDropdownOpen(true)
                      }}
                      onFocus={() => {
                        if (placeResults.length > 0) {
                          setPlaceDropdownOpen(true)
                        }
                      }}
                      onKeyDown={handlePlaceKeyDown}
                      placeholder="Search places"
                    />
                    <button type="submit" disabled={isSearchingPlaces}>
                      {isSearchingPlaces ? (
                        <LoaderCircle size={16} aria-hidden="true" />
                      ) : (
                        <Search size={16} aria-hidden="true" />
                      )}
                      Search
                    </button>
                  </div>
                </label>

                {placeDropdownOpen && placeResults.length > 0 ? (
                  <ul className="place-dropdown">
                    {placeResults.map((place, index) => (
                      <li
                        className={placeActiveIndex === index ? 'is-active' : ''}
                        key={place.id}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          void selectPlace(place)
                        }}
                      >
                        <MapPin size={15} aria-hidden="true" />
                        <span>{getPlaceName(place)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </form>
          </div>

          <div className="filter-section">
            <p className="control-label">Months</p>
            <div className="chip-group month-grid" aria-label="Months">
              {MONTH_NAMES.map((month, index) => {
                const monthNumber = index + 1

                return (
                  <button
                    type="button"
                    key={month}
                    aria-pressed={selectedMonths.has(monthNumber)}
                    className={
                      selectedMonths.has(monthNumber) ? 'is-selected' : ''
                    }
                    onClick={() => toggleMonth(monthNumber)}
                  >
                    {month}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="filter-section">
            <p className="control-label">Life groups</p>
            <div className="chip-group" aria-label="Life groups">
              {TAXON_GROUPS.map((group) => (
                <button
                  type="button"
                  key={group.key}
                  aria-pressed={selectedGroups.has(group.key)}
                  className={selectedGroups.has(group.key) ? 'is-selected' : ''}
                  onClick={() => toggleGroup(group.key)}
                >
                  {group.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-footer">
            <label className="column-control">
              Grid columns
              <input
                type="range"
                min="2"
                max="5"
                value={columns}
                onChange={(event) => setColumns(Number(event.target.value))}
              />
              <span>{columns}</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={showHiddenSpecies}
                onChange={(event) => setShowHiddenSpecies(event.target.checked)}
              />
              <span>Show hidden species</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={hideCasualOnly}
                onChange={(event) => setHideCasualOnly(event.target.checked)}
              />
              <span>Hide casual-only</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={hideUnexpected}
                onChange={(event) => setHideUnexpected(event.target.checked)}
              />
              <span>Hide unexpected</span>
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={buildSnapshot}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoaderCircle size={17} aria-hidden="true" />
              ) : (
                <RefreshCw size={17} aria-hidden="true" />
              )}
              Build snapshot
            </button>
          </div>
        </div>
      </header>

      <main>
        {snapshot ? (
          <section className="snapshot-summary" aria-live="polite">
            <strong>{targetCount} targets</strong>
            <span>{lifeListCount} in life list</span>
            {hiddenThisHikeCount > 0 ? (
              <span>{hiddenThisHikeCount} hidden this hike</span>
            ) : null}
            <span>{snapshot.observedTotal} profile taxa</span>
            <span>{formatMonths(snapshot.months)}</span>
            <span>{snapshot.areaLabel}</span>
            {casualHiddenCount > 0 ? (
              <span>{casualHiddenCount} casual-only hidden</span>
            ) : null}
            {unexpectedHiddenCount > 0 ? (
              <span>{unexpectedHiddenCount} unexpected hidden</span>
            ) : null}
            {builtAt ? <span>Built {builtAt}</span> : null}
          </section>
        ) : null}

        {error ? <div className="message error">{error}</div> : null}

        {isLoading && !snapshot ? (
          <div className="message loading">
            <LoaderCircle size={20} aria-hidden="true" />
            Building the nearby species snapshot
          </div>
        ) : null}

        {snapshot && visibleSpecies.length === 0 ? (
          <div className="message">
            No species match the current local filters.
          </div>
        ) : null}

        {snapshot ? (
          <section
            className="species-grid"
            style={{ '--grid-columns': columns } as CSSProperties}
            aria-label="Nearby species"
          >
            {visibleSpecies.map((species) => {
              const isHidden =
                species.observedByUser || localDone.has(species.id)
              const doneLabel = species.observedByUser
                ? 'Already on your iNaturalist list'
                : isHidden
                  ? 'Restore to this hike'
                  : 'Hide for this hike'

              return (
                <article
                  className={`species-card ${isHidden ? 'is-done' : ''}`}
                  key={species.id}
                >
                  <div className="photo-frame">
                    {species.photoUrl ? (
                      <img
                        src={species.photoUrl}
                        alt={species.commonName}
                        loading="lazy"
                      />
                    ) : (
                      <div className="photo-fallback">
                        {getFallbackLabel(species.commonName)}
                      </div>
                    )}
                    <button
                      type="button"
                      className="done-button"
                      aria-label={doneLabel}
                      title={doneLabel}
                      onClick={() => toggleLocalDone(species)}
                    >
                      {isHidden ? (
                        <Check size={17} aria-hidden="true" />
                      ) : (
                        <Circle size={18} aria-hidden="true" />
                      )}
                    </button>
                    <span className="count-pill">{species.count}</span>
                    <div className="badge-stack">
                      {species.count < 5 ? (
                        <span className="few-pill">Few</span>
                      ) : null}
                      {species.casualOnly ? (
                        <span className="casual-pill">Casual</span>
                      ) : null}
                      {!species.expectedNearby ? (
                        <span className="unexpected-pill">Range?</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="species-copy">
                    <h2>
                      <a
                        href={`https://www.inaturalist.org/taxa/${species.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {species.commonName}
                      </a>
                    </h2>
                    <p>{species.scientificName}</p>
                  </div>
                </article>
              )
            })}
          </section>
        ) : null}
      </main>

      {showBackToTop ? (
        <button
          type="button"
          className="back-to-top"
          aria-label="Back to top"
          title="Back to top"
          onClick={scrollToTop}
        >
          <ArrowUp size={19} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export default App
