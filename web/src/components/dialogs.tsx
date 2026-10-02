import { useState } from 'react'
import { api, setToken } from '../lib/api'
import { useApp } from '../app-context'
import { REASONS } from '../lib/types'
import { Dialog } from './ui'

export function ChoiceDialog({ title, options, custom, onPick, onClose }: { title: string; options: string[]; custom?: string; onPick: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  return (
    <Dialog onClose={onClose}>
      <h3 style={{ margin: '0 0 12px' }}>{title}</h3>
      <div className="row wrap">{options.map((o) => <button key={o} className="btn" onClick={() => onPick(o)} style={{ textTransform: 'capitalize' }}>{o}</button>)}</div>
      {custom && (
        <form className="inlineForm" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) onPick(text.trim()) }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={custom} maxLength={40} />
          <button className="btn sm primary">Create</button>
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
      <h3 style={{ margin: '0 0 4px' }}>Report</h3>
      <p className="sub">Moderators will review it. Thanks for keeping the map honest.</p>
      <label className="lbl">What's wrong?</label>
      <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <label className="lbl">Details (optional)</label>
      <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <p className="err">{err}</p>
      <button className="btn primary block" onClick={async () => {
        try { const r = await api('POST', '/reports', { targetType: type, targetId: id, reason, note }); app.toast(r.duplicate ? 'You already reported this' : 'Salamat! We\'ll review it'); onClose() }
        catch (e: any) { setErr(e.message) }
      }}>Send report</button>
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
      <h2 style={{ margin: '0 0 4px' }}>{mode === 'login' ? 'Welcome back' : 'Sumali sa LapagKainan'}</h2>
      <p className="sub">Hidden food exists somewhere. Help us find it.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('')
        try {
          const body = mode === 'login' ? { login: f.login, password: f.password } : { username: f.username, email: f.email, password: f.password }
          const r = await api('POST', `/auth/${mode}`, body)
          setToken(r.token); app.setUser(r.user); app.toast(`Hi @${r.user.username}!`); onClose()
        } catch (er: any) { setErr(er.message) } finally { setBusy(false) }
      }}>
        {mode === 'register' ? <>
          <label className="lbl">Username (public)</label><input className="field" value={f.username} onChange={set('username')} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.]+" autoComplete="username" />
          <label className="lbl">Email</label><input className="field" type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        </> : <>
          <label className="lbl">Username or email</label><input className="field" value={f.login} onChange={set('login')} required autoComplete="username" />
        </>}
        <label className="lbl">Password</label><input className="field" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <p className="err">{err}</p>
        <button className="btn primary block" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <p className="meta" style={{ textAlign: 'center', marginTop: 14 }}>
        {mode === 'login' ? 'New here? ' : 'Have an account? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}><b>{mode === 'login' ? 'Create an account' : 'Log in'}</b></a>
      </p>
      <p className="meta">Reviews show your username. Your exact GPS is never shown to anyone.</p>
    </Dialog>
  )
}
