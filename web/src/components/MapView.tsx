import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { photoUrl } from '../lib/api'
import { PRICE_SHORT } from '../lib/format'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../lib/mapTiles'
import type { LatLng } from '../lib/geo'
import type { Spot } from '../lib/types'

export type MapTarget = { kind: 'point'; lat: number; lng: number; zoom?: number; n: number } | { kind: 'bounds'; bounds: [[number, number], [number, number]]; n: number }
export type BoundsStr = string // "south,west,north,east"
/** Pixels reserved by UI covering the map: a bottom sheet on phones, a side panel on desktop. */
export interface Inset { top: number; left: number; bottom: number }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const PHOTO_ZOOM = 14 // below this, spots are quiet dots; at street level they become small photo prints

function iconFor(s: Spot, sel: boolean, photoMode: boolean) {
  const off = s.status !== 'active' ? ' off' : ''
  if (!photoMode && !sel) return L.divIcon({ className: '', html: `<div class="dotmk${off}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] })
  const img = s.coverPhoto ? `style="background-image:url(${photoUrl(s.coverPhoto)})"` : ''
  const label = sel ? `<div class="mklbl">${esc(s.name)}<small>${esc(PRICE_SHORT[s.priceBand])}${s.ratings.overall ? ' · ' + s.ratings.overall.toFixed(1) : ''}</small></div>` : ''
  return L.divIcon({
    className: '', iconSize: [46, 46], iconAnchor: [23, 51],
    html: `<div class="mk${sel ? ' sel' : ''}${off}${s.coverPhoto ? '' : ' noimg'}"><div class="ph" ${img}>${s.coverPhoto ? '' : esc(s.name[0]?.toUpperCase() ?? '')}</div>${label}</div>`,
  })
}
const youIcon = L.divIcon({ className: '', html: '<div class="youmk"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })

function Controller({ target, inset, onBounds, onZoom }: { target: MapTarget | null; inset: Inset; onBounds: (b: BoundsStr) => void; onZoom: (z: number) => void }) {
  const map = useMap()
  const report = () => { const b = map.getBounds(); onBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')); onZoom(map.getZoom()) }
  useMapEvents({ moveend: report, zoomend: report })
  useEffect(report, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!target) return
    if (target.kind === 'point') {
      const z = target.zoom ?? Math.max(map.getZoom(), 16)
      // Aim the pin at the middle of the part of the map that is actually visible.
      const dx = -inset.left / 2, dy = inset.bottom / 2 - inset.top / 2
      const c = map.unproject(map.project([target.lat, target.lng], z).add([dx, dy]), z)
      map.flyTo(c, z, { duration: 0.6 })
    } else map.flyToBounds(target.bounds, { paddingTopLeft: [inset.left + 40, inset.top + 30], paddingBottomRight: [40, inset.bottom + 30], maxZoom: 16, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n])
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 250); return () => clearTimeout(t) })
  return null
}

export default function MapView({ spots, highlightId, onSelect, me, target, onBounds, inset }: {
  spots: Spot[]; highlightId: number | null; onSelect: (s: Spot) => void; me: LatLng | null
  target: MapTarget | null; onBounds: (b: BoundsStr) => void; inset: Inset
}) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const photoMode = zoom >= PHOTO_ZOOM
  const markers = useMemo(() => spots.map((s) => (
    <Marker key={`${s.id}-${s.id === highlightId}-${photoMode}`} position={[s.lat, s.lng]} icon={iconFor(s, s.id === highlightId, photoMode)}
      zIndexOffset={s.id === highlightId ? 1000 : 0} eventHandlers={{ click: () => onSelect(s) }} />
  )), [spots, highlightId, photoMode, onSelect])

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} style={{ position: 'absolute', inset: 0 }}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {markers}
      {me && <Marker position={[me.lat, me.lng]} icon={youIcon} interactive={false} />}
      <Controller target={target} inset={inset} onBounds={onBounds} onZoom={setZoom} />
    </MapContainer>
  )
}
