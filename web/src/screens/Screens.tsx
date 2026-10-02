import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api, setToken } from '../lib/api'
import { useApp } from '../app-context'
import { ago } from '../lib/format'
import { getLocation, lastKnownLocation } from '../lib/geo'
import { TILE_ATTRIBUTION, TILE_URL, DEFAULT_CENTER } from '../lib/mapTiles'
import type { Discover, Profile, Spot } from '../lib/types'
import { Bleed, Feature, Line, Quote, Tile } from '../components/stories'
import { ListSkeleton, Photo } from '../components/ui'

function Feed({ d }: { d: Discover }) {
  const app = useApp()
  const open = (s: Spot) => () => app.openSpot(s.id)
  const pool = useMemo(() => {
    const seen = new Set<number>(), out: Spot[] = []
    for (const s of [...d.recent, ...d.favorites, ...d.near, ...d.budget, ...d.missed]) if (!seen.has(s.id)) { seen.add(s.id); out.push(s) }
    return out
  }, [d])
  if (!pool.length) return <div className="empty"><p className="h-lg">Wala pang lapag.</p><p>Mukhang wala pang nakakadiscover dito. Ikaw ang una?</p><button className="btn solid" onClick={app.openLapag}>＋ LAPAG</button></div>

  // Editorial rhythm: one big story, a staggered pair, a full-bleed photo, a text-led quote, then a photo mosaic.
  const [hero, a, b, wide, ...rest] = pool
  const withText = rest.find((s) => s.description.trim().length > 20) ?? rest[0]
  const tail = rest.filter((s) => s !== withText)
  const mosaic = pool.filter((s) => s.coverPhoto).slice(0, 7)
  const nearList = d.near.slice(0, 5), cheap = d.budget.slice(0, 4), missed = d.missed.slice(0, 4)
  return (
    <div className="feed">
      <Feature s={hero} onOpen={open(hero)} />
      {(a || b) && <div className="pair">{a && <Tile s={a} onOpen={open(a)} />}{b && <Tile s={b} onOpen={open(b)} />}</div>}
      {wide && <Bleed s={wide} onOpen={open(wide)} />}
      {withText && <Quote s={withText} onOpen={open(withText)} />}
      {mosaic.length >= 5 && <div><div className="sechead"><span className="kick"><b>Mula sa community</b></span></div><div className="mosaic">{mosaic.map((s) => <Photo key={s.id} id={s.coverPhoto} name={s.name} onClick={open(s)} />)}</div></div>}
      {nearList.length > 0 && <div><div className="sechead"><span className="h-md">Malapit sa’yo</span></div>{nearList.map((s) => <Line key={s.id} s={s} onOpen={open(s)} />)}</div>}
      {cheap.length > 0 && <div><div className="sechead"><span className="h-md">Tipid finds</span><span className="meta">₱100 pababa</span></div>{cheap.map((s) => <Line key={s.id} s={s} onOpen={open(s)} />)}</div>}
      {(missed.length > 0 || tail.length > 0) && <div><div className="sechead"><span className="h-md">Baka hindi mo pa nakikita</span></div>{[...missed, ...tail].slice(0, 5).map((s) => <Line key={s.id} s={s} onOpen={open(s)} />)}</div>}
    </div>
  )
}

export function DiscoverScreen() {
  const app = useApp()
  const [d, setD] = useState<Discover | null>(null), [loc, setLoc] = useState(lastKnownLocation())
  useEffect(() => {
    const p = new URLSearchParams(); if (loc) { p.set('lat', String(loc.lat)); p.set('lng', String(loc.lng)) }
    api<Discover>('GET', '/discover?' + p).then(setD).catch((e) => app.toast(e.message))
  }, [loc, app.version]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="scroll"><div className="col">
      <div className="kick"><b>Discover</b></div>
      <h1 className="h-xl" style={{ margin: '4px 0 6px' }}>Baka may masarap na hindi mo pa alam.</h1>
      <p className="meta" style={{ marginBottom: 22 }}>Walang ads. Walang bayad na ranking. Mga tao lang na nagshe-share.{!loc && <> <button className="link" onClick={() => getLocation().then(setLoc).catch((e) => app.toast(e.message))}>Ipakita ang malapit sa akin</button></>}</p>
      {d ? <Feed d={d} /> : <ListSkeleton />}
    </div></div>
  )
}

function FitAll({ spots }: { spots: Spot[] }) {
  const map = useMap()
  useEffect(() => { if (spots.length) map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [30, 30], maxZoom: 15 }) }, [map, spots])
  return null
}
const dot = L.divIcon({ className: '', html: '<div class="dotmk"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })

export function SavedScreen() {
  const app = useApp()
  const [lists, setLists] = useState<Record<string, Spot[]> | null>(null)
  useEffect(() => { if (app.user) api<{ lists: Record<string, Spot[]> }>('GET', '/me/saves').then((r) => setLists(r.lists)).catch((e) => app.toast(e.message)) }, [app.user, app.version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app.user) return <div className="scroll"><div className="col empty"><p className="h-lg">Walang naka-save.</p><p>Mag-login para makita ang mga lugar na gusto mong balikan.</p><button className="btn solid" onClick={app.openAuth}>Log in</button></div></div>
  if (!lists) return <div className="scroll"><div className="col"><ListSkeleton /></div></div>
  const all = Object.values(lists).flat(), names = Object.keys(lists)
  return (
    <div className="scroll"><div className="col">
      <div className="kick"><b>Saved</b></div>
      <h1 className="h-xl" style={{ margin: '4px 0 14px' }}>Food trip mo.</h1>
      {all.length > 0 && <div className="miniMap" style={{ height: 230, marginBottom: 8 }}>
        <MapContainer center={DEFAULT_CENTER} zoom={10} zoomControl={false} style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          {all.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={dot} eventHandlers={{ click: () => app.openSpot(s.id) }} />)}
          <FitAll spots={all} />
        </MapContainer>
      </div>}
      {names.length ? names.map((n) => <div className="blk" key={n}><div className="sechead"><span className="h-md">{n}</span><span className="meta">{lists[n].length}</span></div>{lists[n].map((s) => <Line key={s.id} s={s} onOpen={() => app.openSpot(s.id)} />)}</div>)
        : <div className="empty" style={{ padding: '24px 0' }}><p className="h-lg">Wala pa dito.</p><p>I-tap ang Save sa kahit anong lapag para magsimula ang food trip.</p></div>}
    </div></div>
  )
}

export function ProfileScreen({ username }: { username: string | null }) {
  const app = useApp()
  const name = username ?? app.user?.username ?? null
  const [p, setP] = useState<Profile | null>(null), [err, setErr] = useState('')
  useEffect(() => { setP(null); setErr(''); if (name) api<Profile>('GET', `/users/${encodeURIComponent(name)}`).then(setP).catch((e) => setErr(e.message)) }, [name, app.version])
  if (!name) return <div className="scroll"><div className="col empty"><p className="h-lg">Sino ka?</p><p>Mag-login para makita ang mga nadiscover mo.</p><button className="btn solid" onClick={app.openAuth}>Log in / Sign up</button></div></div>
  if (err) return <div className="scroll"><div className="col empty"><p className="h-lg">Hindi mahanap.</p><p>{err}</p></div></div>
  if (!p) return <div className="scroll"><div className="col"><ListSkeleton /></div></div>
  const own = app.user?.username.toLowerCase() === p.user.username.toLowerCase()
  return (
    <div className="scroll"><div className="col">
      <div className="kick"><b>{own ? 'Ikaw' : 'Food explorer'}</b> · sumali {ago(p.user.joinedAt)}</div>
      <h1 className="h-xl" style={{ margin: '4px 0' }}>@{p.user.username}</h1>
      <div className="stat3">
        <div><b>{p.stats.discoveries}</b><span>lapag</span></div><div><b>{p.stats.verifiedVisits}</b><span>verified visits</span></div>
        <div><b>{p.stats.reviews}</b><span>reviews</span></div><div><b>{p.stats.likesReceived}</b><span>likes</span></div>
      </div>
      <div className="blk"><span className="kick">Badges</span><div className="stamps">{p.badges.map((b) => <div key={b.id} className={`stampb ${b.earned ? '' : 'off'}`} title={b.desc}>{b.icon} {b.name}{!b.earned && b.progress ? ` · ${b.progress}` : ''}</div>)}</div></div>
      <div className="blk"><div className="sechead"><span className="h-md">Mga nilapag</span></div>{p.spots.length ? p.spots.map((s) => <Line key={s.id} s={s} onOpen={() => app.openSpot(s.id)} />) : <p className="meta">Wala pa.</p>}</div>
      <div className="blk"><div className="sechead"><span className="h-md">Reviews</span></div>{p.reviews.length ? p.reviews.map((r) => (
        <div className="review" key={r.id}><div className="rt"><b style={{ cursor: 'pointer' }} onClick={() => app.openSpot(r.spot_id)}>{r.spot_name}</b>{r.verified && <span className="ok" style={{ fontSize: 12 }}>Verified Visit</span>}<span className="meta">{ago(r.created_at)}</span></div><p>{r.body}</p></div>
      )) : <p className="meta">Wala pa.</p>}</div>
      {own && <p style={{ marginTop: 20 }}><button className="btn" onClick={() => { setToken(null); app.setUser(null); app.toast('Ingat!'); location.hash = '#map' }}>Log out</button></p>}
    </div></div>
  )
}
