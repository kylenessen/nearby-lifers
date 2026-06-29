import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import './App.css'
import {
  type INatUser,
  fetchSpeciesCounts,
  getPhotoUrl,
  resolveUser,
} from './inaturalist'

const DEFAULT_USERNAME = 'kylenessen'
const DEFAULT_LAT = 35.32763176091517
const DEFAULT_LNG = -120.83909699047472
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
  { key: 'other', label: 'Other', taxa: ['Animalia', 'Chromista', 'Protozoa'] },
]

type SpeciesCard = {
  id: number
  commonName: string
  scientificName: string
  count: number
  iconicTaxon?: string
  photoUrl?: string
  observedByUser: boolean
}

type Snapshot = {
  builtAt: string
  user: INatUser
  lat: number
  lng: number
  radius: number
  months?: number[]
  groups: string[]
  observedTotal: number
  species: SpeciesCard[]
}

function getSeasonMonths(date = new Date()) {
  const currentMonth = date.getMonth() + 1
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1

  return [previousMonth, currentMonth, nextMonth]
}

function formatMonths(months?: number[]) {
  if (!months) {
    return 'All months'
  }

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

function App() {
  const defaultMonths = useMemo(() => getSeasonMonths(), [])
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [lat, setLat] = useState(String(DEFAULT_LAT))
  const [lng, setLng] = useState(String(DEFAULT_LNG))
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS))
  const [useSeasonWindow, setUseSeasonWindow] = useState(true)
  const [selectedGroups, setSelectedGroups] = useState(
    () => new Set(TAXON_GROUPS.map((group) => group.key)),
  )
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [showDone, setShowDone] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [localDone, setLocalDone] = useState(() => new Set<number>())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const didAutoBuild = useRef(false)

  const selectedGroupLabels = useMemo(
    () =>
      TAXON_GROUPS.filter((group) => selectedGroups.has(group.key)).map(
        (group) => group.label,
      ),
    [selectedGroups],
  )

  const selectedIconicTaxa = useMemo(
    () =>
      selectedGroups.size === TAXON_GROUPS.length
        ? undefined
        : TAXON_GROUPS.filter((group) => selectedGroups.has(group.key)).flatMap(
            (group) => group.taxa,
          ),
    [selectedGroups],
  )

  const selectedMonths = useMemo(
    () => (useSeasonWindow ? defaultMonths : undefined),
    [defaultMonths, useSeasonWindow],
  )

  const buildSnapshot = useCallback(async () => {
    const numericLat = Number(lat)
    const numericLng = Number(lng)
    const numericRadius = Number(radius)

    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
      setError('Latitude and longitude need to be valid numbers')
      return
    }

    if (!Number.isFinite(numericRadius) || numericRadius <= 0) {
      setError('Radius needs to be greater than zero')
      return
    }

    if (selectedGroups.size === 0) {
      setError('Choose at least one life group')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const user = await resolveUser(username)
      const [nearbyCounts, observedCounts] = await Promise.all([
        fetchSpeciesCounts({
          lat: numericLat,
          lng: numericLng,
          radius: numericRadius,
          months: selectedMonths,
          iconicTaxa: selectedIconicTaxa,
        }),
        fetchSpeciesCounts({ userId: user.id }),
      ])

      const observedTaxa = new Set(
        observedCounts.results.map((result) => result.taxon.id),
      )
      const species = nearbyCounts.results.map((result) => {
        const commonName =
          result.taxon.preferred_common_name ?? result.taxon.name

        return {
          id: result.taxon.id,
          commonName,
          scientificName: result.taxon.name,
          count: result.count,
          iconicTaxon: result.taxon.iconic_taxon_name,
          photoUrl: getPhotoUrl(result.taxon),
          observedByUser: observedTaxa.has(result.taxon.id),
        }
      })

      setLocalDone(new Set())
      setSnapshot({
        builtAt: new Date().toISOString(),
        user,
        lat: numericLat,
        lng: numericLng,
        radius: numericRadius,
        months: selectedMonths,
        groups: selectedGroupLabels,
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
  }, [
    lat,
    lng,
    radius,
    selectedGroups.size,
    selectedGroupLabels,
    selectedIconicTaxa,
    selectedMonths,
    username,
  ])

  useEffect(() => {
    if (didAutoBuild.current) {
      return
    }

    didAutoBuild.current = true
    void buildSnapshot()
  }, [buildSnapshot])

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

  const visibleSpecies = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return snapshot.species.filter((species) => {
      const isDone = species.observedByUser || localDone.has(species.id)
      return showDone || !isDone
    })
  }, [localDone, showDone, snapshot])

  const doneCount =
    snapshot?.species.filter(
      (species) => species.observedByUser || localDone.has(species.id),
    ).length ?? 0
  const targetCount = snapshot ? snapshot.species.length - doneCount : 0
  const builtAt = snapshot
    ? new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(snapshot.builtAt))
    : null

  return (
    <div className="app-shell">
      <header className={`settings ${settingsOpen ? 'is-open' : ''}`}>
        {settingsOpen ? (
          <div className="settings-panel">
            <div className="settings-heading">
              <div>
                <p className="eyebrow">Nearby Lifers</p>
                <h1>Snapshot builder</h1>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Collapse settings"
                title="Collapse settings"
                onClick={() => setSettingsOpen(false)}
              >
                <ChevronUp size={20} aria-hidden="true" />
              </button>
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
              <label>
                Radius km
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={radius}
                  onChange={(event) => setRadius(event.target.value)}
                />
              </label>
              <label>
                Latitude
                <input
                  type="number"
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  value={lng}
                  onChange={(event) => setLng(event.target.value)}
                />
              </label>
            </div>

            <div className="toggle-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={useSeasonWindow}
                  onChange={(event) => setUseSeasonWindow(event.target.checked)}
                />
                <span>Season window</span>
              </label>
              <span className="soft-text">{formatMonths(selectedMonths)}</span>
            </div>

            <div className="chip-group" aria-label="Life groups">
              {TAXON_GROUPS.map((group) => (
                <button
                  type="button"
                  key={group.key}
                  className={selectedGroups.has(group.key) ? 'is-selected' : ''}
                  onClick={() => toggleGroup(group.key)}
                >
                  {group.label}
                </button>
              ))}
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
                  checked={showDone}
                  onChange={(event) => setShowDone(event.target.checked)}
                />
                <span>Show done</span>
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
        ) : (
          <button
            type="button"
            className="collapsed-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <ChevronDown size={18} aria-hidden="true" />
            <SlidersHorizontal size={17} aria-hidden="true" />
            <span>Settings</span>
            {snapshot ? <strong>{targetCount} targets</strong> : null}
          </button>
        )}
      </header>

      <main>
        {snapshot ? (
          <section className="snapshot-summary" aria-live="polite">
            <strong>{targetCount} targets</strong>
            <span>{doneCount} done</span>
            <span>{snapshot.observedTotal} profile taxa</span>
            <span>{formatMonths(snapshot.months)}</span>
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
            Every nearby species in this snapshot is marked done.
          </div>
        ) : null}

        {snapshot ? (
          <section
            className="species-grid"
            style={{ '--grid-columns': columns } as React.CSSProperties}
            aria-label="Nearby species"
          >
            {visibleSpecies.map((species) => {
              const isDone =
                species.observedByUser || localDone.has(species.id)
              const doneLabel = species.observedByUser
                ? 'Already on your iNaturalist list'
                : isDone
                  ? 'Marked done for this hike'
                  : 'Mark done for this hike'

              return (
                <article
                  className={`species-card ${isDone ? 'is-done' : ''}`}
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
                      {isDone ? (
                        <Check size={17} aria-hidden="true" />
                      ) : (
                        <Circle size={18} aria-hidden="true" />
                      )}
                    </button>
                    <span className="count-pill">{species.count}</span>
                    {species.count < 5 ? (
                      <span className="few-pill">Few</span>
                    ) : null}
                  </div>
                  <div className="species-copy">
                    <h2>{species.commonName}</h2>
                    <p>{species.scientificName}</p>
                  </div>
                </article>
              )
            })}
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
