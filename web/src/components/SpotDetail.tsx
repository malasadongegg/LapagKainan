import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { agoTl, area, PRICE_SHORT, readImage } from '../lib/format'
import type { SpotDetail as Detail } from '../lib/types'
import { Back, Bookmark, Heart, Navigate, Share } from './icons'
import { Bars, Photo } from './ui'
import { Who } from './stories'
import { ImHereFlow, ReviewFlow } from './flows'
import { ChoiceDialog, ReportDialog } from './dialogs'

const TIER = ['', '₱', '₱₱', '₱₱₱', '₱₱₱₱']

/** A community discovery, not a restaurant profile: the people and what they found come first. */
export default function SpotDetail({ id, autoHere, onClose }: { id: number; autoHere?: boolean; onClose: () => void }) {
  const app = useApp()
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [flow, setFlow] = useState<null | 'here' | 'review' | 'save' | 'photoKind'>(autoHere ? 'here' : null)
  const [report, setReport] = useState<{ type: string; id: number } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pop, setPop] = useState(false)

  const load = useCallback(() => api<Detail>('GET', `/spots/${id}`).then(setD).catch((e) => setError(e.message)), [id])
  useEffect(() => { setD(null); setError(''); load() }, [load, app.user?.id])

  const share = async () => {
    if (!d) return
    const url = `${location.origin}/#spot/${id}`
    try { if (navigator.share) await navigator.share({ title: d.spot.name, text: 'Hidden food exists somewhere.', url }); else { await navigator.clipboard.writeText(url); app.toast('Na-copy ang link') } } catch { /* cancelled */ }
  }
  const floatNav = (
    <div className="pnav">
      <button className="roundBtn" aria-label="Balik sa mapa" onClick={onClose}><Back /></button>
      {d && <button className="roundBtn" aria-label="Share" onClick={share}><Share /></button>}
    </div>
  )
  if (error) return <>{floatNav}<div className="sheet2"><div className="empty"><p className="h-lg">Hindi mahanap.</p><p>{error}</p></div></div></>
  if (!d) return <>{floatNav}<div className="photo skel" style={{ height: 300 }} /><div className="sheet2"><div className="skel" style={{ height: 28, width: '70%', borderRadius: 8, marginBottom: 12 }} /><div className="skel" style={{ height: 16, width: '50%', borderRadius: 8 }} /></div></>

  const { spot: s, me } = d
  const changed = () => { load(); app.bump() }
  const guard = (fn: () => Promise<void> | void) => async () => {
    if (!app.requireLogin()) return
    try { await fn() } catch (e: any) { app.toast(e.message) }
  }
  const [lead, ...more] = d.photos
  const story = s.description.trim()

  return (
    <>
      {floatNav}
      <div className="hero">{lead ? <Photo id={lead.id} name={s.name} nat /> : <Photo name={s.name} style={{ height: 220 }} />}</div>
      <div className="sheet2">
        <div className="tagsRow">{s.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        <h1 className="spotName">{s.name}</h1>
        <div className="sub">{area(s)} · <b className="tier">{TIER[s.priceTier]}</b> {PRICE_SHORT[s.priceBand]}{s.hours ? ` · ${s.hours}` : ''}</div>
        <div className="statRow">
          <span>★ <b>{s.ratings.overall?.toFixed(1) ?? '–'}</b> <small>({s.reviewCount})</small></span>
          <span className={s.verifiedVisits ? 'v' : ''}>✓ <b>{s.verifiedVisits}</b> nakapunta</span>
          <span>♥ <b>{s.likes}</b></span>
        </div>

        {s.status === 'inactive' && <div className="note warn"><b>Baka sarado na.</b> Ilang tao ang nagsabing sarado ito. Kung bukas pa, sabihin mo sa baba.</div>}

        <div className="actions">
          <a className="btn solid grow" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}><Navigate />Puntahan</a>
          <button className={`btn ${me.saved ? 'on' : ''}`} onClick={guard(async () => { if (me.saved) { await api('DELETE', `/spots/${id}/save`); changed() } else setFlow('save') })}><Bookmark fill={me.saved ? 'currentColor' : 'none'} />{me.saved ? 'Saved' : 'Save'}</button>
          <button className={`roundBtn sm ${me.liked ? 'liked' : ''}`} aria-label="Like" onClick={guard(async () => { setPop(true); await (me.liked ? api('DELETE', `/spots/${id}/like`) : api('POST', `/spots/${id}/like`, {})); changed() })}>
            <span className={pop ? 'pop' : ''} onAnimationEnd={() => setPop(false)} style={{ display: 'inline-flex' }}><Heart fill={me.liked ? 'currentColor' : 'none'} /></span></button>
        </div>

        <div className="founder">
          <Who name={s.discoverer} at={s.createdAt} />
          <p className={story ? '' : 'none'}>{story ? `“${story}”` : 'Wala pang kwento. Ikaw na magkwento sa review.'}</p>
        </div>

        <div className="hereCard">
          <div><b>Nandito ka ba ngayon?</b><span>Mag-photo at i-verify ang visit mo.</span></div>
          <button className="btn green" onClick={guard(() => setFlow('here'))}>Nandito ako</button>
        </div>

        <section className="box">
          <div className="boxHead"><h3>Worth it ba?</h3><span>{s.reviewCount} review{s.reviewCount === 1 ? '' : 's'}</span></div>
          {s.reviewCount > 0 ? <div className="rateBlock">
            <div className="big"><b>{s.ratings.overall?.toFixed(1) ?? '–'}</b><span>overall</span></div>
            <Bars rows={[['Food', s.ratings.food], ['Value', s.ratings.value], ['Service', s.ratings.service], ['Cleanliness', s.ratings.cleanliness]]} />
          </div> : <p className="muted">Wala pang nag-rate. Kumain ka na dito? Ikaw ang unang magsasabi kung worth it.</p>}
          <button className="btn solid block" style={{ marginTop: 14 }} onClick={guard(() => setFlow('review'))}>{me.reviewed ? 'Baguhin ang review ko' : s.reviewCount ? 'Mag-rate at mag-review' : 'I-rate ito'}</button>
        </section>

        <section className="box">
          <div className="boxHead"><h3>Kuha ng community</h3><span>{d.photos.length}</span></div>
          {more.length > 0 && <div className="grid">{more.slice(0, 9).map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>}
          <label className="btn block" style={{ marginTop: more.length ? 12 : 0, cursor: 'pointer' }}>+ Magdagdag ng photo
            <input type="file" accept="image/*" hidden onClick={(e) => { if (!app.requireLogin()) e.preventDefault() }}
              onChange={async (e) => { try { setPending(await readImage(e.target.files?.[0])); setFlow('photoKind') } catch (er: any) { app.toast(er.message) } e.target.value = '' }} /></label>
        </section>

        <section className="box">
          <div className="boxHead"><h3>Reviews</h3></div>
          {d.reviews.map((r) => {
            const shots = d.photos.filter((p) => p.username === r.username && p.kind === 'meal').slice(0, 3)
            return (
              <div className="rev" key={r.id}>
                <div className="row between"><Who name={r.username} at={r.created_at} verb="nag-review" /><span className="score">★ {r.overall}</span></div>
                {r.verified && <span className="vtag">✓ Nandoon talaga</span>}
                {r.body && <p>{r.body}</p>}
                <div className="muted small">Food {r.food} · Value {r.value} · Service {r.service} · Clean {r.cleanliness}</div>
                {shots.length > 0 && <div className="mini">{shots.map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>}
                <button className="tlink" onClick={guard(() => setReport({ type: 'review', id: r.id }))}>Report</button>
              </div>
            )
          })}
          {!d.reviews.length && <p className="muted">Wala pang review. First time mo dito?</p>}
        </section>

        <section className="box">
          <div className="boxHead"><h3>Magkano?</h3><span>galing sa community</span></div>
          <div className="receipt">{d.prices.map((p) => <div className="l" key={p.id}><span>{p.item}</span><i /><b>₱{p.price}</b></div>)}</div>
          {!d.prices.length && <p className="muted">Wala pang presyo. Ano yung inorder mo?</p>}
          {d.prices[0] && <p className="muted small">Huling update {agoTl(d.prices[0].created_at)} ni @{d.prices[0].username}</p>}
          <PriceForm id={id} onDone={changed} />
        </section>

        <section className="box">
          <div className="boxHead"><h3>Usapan</h3><span>{d.comments.length}</span></div>
          {d.comments.map((c) => <div className="bubble" key={c.id}><Who name={c.username} at={c.created_at} verb="" /><p>{c.body}</p><button className="tlink" onClick={guard(() => setReport({ type: 'comment', id: c.id }))}>Report</button></div>)}
          <CommentForm id={id} onDone={changed} />
        </section>

        <section className="box plain">
          <div className="boxHead"><h3>Tama pa ba ‘to?</h3></div>
          <div className="row wrap">
            <button className={`btn sm ${me.signal === 'open' ? 'on' : ''}`} onClick={guard(async () => { await api('POST', `/spots/${id}/signal`, { kind: 'open' }); app.toast('Salamat! Bukas pa raw.'); changed() })}>Bukas pa</button>
            <button className={`btn sm ${me.signal === 'closed' ? 'on' : ''}`} onClick={guard(async () => { const r = await api('POST', `/spots/${id}/signal`, { kind: 'closed' }); app.toast(r.status === 'inactive' ? 'Na-mark na baka sarado. Salamat.' : 'Salamat sa report'); changed() })}>Mukhang sarado</button>
            <button className="btn sm" onClick={guard(() => setReport({ type: 'spot', id }))}>May mali</button>
          </div>
        </section>
      </div>

      {flow === 'here' && <ImHereFlow spot={s} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'review' && <ReviewFlow spot={s} visitId={me.visitId} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'save' && <ChoiceDialog title="I-save sa…" options={['Want to Try', 'Visited', 'Favorites']} custom="Bagong collection…" onClose={() => setFlow(null)}
        onPick={async (list) => { setFlow(null); try { await api('PUT', `/spots/${id}/save`, { list }); app.toast(`Na-save sa ${list}`); changed() } catch (e: any) { app.toast(e.message) } }} />}
      {flow === 'photoKind' && pending && <ChoiceDialog title="Anong kuha ito?" options={['food', 'exterior', 'menu', 'interior']} onClose={() => { setFlow(null); setPending(null) }}
        onPick={async (kind) => { setFlow(null); try { await api('POST', `/spots/${id}/photos`, { photo: pending, kind }); app.toast('Na-add ang photo'); changed() } catch (e: any) { app.toast(e.message) } setPending(null) }} />}
      {report && <ReportDialog type={report.type} id={report.id} onClose={() => setReport(null)} />}
    </>
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
      <input className="field" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Inorder (Pares)" required maxLength={60} />
      <input className="field" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₱" type="number" min="0" step="0.5" required style={{ maxWidth: 84 }} />
      <button className="btn solid sm">Add</button>
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
      <input className="field" value={body} onChange={(e) => setBody(e.target.value)} placeholder="May alam ka? Oras, tip, sarado tuwing Linggo…" required maxLength={600} />
      <button className="btn solid sm">Post</button>
    </form>
  )
}
