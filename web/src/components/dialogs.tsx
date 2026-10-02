import { useState } from 'react'
import { api, setToken } from '../lib/api'
import { useApp } from '../app-context'
import { REASONS, type Spot } from '../lib/types'
import { getLocation } from '../lib/geo'
import { Dialog } from './ui'

export function ChoiceDialog({ title, options, custom, onPick, onClose }: { title: string; options: string[]; custom?: string; onPick: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  return (
    <Dialog onClose={onClose}>
      <h3 className="h-lg" style={{ marginBottom: 14 }}>{title}</h3>
      <div className="opt">{options.map((o) => <button key={o} onClick={() => onPick(o)} style={{ textTransform: 'capitalize' }}>{o}</button>)}</div>
      {custom && (
        <form className="inline" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) onPick(text.trim()) }}>
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={custom} maxLength={40} />
          <button className="btn dark sm" style={{ height: 40 }}>Gawa</button>
        </form>
      )}
    </Dialog>
  )
}

export function ReportDialog({ type, id, onClose }: { type: string; id: number; onClose: () => void }) {
  const app = useApp()
  const spotOnly = ['fake_spot', 'wrong_location', 'duplicate', 'closed']
  const reasons = Object.entries(REASONS).filter(([k]) => type === 'spot' || !spotOnly.includes(k))
  const [reason, setReason] = useState(reasons[0][0]), [note, setNote] = useState(''), [err, setErr] = useState('')
  return (
    <Dialog onClose={onClose}>
      <h3 className="h-lg">I-report</h3>
      <p className="meta" style={{ marginTop: 4 }}>Titingnan ito ng mga moderator. Salamat sa pag-aalaga ng mapa.</p>
      <span className="lbl">Ano ang mali?</span>
      <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <span className="lbl">Detalye (optional)</span>
      <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <p className="err">{err}</p>
      <button className="btn solid block" onClick={async () => {
        try { const r = await api('POST', '/reports', { targetType: type, targetId: id, reason, note }); app.toast(r.duplicate ? 'Na-report mo na ito' : 'Salamat! Titingnan namin.'); onClose() }
        catch (e: any) { setErr(e.message) }
      }}>Ipadala</button>
    </Dialog>
  )
}

/** The "＋ LAPAG" entry point: what did you find? */
export function LapagMenu({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const app = useApp()
  const [nearby, setNearby] = useState<Spot[] | null>(null), [msg, setMsg] = useState('')
  const ate = async () => {
    setMsg('Hinahanap ang mga malapit…')
    try {
      const l = await getLocation()
      const r = await api<{ spots: Spot[] }>('GET', `/spots?lat=${l.lat}&lng=${l.lng}&radius=300&limit=8`)
      if (!r.spots.length) setMsg('Walang lapag na malapit sa’yo. Baka bago ito? I-lapag mo!'); else { setMsg(''); setNearby(r.spots) }
    } catch (e: any) { setMsg(e.message) }
  }
  return (
    <Dialog onClose={onClose}>
      {nearby ? <>
        <h3 className="h-lg">Alin dito?</h3>
        <div style={{ marginTop: 10 }}>{nearby.map((s) => <button key={s.id} className="menuopt" onClick={() => { onClose(); app.openSpot(s.id, { here: true }) }}><span className="h-lg">{s.name}</span><span className="meta">{s.distanceM} m ang layo · {s.municipality}</span></button>)}</div>
      </> : <>
        <h3 className="h-xl">Ano’ng nakita mo?</h3>
        <div style={{ marginTop: 14 }}>
          <button className="menuopt" onClick={onNew}><span className="h-lg">May bago akong nadiscover</span><span className="meta">Photo, pin sa mapa, kwento. Mga 30 segundo.</span></button>
          <button className="menuopt" onClick={ate}><span className="h-lg">Kakain / kumain ako sa isang lugar</span><span className="meta">I-verify ang visit at mag-review.</span></button>
        </div>
        <p className="err">{msg}</p>
      </>}
    </Dialog>
  )
}

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState({ username: '', email: '', login: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Dialog onClose={onClose}>
      <div className="kick"><b>LapagKainan</b></div>
      <h2 className="h-xl" style={{ margin: '4px 0 6px' }}>{mode === 'login' ? 'Welcome back.' : 'Sumali ka.'}</h2>
      <p className="meta">Hidden food exists somewhere. Tulungan mo kaming hanapin.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('')
        try {
          const body = mode === 'login' ? { login: f.login, password: f.password } : { username: f.username, email: f.email, password: f.password }
          const r = await api('POST', `/auth/${mode}`, body)
          setToken(r.token); app.setUser(r.user); app.toast(`Uy, @${r.user.username}!`); onClose()
        } catch (er: any) { setErr(er.message) } finally { setBusy(false) }
      }}>
        {mode === 'register' ? <>
          <span className="lbl">Username (public)</span><input className="field" value={f.username} onChange={set('username')} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.]+" autoComplete="username" />
          <span className="lbl">Email</span><input className="field" type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        </> : <>
          <span className="lbl">Username o email</span><input className="field" value={f.login} onChange={set('login')} required autoComplete="username" />
        </>}
        <span className="lbl">Password</span><input className="field" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <p className="err">{err}</p>
        <button className="btn solid block" disabled={busy}>{mode === 'login' ? 'Log in' : 'Gumawa ng account'}</button>
      </form>
      <p className="meta" style={{ textAlign: 'center', marginTop: 14 }}>
        {mode === 'login' ? 'Bago ka dito? ' : 'May account ka na? '}
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>{mode === 'login' ? 'Gumawa ng account' : 'Log in'}</button>
      </p>
      <p className="meta" style={{ marginTop: 10 }}>Nakikita ang username mo sa mga review. Hindi kailanman ipinapakita ang eksaktong GPS mo.</p>
    </Dialog>
  )
}
