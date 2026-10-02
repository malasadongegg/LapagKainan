import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { geocodePlace, getLocation, lastKnownLocation, type LatLng } from '../lib/geo'
import { BANDS, TAG_GROUPS, type PriceBand, type Spot } from '../lib/types'
import MapView, { type BoundsStr, type MapTarget } from '../components/MapView'
import SpotDetail from '../components/SpotDetail'
import { Locate } from '../components/icons'
import { TrayStory } from '../components/stories'

interface Filters { radius: number; price: PriceBand[]; verified: boolean; recent: boolean; inactive: boolean }
const NO_FILTERS: Filters = { radius: 0, price: [], verified: false, recent: false, inactive: false }
const RADII: [number, string][] = [[0, 'Kahit saan'], [500, '500 m'], [1000, '1 km'], [3000, '3 km'], [5000, '5 km']]
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches

export default function MapScreen({ initialSpot, initialHere }: { initialSpot: number | null; initialHere: boolean }) {
  const app = useApp()
  const [query, setQuery] = useState(''), [tags, setTags] = useState<string[]>([]), [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [searchOpen, setSearchOpen] = useState(false)
  const [bounds, setBounds] = useState<BoundsStr>('')
  const [spots, setSpots] = useState<Spot[]>([]), [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(initialSpot)
  const [focusId, setFocusId] = useState<number | null>(initialSpot)
  const [target, setTarget] = useState<MapTarget | null>(null)
  const [me, setMe] = useState<LatLng | null>(lastKnownLocation())
  const nTarget = useRef(0), seq = useRef(0), tray = useRef<HTMLDivElement>(null), trayTimer = useRef(0)

  const flyPoint = (lat: number, lng: number, zoom?: number) => setTarget({ kind: 'point', lat, lng, zoom, n: ++nTarget.current })
  const flyBounds = (b: [[number, number], [number, number]]) => setTarget({ kind: 'bounds', bounds: b, n: ++nTarget.current })

  useEffect(() => { if (initialSpot) api('GET', `/spots/${initialSpot}`).then((d) => flyPoint(d.spot.lat, d.spot.lng, 16)).catch(() => {}) }, [initialSpot])

  useEffect(() => {
    const id = ++seq.current, p = new URLSearchParams()
    if (query) p.set('q', query)
    if (tags.length) p.set('tags', tags.join(','))
    if (filters.price.length) p.set('price', filters.price.join(','))
    if (filters.verified) p.set('verified', '1'); if (filters.recent) p.set('recent', '1'); if (filters.inactive) p.set('inactive', '1')
    const origin = me ?? (bounds ? centerOf(bounds) : null)
    if (origin) { p.set('lat', String(origin.lat)); p.set('lng', String(origin.lng)) }
    if (filters.radius) p.set('radius', String(filters.radius))
    else if (!query && bounds) p.set('bbox', bounds)
    else if (!query) return
    const t = setTimeout(() => {
      setLoading(true)
      api<{ spots: Spot[] }>('GET', '/spots?' + p).then((r) => { if (id === seq.current) setSpots(r.spots) }).catch((e) => app.toast(e.message)).finally(() => id === seq.current && setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [query, tags, filters, bounds, me, app.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const locate = async () => {
    try { const l = await getLocation(); setMe(l); flyPoint(l.lat, l.lng, 15); app.toast('Mga bagong lapag malapit sa’yo') } catch (e: any) { app.toast(e.message) }
  }

  const focus = useCallback((s: Spot, scroll: boolean) => {
    setFocusId(s.id); flyPoint(s.lat, s.lng)
    if (scroll) (tray.current?.querySelector(`[data-id="${s.id}"]`) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [])
  // Tapping a light focuses its story; tapping the focused light opens it.
  const onLight = useCallback((s: Spot) => { if (s.id === focusId) setOpenId(s.id); else focus(s, true) }, [focusId, focus])
  // Swiping the tray flies the camera to whichever story is in front.
  const onTrayScroll = () => {
    window.clearTimeout(trayTimer.current)
    trayTimer.current = window.setTimeout(() => {
      const el = tray.current; if (!el) return
      const vertical = isDesktop(), pos = vertical ? el.scrollTop : el.scrollLeft
      let best: HTMLElement | null = null, bd = Infinity
      for (const c of Array.from(el.children) as HTMLElement[]) { const d = Math.abs((vertical ? c.offsetTop : c.offsetLeft) - el.firstElementChild!.getBoundingClientRect().height * 0 - pos - (vertical ? 0 : 16)); if (d < bd) { bd = d; best = c } }
      const s = spots.find((x) => String(x.id) === best?.dataset.id)
      if (s && s.id !== focusId) focus(s, false)
    }, 160)
  }

  const apply = async (next: { query: string; tags: string[]; filters: Filters }) => {
    setSearchOpen(false); setTags(next.tags); setFilters(next.filters)
    const text = next.query.trim()
    if (/near me|malapit/i.test(text)) { setQuery(text.replace(/food|near me|malapit/gi, '').trim()); void locate(); return }
    setQuery(text); setOpenId(null)
    if (!text) return
    const r = await api<{ spots: Spot[] }>('GET', `/spots?q=${encodeURIComponent(text)}`)
    if (r.spots.length) flyBounds(boundsOf(r.spots))
    else {
      const g = await geocodePlace(text)
      if (g) { setQuery(''); flyBounds(g.bounds); app.toast(`Tingnan natin ang ${g.name}`) } else app.toast('Wala pa dito. Ibang salita?')
    }
  }

  const desktop = isDesktop()
  const inset = desktop ? { top: 120, left: 380, right: openId ? 560 : 0, bottom: 0 } : { top: 150, left: 0, right: 0, bottom: 280 }
  const summary = [query && `“${query}”`, ...tags, ...filters.price.map((b) => BANDS[b]), filters.radius ? RADII.find(([r]) => r === filters.radius)?.[1] : '', filters.verified && 'verified', filters.recent && 'bago', filters.inactive && '+ sarado'].filter(Boolean) as string[]
  const quiet = !loading && !spots.length

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="mapLayer"><MapView spots={spots} selectedId={focusId} onSelect={onLight} me={me} target={target} onBounds={setBounds} inset={inset} /></div>
      <div className="scrimTop" /><div className="scrimBot" />

      <button className="prompt" onClick={() => setSearchOpen(true)} aria-label="Maghanap">
        <span className="say">Saan tayo kakain?</span>
        <span className="kick">{summary.length ? summary.join(' · ') : 'Pares, silog, lugaw… o isang lugar'}</span>
      </button>
      {summary.length > 0 && <div className="filterline"><button className="link" onClick={() => { setQuery(''); setTags([]); setFilters(NO_FILTERS) }}>× Alisin ang filter</button></div>}

      <button className="locate" style={{ bottom: desktop ? undefined : 260 }} aria-label="Malapit sa akin" onClick={locate}><Locate /></button>

      <div className="trayHead kick"><span>{loading ? 'Hinahanap ang mga ilaw…' : quiet ? 'Tahimik dito' : <><b>{spots.length}</b> lapag dito</>}</span>{!quiet && !desktop && <span>swipe →</span>}</div>
      <div className="tray" ref={tray} onScroll={onTrayScroll}>
        {quiet ? (
          <div className="story empty">
            <p className="say" style={{ fontSize: 30 }}>Parang tahimik dito ah.</p>
            <p className="meta" style={{ margin: '8px 0 14px' }}>Baka ikaw ang unang makakadiskubre.</p>
            <button className="btn solid" onClick={app.openLapag}>＋ Lapag mo</button>
          </div>
        ) : spots.slice(0, 40).map((s) => <TrayStory key={s.id} s={s} on={s.id === focusId} onOpen={() => { focus(s, false); setOpenId(s.id) }} />)}
      </div>

      {openId != null && <div className="page" role="dialog" aria-modal="true"><SpotDetail key={openId} id={openId} autoHere={initialHere && openId === initialSpot} onClose={() => setOpenId(null)} /></div>}
      {searchOpen && <Search value={{ query, tags, filters }} onApply={apply} onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

function centerOf(b: string): LatLng { const [s, w, n, e] = b.split(',').map(Number); return { lat: (s + n) / 2, lng: (w + e) / 2 } }
function boundsOf(spots: Spot[]): [[number, number], [number, number]] {
  const lats = spots.map((s) => s.lat), lngs = spots.map((s) => s.lng)
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}

/** Search is a sentence, not a form: type anything, or tap the words. */
function Search({ value, onApply, onClose }: { value: { query: string; tags: string[]; filters: Filters }; onApply: (v: { query: string; tags: string[]; filters: Filters }) => void; onClose: () => void }) {
  const [q, setQ] = useState(value.query), [tags, setTags] = useState(value.tags), [f, setF] = useState(value.filters)
  const toggle = (t: string) => setTags((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))
  const go = () => onApply({ query: q, tags, filters: f })
  return (
    <div className="search" role="dialog" aria-modal="true">
      <form className="in" onSubmit={(e) => { e.preventDefault(); go() }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Saan tayo kakain?" enterKeyHint="search" aria-label="Maghanap" />
        <button type="button" className="link" onClick={onClose}>Isara</button>
      </form>
      <div className="col" style={{ paddingTop: 20, paddingBottom: 120 }}>
        <span className="kick">Pagkain, lugar, o “malapit sa akin”</span>
        {Object.entries(TAG_GROUPS).map(([g, ts]) => (
          <div key={g} style={{ marginTop: 22 }}><div className="kick dim" style={{ marginBottom: 6 }}>{g}</div>
            <div className="words">{ts.map((t) => <button key={t} className={tags.includes(t) ? 'on' : ''} onClick={() => toggle(t)}>{t}</button>)}</div></div>
        ))}
        <span className="lbl">Magkano</span>
        <div className="opt">{(Object.keys(BANDS) as PriceBand[]).map((b) => <button key={b} className={f.price.includes(b) ? 'on' : ''} onClick={() => setF({ ...f, price: f.price.includes(b) ? f.price.filter((x) => x !== b) : [...f.price, b] })}>{BANDS[b]}</button>)}</div>
        <span className="lbl">Gaano kalayo</span>
        <div className="opt">{RADII.map(([r, l]) => <button key={r} className={f.radius === r ? 'on' : ''} onClick={() => setF({ ...f, radius: r })}>{l}</button>)}</div>
        <span className="lbl">Iba pa</span>
        <div className="opt">
          <button className={f.verified ? 'on' : ''} onClick={() => setF({ ...f, verified: !f.verified })}>May nakapunta talaga</button>
          <button className={f.recent ? 'on' : ''} onClick={() => setF({ ...f, recent: !f.recent })}>Bagong lapag</button>
          <button className={f.inactive ? 'on' : ''} onClick={() => setF({ ...f, inactive: !f.inactive })}>Isama ang baka sarado</button>
        </div>
        <div className="row" style={{ marginTop: 30, gap: 16 }}>
          <button className="btn solid" onClick={go}>Hanapin</button>
          <button className="link" onClick={() => { setQ(''); setTags([]); setF(NO_FILTERS) }}>I-reset</button>
        </div>
      </div>
    </div>
  )
}
