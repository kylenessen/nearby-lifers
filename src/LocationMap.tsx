import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Circle, Hand, Pentagon, Square, Undo2 } from 'lucide-react'
import { boundsOf, DEFAULT_CENTER, MAX_VERTICES, polygonError } from './search'
import type { Area, Point } from './search'
import type { INatPlace } from './inaturalist'
import { useOnline } from './network'

type Mode = 'browse' | 'circle' | 'rectangle' | 'polygon'
type Props = {
  area: Area
  radius: number
  place: INatPlace | null
  onChange: (area: Area) => void
  onDrawingChange: (drawing: boolean) => void
}
const shapeStyle = {
  color: '#ffffff',
  fillColor: '#246956',
  fillOpacity: 0.2,
  weight: 3,
}
const draftStyle = {
  color: '#ffe38c',
  fillColor: '#ffe38c',
  fillOpacity: 0.15,
  weight: 3,
  dashArray: '6 5',
}
const pointFrom = (latlng: L.LatLng): Point => ({
  lat: Number(latlng.lat.toFixed(6)),
  lng: Number((((((latlng.lng + 180) % 360) + 360) % 360) - 180).toFixed(6)),
})

export function LocationMap({
  area,
  radius,
  place,
  onChange,
  onDrawingChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const online = useOnline()
  const mapRef = useRef<L.Map | null>(null)
  const selectedLayer = useRef<L.LayerGroup | null>(null)
  const draftLayer = useRef<L.LayerGroup | null>(null)
  const fittedKey = useRef('')
  const [mode, setMode] = useState<Mode>('browse')
  const [points, setPoints] = useState<Point[]>([])
  const [error, setError] = useState<string | null>(null)

  function start(next: Mode, vertices: Point[] = []) {
    setMode(next)
    setPoints(vertices)
    setError(null)
    onDrawingChange(next !== 'browse')
  }
  function finish() {
    const message = polygonError(points)
    if (message) {
      setError(message)
      return
    }
    onChange({ kind: 'polygon', points })
    start('browse')
  }

  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(
      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      14,
    )
    const tiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      },
    )
    const updateTiles = () => {
      if (navigator.onLine) tiles.addTo(map)
      else tiles.remove()
    }
    updateTiles()
    window.addEventListener('online', updateTiles)
    window.addEventListener('offline', updateTiles)
    mapRef.current = map
    selectedLayer.current = L.layerGroup().addTo(map)
    draftLayer.current = L.layerGroup().addTo(map)
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(container.current)
    return () => {
      resize.disconnect()
      window.removeEventListener('online', updateTiles)
      window.removeEventListener('offline', updateTiles)
      map.remove()
      mapRef.current = null
      fittedKey.current = ''
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    function select(point: Point) {
      setError(null)
      if (mode === 'circle') {
        onChange({ kind: 'circle', center: point })
        setMode('browse')
        onDrawingChange(false)
      } else if (mode === 'rectangle') {
        if (!points.length) setPoints([point])
        else {
          const bounds = boundsOf([points[0], point])
          if (
            bounds.sw.lat === bounds.ne.lat ||
            bounds.sw.lng === bounds.ne.lng
          ) {
            setError('Choose a different opposite corner.')
            return
          }
          onChange({ kind: 'rectangle', bounds })
          setPoints([])
          setMode('browse')
          onDrawingChange(false)
        }
      } else if (mode === 'polygon') {
        if (points.length >= MAX_VERTICES) {
          setError(`Use at most ${MAX_VERTICES} corners.`)
          return
        }
        setPoints((current) => [...current, point])
      }
    }
    const click = (event: L.LeafletMouseEvent) =>
      select(pointFrom(event.latlng))
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMode('browse')
        setPoints([])
        setError(null)
        onDrawingChange(false)
      }
      if (event.key === 'Enter' && mode !== 'browse') {
        event.preventDefault()
        select(pointFrom(map!.getCenter()))
      }
    }
    map.on('click', click)
    map.getContainer().addEventListener('keydown', key)
    if (mode === 'browse') map.doubleClickZoom.enable()
    else map.doubleClickZoom.disable()
    return () => {
      map.off('click', click)
      map.getContainer().removeEventListener('keydown', key)
    }
  }, [mode, points, onChange, onDrawingChange])

  useEffect(() => {
    const group = draftLayer.current,
      map = mapRef.current
    if (!group || !map) return
    group.clearLayers()
    const coords = points.map((p) => [p.lat, p.lng] as L.LatLngTuple)
    if (mode === 'polygon' && points.length >= 2) {
      if (points.length >= 3)
        L.polygon(coords, { ...draftStyle, interactive: false }).addTo(group)
      else
        L.polyline(coords, { ...draftStyle, interactive: false }).addTo(group)
    }
    points.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        draggable: mode === 'polygon',
        keyboard: true,
        icon: L.divIcon({
          className: 'map-vertex',
          html: String(index + 1),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        title: `Corner ${index + 1}. Drag to move.`,
      }).addTo(group)
      marker.on('dragend', () => {
        setPoints((current) =>
          current.map((p, i) =>
            i === index ? pointFrom(marker.getLatLng()) : p,
          ),
        )
        setError(null)
      })
    })
    let preview: L.Rectangle | null = null
    const move = (event: L.LeafletMouseEvent) => {
      if (mode !== 'rectangle' || !points.length) return
      const bounds = boundsOf([points[0], pointFrom(event.latlng)])
      const latlngs: L.LatLngBoundsExpression = [
        [bounds.sw.lat, bounds.sw.lng],
        [bounds.ne.lat, bounds.ne.lng],
      ]
      if (preview) preview.setBounds(latlngs)
      else
        preview = L.rectangle(latlngs, {
          ...draftStyle,
          interactive: false,
        }).addTo(group)
    }
    map.on('mousemove', move)
    return () => {
      map.off('mousemove', move)
    }
  }, [points, mode])

  useEffect(() => {
    const map = mapRef.current,
      group = selectedLayer.current
    if (!map || !group) return
    group.clearLayers()
    const boundaryStyle = {
      ...shapeStyle,
      color: online ? shapeStyle.color : '#246956',
    }
    let bounds: L.LatLngBounds | undefined
    if (area.kind === 'circle') {
      const center: L.LatLngTuple = [area.center.lat, area.center.lng]
      bounds = L.circle(center, {
        ...boundaryStyle,
        radius: radius * 1000,
        interactive: false,
      })
        .addTo(group)
        .getBounds()
      L.circleMarker(center, {
        ...boundaryStyle,
        radius: 5,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group)
    } else if (area.kind === 'rectangle') {
      bounds = L.rectangle(
        [
          [area.bounds.sw.lat, area.bounds.sw.lng],
          [area.bounds.ne.lat, area.bounds.ne.lng],
        ],
        { ...boundaryStyle, interactive: false },
      )
        .addTo(group)
        .getBounds()
    } else if (area.kind === 'polygon') {
      bounds = L.polygon(
        area.points.map((p) => [p.lat, p.lng]),
        { ...boundaryStyle, interactive: false },
      )
        .addTo(group)
        .getBounds()
    } else if (place?.id === area.id) {
      const geojson = place.geometry_geojson ?? place.bounding_box_geojson
      if (geojson)
        bounds = L.geoJSON(geojson, {
          style: boundaryStyle,
          interactive: false,
        })
          .addTo(group)
          .getBounds()
    }
    const key = JSON.stringify([area, radius, place?.id])
    if (bounds?.isValid() && fittedKey.current !== key) {
      map.fitBounds(bounds.pad(0.15), { maxZoom: 16, animate: false })
      fittedKey.current = key
    }
  }, [area, radius, place, online])

  const hint =
    mode === 'browse'
      ? ''
      : mode === 'circle'
        ? 'Tap the map to set the center of your radius.'
        : mode === 'rectangle'
          ? points.length
            ? 'Tap the opposite corner to finish your rectangle.'
            : 'Tap the first corner of your rectangle.'
          : `Tap to add corners, then finish. Drag numbered corners to adjust. ${points.length} corners added.`
  return (
    <div className="map-editor">
      {!online && (
        <p className="hint" role="status">
          Offline. Search boundary shown without satellite imagery.
        </p>
      )}
      <div className="map-tools" aria-label="Map tools">
        {(
          [
            { key: 'browse', label: 'Explore', icon: Hand },
            { key: 'circle', label: 'Radius', icon: Circle },
            { key: 'rectangle', label: 'Rectangle', icon: Square },
            { key: 'polygon', label: 'Polygon', icon: Pentagon },
          ] as const
        ).map((tool) => (
          <button
            type="button"
            key={tool.key}
            aria-pressed={mode === tool.key}
            className={mode === tool.key ? 'selected' : ''}
            onClick={() => start(tool.key)}
          >
            <tool.icon size={16} />
            {tool.label}
          </button>
        ))}
      </div>
      <div
        className={`map-preview ${mode !== 'browse' ? 'drawing' : ''}`}
        ref={container}
        aria-label="Search area map. Use arrow keys to pan and Enter to place a corner while drawing."
      />
      <div className="map-instructions">
        {hint && <p aria-live="polite">{hint}</p>}
        {mode !== 'browse' && (
          <div className="button-row">
            {mode === 'polygon' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPoints((p) => p.slice(0, -1))
                    setError(null)
                  }}
                  disabled={!points.length}
                >
                  <Undo2 size={14} />
                  Undo
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={points.length < 3}
                  onClick={finish}
                >
                  Finish polygon
                </button>
              </>
            )}
            <button type="button" onClick={() => start('browse')}>
              Cancel drawing
            </button>
          </div>
        )}
        {mode === 'browse' && area.kind === 'polygon' && (
          <button type="button" onClick={() => start('polygon', area.points)}>
            Edit polygon
          </button>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
