import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api, setToken } from '../lib/api'
import { emojiFor } from '../lib/food'
import { useApp } from '../app-context'
import { ago } from '../lib/format'
import { getLocation, lastKnownLocation } from '../lib/geo'
import { TILE_ATTRIBUTION, TILE_URL, DEFAULT_CENTER } from '../lib/mapTiles'
import type { Discover, Profile, Spot } from '../lib/types'
import { Check, Locate } from '../components/icons'
import { Spinner, SpotCard, SpotRow } from '../components/ui'

function Row({ title, spots }: { title: string; spots?: Spot[] }) {
  const app = useApp()
  if (!spots?.length) return null
  return <div className="section"><h3>{title}</h3><div className="hCards">{spots.map((s) => <SpotCard key={s.id} s={s} onClick={() => app.openSpot(s.id)} />)}</div></div>
}

export function DiscoverScreen() {
  const app = useApp()
  const [d, setD] = useState<Discover | null>(null), [loc, setLoc] = useState(lastKnownLocation())
  useEffect(() => {
    const p = new URLSearchParams(); if (loc) { p.set('lat', String(loc.lat)); p.set('lng', String(loc.lng)) }
    api<Discover>('GET', '/discover?' + p).then(setD).catch((e) => app.toast(e.message))
  }, [loc, app.version]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="scroll"><div className="page">
      <h1>Discover <em>🔥</em></h1><p className="sub">Walang ads. Walang bayad na ranking. Community lang.</p>
      {!loc && <button className="btn sm soft" onClick={() => getLocation().then(setLoc).catch((e) => app.toast(e.message))}><Locate width={16} height={16} />Show spots near me</button>}
      {!d ? <Spinner /> : <>
        <Row title="📍 Near you" spots={d.near} /><Row title="✨ Recently discovered" spots={d.recent} /><Row title="🔥 Community favorites" spots={d.favorites} />
        <Row title="💸 Budget finds" spots={d.budget} /><Row title="👀 You might have missed" spots={d.missed} />
        {Object.values(d).every((a) => !a.length) && <div className="empty"><b>Wala pang discoveries.</b><p>Be the first. Tap Lapag!</p><button className="btn red" onClick={app.openLapag}>Lapag mo!</button></div>}
      </>}
    </div></div>
  )
}

function FitAll({ spots }: { spots: Spot[] }) {
  const map = useMap()
  useEffect(() => { if (spots.length) map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng])), { padding: [30, 30], maxZoom: 15 }) }, [map, spots])
  return null
}
const pinFor = (s: Spot) => L.divIcon({ className: '', html: `<div class="pin"><span>${emojiFor(s.tags)}</span></div>`, iconSize: [40, 48], iconAnchor: [20, 46] })

export function SavedScreen() {
  const app = useApp()
  const [lists, setLists] = useState<Record<string, Spot[]> | null>(null)
  useEffect(() => { if (app.user) api<{ lists: Record<string, Spot[]> }>('GET', '/me/saves').then((r) => setLists(r.lists)).catch((e) => app.toast(e.message)) }, [app.user, app.version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!app.user) return <div className="scroll"><div className="page empty"><h1>Saved</h1><p>Mag-login para makita ang saved food spots mo.</p><button className="btn primary" onClick={app.openAuth}>Log in</button></div></div>
  if (!lists) return <div className="scroll"><Spinner /></div>
  const all = Object.values(lists).flat(), names = Object.keys(lists)
  return (
    <div className="scroll"><div className="page">
      <h1>Your <em>food atlas</em></h1><p className="sub">Every spot you saved, on one map.</p>
      <div className="miniMap" style={{ height: 240, borderRadius: 16, overflow: 'hidden' }}>
        <MapContainer center={DEFAULT_CENTER} zoom={10} zoomControl={false} style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          {all.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={pinFor(s)} eventHandlers={{ click: () => app.openSpot(s.id) }} />)}
          <FitAll spots={all} />
        </MapContainer>
      </div>
      {names.length ? names.map((n) => <div className="section" key={n}><h3>{n} <span className="meta">{lists[n].length}</span></h3>{lists[n].map((s) => <SpotRow key={s.id} s={s} onClick={() => app.openSpot(s.id)} />)}</div>)
        : <div className="empty">Wala ka pang saved. Tap Save sa kahit anong food spot.</div>}
    </div></div>
  )
}

export function ProfileScreen({ username }: { username: string | null }) {
  const app = useApp()
  const name = username ?? app.user?.username ?? null
  const [p, setP] = useState<Profile | null>(null), [err, setErr] = useState('')
  useEffect(() => { setP(null); setErr(''); if (name) api<Profile>('GET', `/users/${encodeURIComponent(name)}`).then(setP).catch((e) => setErr(e.message)) }, [name, app.version])
  if (!name) return <div className="scroll"><div className="page empty"><h1>Profile</h1><p>Mag-login para makita ang profile mo.</p><button className="btn primary" onClick={app.openAuth}>Log in / Sign up</button></div></div>
  if (err) return <div className="scroll"><div className="empty">{err}</div></div>
  if (!p) return <div className="scroll"><Spinner /></div>
  const own = app.user?.username.toLowerCase() === p.user.username.toLowerCase()
  return (
    <div className="scroll"><div className="page">
      <h1>@{p.user.username}</h1><p className="sub">Joined {ago(p.user.joinedAt)}</p>
      <div className="stats">
        <div><b>{p.stats.discoveries}</b><span>Discoveries</span></div><div><b>{p.stats.verifiedVisits}</b><span>Verified visits</span></div>
        <div><b>{p.stats.reviews}</b><span>Reviews</span></div><div><b>{p.stats.likesReceived}</b><span>Likes received</span></div>
      </div>
      <div className="badges">{p.badges.map((b) => <div key={b.id} className={`badge ${b.earned ? '' : 'off'}`} title={b.desc}>{b.icon} <b>{b.name}</b>{!b.earned && b.progress && <div className="meta">{b.progress}</div>}</div>)}</div>
      <div className="section"><h3>Discoveries</h3>{p.spots.length ? p.spots.map((s) => <SpotRow key={s.id} s={s} onClick={() => app.openSpot(s.id)} />) : <p className="meta">None yet.</p>}</div>
      <div className="section"><h3>Reviews</h3>{p.reviews.length ? p.reviews.map((r) => (
        <div className="item" key={r.id}><b style={{ cursor: 'pointer' }} onClick={() => app.openSpot(r.spot_id)}>{r.spot_name}</b> · {r.overall}★ {r.verified && <span className="stamp"><Check width={12} height={12} />Verified Visit</span>} <span className="meta">{ago(r.created_at)}</span><div>{r.body}</div></div>
      )) : <p className="meta">None yet.</p>}</div>
      {own && <p><button className="btn" onClick={() => { setToken(null); app.setUser(null); app.toast('Ingat!'); location.hash = '#map' }}>Log out</button></p>}
    </div></div>
  )
}
