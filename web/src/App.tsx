import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './lib/api'
import { Ctx, type AppCtx } from './app-context'
import type { User } from './lib/types'
import { AuthDialog, LapagMenu } from './components/dialogs'
import { Bookmark, Flame, MapIcon, Plus, UserIcon } from './components/icons'
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
  const [authOpen, setAuthOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [lapagOpen, setLapagOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState(''), [version, setVersion] = useState(0)
  const [mapKey, setMapKey] = useState(0)
  const [pending, setPending] = useState<{ id: number; here: boolean } | null>(null)

  useEffect(() => {
    const h = () => { const r = parseHash(); setRoute(r); if (r.spot) { setPending({ id: r.spot, here: false }); setMapKey((k) => k + 1) } }
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])
  useEffect(() => {
    if (!getToken()) return
    api<{ user: User | null }>('GET', '/me').then((r) => { if (r.user) setUser(r.user); else setToken(null) }).catch(() => {})
  }, [])
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(''), 3200); return () => clearTimeout(t) }, [toastMsg])

  const ctx = useMemo<AppCtx>(() => ({
    user, setUser,
    toast: setToastMsg,
    requireLogin: () => { if (user) return true; setToastMsg('Mag-login muna para makasali'); setAuthOpen(true); return false },
    openAuth: () => setAuthOpen(true),
    // Opening a spot always happens on the map; remounting the map applies it.
    openSpot: (id, opts) => { setPending({ id, here: !!opts?.here }); setMapKey((k) => k + 1); location.hash = '#map' },
    openLapag: () => { if (user) setMenuOpen(true); else { setToastMsg('Mag-login muna para makapag-lapag'); setAuthOpen(true) } },
    version, bump: () => setVersion((v) => v + 1),
  }), [user, version])

  const go = useCallback((t: Tab) => { location.hash = '#' + t }, [])
  const initial = pending ?? (route.spot ? { id: route.spot, here: false } : null)
  const tab = (t: Tab, label: string, icon: React.ReactNode) => <button key={t} className={route.tab === t ? 'on' : ''} onClick={() => go(t)}>{icon}{label}</button>

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <div className="screen">
          {/* The map stays mounted so panning state survives tab switches. */}
          <div style={{ position: 'absolute', inset: 0, visibility: route.tab === 'map' ? 'visible' : 'hidden' }}>
            <MapScreen key={mapKey} initialSpot={initial?.id ?? null} initialHere={!!initial?.here} />
          </div>
          {route.tab === 'discover' && <DiscoverScreen />}
          {route.tab === 'saved' && <SavedScreen />}
          {route.tab === 'profile' && <ProfileScreen username={route.user} />}

          <header className="mast">
            <button className="wordmark" onClick={() => go('map')}>Lapag<span>kainan</span></button>
            <nav className="deskNav">
              {([['map', 'Mapa'], ['discover', 'Kwento'], ['saved', 'Saved']] as const).map(([t, l]) => <button key={t} className={`tab ${route.tab === t ? 'on' : ''}`} onClick={() => go(t)}>{l}</button>)}
              <button className="btn solid sm" onClick={ctx.openLapag}>＋ Lapag</button>
            </nav>
            <button className={`avatar ${user ? '' : 'out'}`} aria-label="Account" onClick={() => (user ? go('profile') : setAuthOpen(true))}>{user ? user.username[0].toUpperCase() : 'Log in'}</button>
          </header>
        </div>

        <nav className="nav" aria-label="Main">
          {tab('map', 'Mapa', <MapIcon />)}
          {tab('discover', 'Kwento', <Flame />)}
          <button className="lapag" onClick={ctx.openLapag}><Plus />LAPAG</button>
          {tab('saved', 'Saved', <Bookmark />)}
          {tab('profile', 'Ikaw', <UserIcon />)}
        </nav>

        {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
        {menuOpen && <LapagMenu onClose={() => setMenuOpen(false)} onNew={() => { setMenuOpen(false); setLapagOpen(true) }} />}
        {lapagOpen && <LapagFlow onClose={() => setLapagOpen(false)} onCreated={(s) => { setLapagOpen(false); ctx.openSpot(s.id) }} />}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </Ctx.Provider>
  )
}
