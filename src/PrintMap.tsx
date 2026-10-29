import { useLayoutEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Snapshot } from './inaturalist'
import { useOnline } from './network'

export function PrintMap({ snapshot }: { snapshot: Snapshot }) {
  const container = useRef<HTMLDivElement>(null)
  const online = useOnline()
  const [status, setStatus] = useState('Loading map imagery.')
  useLayoutEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomAnimation: false,
      fadeAnimation: false,
    }).setView(
      [
        snapshot.search.area.kind === 'circle'
          ? snapshot.search.area.center.lat
          : 0,
        snapshot.search.area.kind === 'circle'
          ? snapshot.search.area.center.lng
          : 0,
      ],
      12,
    )
    const style = {
      color: online ? '#fff' : '#174e3b',
      weight: 3,
      fillColor: '#174e3b',
      fillOpacity: 0.2,
    }
    const { area, radius } = snapshot.search
    let shape: L.FeatureGroup | L.Polygon | L.Circle | undefined
    if (area.kind === 'circle')
      shape = L.circle([area.center.lat, area.center.lng], {
        ...style,
        radius: radius * 1000,
      })
    if (area.kind === 'rectangle')
      shape = L.rectangle(
        [
          [area.bounds.sw.lat, area.bounds.sw.lng],
          [area.bounds.ne.lat, area.bounds.ne.lng],
        ],
        style,
      )
    if (area.kind === 'polygon')
      shape = L.polygon(
        area.points.map((p) => [p.lat, p.lng]),
        style,
      )
    if (area.kind === 'place') {
      const geometry =
        snapshot.place?.geometry_geojson ?? snapshot.place?.bounding_box_geojson
      if (geometry) shape = L.geoJSON(geometry, { style })
    }
    shape?.addTo(map)
    if (!shape || !shape.getBounds().isValid()) {
      setStatus(
        'Map boundary unavailable for this place. Use the place ID below.',
      )
      map.remove()
      return
    }
    const tiles = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 },
    )
    let failed = false
    tiles.on('tileerror', () => {
      failed = true
    })
    tiles.on('load', () =>
      setStatus(failed ? 'Imagery unavailable. Search boundary shown.' : ''),
    )
    map.fitBounds(shape.getBounds(), {
      padding: [18, 18],
      animate: false,
      maxZoom: 16,
    })
    if (online) tiles.addTo(map)
    else setStatus('Offline. Search boundary shown without satellite imagery.')
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)
    if (area.kind === 'place' && !snapshot.place?.geometry_geojson)
      setStatus('Place bounding rectangle shown.')
    return () => {
      map.remove()
    }
  }, [snapshot, online])
  return (
    <figure className="booklet-map">
      <div
        className="print-map-canvas"
        ref={container}
        role="img"
        aria-label={`Search boundary for ${snapshot.areaLabel}`}
      />
      <figcaption>
        {status && <span>{status} </span>}
        {snapshot.search.area.kind === 'place' &&
          !snapshot.place?.geometry_geojson &&
          snapshot.place?.bounding_box_geojson &&
          'Place bounding rectangle. '}
        North up. Imagery © Esri, Maxar, Earthstar Geographics.
      </figcaption>
    </figure>
  )
}
