import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ExternalLink,
  Leaf,
  Link as LinkIcon,
  LocateFixed,
  LoaderCircle,
  Printer,
  Search as SearchIcon,
} from 'lucide-react'
import './App.css'
import { LocationMap } from './LocationMap'
import { PrintPreview } from './PrintPreview'
import {
  areaLabel,
  decodeSettings,
  defaults,
  encodeSettings,
  GROUPS,
  groupFor,
  MONTHS,
  PAPERS,
  searchKey,
  userNames,
  validateSearch,
} from './search'
import type { Area, Settings, View } from './search'
import { buildSnapshot, fetchPlaceDetails, searchPlaces } from './inaturalist'
import type { INatPlace, Snapshot, Species } from './inaturalist'

function initialSettings() {
  try {
    return { settings: decodeSettings(window.location.search), error: null }
  } catch (error) {
    return {
      settings: defaults(),
      error:
        error instanceof Error
          ? error.message
          : 'This search link could not be read.',
    }
  }
}
function writeUrl(settings: Settings, push = false) {
  const url = `${window.location.pathname}?${encodeSettings(settings)}${window.location.hash}`
  if (
    url ===
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  )
    return
  window.history[push ? 'pushState' : 'replaceState'](null, '', url)
}
function sortedSpecies(species: Species[]) {
  return GROUPS.map((group) => ({
    group,
    species: species
      .filter((s) => groupFor(s.iconicTaxon).key === group.key)
      .sort((a, b) => a.commonName.localeCompare(b.commonName)),
  })).filter((g) => g.species.length)
}
export default function App() {
  const [initial] = useState(initialSettings)
  const [builderOpen, setBuilderOpen] = useState(
    () =>
      Boolean(initial.error) ||
      !window.location.search ||
      !window.matchMedia('(max-width: 760px)').matches,
  )
  const [settings, setSettings] = useState(initial.settings)
  const [draft, setDraft] = useState(initial.settings.search)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(initial.error)
  const [canLoad, setCanLoad] = useState(!initial.error)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('Loading your search.')
  const [retry, setRetry] = useState(0)
  const [place, setPlace] = useState<INatPlace | null>(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [places, setPlaces] = useState<INatPlace[]>([])
  const [placeBusy, setPlaceBusy] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [mapVersion, setMapVersion] = useState(0)
  const [preview, setPreview] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printMessage, setPrintMessage] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const initialUrlWritten = useRef(false)
  const loadKey = searchKey(settings.search)
  const pending = searchKey(draft) !== loadKey || drawing
  const { view } = settings

  useEffect(() => {
    if (initialUrlWritten.current || !canLoad) return
    writeUrl(settings)
    initialUrlWritten.current = true
  }, [settings, canLoad])

  useEffect(() => {
    function restore() {
      requestRef.current?.abort()
      try {
        const restored = decodeSettings(window.location.search)
        setSettings(restored)
        setDraft(restored.search)
        setCanLoad(true)
        setError(null)
        setPlaceQuery('')
        setDrawing(false)
        setMapVersion((v) => v + 1)
        setCopyMessage('')
      } catch (cause) {
        setCanLoad(false)
        setSnapshot(null)
        setLoading(false)
        setError(
          cause instanceof Error ? cause.message : 'Invalid search link.',
        )
      }
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => {
    if (!canLoad) return
    const controller = new AbortController()
    requestRef.current = controller
    const search = settings.search
    setLoading(true)
    setError(null)
    setSnapshot(null)
    setPreview(false)
    void (async () => {
      let label = areaLabel(search.area, search.radius)
      if (search.area.kind === 'place') {
        const loaded = await fetchPlaceDetails(
          search.area.id,
          controller.signal,
        )
        label = loaded.display_name ?? loaded.name
      }
      const result = await buildSnapshot(
        search,
        label,
        controller.signal,
        setProgress,
      )
      if (!controller.signal.aborted) setSnapshot(result)
    })()
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'The search could not finish. Please try again.',
          )
          controller.abort()
        }
      })
      .finally(() => {
        if (requestRef.current === controller) setLoading(false)
      })
    return () => controller.abort()
    // View options never refetch observations. The canonical key includes every search input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey, retry, canLoad])

  const placeId = draft.area.kind === 'place' ? draft.area.id : null
  useEffect(() => {
    if (!placeId) {
      setPlace(null)
      return
    }
    const controller = new AbortController()
    void fetchPlaceDetails(placeId, controller.signal)
      .then(setPlace)
      .catch((cause) => {
        if (!controller.signal.aborted) setPlaceError(cause.message)
      })
    return () => controller.abort()
  }, [placeId])

  useEffect(() => {
    if (placeQuery.trim().length < 2) {
      setPlaces([])
      setPlaceBusy(false)
      return
    }
    const controller = new AbortController()
    setPlaceBusy(true)
    const timer = window.setTimeout(() => {
      const query = placeQuery.trim()
      const result = /^\d+$/.test(query)
        ? fetchPlaceDetails(Number(query), controller.signal).then((p) => [p])
        : searchPlaces(query, controller.signal)
      void result
        .then((p) => {
          setPlaces(p)
          setPlaceError(
            p.length
              ? null
              : 'No places found. Try a different name or place ID.',
          )
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setPlaceError(cause.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setPlaceBusy(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [placeQuery])

  const onAreaChange = useCallback((area: Area) => {
    setDraft((s) => ({ ...s, area }))
    setPlaceQuery('')
    setPlaceError(null)
  }, [])
  function updateView(patch: Partial<View>) {
    const next = { ...settings, view: { ...view, ...patch } }
    setSettings(next)
    if (canLoad) writeUrl(next)
    setCopyMessage('')
  }
  function submitSearch() {
    const message = validateSearch(draft)
    if (message) {
      setError(message)
      return
    }
    const search = { ...draft, users: userNames(draft.users).join(',') }
    const next = { search, view }
    writeUrl(next, true)
    setSettings(next)
    setDraft(search)
    setCanLoad(true)
    setError(null)
    setCopyMessage('')
    if (window.matchMedia('(max-width: 760px)').matches) {
      setBuilderOpen(false)
      requestAnimationFrame(() =>
        document.getElementById('results')?.scrollIntoView({ block: 'start' }),
      )
    }
    if (searchKey(search) === loadKey) setRetry((v) => v + 1)
  }
  function toggle(field: 'groups' | 'months', value: string | number) {
    setDraft((current) => {
      const values = current[field] as (string | number)[]
      return {
        ...current,
        [field]: values.includes(value)
          ? values.filter((v) => v !== value)
          : [...values, value],
      }
    })
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyMessage('Link copied. Ready to share or bookmark.')
    } catch {
      setCopyMessage('Copy the address from your browser to share this search.')
    }
  }
  function useLocation() {
    if (!navigator.geolocation) {
      setError(
        'Location lookup is not available in this browser. Select an area on the map.',
      )
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onAreaChange({
          kind: 'circle',
          center: {
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
          },
        })
        setDrawing(false)
        setMapVersion((v) => v + 1)
        setLocating(false)
      },
      () => {
        setError('Location lookup was unavailable. Select an area on the map.')
        setLocating(false)
      },
      { timeout: 10000 },
    )
  }

  const visible = useMemo(
    () =>
      snapshot?.species.filter(
        (s) =>
          (!view.hideCasual || !s.casualOnly) &&
          (!view.hideUnexpected || s.expectedNearby) &&
          (view.showObserved || !s.observedByUser),
      ) ?? [],
    [snapshot, view.hideCasual, view.hideUnexpected, view.showObserved],
  )
  const groups = useMemo(() => sortedSpecies(visible), [visible])
  const found = snapshot?.species.filter((s) => s.observedByUser).length ?? 0
  const targetCount = visible.filter((s) => !s.observedByUser).length
  const selectedAreaLabel =
    draft.area.kind === 'place' && place?.id === draft.area.id
      ? (place.display_name ?? place.name)
      : areaLabel(draft.area, draft.radius)

  async function print() {
    setPreview(true)
    setPrinting(true)
    setPrintMessage('Preparing photos for print.')
    // Wait for React to show the preview before asking the browser to print it.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
    await document.fonts.ready
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>('.print-output img'),
    )
    const loaded = await Promise.all(
      images.map(
        (img) =>
          new Promise<boolean>((resolve) => {
            img.loading = 'eager'
            if (img.complete) {
              resolve(img.naturalWidth > 0)
              return
            }
            const done = () => {
              clearTimeout(timeout)
              img.removeEventListener('load', done)
              img.removeEventListener('error', done)
              resolve(img.naturalWidth > 0)
            }
            const timeout = window.setTimeout(done, 15000)
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          }),
      ),
    )
    setPrintMessage(
      loaded.some((v) => !v)
        ? 'Some photos could not load. Their names will still print.'
        : '',
    )
    setPrinting(false)
    window.print()
  }

  return (
    <>
      <div className="app-shell screen-only">
        <header className="site-header">
          <a className="wordmark" href={window.location.pathname}>
            <Leaf size={22} />
            Nearby Lifers
          </a>
          <a
            className="source-link"
            href="https://www.inaturalist.org"
            target="_blank"
            rel="noreferrer"
          >
            Powered by iNaturalist <ExternalLink size={13} />
          </a>
        </header>
        <section className="intro">
          <p className="eyebrow">A little direction for your next outing</p>
          <h1>What’s still out there?</h1>
          <p>
            Find species reported nearby that you haven’t observed yet. Save a
            search as a link, or take a checklist into the field.
          </p>
        </section>
        <div className="workspace">
          <section className="search-panel" aria-labelledby="search-title">
            <div className="section-heading">
              <h2 id="search-title">
                {builderOpen ? 'Build your search' : 'Your saved search'}
              </h2>
              <button
                type="button"
                className="text-button"
                aria-expanded={builderOpen}
                aria-controls="search-form"
                disabled={drawing}
                onClick={() => setBuilderOpen((open) => !open)}
              >
                {builderOpen ? 'Hide controls' : 'Edit search'}
              </button>
            </div>
            {!builderOpen && (
              <p className="collapsed-summary">
                {draft.users} · {selectedAreaLabel}
              </p>
            )}
            {builderOpen && (
              <form
                id="search-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!drawing) submitSearch()
                }}
              >
                <label htmlFor="users">iNaturalist usernames</label>
                <input
                  id="users"
                  value={draft.users}
                  onChange={(event) =>
                    setDraft((s) => ({ ...s, users: event.target.value }))
                  }
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  required
                />
                <p className="hint">
                  Separate users with commas. Species observed by any listed
                  user count as already seen.
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.excludeUserCasual}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        excludeUserCasual: e.target.checked,
                      }))
                    }
                  />
                  Exclude users’ casual observations
                </label>
                <p className="hint">
                  Research Grade and Needs ID always count. Casual observations
                  count unless excluded. Life lists use all dates and locations.
                </p>
                <div className="field-section">
                  <div className="label-row">
                    <label htmlFor="place-search">Search area</label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={useLocation}
                      disabled={locating}
                    >
                      {locating ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <LocateFixed size={14} />
                      )}
                      Use my location
                    </button>
                  </div>
                  <div className="place-search">
                    <SearchIcon size={17} />
                    <input
                      id="place-search"
                      placeholder="Find an iNaturalist place or enter its ID"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      autoComplete="off"
                      aria-controls="place-results"
                      aria-expanded={places.length > 0}
                    />
                    {placeBusy && <LoaderCircle size={15} className="spin" />}
                  </div>
                  {places.length > 0 && (
                    <ul className="place-results" id="place-results">
                      {places.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onAreaChange({ kind: 'place', id: p.id })
                              setPlace(p)
                              setPlaces([])
                              setMapVersion((v) => v + 1)
                              setDrawing(false)
                            }}
                          >
                            {p.display_name ?? p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {placeError && (
                    <p className="error-text" role="status">
                      {placeError}
                    </p>
                  )}
                  <LocationMap
                    key={mapVersion}
                    area={draft.area}
                    radius={Math.min(100, Math.max(0.1, draft.radius))}
                    place={place}
                    onChange={onAreaChange}
                    onDrawingChange={setDrawing}
                  />
                  <p className="area-label">{selectedAreaLabel}</p>
                  {draft.area.kind === 'circle' && (
                    <label className="radius-field">
                      Radius in km
                      <input
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={draft.radius}
                        onChange={(e) =>
                          setDraft((s) => ({
                            ...s,
                            radius: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  )}
                  {draft.area.kind === 'polygon' && (
                    <p className="hint">
                      Uses public observation coordinates inside your shape.
                      Obscured locations may be imprecise. Large areas may need
                      fewer months or life groups.
                    </p>
                  )}
                </div>
                <fieldset>
                  <legend>Months observed</legend>
                  <div className="label-row">
                    <span className="hint">Across all years</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setDraft((s) => ({
                          ...s,
                          months: Array.from({ length: 12 }, (_, i) => i + 1),
                        }))
                      }
                    >
                      All year
                    </button>
                  </div>
                  <div className="chips months">
                    {MONTHS.map((m, i) => (
                      <button
                        type="button"
                        key={m}
                        aria-pressed={draft.months.includes(i + 1)}
                        onClick={() => toggle('months', i + 1)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Life groups</legend>
                  <div className="label-row">
                    <span className="hint">Choose what you want to find</span>
                    <div>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setDraft((s) => ({
                            ...s,
                            groups: GROUPS.map((g) => g.key),
                          }))
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setDraft((s) => ({ ...s, groups: [] }))}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="chips">
                    {GROUPS.map((g) => (
                      <button
                        type="button"
                        key={g.key}
                        aria-pressed={draft.groups.includes(g.key)}
                        onClick={() => toggle('groups', g.key)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button
                  className="primary search-button"
                  type="submit"
                  disabled={drawing}
                >
                  {loading ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <SearchIcon size={18} />
                  )}
                  {loading ? 'Restart search' : 'Find nearby lifers'}
                </button>
                <p className="hint bookmark-hint">
                  Run your search to update the URL. Bookmark it or add it to
                  your home screen to return to the same settings. Results
                  refresh when you open it.
                </p>
              </form>
            )}
          </section>
          <main className="results-panel" id="results">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Your field list</p>
                <h2>
                  {snapshot
                    ? `${targetCount.toLocaleString()} potential lifers`
                    : 'Let’s see what’s nearby'}
                </h2>
              </div>
              <span className="step-label">02</span>
            </div>
            <div className="result-actions">
              <button
                type="button"
                disabled={pending || !canLoad}
                onClick={copyLink}
              >
                <LinkIcon size={16} />
                Copy search link
              </button>
              <button
                type="button"
                disabled={!snapshot || !visible.length || pending}
                onClick={() => setPreview((v) => !v)}
              >
                <Printer size={16} />
                {preview ? 'Close print preview' : 'Print options'}
              </button>
            </div>
            {copyMessage && (
              <p className="hint" role="status">
                {copyMessage}
              </p>
            )}
            {pending && (
              <div className="notice">
                {drawing
                  ? 'Finish or cancel your drawing before searching.'
                  : 'Search settings have changed. Run the search to update your results and shareable link.'}
              </div>
            )}
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            {loading && (
              <div className="loading" role="status">
                <LoaderCircle size={22} className="spin" />
                <span>{progress}</span>
                <button
                  type="button"
                  onClick={() => {
                    requestRef.current?.abort()
                    setLoading(false)
                    setError(
                      'Search canceled. Run it again when you are ready.',
                    )
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            {snapshot && (
              <>
                <p className="result-context">
                  {snapshot.areaLabel} ·{' '}
                  {snapshot.search.months
                    .slice()
                    .sort((a, b) => a - b)
                    .map((m) => MONTHS[m - 1])
                    .join(', ')}
                </p>
                <p className="hint">
                  {found.toLocaleString()} nearby species already observed.
                  Compared with {snapshot.observedTotal.toLocaleString()}{' '}
                  species across {snapshot.users.map((u) => u.login).join(', ')}
                  . Identifications must be at species level or below.
                </p>
                <div className="result-filters">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={view.hideCasual}
                      onChange={(e) =>
                        updateView({ hideCasual: e.target.checked })
                      }
                    />
                    Hide nearby casual-only species
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={view.hideUnexpected}
                      onChange={(e) =>
                        updateView({ hideUnexpected: e.target.checked })
                      }
                    />
                    Only species marked expected nearby
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={view.showObserved}
                      onChange={(e) =>
                        updateView({ showObserved: e.target.checked })
                      }
                    />
                    Include already observed species
                  </label>
                </div>
                <div className="view-toolbar">
                  <span className="hint">{visible.length} species shown</span>
                  <div className="segmented" aria-label="List format">
                    <button
                      type="button"
                      aria-pressed={view.layout === 'grid'}
                      onClick={() => updateView({ layout: 'grid' })}
                    >
                      Photo grid
                    </button>
                    <button
                      type="button"
                      aria-pressed={view.layout === 'list'}
                      onClick={() => updateView({ layout: 'list' })}
                    >
                      Taxon checklist
                    </button>
                  </div>
                </div>
                {preview && (
                  <section
                    className="print-controls"
                    aria-label="Print settings"
                  >
                    <h3>Make it a field sheet</h3>
                    <div className="print-options">
                      <label>
                        Paper size
                        <select
                          value={view.paper}
                          onChange={(e) =>
                            updateView({
                              paper: e.target.value as View['paper'],
                            })
                          }
                        >
                          {Object.entries(PAPERS).map(([key, paper]) => (
                            <option key={key} value={key}>
                              {paper.label} · {paper.dimensions}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Density
                        <select
                          value={view.density}
                          onChange={(e) =>
                            updateView({
                              density: e.target.value as View['density'],
                            })
                          }
                        >
                          <option value="comfortable">Comfortable</option>
                          <option value="compact">Compact</option>
                          <option value="large">Large</option>
                        </select>
                      </label>
                    </div>
                    <p className="hint">
                      The preview below uses your visible species and selected
                      format. Match the paper size in your print dialog, use
                      100% scale, and turn off browser headers and footers.
                    </p>
                    <button
                      type="button"
                      className="primary"
                      onClick={print}
                      disabled={printing || pending || !visible.length}
                    >
                      {printing ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Printer size={16} />
                      )}
                      Print or save PDF
                    </button>
                    {printMessage && (
                      <p className="hint" role="status">
                        {printMessage}
                      </p>
                    )}
                  </section>
                )}
                {!visible.length && (
                  <div className="empty-state">
                    <Leaf size={28} />
                    <h3>No species match this search.</h3>
                    <p>
                      Try more life groups, a different area, or fewer display
                      filters.
                    </p>
                  </div>
                )}
                {!preview && view.layout === 'grid' && (
                  <section className="species-grid" aria-label="Nearby species">
                    {visible.map((species) => (
                      <article
                        className={`species-card ${species.observedByUser ? 'observed' : ''}`}
                        key={species.id}
                      >
                        <div className="photo-frame">
                          {species.photoUrl ? (
                            <img
                              src={species.photoUrl}
                              alt={species.commonName}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <Leaf className="fallback-leaf" size={32} />
                          )}
                          <span
                            className="count-pill"
                            title="Reported observations in this area and selected months"
                          >
                            {species.count.toLocaleString()} records
                          </span>
                          {species.observedByUser && (
                            <span className="seen-pill">
                              <Check size={12} />
                              Seen
                            </span>
                          )}
                        </div>
                        <div className="species-copy">
                          <h3>
                            <a
                              href={`https://www.inaturalist.org/taxa/${species.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {species.commonName}
                            </a>
                          </h3>
                          <p>
                            <i>{species.scientificName}</i>
                          </p>
                          <div className="species-tags">
                            {species.casualOnly && <span>Casual only</span>}
                            {!species.expectedNearby && (
                              <span>Range uncertain</span>
                            )}
                          </div>
                          {species.photoCredit && (
                            <details className="photo-credit">
                              <summary>Photo credit</summary>
                              {species.photoCredit}
                            </details>
                          )}
                        </div>
                      </article>
                    ))}
                  </section>
                )}
                {!preview && view.layout === 'list' && (
                  <section
                    className="taxon-checklist"
                    aria-label="Nearby species"
                  >
                    {groups.map(({ group, species }) => (
                      <section key={group.key}>
                        <h3>
                          {group.label}
                          <span>{species.length}</span>
                        </h3>
                        <ul>
                          {species.map((s) => (
                            <li key={s.id}>
                              <span
                                className={`check-box ${s.observedByUser ? 'checked' : ''}`}
                                aria-label={
                                  s.observedByUser
                                    ? 'Already observed'
                                    : undefined
                                }
                              >
                                {s.observedByUser && <Check size={12} />}
                              </span>
                              <div>
                                <a
                                  href={`https://www.inaturalist.org/taxa/${s.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {s.commonName}
                                </a>
                                <i>{s.scientificName}</i>
                              </div>
                              <span className="record-count">
                                {s.count} records
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </section>
                )}
              </>
            )}
          </main>
        </div>
        <footer className="site-footer">
          <p>
            Made for curious naturalists. Reported records are a starting point,
            not a promise of a sighting.
          </p>
          <a
            href="#top"
            onClick={(event) => {
              event.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <ArrowUp size={14} />
            Back to top
          </a>
        </footer>
      </div>
      {snapshot && (
        <PrintPreview
          snapshot={snapshot}
          species={visible}
          view={view}
          visible={preview}
        />
      )}
    </>
  )
}
