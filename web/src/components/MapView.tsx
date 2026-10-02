import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../lib/mapTiles'
import type { LatLng } from '../lib/geo'
import type { Spot } from '../lib/types'

export type MapTarget = { kind: 'point'; lat: number; lng: number; zoom?: number; n: number } | { kind: 'bounds'; bounds: [[number, number], [number, number]]; n: number }
export type BoundsStr = string // "south,west,north,east"

const pin = (cls: string) => L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [30, 30], iconAnchor: [4, 30] })
const ICONS = { on: pin(''), off: pin('off'), sel: pin('sel') }
const meIcon = L.divIcon({ className: '', html: '<div class="mePin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })

function Controller({ target, onBounds, bottomPad }: { target: MapTarget | null; onBounds: (b: BoundsStr) => void; bottomPad: number }) {
  const map = useMap()
  useMapEvents({
    moveend: () => { const b = map.getBounds(); onBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')) },
  })
  useEffect(() => { const b = map.getBounds(); onBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')) }, [map, onBounds])
  useEffect(() => {
    if (!target) return
    if (target.kind === 'point') {
      const z = target.zoom ?? Math.max(map.getZoom(), 16)
      // On phones the bottom sheet covers the lower half, so aim the pin at the visible middle.
      const c = bottomPad ? map.unproject(map.project([target.lat, target.lng], z).add([0, bottomPad / 2]), z) : L.latLng(target.lat, target.lng)
      map.flyTo(c, z, { duration: 0.6 })
    }
    else map.flyToBounds(target.bounds, { padding: [40, 40], maxZoom: 16, duration: 0.6, paddingBottomRight: [40, bottomPad] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n])
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 250); return () => clearTimeout(t) })
  return null
}

export default function MapView({ spots, selectedId, onSelect, me, target, onBounds, bottomPad }: {
  spots: Spot[]; selectedId: number | null; onSelect: (id: number) => void; me: LatLng | null
  target: MapTarget | null; onBounds: (b: BoundsStr) => void; bottomPad: number
}) {
  const markers = useMemo(() => spots.map((s) => (
    <Marker key={s.id} position={[s.lat, s.lng]} icon={s.id === selectedId ? ICONS.sel : s.status === 'active' ? ICONS.on : ICONS.off}
      zIndexOffset={s.id === selectedId ? 1000 : 0} eventHandlers={{ click: () => onSelect(s.id) }} />
  )), [spots, selectedId, onSelect])

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} attributionControl={true} style={{ position: 'absolute', inset: 0 }}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {markers}
      {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />}
      <Controller target={target} onBounds={onBounds} bottomPad={bottomPad} />
    </MapContainer>
  )
}
