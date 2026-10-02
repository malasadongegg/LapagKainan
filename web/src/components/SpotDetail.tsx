import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../app-context'
import { agoTl, area, PRICE_SHORT, readImage } from '../lib/format'
import type { SpotDetail as Detail } from '../lib/types'
import { Bookmark, Heart, Navigate, Share } from './icons'
import { Bars, Photo } from './ui'
import { ImHereFlow, ReviewFlow } from './flows'
import { ChoiceDialog, ReportDialog } from './dialogs'

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

  const bar = (
    <div className="pbar">
      <button className="link" onClick={onClose}>← Mapa</button>
      {d && <button className="link" onClick={async () => {
        const url = `${location.origin}/#spot/${id}`
        try { if (navigator.share) await navigator.share({ title: d.spot.name, text: 'Hidden food exists somewhere.', url }); else { await navigator.clipboard.writeText(url); app.toast('Na-copy ang link') } } catch { /* cancelled */ }
      }}><Share />Share</button>}
    </div>
  )
  if (error) return <>{bar}<div className="dv empty"><p className="h-lg">Hindi mahanap.</p><p>{error}</p></div></>
  if (!d) return <>{bar}<div className="photo nat skel" /><div className="dv" style={{ paddingTop: 18 }}><div className="skel" style={{ height: 34, width: '80%', marginBottom: 10 }} /><div className="skel" style={{ height: 34, width: '60%' }} /></div></>

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
      {bar}
      {lead ? <div className="lead"><Photo id={lead.id} name={s.name} nat /></div> : null}
      <div className="dv">
        <div className="kick label">@{s.discoverer} <b>nakahanap</b> · {agoTl(s.createdAt)}</div>
        <p className={`say quoteBig ${story ? '' : 'none'}`}>{story ? `“${story}”` : 'Walang kwento pa. Ikaw na magkwento.'}</p>
        <h2 className="name">{s.name}</h2>
        <div className="meta facts">{area(s)}<span className="sep">·</span>{PRICE_SHORT[s.priceBand]}{s.hours && <><span className="sep">·</span>{s.hours}</>}<span className="sep">·</span>{s.tags.join(' / ')}</div>

        {s.status === 'inactive' && <div className="alertline"><b>Patay na ang ilaw?</b> Ilang tao ang nagsabing sarado na ito. Kung bukas pa, sabihin mo sa baba.</div>}

        <div className="acts">
          <a className="btn solid" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}><Navigate />Puntahan</a>
          <button className={`link ${me.saved ? 'on' : ''}`} onClick={guard(async () => { if (me.saved) { await api('DELETE', `/spots/${id}/save`); changed() } else setFlow('save') })}><Bookmark fill={me.saved ? 'currentColor' : 'none'} />{me.saved ? `Saved · ${me.saved}` : 'Save'}</button>
          <button className={`link ${me.liked ? 'on' : ''}`} onClick={guard(async () => { setPop(true); await (me.liked ? api('DELETE', `/spots/${id}/like`) : api('POST', `/spots/${id}/like`, {})); changed() })}>
            <span className={pop ? 'pop' : ''} onAnimationEnd={() => setPop(false)} style={{ display: 'inline-flex' }}><Heart fill={me.liked ? 'currentColor' : 'none'} /></span>{s.likes}</button>
        </div>

        <div className="here">
          <div>{s.verifiedVisits ? <div className="ok">{s.verifiedVisits} nakapunta talaga</div> : <div className="meta">Wala pang verified visit</div>}<div className="h-md" style={{ marginTop: 4 }}>Nandito ka ba ngayon?</div></div>
          <button className="btn dark" onClick={guard(() => setFlow('here'))}>Nandito ako</button>
        </div>

        {more.length > 0 && <section className="blk"><span className="kick">Kuha ng community · {d.photos.length}</span>
          <div className="contact">{more.slice(0, 9).map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>
        </section>}
        <div style={{ marginTop: 14 }}>
          <label className="link" style={{ cursor: 'pointer' }}>+ Dagdag photo
            <input type="file" accept="image/*" hidden onClick={(e) => { if (!app.requireLogin()) e.preventDefault() }}
              onChange={async (e) => { try { setPending(await readImage(e.target.files?.[0])); setFlow('photoKind') } catch (er: any) { app.toast(er.message) } e.target.value = '' }} /></label>
        </div>

        <section className="blk">
          <span className="kick">Worth it ba? · {s.reviewCount} review{s.reviewCount === 1 ? '' : 's'}</span>
          <Bars rows={[['Food', s.ratings.food], ['Value', s.ratings.value], ['Service', s.ratings.service], ['Cleanliness', s.ratings.cleanliness]]} />
          <div style={{ marginTop: 14 }}><button className="link" onClick={guard(() => setFlow('review'))}>{me.reviewed ? 'Baguhin ang review ko' : 'Mag-review'}</button></div>
          {d.reviews.map((r) => {
            const shots = d.photos.filter((p) => p.username === r.username && p.kind === 'meal').slice(0, 3)
            return (
              <div className="rev" key={r.id}>
                <div className="row wrap" style={{ gap: 10 }}><span className="kick">@{r.username} · {agoTl(r.created_at)}</span>{r.verified && <span className="ok">Nandoon talaga</span>}</div>
                {r.body && <p className="say">“{r.body}”</p>}
                <div className="meta">Overall {r.overall}/5<span className="sep">·</span>Food {r.food}<span className="sep">·</span>Value {r.value}<span className="sep">·</span>Service {r.service}<span className="sep">·</span>Clean {r.cleanliness}</div>
                {shots.length > 0 && <div className="mini">{shots.map((p) => <Photo key={p.id} id={p.id} name={s.name} />)}</div>}
                <div style={{ marginTop: 8 }}><button className="link" onClick={guard(() => setReport({ type: 'review', id: r.id }))}>Report</button></div>
              </div>
            )
          })}
          {!d.reviews.length && <p className="meta" style={{ marginTop: 14 }}>Wala pang review. First time mo dito?</p>}
        </section>

        <section className="blk receipt">
          <span className="kick">Magkano? · galing sa community</span>
          {d.prices.map((p) => <div className="l" key={p.id}><span>{p.item}</span><i /><b>₱{p.price}</b><small>{agoTl(p.created_at)} · @{p.username}</small></div>)}
          {!d.prices.length && <p className="meta">Wala pang presyo. Ano yung inorder mo?</p>}
          <PriceForm id={id} onDone={changed} />
        </section>

        <section className="blk">
          <span className="kick">Usapan · {d.comments.length}</span>
          {d.comments.map((c) => <div className="cmt" key={c.id}><span className="kick">@{c.username} · {agoTl(c.created_at)}</span><p>{c.body}</p><button className="link" style={{ marginTop: 4 }} onClick={guard(() => setReport({ type: 'comment', id: c.id }))}>Report</button></div>)}
          <CommentForm id={id} onDone={changed} />
        </section>

        <section className="blk">
          <span className="kick">Tama pa ba ‘to?</span>
          <div className="row wrap" style={{ gap: 20 }}>
            <button className={`link ${me.signal === 'open' ? 'on' : ''}`} onClick={guard(async () => { await api('POST', `/spots/${id}/signal`, { kind: 'open' }); app.toast('Salamat! Bukas pa raw.'); changed() })}>Bukas pa</button>
            <button className={`link ${me.signal === 'closed' ? 'on' : ''}`} onClick={guard(async () => { const r = await api('POST', `/spots/${id}/signal`, { kind: 'closed' }); app.toast(r.status === 'inactive' ? 'Pinatay na ang ilaw. Salamat.' : 'Salamat sa report'); changed() })}>Mukhang sarado</button>
            <button className="link" onClick={guard(() => setReport({ type: 'spot', id }))}>May mali</button>
          </div>
        </section>
      </div>

      {flow === 'here' && <ImHereFlow spot={s} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'review' && <ReviewFlow spot={s} visitId={me.visitId} onClose={() => setFlow(null)} onDone={changed} />}
      {flow === 'save' && <ChoiceDialog title="I-save sa…" options={['Want to Try', 'Visited', 'Favorites']} custom="Bagong collection…" onClose={() => setFlow(null)}
        onPick={async (list) => { setFlow(null); try { await api('PUT', `/spots/${id}/save`, { list }); app.toast(`Saved · ${list}`); changed() } catch (e: any) { app.toast(e.message) } }} />}
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
      <input className="field" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₱" type="number" min="0" step="0.5" required style={{ maxWidth: 80 }} />
      <button className="btn sm">Add</button>
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
      <button className="btn sm">Post</button>
    </form>
  )
}
