import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api, setToken } from '../lib/api'
import { useApp } from '../app-context'
import { agoTl } from '../lib/format'
import { getLocation, lastKnownLocation } from '../lib/geo'
import { TILE_ATTRIBUTION, TILE_URL, DEFAULT_CENTER } from '../lib/mapTiles'
import type { Discover, Profile, Spot } from '../lib/types'
import { FeedLine, FeedMap, FeedPair, FeedPhoto, FeedText } from '../components/stories'
import { ListSkeleton } from '../components/ui'

/** Composes a feed with rhythm from whatever exists — works with 1 discovery or 500. */
function Feed({ d }: { d: Discover }) {
  const app = useApp()
  const open = (s: Spot) => app.openSpot(s.id)
  const blocks = useMemo(() => {
    const seen = new Set<number>(), pool: Spot[] = []
    for (const s of [...d.recent, ...d.near, ...d.favorites, ...d.missed, ...d.budget]) if (!seen.has(s.id)) { seen.add(s.id); pool.push(s) }
    const out: React.ReactNode[] = []
    const take = (pred: (s: Spot) => boolean) => { const i = pool.findIndex(pred); return i < 0 ? undefined : pool.splice(i, 1)[0] }
    const hasPhoto = (s: Spot) => !!s.coverPhoto, hasWords = (s: Spot) => s.description.trim().length > 24
    let i = 0
    while (pool.length && i < 30) {
      const kind = i % 5
      if (kind === 0) { const s = take(hasPhoto) ?? take(() => true)!; out.push(<FeedPhoto key={`p${s.id}`} s={s} onOpen={() => open(s)} />) }
      else if (kind === 1) { const s = take(hasWords); if (s) out.push(<FeedText key={`t${s.id}`} s={s} onOpen={() => open(s)} />) }
      else if (kind === 2) { const a = take(hasPhoto); if (a) out.push(<FeedPair key={`pr${a.id}`} a={a} b={take(hasPhoto)} onOpen={open} />) }
      else if (kind === 3) { const s = take(() => true); if (s) out.push(<FeedMap key={`m${s.id}`} s={s} onOpen={() => open(s)} />) }
      else { const ls = pool.splice(0, 3); if (ls.length) out.push(<div className="sec" key={`l${ls[0].id}`}><span className="kick"><b>Baka hindi mo pa alam</b></span>{ls.map((s) => <FeedLine key={s.id} s={s} onOpen={() => open(s)} />)}</div>) }
      i++
    }
    return out
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!blocks.length) return <div className="empty"><p className="h-lg">Wala pang lapag.</p><p>Parang tahimik pa. Ikaw kaya ang una?</p><button className="btn solid" onClick={app.openLapag}>＋ Lapag mo</button></div>
  return <div className="feed">{blocks}</div>
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
      <span className="kick">Mga kwento · walang ads, walang bayad na ranking</span>
      <h1 className="h-xl" style={{ margin: '8px 0 10px' }}>Baka may masarap na hindi mo pa alam.</h1>
      {!loc && <button className="link" style={{ marginBottom: 28 }} onClick={() => getLocation().then(setLoc).catch((e) => app.toast(e.message))}>Unahin ang malapit sa akin</button>}
      <div style={{ marginTop: 26 }}>{d ? <Feed d={d} /> : <ListSkeleton />}</div>
    </div></div>
  )
}

function FitAll({ spots }: { spots: Spot[] }) {
  const map = useMap()
  useEffect(() => { if (spots.length) map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [40, 40], maxZoom: 15 }) }, [map, spots])
  return null
}
const dot = L.divIcon({ className: '', html: '<div class="dotpin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })

export function SavedScreen() {
  const app = useApp()
  const [lists, setLists] = useState<Record<string, Spot[]> | null>(null)
  useEffect(() => { if (app.user) api<{ lists: Record<string, Spot[]> }>('GET', '/me/saves').then((r) => setLists(r.lists)).catch((e) => app.toast(e.message)) }, [app.user, app.version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app.user) return <div className="scroll"><div className="col empty"><p className="h-lg">Walang naka-save.</p><p>Mag-login para mabuo ang sarili mong mapa ng mga gustong balikan.</p><button className="btn solid" onClick={app.openAuth}>Log in</button></div></div>
  if (!lists) return <div className="scroll"><div className="col"><ListSkeleton /></div></div>
  const all = Object.values(lists).flat(), names = Object.keys(lists)
  return (
    <div className="scroll"><div className="col">
      <span className="kick">Saved · {all.length} ilaw</span>
      <h1 className="h-xl" style={{ margin: '8px 0 18px' }}>Food trip mo.</h1>
      {all.length > 0 && <div className="miniMap" style={{ height: 260, margin: '0 -16px 10px', border: 0 }}>
        <MapContainer center={DEFAULT_CENTER} zoom={10} zoomControl={false} style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          {all.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={dot} eventHandlers={{ click: () => app.openSpot(s.id) }} />)}
          <FitAll spots={all} />
        </MapContainer>
      </div>}
      {names.length ? names.map((n) => <div className="blk sec" key={n}><span className="kick"><b>{n}</b> · {lists[n].length}</span>{lists[n].map((s) => <FeedLine key={s.id} s={s} onOpen={() => app.openSpot(s.id)} />)}</div>)
        : <div className="empty"><p className="h-lg">Wala pa dito.</p><p>I-save ang kahit anong lapag para magsimula ang food trip.</p></div>}
    </div></div>
  )
}

export function ProfileScreen({ username }: { username: string | null }) {
  const app = useApp()
  const name = username ?? app.user?.username ?? null
  const [p, setP] = useState<Profile | null>(null), [err, setErr] = useState('')
  useEffect(() => { setP(null); setErr(''); if (name) api<Profile>('GET', `/users/${encodeURIComponent(name)}`).then(setP).catch((e) => setErr(e.message)) }, [name, app.version])
  if (!name) return <div className="scroll"><div className="col empty"><p className="h-lg">Sino ka?</p><p>Mag-login para makita ang mga nadiskubre mo.</p><button className="btn solid" onClick={app.openAuth}>Log in / Sumali</button></div></div>
  if (err) return <div className="scroll"><div className="col empty"><p className="h-lg">Hindi mahanap.</p><p>{err}</p></div></div>
  if (!p) return <div className="scroll"><div className="col"><ListSkeleton /></div></div>
  const own = app.user?.username.toLowerCase() === p.user.username.toLowerCase()
  return (
    <div className="scroll"><div className="col">
      <span className="kick">{own ? 'Ikaw' : 'Taga-diskubre'} · sumali {agoTl(p.user.joinedAt)}</span>
      <h1 className="h-xl" style={{ margin: '8px 0 0' }}>@{p.user.username}</h1>
      <div className="stats">
        <div><b>{p.stats.discoveries}</b><span>Nilapag</span></div><div><b>{p.stats.verifiedVisits}</b><span>Nakapunta talaga</span></div>
        <div><b>{p.stats.reviews}</b><span>Reviews</span></div><div><b>{p.stats.likesReceived}</b><span>Likes</span></div>
      </div>
      <div className="blk"><span className="kick">Mga natuklasan</span>
        <div className="finds">{p.badges.map((b) => <span key={b.id} className={`find ${b.earned ? '' : 'off'}`} title={b.desc}>{b.name}{!b.earned && b.progress ? ` ${b.progress}` : ''}</span>)}</div></div>
      <div className="blk sec"><span className="kick">Mga nilapag</span>{p.spots.length ? p.spots.map((s) => <FeedLine key={s.id} s={s} onOpen={() => app.openSpot(s.id)} />) : <p className="meta">Wala pa. {own ? 'May nakita ka bang solid?' : ''}</p>}</div>
      <div className="blk"><span className="kick">Reviews</span>{p.reviews.length ? p.reviews.map((r) => (
        <div className="rev" key={r.id}><div className="row wrap" style={{ gap: 10 }}><button className="kick" onClick={() => app.openSpot(r.spot_id)}><b>{r.spot_name}</b></button><span className="kick">{agoTl(r.created_at)}</span>{r.verified && <span className="ok">Nandoon talaga</span>}</div>{r.body && <p className="say">“{r.body}”</p>}</div>
      )) : <p className="meta">Wala pa.</p>}</div>
      {own && <p style={{ marginTop: 34 }}><button className="link" onClick={() => { setToken(null); app.setUser(null); app.toast('Ingat!'); location.hash = '#map' }}>Log out</button></p>}
    </div></div>
  )
}
