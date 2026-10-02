import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { geocodePlace, getLocation, lastKnownLocation, type LatLng } from '../lib/geo'
import { BANDS, QUICK_TAGS, type PriceBand, type Spot } from '../lib/types'
import MapView, { type BoundsStr, type MapTarget } from '../components/MapView'
import SpotDetail from '../components/SpotDetail'
import { Back, Locate, Search, Sliders } from '../components/icons'
import { BottomSheet, Dialog, Spinner, SpotRow, type Snap } from '../components/ui'

interface Filters { radius: number; price: PriceBand[]; min: Record<string, number>; verified: boolean; recent: boolean; inactive: boolean }
const NO_FILTERS: Filters = { radius: 0, price: [], min: {}, verified: false, recent: false, inactive: false }
const RADII: [number, string][] = [[0, 'Anywhere'], [500, '500 m'], [1000, '1 km'], [3000, '3 km'], [5000, '5 km']]

export default function MapScreen({ initialSpot }: { initialSpot: number | null }) {
  const app = useApp()
  const [q, setQ] = useState(''), [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS), [filterOpen, setFilterOpen] = useState(false)
  const [bounds, setBounds] = useState<BoundsStr>('')
  const [spots, setSpots] = useState<Spot[]>([]), [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(initialSpot)
  const [snap, setSnap] = useState<Snap>('peek'), [sheetH, setSheetH] = useState(250)
  const [target, setTarget] = useState<MapTarget | null>(null)
  const [me, setMe] = useState<LatLng | null>(lastKnownLocation())
  const nTarget = useRef(0), seq = useRef(0)

  const flyPoint = (lat: number, lng: number, zoom?: number) => setTarget({ kind: 'point', lat, lng, zoom, n: ++nTarget.current })
  const flyBounds = (b: [[number, number], [number, number]]) => setTarget({ kind: 'bounds', bounds: b, n: ++nTarget.current })

  const select = useCallback((id: number | null, flyTo?: Spot) => {
    setSelectedId(id)
    if (id != null) { setSnap((s) => (s === 'peek' ? 'half' : s)); if (flyTo) flyPoint(flyTo.lat, flyTo.lng) }
    else setSnap('half')
  }, [])
  // Open a deep-linked spot (#spot/ID) once.
  useEffect(() => { if (initialSpot) api('GET', `/spots/${initialSpot}`).then((d) => { flyPoint(d.spot.lat, d.spot.lng, 16); setSnap('half') }).catch(() => {}) }, [initialSpot])

  // Fetch spots for the current query / filters / visible area.
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
      app.toast('Mga hidden gem malapit sa\'yo')
    } catch (e: any) { app.toast(e.message) }
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    if (/near me|malapit/i.test(text)) { setQuery(text.replace(/food|near me|malapit/gi, '').trim()); await locate(); return }
    setQuery(text); setSelectedId(null); setSnap('half')
    if (!text) return
    const r = await api<{ spots: Spot[] }>('GET', `/spots?q=${encodeURIComponent(text)}`)
    if (r.spots.length) flyBounds(boundsOf(r.spots))
    else {
      const g = await geocodePlace(text)
      if (g) { setQuery(''); flyBounds(g.bounds); app.toast(`Exploring ${g.name}`) } else app.toast('Walang nahanap. Try another word?')
    }
  }

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const activeFilters = (filters.radius ? 1 : 0) + filters.price.length + Object.values(filters.min).filter(Boolean).length + [filters.verified, filters.recent, filters.inactive].filter(Boolean).length
  const bottomPad = snap === 'peek' ? 160 : Math.round(sheetH)
  const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
  const header = useMemo(() => selectedId == null
    ? <div><div className="kicker">{loading ? 'Hinahanap…' : `${spots.length} hidden bite${spots.length === 1 ? '' : 's'}${query ? ` for “${query}”` : ' nearby'}`}</div><div className="headline">Saan tayo <em>kakain</em>?</div></div>
    : <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => select(null)}><Back width={18} height={18} />Back to results</button>,
    [selectedId, loading, spots.length, query, select])

  return (
    <div className="mapWrap">
      <div className="mapLayer"><MapView spots={spots} selectedId={selectedId} onSelect={(id) => select(id)} me={me} target={target} onBounds={setBounds} bottomPad={desktop ? 0 : bottomPad} /></div>

      <div className="topUI">
        <form className="searchBar" onSubmit={search}>
          <Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Saan tayo kakain? pares, silog, Bulacan…" enterKeyHint="search" aria-label="Search" />
          {q && <button type="button" className="btn ghost sm" onClick={() => { setQ(''); setQuery('') }}>Clear</button>}
          <button type="button" className="avatarBtn" aria-label="Account" onClick={() => (app.user ? (location.hash = '#profile') : app.openAuth())}>{app.user ? app.user.username[0].toUpperCase() : '?'}</button>
        </form>
        <div className="chipRow">
          <button className={`chip ${activeFilters ? 'on' : ''}`} onClick={() => setFilterOpen(true)}><Sliders width={14} height={14} style={{ verticalAlign: -2 }} /> Filters{activeFilters ? ` · ${activeFilters}` : ''}</button>
          {QUICK_TAGS.map((t) => <button key={t} className={`chip ${tags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>{t}</button>)}
        </div>
      </div>

      <div className="mapFabs" style={{ bottom: sheetH + 14 }}>
        <button className="iconBtn" aria-label="Near me" onClick={locate}><Locate /></button>
      </div>

      <BottomSheet snap={snap} setSnap={setSnap} header={header} onHeight={setSheetH}>
        {selectedId != null ? <SpotDetail id={selectedId} /> : loading && !spots.length ? <Spinner /> : spots.length ? spots.map((s) => <SpotRow key={s.id} s={s} onClick={() => select(s.id, s)} />) : (
          <div className="empty"><b>Wala pang food spot dito.</b><p>May nakita ka bang solid na food spot?</p><button className="btn red" onClick={app.openLapag}>Lapag mo!</button></div>
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
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Filters</h3><button className="btn ghost sm" onClick={() => onChange(NO_FILTERS)}>Reset</button></div>
      <label className="lbl">Distance <span className="meta">(from you, or the map center)</span></label>
      <div className="row wrap">{RADII.map(([r, l]) => <button key={r} className={`chip flat ${value.radius === r ? 'on' : ''}`} onClick={() => set({ radius: r })}>{l}</button>)}</div>
      <label className="lbl">Price</label>
      <div className="row wrap">{(Object.keys(BANDS) as PriceBand[]).map((b) => <button key={b} className={`chip flat ${value.price.includes(b) ? 'on' : ''}`} onClick={() => togglePrice(b)}>{BANDS[b]}</button>)}</div>
      <label className="lbl">Minimum rating</label>
      {(['food', 'value', 'service', 'cleanliness'] as const).map((k) => (
        <div className="row" key={k} style={{ justifyContent: 'space-between', margin: '4px 0' }}>
          <span style={{ textTransform: 'capitalize' }}>{k}</span>
          <select className="field" style={{ width: 110 }} value={value.min[k] ?? 0} onChange={(e) => set({ min: { ...value.min, [k]: +e.target.value } })}>
            <option value={0}>Any</option>{[3, 3.5, 4, 4.5].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>
      ))}
      <label className="lbl">More</label>
      {([['verified', 'Has verified visits'], ['recent', 'Recently discovered (2 weeks)'], ['inactive', 'Include inactive spots']] as const).map(([k, l]) => (
        <label key={k} className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={value[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Filters>)} /> {l}</label>
      ))}
      <button className="btn primary block" style={{ marginTop: 14 }} onClick={onClose}>Show results</button>
    </Dialog>
  )
}
