import { useCallback, useEffect, useState } from 'react'
import { api, photoUrl } from '../lib/api'
import { useApp } from '../app-context'
import { ago, area, readImage } from '../lib/format'
import { BANDS, TIER, type SpotDetail as Detail } from '../lib/types'
import { Bookmark, Camera, Chat, Check, Flag, Heart, Navigate, Share, Star } from './icons'
import { emojiFor } from '../lib/food'
import { Rating, Spinner, SpotBadges } from './ui'
import { ImHereFlow, ReviewFlow } from './flows'
import { ChoiceDialog, ReportDialog } from './dialogs'

export default function SpotDetail({ id }: { id: number }) {
  const app = useApp()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [flow, setFlow] = useState<null | 'here' | 'review' | 'save' | 'photoKind'>(null)
  const [report, setReport] = useState<{ type: string; id: number } | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)

  const load = useCallback(() => api<Detail>('GET', `/spots/${id}`).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => { setD(null); setError(''); load() }, [load, app.user?.id])

  if (error) return <div className="empty">{error}</div>
  if (!d) return <Spinner />
  const { spot: s, me } = d
  const changed = () => { load(); app.bump() }
  const guard = (fn: () => Promise<void> | void) => async () => {
    if (!app.requireLogin()) return
    try { await fn() } catch (e: any) { app.toast(e.message) }
  }

  const share = async () => {
    const url = `${location.origin}/#spot/${id}`
    try {
      if (navigator.share) await navigator.share({ title: s.name, text: 'Hidden food exists somewhere', url })
      else { await navigator.clipboard.writeText(url); app.toast('Link copied') }
    } catch { /* cancelled */ }
  }

  return (
    <div className="detail">
      <div className="gallery">
        {d.photos.length ? d.photos.slice(0, 8).map((p) => <figure className="polaroid big" key={p.id}><img src={photoUrl(p.id)} alt={`${p.kind} photo by ${p.username}`} loading="lazy" /><figcaption>@{p.username}</figcaption></figure>)
          : <div className="polaroid big"><div className="ph" style={{ height: 150 }}><span>{emojiFor(s.tags)}</span></div><div className="cap">Wala pang photo</div></div>}
      </div>

      <h2>{s.name}</h2>
      <div className="meta" style={{ marginTop: 4 }}>
        <Rating value={s.ratings.overall} />{s.reviewCount > 0 && <span> ({s.reviewCount})</span>}
        <span className="dot">·</span><b className="peso">{TIER[s.priceBand]}</b> {BANDS[s.priceBand]}<span className="dot">·</span>{area(s)}
      </div>
      <div className="tags"><SpotBadges s={s} />{s.tags.map((t) => <span className="pill" key={t}>{t}</span>)}</div>

      <div className="actions">
        <a className="btn primary" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}><Navigate width={16} height={16} />Directions</a>
        <button className={`btn ${me.saved ? 'on' : ''}`} onClick={guard(async () => { if (me.saved) { await api('DELETE', `/spots/${id}/save`); changed() } else setFlow('save') })}><Bookmark width={16} height={16} />{me.saved ?? 'Save'}</button>
        <button className={`btn ${me.liked ? 'on' : ''}`} onClick={guard(async () => { await (me.liked ? api('DELETE', `/spots/${id}/like`) : api('POST', `/spots/${id}/like`, {})); changed() })}><Heart width={16} height={16} />{s.likes}</button>
        <button className="btn" onClick={share}><Share width={16} height={16} />Share</button>
      </div>

      {s.status === 'inactive' && <div className="alert"><b>Marked inactive.</b> The community reports this place may be closed. If you know it's open, tap “Still open” below.</div>}

      <div className="hereCard">
        <div className="grow"><b>Nandito ka ba ngayon?</b><div className="meta">Verify your visit with a photo and leave a review.</div></div>
        <button className="btn green" onClick={guard(() => setFlow('here'))}>I'm here</button>
      </div>

      {s.description && <p style={{ margin: '14px 0' }}>{s.description}</p>}
      {s.hours && <p className="meta">Hours: {s.hours}</p>}
      <p className="meta">Discovered by <b>@{s.discoverer}</b> {ago(s.createdAt)}</p>

      <div className="section">
        <h3>Ano'ng sabi ng community</h3>
        <div className="ratingGrid">
          {([['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['cleanliness', 'Cleanliness']] as const).map(([k, l]) => (
            <div key={k}><b>{s.ratings[k] ?? '—'}</b><span>{l}</span></div>
          ))}
        </div>
        <button className="btn sm" onClick={guard(() => setFlow('review'))}>{me.reviewed ? 'Edit my review' : 'Write a review'}</button>
      </div>

      <div className="section">
        <h3>Community photos 📸</h3>
        {d.photos.length ? <div className="photoGrid">{d.photos.map((p) => <img key={p.id} src={photoUrl(p.id)} alt={p.kind} loading="lazy" title={`${p.kind} · @${p.username}`} />)}</div> : <p className="meta">Wala pang photos.</p>}
        <label className="btn sm" style={{ marginTop: 10 }}>
          <Camera width={16} height={16} />Add photo
          <input type="file" accept="image/*" hidden onClick={(e) => { if (!app.requireLogin()) e.preventDefault() }}
            onChange={async (e) => { try { setPendingPhoto(await readImage(e.target.files?.[0])); setFlow('photoKind') } catch (er: any) { app.toast(er.message) } e.target.value = '' }} />
        </label>
      </div>

      <div className="section">
        <h3>Prices <span className="meta">community-reported</span></h3>
        {d.prices.length ? d.prices.map((p) => <div className="priceLine" key={p.id}><span>{p.item}</span><span><b>₱{p.price}</b> <span className="meta">· {ago(p.created_at)} by @{p.username}</span></span></div>) : <p className="meta">No price reports yet.</p>}
        <PriceForm id={id} onDone={changed} />
      </div>

      <div className="section">
        <h3>Reviews</h3>
        {d.reviews.length ? d.reviews.map((r) => (
          <div className="item" key={r.id}>
            <div className="row wrap"><b>@{r.username}</b>{r.verified && <span className="stamp"><Check width={12} height={12} />Verified Visit</span>}<span className="meta">{ago(r.created_at)}</span></div>
            <div className="meta"><span className="rate"><Star />{r.overall}</span> · Food {r.food} · Value {r.value} · Service {r.service} · Clean {r.cleanliness}</div>
            {r.body && <p style={{ margin: '4px 0' }}>{r.body}</p>}
            <button className="btn ghost sm" onClick={guard(() => setReport({ type: 'review', id: r.id }))}>Report</button>
          </div>
        )) : <p className="meta">Wala pang review. Kumain ka na ba dito?</p>}
      </div>

      <div className="section">
        <h3>Comments</h3>
        {d.comments.map((c) => (
          <div className="item" key={c.id}><b>@{c.username}</b> {c.body} <span className="meta">{ago(c.created_at)}</span>
            <button className="btn ghost sm" onClick={guard(() => setReport({ type: 'comment', id: c.id }))}>Report</button></div>
        ))}
        <CommentForm id={id} onDone={changed} />
      </div>

      <div className="section">
        <h3>Help keep this accurate</h3>
        <div className="row wrap">
          <button className={`btn sm ${me.signal === 'open' ? 'on' : ''}`} onClick={guard(async () => { await api('POST', `/spots/${id}/signal`, { kind: 'open' }); app.toast('Salamat! Noted.'); changed() })}>Still open</button>
          <button className={`btn sm ${me.signal === 'closed' ? 'on' : ''}`} onClick={guard(async () => { const r = await api('POST', `/spots/${id}/signal`, { kind: 'closed' }); app.toast(r.status === 'inactive' ? 'Marked inactive by the community' : 'Salamat sa report'); changed() })}>Appears closed</button>
          <button className="btn sm" onClick={guard(() => setReport({ type: 'spot', id }))}><Flag width={14} height={14} />Report</button>
        </div>
      </div>

      {flow === 'here' && <ImHereFlow spot={s} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'review' && <ReviewFlow spot={s} visitId={me.visitId} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'save' && <ChoiceDialog title="Save to…" options={['Want to Try', 'Visited', 'Favorites']} custom="New collection…" onClose={() => setFlow(null)}
        onPick={async (list) => { setFlow(null); try { await api('PUT', `/spots/${id}/save`, { list }); app.toast('Saved'); changed() } catch (e: any) { app.toast(e.message) } }} />}
      {flow === 'photoKind' && pendingPhoto && <ChoiceDialog title="What kind of photo?" options={['food', 'exterior', 'menu', 'interior']} onClose={() => { setFlow(null); setPendingPhoto(null) }}
        onPick={async (kind) => { setFlow(null); try { await api('POST', `/spots/${id}/photos`, { photo: pendingPhoto, kind }); app.toast('Photo added'); changed() } catch (e: any) { app.toast(e.message) } setPendingPhoto(null) }} />}
      {report && <ReportDialog type={report.type} id={report.id} onClose={() => setReport(null)} />}
    </div>
  )
}

function PriceForm({ id, onDone }: { id: number; onDone: () => void }) {
  const app = useApp()
  const [item, setItem] = useState(''), [price, setPrice] = useState('')
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault(); if (!app.requireLogin()) return
      try { await api('POST', `/spots/${id}/prices`, { item, price: +price }); setItem(''); setPrice(''); onDone() } catch (er: any) { app.toast(er.message) }
    }}>
      <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Item (e.g. Pares)" required maxLength={60} />
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₱" type="number" min="0" step="0.5" required style={{ maxWidth: 90 }} />
      <button className="btn sm">Add</button>
    </form>
  )
}

function CommentForm({ id, onDone }: { id: number; onDone: () => void }) {
  const app = useApp()
  const [body, setBody] = useState('')
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault(); if (!app.requireLogin()) return
      try { await api('POST', `/spots/${id}/comments`, { body }); setBody(''); onDone() } catch (er: any) { app.toast(er.message) }
    }}>
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share what you know: hours, tips…" required maxLength={600} />
      <button className="btn sm" aria-label="Post comment"><Chat width={16} height={16} /></button>
    </form>
  )
}
