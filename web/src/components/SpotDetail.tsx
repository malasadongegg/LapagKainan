import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { ago, agoTl, area, PRICE_SHORT, readImage } from '../lib/format'
import type { SpotDetail as Detail } from '../lib/types'
import { Bookmark, Heart, Navigate, Share } from './icons'
import { Dots, Photo } from './ui'
import { ImHereFlow, ReviewFlow } from './flows'
import { ChoiceDialog, ReportDialog } from './dialogs'

export default function SpotDetail({ id, autoHere }: { id: number; autoHere?: boolean }) {
  const app = useApp()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [flow, setFlow] = useState<null | 'here' | 'review' | 'save' | 'photoKind'>(autoHere ? 'here' : null)
  const [report, setReport] = useState<{ type: string; id: number } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pop, setPop] = useState(false)

  const load = useCallback(() => api<Detail>('GET', `/spots/${id}`).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => { setD(null); setError(''); load() }, [load, app.user?.id])

  if (error) return <div className="empty"><p className="h-lg">Hindi mahanap.</p><p>{error}</p></div>
  if (!d) return <div className="pad"><div className="photo skel" style={{ aspectRatio: '4/3', margin: '0 -16px 16px', borderRadius: 0 }} /><div className="skel" style={{ height: 30, width: '70%', marginBottom: 12 }} /><div className="skel" style={{ height: 20, width: '90%' }} /></div>
  const { spot: s, me } = d
  const changed = () => { load(); app.bump() }
  const guard = (fn: () => Promise<void> | void) => async () => {
    if (!app.requireLogin()) return
    try { await fn() } catch (e: any) { app.toast(e.message) }
  }
  const share = async () => {
    const url = `${location.origin}/#spot/${id}`
    try {
      if (navigator.share) await navigator.share({ title: s.name, text: 'Hidden food exists somewhere.', url })
      else { await navigator.clipboard.writeText(url); app.toast('Na-copy ang link') }
    } catch { /* cancelled */ }
  }
  const story = s.description.trim()
  const dims = [['Food', s.ratings.food], ['Value', s.ratings.value], ['Service', s.ratings.service], ['Cleanliness', s.ratings.cleanliness]] as const
  const cover = d.photos.length ? d.photos : []

  return (
    <div>
      <div className="hero">
        {cover.length ? cover.slice(0, 8).map((p) => <Photo key={p.id} id={p.id} name={s.name} />) : <Photo name={s.name} style={{ width: '100%', aspectRatio: '16/9', borderRadius: 0, flex: 'none' }} />}
      </div>

      <div className="dscv">
        <div className="kick"><b>Community discovery</b></div>
        <h2 className="name">{s.name}</h2>
        {story ? <p className="voice story-q">“{story}”</p> : <p className="voice story-q dim">Wala pang kwento. Ikaw na magkwento.</p>}
        <p className="by">— <b>@{s.discoverer}</b>, {agoTl(s.createdAt)}</p>

        <div className="facts"><span>{area(s)}</span><span>{PRICE_SHORT[s.priceBand]}</span>{s.hours && <span>{s.hours}</span>}</div>
        {s.status === 'inactive' && <div className="alertbar"><b>Baka sarado na.</b> Ilang tao ang nag-report na sarado ito. Kung bukas pa, tap “Bukas pa”.</div>}

        <div className="acts2">
          <a className="btn solid" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}><Navigate />Directions</a>
          <button className={`link ${me.saved ? 'on' : ''}`} onClick={guard(async () => { if (me.saved) { await api('DELETE', `/spots/${id}/save`); changed() } else setFlow('save') })}><Bookmark />{me.saved ?? 'Save'}</button>
          <button className={`link ${me.liked ? 'on' : ''}`} onClick={guard(async () => { setPop(true); await (me.liked ? api('DELETE', `/spots/${id}/like`) : api('POST', `/spots/${id}/like`, {})); changed() })}>
            <span className={pop ? 'pop' : ''} onAnimationEnd={() => setPop(false)} style={{ display: 'inline-flex' }}><Heart fill={me.liked ? 'currentColor' : 'none'} /></span>{s.likes}</button>
          <button className="link" onClick={share}><Share />Share</button>
        </div>

        <div className="herebar">
          <div><div className={s.verifiedVisits ? 'ok' : 'meta'}>{s.verifiedVisits ? `${s.verifiedVisits} verified visit${s.verifiedVisits > 1 ? 's' : ''}` : 'Wala pang verified visit'}</div><div className="meta">Nandito ka ba ngayon?</div></div>
          <button className="btn dark" onClick={guard(() => setFlow('here'))}>Nandito ako</button>
        </div>

        <section className="blk">
          <span className="kick">Ano’ng sabi ng community</span>
          {dims.map(([l, v]) => <div className="rrow" key={l}><span>{l}</span><Dots value={v} /><b>{v ?? '–'}</b></div>)}
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="meta">{s.reviewCount} review{s.reviewCount === 1 ? '' : 's'}</span>
            <button className="link" onClick={guard(() => setFlow('review'))}>{me.reviewed ? 'Edit my review' : 'Write a review'}</button>
          </div>
        </section>

        {d.photos.length > 1 && (
          <section className="blk"><span className="kick">Mga photo ng community · {d.photos.length}</span>
            <div className="shots">{d.photos.slice(0, 7).map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>
          </section>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <label className="link" style={{ cursor: 'pointer' }}>Magdagdag ng photo
            <input type="file" accept="image/*" hidden onClick={(e) => { if (!app.requireLogin()) e.preventDefault() }}
              onChange={async (e) => { try { setPending(await readImage(e.target.files?.[0])); setFlow('photoKind') } catch (er: any) { app.toast(er.message) } e.target.value = '' }} /></label>
        </div>

        <section className="blk receipt">
          <span className="kick">Presyo · galing sa community</span>
          {d.prices.length ? d.prices.map((p) => <div className="l" key={p.id}><span>{p.item}</span><i /><b>₱{p.price}</b><span className="meta">{ago(p.created_at)} · @{p.username}</span></div>) : <p className="meta">Wala pang price report.</p>}
          <PriceForm id={id} onDone={changed} />
        </section>

        <section className="blk">
          <span className="kick">Reviews</span>
          {d.reviews.length ? d.reviews.map((r) => {
            const shots = d.photos.filter((p) => p.username === r.username && p.kind === 'meal').slice(0, 3)
            return (
              <div className="review" key={r.id}>
                <div className="rt"><b>@{r.username}</b>{r.verified && <span className="ok" style={{ fontSize: 12 }}>Verified Visit</span>}<span className="meta">{ago(r.created_at)}</span></div>
                <div className="meta"><Dots value={r.overall} /> <span className="sep">·</span>Food {r.food}<span className="sep">·</span>Value {r.value}<span className="sep">·</span>Service {r.service}<span className="sep">·</span>Clean {r.cleanliness}</div>
                {r.body && <p>{r.body}</p>}
                {shots.length > 0 && <div className="mini">{shots.map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>}
                <button className="link meta" onClick={guard(() => setReport({ type: 'review', id: r.id }))}>Report</button>
              </div>
            )
          }) : <p className="meta">Wala pang review. Kumain ka na ba dito?</p>}
        </section>

        <section className="blk">
          <span className="kick">Usapan</span>
          {d.comments.map((c) => <div className="cmt" key={c.id}><b>@{c.username}</b> {c.body} <span className="meta">{ago(c.created_at)}</span> <button className="link meta" onClick={guard(() => setReport({ type: 'comment', id: c.id }))}>Report</button></div>)}
          <CommentForm id={id} onDone={changed} />
        </section>

        <section className="blk" style={{ paddingBottom: 16 }}>
          <span className="kick">Tulungan nating maging tama</span>
          <div className="row wrap" style={{ gap: 18 }}>
            <button className={`link ${me.signal === 'open' ? 'on' : ''}`} onClick={guard(async () => { await api('POST', `/spots/${id}/signal`, { kind: 'open' }); app.toast('Salamat! Noted.'); changed() })}>Bukas pa</button>
            <button className={`link ${me.signal === 'closed' ? 'on' : ''}`} onClick={guard(async () => { const r = await api('POST', `/spots/${id}/signal`, { kind: 'closed' }); app.toast(r.status === 'inactive' ? 'Na-mark na na baka sarado' : 'Salamat sa report'); changed() })}>Mukhang sarado</button>
            <button className="link" onClick={guard(() => setReport({ type: 'spot', id }))}>Report</button>
          </div>
        </section>
      </div>

      {flow === 'here' && <ImHereFlow spot={s} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'review' && <ReviewFlow spot={s} visitId={me.visitId} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'save' && <ChoiceDialog title="I-save sa…" options={['Want to Try', 'Visited', 'Favorites']} custom="Bagong collection…" onClose={() => setFlow(null)}
        onPick={async (list) => { setFlow(null); try { await api('PUT', `/spots/${id}/save`, { list }); app.toast(`Na-save sa ${list}`); changed() } catch (e: any) { app.toast(e.message) } }} />}
      {flow === 'photoKind' && pending && <ChoiceDialog title="Anong photo ito?" options={['food', 'exterior', 'menu', 'interior']} onClose={() => { setFlow(null); setPending(null) }}
        onPick={async (kind) => { setFlow(null); try { await api('POST', `/spots/${id}/photos`, { photo: pending, kind }); app.toast('Na-add ang photo'); changed() } catch (e: any) { app.toast(e.message) } setPending(null) }} />}
      {report && <ReportDialog type={report.type} id={report.id} onClose={() => setReport(null)} />}
    </div>
  )
}

function PriceForm({ id, onDone }: { id: number; onDone: () => void }) {
  const app = useApp()
  const [item, setItem] = useState(''), [price, setPrice] = useState('')
  return (
    <form className="inline" onSubmit={async (e) => {
      e.preventDefault(); if (!app.requireLogin()) return
      try { await api('POST', `/spots/${id}/prices`, { item, price: +price }); setItem(''); setPrice(''); onDone() } catch (er: any) { app.toast(er.message) }
    }}>
      <input className="field" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ano’ng order? (Pares)" required maxLength={60} />
      <input className="field" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₱" type="number" min="0" step="0.5" required style={{ maxWidth: 84 }} />
      <button className="btn sm" style={{ height: 40 }}>Add</button>
    </form>
  )
}

function CommentForm({ id, onDone }: { id: number; onDone: () => void }) {
  const app = useApp()
  const [body, setBody] = useState('')
  return (
    <form className="inline" onSubmit={async (e) => {
      e.preventDefault(); if (!app.requireLogin()) return
      try { await api('POST', `/spots/${id}/comments`, { body }); setBody(''); onDone() } catch (er: any) { app.toast(er.message) }
    }}>
      <input className="field" value={body} onChange={(e) => setBody(e.target.value)} placeholder="May alam ka? Oras, tip, closed tuwing Linggo…" required maxLength={600} />
      <button className="btn sm" style={{ height: 40 }}>Post</button>
    </form>
  )
}

