import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './lib/api'
import { Ctx, type AppCtx } from './app-context'
import type { User } from './lib/types'
import { Bookmark, Flame, MapIcon, Plus, UserIcon } from './components/icons'
import { AuthDialog } from './components/dialogs'
import { LapagFlow } from './components/flows'
import MapScreen from './screens/MapScreen'
import { DiscoverScreen, ProfileScreen, SavedScreen } from './screens/Screens'

type Tab = 'map' | 'discover' | 'saved' | 'profile'
function parseHash() {
  const [name, arg] = (location.hash.slice(1) || 'map').split('/')
  const tab: Tab = (['map', 'discover', 'saved', 'profile'] as const).find((t) => t === name) ?? (name === 'u' ? 'profile' : 'map')
  return { tab, spot: name === 'spot' && +arg ? +arg : null, user: name === 'u' && arg ? decodeURIComponent(arg) : null }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [route, setRoute] = useState(parseHash)
  const [authOpen, setAuthOpen] = useState(false), [lapagOpen, setLapagOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState(''), [version, setVersion] = useState(0)
  const [mapKey, setMapKey] = useState(0)
  const [pendingSpot, setPendingSpot] = useState<number | null>(null)

  useEffect(() => { const h = () => setRoute(parseHash()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  useEffect(() => {
    if (!getToken()) return
    api<{ user: User | null }>('GET', '/me').then((r) => { if (r.user) setUser(r.user); else setToken(null) }).catch(() => {})
  }, [])
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(''), 3200); return () => clearTimeout(t) }, [toastMsg])

  const ctx = useMemo<AppCtx>(() => ({
    user, setUser,
    toast: setToastMsg,
    requireLogin: () => { if (user) return true; setToastMsg('Mag-login muna para makasali sa community'); setAuthOpen(true); return false },
    openAuth: () => setAuthOpen(true),
    // Opening a spot always happens on the map screen.
    openSpot: (id) => { setPendingSpot(id); setMapKey((k) => k + 1); location.hash = '#map' },
    openLapag: () => { if (user) setLapagOpen(true); else { setToastMsg('Mag-login muna para makapag-Lapag'); setAuthOpen(true) } },
    version, bump: () => setVersion((v) => v + 1),
  }), [user, version])

  const go = useCallback((t: Tab) => { location.hash = '#' + t }, [])
  const initialSpot = pendingSpot ?? route.spot

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <div className="screen">
          {/* The map stays mounted so panning state isn't lost when switching tabs. */}
          <div style={{ position: 'absolute', inset: 0, visibility: route.tab === 'map' ? 'visible' : 'hidden' }}><MapScreen key={mapKey} initialSpot={initialSpot} /></div>
          {route.tab === 'discover' && <div style={{ position: 'absolute', inset: 0, background: '#fff' }}><DiscoverScreen /></div>}
          {route.tab === 'saved' && <div style={{ position: 'absolute', inset: 0, background: '#fff' }}><SavedScreen /></div>}
          {route.tab === 'profile' && <div style={{ position: 'absolute', inset: 0, background: '#fff' }}><ProfileScreen username={route.user} /></div>}

          <div className="deskNav">
            {([['map', 'Map'], ['discover', 'Discover'], ['saved', 'Saved']] as const).map(([t, l]) => <button key={t} className={`btn ${route.tab === t ? 'on' : ''}`} onClick={() => go(t)}>{l}</button>)}
            <button className="btn" onClick={() => (user ? go('profile') : setAuthOpen(true))}>{user ? `@${user.username}` : 'Log in'}</button>
            <button className="btn red" onClick={ctx.openLapag}><Plus width={16} height={16} />Lapag</button>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          <button className={route.tab === 'map' ? 'on' : ''} onClick={() => go('map')}><MapIcon />Map</button>
          <button className={route.tab === 'discover' ? 'on' : ''} onClick={() => go('discover')}><Flame />Discover</button>
          <button className="lapag" onClick={ctx.openLapag} aria-label="Lapag"><span><Plus /></span>Lapag</button>
          <button className={route.tab === 'saved' ? 'on' : ''} onClick={() => go('saved')}><Bookmark />Saved</button>
          <button className={route.tab === 'profile' ? 'on' : ''} onClick={() => go('profile')}><UserIcon />Profile</button>
        </nav>

        {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
        {lapagOpen && <LapagFlow onClose={() => setLapagOpen(false)} onCreated={(s) => { setLapagOpen(false); ctx.openSpot(s.id) }} />}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </Ctx.Provider>
  )
}
