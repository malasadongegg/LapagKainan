import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { geocodePlace, getLocation, lastKnownLocation, type LatLng } from '../lib/geo'
import { BANDS, QUICK_TAGS, type PriceBand, type Spot } from '../lib/types'
import MapView, { type BoundsStr, type MapTarget } from '../components/MapView'
import SpotDetail from '../components/SpotDetail'
import { Locate } from '../components/icons'
import { Feature, Line, PeekCard } from '../components/stories'
import { BottomSheet, Dialog, ListSkeleton, PEEK, type Snap } from '../components/ui'

interface Filters { radius: number; price: PriceBand[]; min: Record<string, number>; verified: boolean; recent: boolean; inactive: boolean }
const NO_FILTERS: Filters = { radius: 0, price: [], min: {}, verified: false, recent: false, inactive: false }
const RADII: [number, string][] = [[0, 'Kahit saan'], [500, '500 m'], [1000, '1 km'], [3000, '3 km'], [5000, '5 km']]
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches

export interface SearchReq { text: string; n: number }

export default function MapScreen({ initialSpot, initialHere, searchReq }: { initialSpot: number | null; initialHere: boolean; searchReq: SearchReq }) {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS), [filterOpen, setFilterOpen] = useState(false)
  const [bounds, setBounds] = useState<BoundsStr>('')
  const [spots, setSpots] = useState<Spot[]>([]), [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(initialSpot)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [snap, setSnap] = useState<Snap>(initialSpot ? 'half' : 'peek'), [sheetH, setSheetH] = useState(PEEK)
  const [target, setTarget] = useState<MapTarget | null>(null)
  const [me, setMe] = useState<LatLng | null>(lastKnownLocation())
  const nTarget = useRef(0), seq = useRef(0), rail = useRef<HTMLDivElement>(null), railTimer = useRef<number>(0)

  const flyPoint = (lat: number, lng: number, zoom?: number) => setTarget({ kind: 'point', lat, lng, zoom, n: ++nTarget.current })
  const flyBounds = (b: [[number, number], [number, number]]) => setTarget({ kind: 'bounds', bounds: b, n: ++nTarget.current })

  const open = useCallback((s: Spot) => { setSelectedId(s.id); setFocusId(s.id); setSnap((c) => (c === 'peek' ? 'half' : c)); flyPoint(s.lat, s.lng) }, [])
  const closeDetail = () => { setSelectedId(null); setSnap('half') }

  // Deep link or "Kumain ako dito": open a spot straight away.
  useEffect(() => { if (initialSpot) api('GET', `/spots/${initialSpot}`).then((d) => { flyPoint(d.spot.lat, d.spot.lng, 16); setFocusId(initialSpot) }).catch(() => {}) }, [initialSpot])

  // Fetch for the current query / filters / visible area.
  useEffect(() => {
    const id = ++seq.current, p = new URLSearchParams()
    if (query) p.set('q', query)
    if (tags.length) p.set('tags', tags.join(','))
    if (filters.price.length) p.set('price', filters.price.join(','))
    for (const [k, v] of Object.entries(filters.min)) if (v) p.set('min' + k, String(v))
    if (filters.verified) p.set('verified', '1'); if (filters.recent) p.set('recent', '1'); if (filters.inactive) p.set('inactive', '1')
    const origin = me ?? (bounds ? centerOf(bounds) : null)
    if (origin) { p.set('lat', String(origin.lat)); p.set('lng', String(origin.lng)) }
    if (filters.radius) p.set('radius', String(filters.radius))
    else if (!query && bounds) p.set('bbox', bounds)
    else if (!query) return
    const t = setTimeout(() => {
      setLoading(true)
      api<{ spots: Spot[] }>('GET', '/spots?' + p).then((r) => { if (id === seq.current) setSpots(r.spots) }).catch((e) => app.toast(e.message)).finally(() => id === seq.current && setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, tags, filters, bounds, me, app.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const locate = async () => {
    try {
      const l = await getLocation(); setMe(l); flyPoint(l.lat, l.lng, 15)
      if (!filters.radius) setFilters((f) => ({ ...f, radius: 3000 }))
      app.toast('Mga bagong lapag malapit sa’yo')
    } catch (e: any) { app.toast(e.message) }
  }

  // Searches typed into the masthead arrive here.
  useEffect(() => {
    if (!searchReq.n) return
    const text = searchReq.text.trim()
    if (/near me|malapit/i.test(text)) { setQuery(text.replace(/food|near me|malapit/gi, '').trim()); void locate(); return }
    setQuery(text); setSelectedId(null); setSnap('half')
    if (!text) return
    ;(async () => {
      const r = await api<{ spots: Spot[] }>('GET', `/spots?q=${encodeURIComponent(text)}`)
      if (r.spots.length) flyBounds(boundsOf(r.spots))
      else {
        const g = await geocodePlace(text)
        if (g) { setQuery(''); flyBounds(g.bounds); app.toast(`Tinitingnan ang ${g.name}`) } else app.toast('Wala pa dito. Ibang salita?')
      }
    })()
  }, [searchReq.n]) // eslint-disable-line react-hooks/exhaustive-deps

  // Swiping the tray moves the map to that discovery.
  const onRailScroll = () => {
    window.clearTimeout(railTimer.current)
    railTimer.current = window.setTimeout(() => {
      const el = rail.current; if (!el || !el.firstElementChild) return
      const w = (el.firstElementChild as HTMLElement).offsetWidth + 12
      const s = spots[Math.max(0, Math.min(spots.length - 1, Math.round(el.scrollLeft / w)))]
      if (s && s.id !== focusId) { setFocusId(s.id); flyPoint(s.lat, s.lng) }
    }, 140)
  }
  const onMarker = useCallback((s: Spot) => {
    if (isDesktop() || snap !== 'peek') return open(s)
    setFocusId(s.id)
    const i = spots.findIndex((x) => x.id === s.id), el = rail.current
    if (el && i >= 0 && el.firstElementChild) el.scrollTo({ left: i * ((el.firstElementChild as HTMLElement).offsetWidth + 12), behavior: 'smooth' })
  }, [snap, spots, open])

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const activeFilters = (filters.radius ? 1 : 0) + filters.price.length + Object.values(filters.min).filter(Boolean).length + [filters.verified, filters.recent, filters.inactive].filter(Boolean).length
  const desktop = isDesktop()
  const inset = desktop ? { top: 110, left: 440, bottom: 0 } : { top: 110, left: 0, bottom: sheetH }
  const stableOnMarker = onMarker
  const count = spots.length

  const header = selectedId == null
    ? <div><div className="kick"><b>{loading ? 'Hinahanap…' : `${count} lapag${query ? ` para sa “${query}”` : ' sa paligid'}`}</b></div><div className="h-lg">Saan tayo kakain?</div></div>
    : <button className="link" onClick={closeDetail}>← Balik sa listahan</button>

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="mapLayer">
        <MapView spots={spots} highlightId={selectedId ?? focusId} onSelect={stableOnMarker} me={me} target={target} onBounds={setBounds} inset={inset} />
      </div>

      <div className="filters">
        <button className={activeFilters ? 'on' : ''} onClick={() => setFilterOpen(true)}>Filters{activeFilters ? ` · ${activeFilters}` : ''}</button>
        {QUICK_TAGS.map((t) => <button key={t} className={tags.includes(t) ? 'on' : ''} onClick={() => toggleTag(t)}>{t}</button>)}
      </div>

      <div className="mapFabs" style={{ bottom: sheetH + 14 }}>
        <button className="fab" aria-label="Malapit sa akin" onClick={locate}><Locate /></button>
      </div>

      <BottomSheet snap={snap} setSnap={setSnap} header={header} onHeight={setSheetH}>
        {selectedId != null ? <SpotDetail id={selectedId} autoHere={initialHere && selectedId === initialSpot} />
          : loading && !spots.length ? <ListSkeleton />
            : !spots.length ? (
              <div className="empty"><p className="h-lg">Wala pa dito.</p><p>Mukhang wala pang nakakadiscover sa lugar na ito. Ikaw na ang mauna.</p><button className="btn solid" onClick={app.openLapag}>＋ LAPAG</button></div>
            ) : snap === 'peek' && !desktop ? (
              <div className="rail" ref={rail} onScroll={onRailScroll}>{spots.slice(0, 24).map((s) => <PeekCard key={s.id} s={s} onOpen={() => open(s)} />)}</div>
            ) : (
              <div className="pad"><Feature s={spots[0]} onOpen={() => open(spots[0])} />{spots.slice(1).map((s) => <Line key={s.id} s={s} onOpen={() => open(s)} />)}</div>
            )}
      </BottomSheet>

      {filterOpen && <FilterDialog value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  )
}

function centerOf(b: string): LatLng { const [s, w, n, e] = b.split(',').map(Number); return { lat: (s + n) / 2, lng: (w + e) / 2 } }
function boundsOf(spots: Spot[]): [[number, number], [number, number]] {
  const lats = spots.map((s) => s.lat), lngs = spots.map((s) => s.lng)
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}

function FilterDialog({ value, onChange, onClose }: { value: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const set = (p: Partial<Filters>) => onChange({ ...value, ...p })
  const togglePrice = (b: PriceBand) => set({ price: value.price.includes(b) ? value.price.filter((x) => x !== b) : [...value.price, b] })
  return (
    <Dialog onClose={onClose}>
      <div className="row between"><h3 className="h-lg">Filters</h3><button className="link" onClick={() => onChange(NO_FILTERS)}>I-reset</button></div>
      <span className="lbl">Layo <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· mula sa’yo o sa gitna ng mapa</span></span>
      <div className="opt">{RADII.map(([r, l]) => <button key={r} className={value.radius === r ? 'on' : ''} onClick={() => set({ radius: r })}>{l}</button>)}</div>
      <span className="lbl">Presyo</span>
      <div className="opt">{(Object.keys(BANDS) as PriceBand[]).map((b) => <button key={b} className={value.price.includes(b) ? 'on' : ''} onClick={() => togglePrice(b)}>{BANDS[b]}</button>)}</div>
      <span className="lbl">Pinakamababang rating</span>
      {(['food', 'value', 'service', 'cleanliness'] as const).map((k) => (
        <div className="dimrow" key={k}><b style={{ textTransform: 'capitalize' }}>{k}</b>
          <select className="field" style={{ width: 110, height: 36 }} value={value.min[k] ?? 0} onChange={(e) => set({ min: { ...value.min, [k]: +e.target.value } })}>
            <option value={0}>Any</option>{[3, 3.5, 4, 4.5].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select></div>
      ))}
      <span className="lbl">Iba pa</span>
      {([['verified', 'May verified visits'], ['recent', 'Bagong lapag (2 linggo)'], ['inactive', 'Isama ang baka sarado']] as const).map(([k, l]) => (
        <label key={k} className="row" style={{ padding: '7px 0' }}><input type="checkbox" checked={value[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Filters>)} /> {l}</label>
      ))}
      <button className="btn solid block" style={{ marginTop: 16 }} onClick={onClose}>Ipakita</button>
    </Dialog>
  )
}
