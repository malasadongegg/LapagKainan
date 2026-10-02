import { agoTl, area, distance, PRICE_SHORT, quoteOf } from '../lib/format'
import type { Spot } from '../lib/types'
import { Photo } from './ui'

const byline = (s: Spot) => <>Natuklasan ni <b>@{s.discoverer}</b> · {agoTl(s.createdAt)}</>
const ratingText = (s: Spot) => (s.ratings.overall ? `${s.ratings.overall.toFixed(1)}` : 'bago')
/** The discoverer's own words lead; the place name is the fallback headline. */
const headline = (s: Spot) => quoteOf(s.description) || s.name

export function Facts({ s }: { s: Spot }) {
  return <div className="where">{s.name}<span className="sep">·</span>{area(s)}<span className="sep">·</span>{PRICE_SHORT[s.priceBand]}{s.distanceM != null && <><span className="sep">·</span>{distance(s.distanceM)}</>}</div>
}

/** Swipeable card in the map's peek tray. */
export function PeekCard({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <div className="peekCard" data-id={s.id} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="grow">
        <div className="kick"><b>{s.name}</b></div>
        <p className="voice">{s.description ? `“${headline(s)}”` : 'Wala pang kwento. Ikaw na magkwento.'}</p>
        <div className="meta">{area(s)} · {PRICE_SHORT[s.priceBand]} · {ratingText(s)}</div>
        {s.verifiedVisits > 0 && <div className="meta ok" style={{ marginTop: 2 }}>{s.verifiedVisits} verified {s.verifiedVisits === 1 ? 'visit' : 'visits'}</div>}
      </div>
    </div>
  )
}

/** Large story, used first in lists. */
export function Feature({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="story feature" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="kick byline">{byline(s)}</div>
      <p className="voice">{s.description ? `“${headline(s)}”` : s.name}</p>
      <Facts s={s} />
      <div className="acts"><span>♥ {s.likes}</span><span>{s.comments} komento</span>{s.verifiedVisits > 0 && <span className="ok">{s.verifiedVisits} verified</span>}</div>
    </article>
  )
}

/** Compact line for dense lists. */
export function Line({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <div className="line" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="grow">
        <h4>{s.name}{s.status === 'inactive' && <span className="state"> · baka sarado</span>}</h4>
        {s.description && <p className="voice">“{headline(s)}”</p>}
        <div className="meta">{area(s)}<span className="sep">·</span>{PRICE_SHORT[s.priceBand]}<span className="sep">·</span>{ratingText(s)}{s.distanceM != null && <><span className="sep">·</span>{distance(s.distanceM)}</>}</div>
        {s.verifiedVisits > 0 && <div className="meta ok">{s.verifiedVisits} verified</div>}
      </div>
    </div>
  )
}

/** Half-width tile for the staggered pair layout. */
export function Tile({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="story" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="kick">@{s.discoverer}</div>
      <p className="voice">{s.description ? `“${headline(s)}”` : s.name}</p>
      <div className="where">{s.name} · {area(s).split(',')[0]}</div>
    </article>
  )
}

/** Full-bleed photo with the story laid over it. */
export function Bleed({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="bleed" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="cap">
        <div className="kick">{byline(s)}</div>
        <p className="voice">{s.description ? `“${headline(s)}”` : s.name}</p>
        <div className="kick">{s.name} · {area(s).split(',')[0]} · {PRICE_SHORT[s.priceBand]}</div>
      </div>
    </article>
  )
}

/** Text-led recommendation, no photo. */
export function Quote({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="quote" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="kick">{byline(s)}</div>
      <p className="voice">“{headline(s)}”</p>
      <div className="where">{s.name} · {area(s)} · {PRICE_SHORT[s.priceBand]}</div>
    </article>
  )
}
