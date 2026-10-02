import { useMemo } from 'react'
import { agoTl, area, distance, PRICE_SHORT, quoteOf } from '../lib/format'
import { tileFor } from '../lib/mapTiles'
import type { Spot } from '../lib/types'
import { Photo } from './ui'

/** Person → discovery → food → story → location. */
const who = (s: Spot) => <>@{s.discoverer} <b>nakahanap</b> · {agoTl(s.createdAt)}</>
const where = (s: Spot) => [s.name, area(s).split(',')[0], PRICE_SHORT[s.priceBand], s.distanceM != null ? distance(s.distanceM) : ''].filter(Boolean).join(' · ')
const words = (s: Spot, max = 120) => quoteOf(s.description, max)
const trust = (s: Spot) => s.status !== 'active' ? <span className="off-txt">Baka sarado na</span> : s.verifiedVisits ? <span className="ok">{s.verifiedVisits} nakapunta talaga</span> : null
const act = (fn: () => void) => ({ onClick: fn, role: 'button' as const, tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && fn() })

/** A story in the map tray. Photo-led when there is a photo; text-led when there isn't. */
export function TrayStory({ s, on, onOpen }: { s: Spot; on: boolean; onOpen: () => void }) {
  const q = words(s, 90)
  return (
    <article className={`story ${s.coverPhoto ? '' : 'text'} ${on ? 'on' : ''}`} data-id={s.id} {...act(onOpen)}>
      {s.coverPhoto && <Photo id={s.coverPhoto} name={s.name} />}
      <div className="txt">
        <div className="kick">{who(s)}</div>
        <p className="say">{q ? `“${q}”` : s.name}</p>
        <div className="meta">{where(s)}</div>
        {trust(s) && <div style={{ marginTop: 4 }}>{trust(s)}</div>}
      </div>
    </article>
  )
}

export function FeedPhoto({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const q = words(s)
  return (
    <article className="fx f-photo" {...act(onOpen)}>
      <Photo id={s.coverPhoto} name={s.name} nat />
      <div className="kick" style={{ marginTop: 12 }}>{who(s)}</div>
      <p className="say">{q ? `“${q}”` : s.name}</p>
      <div className="meta">{where(s)}</div>
      {trust(s) && <div style={{ marginTop: 6 }}>{trust(s)}</div>}
    </article>
  )
}

export function FeedText({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  return (
    <article className="fx f-text" {...act(onOpen)}>
      <div className="kick">{who(s)}</div>
      <p className="say">“{words(s, 160)}”</p>
      <div className="meta">{where(s)}</div>
    </article>
  )
}

export function FeedPair({ a, b, onOpen }: { a: Spot; b?: Spot; onOpen: (s: Spot) => void }) {
  return (
    <div className="f-pair">
      {[a, b].filter(Boolean).map((s) => s && (
        <article className="fx" key={s.id} {...act(() => onOpen(s))}>
          <Photo id={s.coverPhoto} name={s.name} />
          <p className="say">{words(s, 60) ? `“${words(s, 60)}”` : s.name}</p>
          <div className="meta">@{s.discoverer} · {s.name}</div>
        </article>
      ))}
    </div>
  )
}

/** A discovery told through its place: a small piece of the lit map. */
export function FeedMap({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const tiles = useMemo(() => {
    const z = 15, n = 2 ** z
    const fx = ((s.lng + 180) / 360) * n
    const r = (s.lat * Math.PI) / 180
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
    const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5)
    return { z, x0, y0, px: (fx - x0) * 256, py: (fy - y0) * 256 }
  }, [s.lat, s.lng])
  return (
    <article className="fx f-map" {...act(onOpen)}>
      <div className="snip">
        <div className="tiles" style={{ left: `calc(50% - ${tiles.px}px)`, top: `calc(50% - ${tiles.py}px)` }}>
          {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => <img key={`${dx}${dy}`} alt="" src={tileFor(tiles.z, tiles.x0 + dx, tiles.y0 + dy)} />)}
        </div>
        <div className={`lt ph${s.verifiedVisits ? ' v' : ''}`} style={s.coverPhoto ? ({ ['--img' as string]: `url(/api/photos/${s.coverPhoto})` } as React.CSSProperties) : undefined} />
      </div>
      <div className="kick" style={{ marginTop: 12 }}>{s.distanceM != null ? <><b>{distance(s.distanceM)}</b> mula sa’yo</> : area(s)}</div>
      <p className="say">{words(s, 90) ? `“${words(s, 90)}”` : s.name}</p>
      <div className="meta">{s.name} · @{s.discoverer}</div>
    </article>
  )
}

export function FeedLine({ s, onOpen }: { s: Spot; onOpen: () => void }) {
  const q = words(s, 80)
  return (
    <div className="f-line" {...act(onOpen)}>
      <Photo id={s.coverPhoto} name={s.name} />
      <div className="grow">
        <div className="kick">{who(s)}</div>
        <p className="say">{q ? `“${q}”` : s.name}</p>
        <div className="meta">{where(s)}</div>
        {trust(s)}
      </div>
    </div>
  )
}
