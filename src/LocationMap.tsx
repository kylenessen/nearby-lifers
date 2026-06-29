import { useEffect, useMemo, useRef, useState } from 'react'
import L, { type LeafletMouseEvent, type Map as LeafletMap } from 'leaflet'
import type { INatPlace } from './inaturalist'

export type LatLngPoint = {
  lat: number
  lng: number
}

export type SearchBounds = {
  sw: LatLngPoint
  ne: LatLngPoint
}

export type SearchArea =
  | { kind: 'circle'; center: LatLngPoint }
  | { kind: 'rectangle'; bounds: SearchBounds }
  | { kind: 'place'; place: INatPlace; bounds?: SearchBounds | null }

type LocationMapProps = {
  area: SearchArea
  mode: 'circle' | 'rectangle'
  radiusKm: number
  onCircleCenterSelected: (point: LatLngPoint) => void
  onRectangleSelected: (bounds: SearchBounds) => void
}

function normalizeBounds(first: LatLngPoint, second: LatLngPoint): SearchBounds {
  return {
    sw: {
      lat: Math.min(first.lat, second.lat),
      lng: Math.min(first.lng, second.lng),
    },
    ne: {
      lat: Math.max(first.lat, second.lat),
      lng: Math.max(first.lng, second.lng),
    },
  }
}

function leafletBounds(bounds: SearchBounds) {
  return L.latLngBounds(
    [bounds.sw.lat, bounds.sw.lng],
    [bounds.ne.lat, bounds.ne.lng],
  )
}

function areaKey(area: SearchArea, radiusKm: number) {
  if (area.kind === 'circle') {
    return `circle:${area.center.lat}:${area.center.lng}:${radiusKm}`
  }

  if (area.kind === 'rectangle') {
    return `rectangle:${area.bounds.sw.lat}:${area.bounds.sw.lng}:${area.bounds.ne.lat}:${area.bounds.ne.lng}`
  }

  return `place:${area.place.id}`
}

export function LocationMap({
  area,
  mode,
  radiusKm,
  onCircleCenterSelected,
  onRectangleSelected,
}: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const draftGroupRef = useRef<L.LayerGroup | null>(null)
  const lastAreaKeyRef = useRef<string | null>(null)
  const [draftStart, setDraftStart] = useState<LatLngPoint | null>(null)
  const currentAreaKey = useMemo(() => areaKey(area, radiusKm), [area, radiusKm])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = L.map(containerRef.current, {
      attributionControl: true,
      zoomControl: true,
    }).setView([35.32763176091517, -120.83909699047472], 14)

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19,
      },
    ).addTo(map)

    layerGroupRef.current = L.layerGroup().addTo(map)
    draftGroupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
      layerGroupRef.current = null
      draftGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const handleClick = (event: LeafletMouseEvent) => {
      const point = {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      }

      if (mode === 'circle') {
        setDraftStart(null)
        onCircleCenterSelected(point)
        return
      }

      if (!draftStart) {
        setDraftStart(point)
        return
      }

      onRectangleSelected(normalizeBounds(draftStart, point))
      setDraftStart(null)
    }

    map.on('click', handleClick)

    return () => {
      map.off('click', handleClick)
    }
  }, [draftStart, mode, onCircleCenterSelected, onRectangleSelected])

  useEffect(() => {
    const draftGroup = draftGroupRef.current

    if (!draftGroup) {
      return
    }

    draftGroup.clearLayers()

    if (draftStart) {
      L.circleMarker([draftStart.lat, draftStart.lng], {
        color: '#ffffff',
        fillColor: '#2b7568',
        fillOpacity: 1,
        radius: 6,
        weight: 2,
      }).addTo(draftGroup)
    }
  }, [draftStart])

  useEffect(() => {
    const map = mapRef.current
    const layerGroup = layerGroupRef.current

    if (!map || !layerGroup) {
      return
    }

    layerGroup.clearLayers()
    let fittedBounds: L.LatLngBounds | null = null

    if (area.kind === 'circle') {
      const center: L.LatLngExpression = [area.center.lat, area.center.lng]
      const circle = L.circle(center, {
        color: '#ffffff',
        fillColor: '#2b7568',
        fillOpacity: 0.18,
        radius: radiusKm * 1000,
        weight: 2,
      }).addTo(layerGroup)

      L.circleMarker(center, {
        color: '#ffffff',
        fillColor: '#2b7568',
        fillOpacity: 1,
        radius: 6,
        weight: 2,
      }).addTo(layerGroup)

      fittedBounds = circle.getBounds()
    }

    if (area.kind === 'rectangle') {
      const rectangle = L.rectangle(leafletBounds(area.bounds), {
        color: '#ffffff',
        fillColor: '#2b7568',
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(layerGroup)

      fittedBounds = rectangle.getBounds()
    }

    if (area.kind === 'place') {
      if (area.place.geometry_geojson) {
        const geometry = L.geoJSON(area.place.geometry_geojson, {
          style: {
            color: '#ffffff',
            fillColor: '#2b7568',
            fillOpacity: 0.18,
            weight: 2,
          },
        }).addTo(layerGroup)
        fittedBounds = geometry.getBounds()
      } else if (area.bounds) {
        const rectangle = L.rectangle(leafletBounds(area.bounds), {
          color: '#ffffff',
          fillColor: '#2b7568',
          fillOpacity: 0.18,
          weight: 2,
        }).addTo(layerGroup)
        fittedBounds = rectangle.getBounds()
      }
    }

    if (
      fittedBounds?.isValid() &&
      lastAreaKeyRef.current !== currentAreaKey
    ) {
      map.fitBounds(fittedBounds.pad(0.18), {
        animate: false,
        maxZoom: area.kind === 'circle' ? 16 : 15,
      })
      lastAreaKeyRef.current = currentAreaKey
    }
  }, [area, currentAreaKey, radiusKm])

  return <div className="map-preview" ref={containerRef} />
}
