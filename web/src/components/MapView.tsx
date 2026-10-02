import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { photoUrl } from '../lib/api'
import { PRICE_SHORT, quoteOf } from '../lib/format'
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../lib/mapTiles'
import type { LatLng } from '../lib/geo'
import type { Spot } from '../lib/types'

export type MapTarget = { kind: 'point'; lat: number; lng: number; zoom?: number; n: number } | { kind: 'bounds'; bounds: [[number, number], [number, number]]; n: number }
export type BoundsStr = string // "south,west,north,east"
/** Pixels of the viewport covered by UI, so flights aim at the visible part of the map. */
export interface Inset { top: number; left: number; right: number; bottom: number }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const PHOTO_ZOOM = 14 // below this a discovery is a point of light; at street level it shows its photo
const CLUSTER_PX = 54
const WEEK = 7 * 864e5

const states = (s: Spot) => `${s.status !== 'active' ? ' off' : ''}${Date.now() - s.createdAt < WEEK && s.status === 'active' ? ' new' : ''}`

function lightIcon(s: Spot, sel: boolean, photo: boolean) {
  if (!photo && !sel) return L.divIcon({ className: '', html: `<div class="lt dot${states(s)}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] })
  const size = sel ? 64 : 44
  const img = s.coverPhoto ? ` style="--img:url(${photoUrl(s.coverPhoto)})"` : ''
  const q = quoteOf(s.description, 72)
  const ann = sel ? `<div class="ann"><i></i><b>${esc(s.name)}</b>${q ? `<q>${esc(q)}</q>` : ''}<small>@${esc(s.discoverer)} · ${esc(PRICE_SHORT[s.priceBand])}${s.status !== 'active' ? ' · baka sarado' : ''}</small></div>` : ''
  return L.divIcon({
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="lt ph${sel ? ' sel' : ''}${s.verifiedVisits ? ' v' : ''}${states(s)}"${img}>${s.coverPhoto ? '' : esc(s.name[0]?.toUpperCase() ?? '')}${ann}</div>`,
  })
}
function clusterIcon(n: number) {
  const s = Math.round(34 + Math.min(46, Math.sqrt(n) * 12))
  return L.divIcon({ className: '', html: `<div class="lt cl" style="--s:${s}px">${n}</div>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] })
}
const youIcon = L.divIcon({ className: '', html: '<div class="you"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })

type Group = { one: Spot } | { many: Spot[]; lat: number; lng: number }

/** Lights, merged into glowing clusters where they overlap at the current zoom. */
function Lights({ spots, selectedId, onSelect }: { spots: Spot[]; selectedId: number | null; onSelect: (s: Spot) => void }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const groups = useMemo<Group[]>(() => {
    if (zoom >= 16) return spots.map((one) => ({ one }))
    const cells = new Map<string, Spot[]>()
    for (const s of spots) {
      if (s.id === selectedId) continue
      const p = map.project([s.lat, s.lng], zoom), k = `${Math.floor(p.x / CLUSTER_PX)}:${Math.floor(p.y / CLUSTER_PX)}`
      cells.set(k, [...(cells.get(k) ?? []), s])
    }
    const out: Group[] = [...cells.values()].map((g) => g.length === 1 ? { one: g[0] } : { many: g, lat: g.reduce((a, s) => a + s.lat, 0) / g.length, lng: g.reduce((a, s) => a + s.lng, 0) / g.length })
    const sel = spots.find((s) => s.id === selectedId)
    if (sel) out.push({ one: sel })
    return out
  }, [spots, zoom, selectedId, map])

  const photo = zoom >= PHOTO_ZOOM
  return <>{groups.map((g) => 'one' in g
    ? <Marker key={`s${g.one.id}-${g.one.id === selectedId}-${photo}`} position={[g.one.lat, g.one.lng]} icon={lightIcon(g.one, g.one.id === selectedId, photo)}
      zIndexOffset={g.one.id === selectedId ? 1000 : 0} eventHandlers={{ click: () => onSelect(g.one) }} />
    : <Marker key={`c${g.many.map((s) => s.id).join('-')}`} position={[g.lat, g.lng]} icon={clusterIcon(g.many.length)}
      eventHandlers={{ click: () => map.flyToBounds(L.latLngBounds(g.many.map((s) => [s.lat, s.lng])), { padding: [70, 70], maxZoom: 17, duration: 0.5 }) }} />,
  )}</>
}

function Controller({ target, inset, onBounds }: { target: MapTarget | null; inset: Inset; onBounds: (b: BoundsStr) => void }) {
  const map = useMap()
  const report = () => { const b = map.getBounds(); onBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',')) }
  useMapEvents({ moveend: report })
  useEffect(report, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!target) return
    if (target.kind === 'point') {
      const z = target.zoom ?? Math.max(map.getZoom(), 16)
      // Aim at the middle of the visible map; nudge left so the annotation has room on the right.
      const dx = (inset.right - inset.left) / 2 + 60, dy = (inset.bottom - inset.top) / 2
      map.flyTo(map.unproject(map.project([target.lat, target.lng], z).add([dx, dy]), z), z, { duration: 0.7 })
    } else map.flyToBounds(target.bounds, { paddingTopLeft: [inset.left + 40, inset.top + 30], paddingBottomRight: [inset.right + 40, inset.bottom + 30], maxZoom: 16, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n])
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 250); return () => clearTimeout(t) })
  return null
}

export default function MapView({ spots, selectedId, onSelect, me, target, onBounds, inset }: {
  spots: Spot[]; selectedId: number | null; onSelect: (s: Spot) => void; me: LatLng | null
  target: MapTarget | null; onBounds: (b: BoundsStr) => void; inset: Inset
}) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} style={{ position: 'absolute', inset: 0 }}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <Lights spots={spots} selectedId={selectedId} onSelect={onSelect} />
      {me && <Marker position={[me.lat, me.lng]} icon={youIcon} interactive={false} />}
      <Controller target={target} inset={inset} onBounds={onBounds} />
    </MapContainer>
  )
}
