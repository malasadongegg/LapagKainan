import { useMemo } from 'react'
import { agoTl, area, distance, PRICE_SHORT, quoteOf } from '../lib/format'
import { tileFor } from '../lib/mapTiles'
import type { Spot } from '../lib/types'
import { Photo } from './ui'
import { pinHtml } from './MapView'

const TIER = ['', '₱', '₱₱', '₱₱₱', '₱₱₱₱']
const words = (s: Spot, max = 120) => quoteOf(s.description, max)
const act = (fn: () => void) => ({ onClick: fn, role: 'button' as const, tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && fn() })

/** "@juan nakahanap · 3 araw na" with a small avatar: the person always comes first. */
export function Who({ name, at, verb = 'nakahanap' }: { name: string; at: number; verb?: string }) {
  return <div className="who"><span className="av">{name[0]?.toUpperCase()}</span><span><b>@{name}</b> {verb} · {agoTl(at)}</span></div>
}

function Status({ s }: { s: Spot }) {
  if (s.status !== 'active') return <span className="stat off">Baka sarado na</span>
  if (s.verifiedVisits) return <span className="stat v">✓ {s.verifiedVisits} nakapunta</span>
  if (s.ratings.overall) return <span className="stat">★ {s.ratings.overall.toFixed(1)} · {s.reviewCount} review</span>
  return <span className="stat">Bagong lapag · {agoTl(s.createdAt)}</span>
}

/** Map tray card: the food, the place, and what the person who found it said. */
export function TrayCard({ s, on, onOpen }: { s: Spot; on: boolean; onOpen: () => void }) {
  const q = words(s, 90)
  return (
    <article className={`card ${on ? 'on' : ''}`} data-id={s.id} {...act(onOpen)}>
      <div className="cimg">
        <Photo id={s.coverPhoto} name={s.name} />
        {s.tags[0] && <span className="cat">{s.tags[0]}</span>}
        {s.distanceM != null && <span className="dist">{distance(s.distanceM)}</span>}
      </div>
      <div className="cbody">
        <h3>{s.name}</h3>
        <div className="where"><span>{area(s)}</span><b>{TIER[s.priceTier]}</b></div>
        {q && <p className="cq">“{q}” <span>— @{s.discoverer}</span></p>}
        <div className="cfoot"><Status s={s} /><span className="btn solid sm">Tingnan</span></div>
      </div>
    </article>
  )
}

/** Feed: a big photo story. */
export function FeedPhoto({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const q = words(s)
  return (
    <article className="fcard" {...act(onOpen)}>
      <Photo id={s.coverPhoto} name={s.name} nat />
      <div className="fbodyc">
        <Who name={s.discoverer} at={s.createdAt} />
        {q && <p className="fq">“{q}”</p>}
        <div className="fplace"><b>{s.name}</b><span>{area(s)} · {PRICE_SHORT[s.priceBand]}{s.distanceM != null ? ` · ${distance(s.distanceM)}` : ''}</span></div>
        <div className="ffooter"><Status s={s} /><span className="likes">♥ {s.likes} · {s.comments} komento</span></div>
      </div>
    </article>
  )
}

/** Feed: a text-led recommendation, no photo needed. */
export function FeedText({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="fquote" {...act(onOpen)}>
      <span className="mark">“</span>
      <p>{words(s, 160)}</p>
      <Who name={s.discoverer} at={s.createdAt} />
      <div className="fplace"><b>{s.name}</b><span>{area(s)} · {PRICE_SHORT[s.priceBand]}</span></div>
    </article>
  )
}

/** Feed: two smaller discoveries side by side. */
export function FeedPair({ a, b, onOpen }: { a: Spot; b?: Spot; onOpen: (s: Spot) => void }) {
  return (
    <div className="fpair">
      {[a, b].filter(Boolean).map((s) => s && (
        <article className="fmini" key={s.id} {...act(() => onOpen(s))}>
          <Photo id={s.coverPhoto} name={s.name} />
          <div className="fminib">
            <b>{s.name}</b>
            {words(s, 60) && <p>“{words(s, 60)}”</p>}
            <span>@{s.discoverer} · {area(s).split(',')[0]}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

/** Feed: a discovery told through where it is. */
export function FeedMap({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const t = useMemo(() => {
    const z = 15, n = 2 ** z, fx = ((s.lng + 180) / 360) * n, r = (s.lat * Math.PI) / 180
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
    const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy) - 1
    return { z, x0, y0, px: (fx - x0) * 256, py: (fy - y0) * 256 }
  }, [s.lat, s.lng])
  return (
    <article className="fcard" {...act(onOpen)}>
      <div className="snip">
        <div className="tiles" style={{ left: `calc(50% - ${t.px}px)`, top: `calc(50% - ${t.py}px)` }}>
          {[0, 1, 2].flatMap((dy) => [0, 1, 2].map((dx) => [dx, dy])).map(([dx, dy]) => <img key={`${dx}${dy}`} alt="" src={tileFor(t.z, t.x0 + dx, t.y0 + dy)} />)}
        </div>
        <div className="snipPin" dangerouslySetInnerHTML={{ __html: pinHtml(s, false) }} />
        {s.distanceM != null && <span className="dist">{distance(s.distanceM)} mula sa’yo</span>}
      </div>
      <div className="fbodyc">
        <Who name={s.discoverer} at={s.createdAt} />
        {words(s, 90) && <p className="fq">“{words(s, 90)}”</p>}
        <div className="fplace"><b>{s.name}</b><span>{area(s)} · {PRICE_SHORT[s.priceBand]}</span></div>
      </div>
    </article>
  )
}

/** Compact row for lists (Saved, Profile, feed sections). */
export function FeedLine({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const q = words(s, 80)
  return (
    <div className="frow" {...act(onOpen)}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="grow">
        <b>{s.name}</b>
        <span className="sub">{area(s)} · {TIER[s.priceTier]}{s.distanceM != null ? ` · ${distance(s.distanceM)}` : ''}</span>
        {q && <p>“{q}”</p>}
        <Status s={s} />
      </div>
    </div>
  )
}
