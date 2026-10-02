import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { photoUrl } from '../lib/api'
import { area, distance } from '../lib/format'
import { BANDS, TIER, type Spot } from '../lib/types'
import { Close, Star } from './icons'
import { emojiFor } from '../lib/food'

export function Rating({ value }: { value: number | null }) {
  return value ? <span className="rate"><Star />{value.toFixed(1)}</span> : <span className="pill new">✦ New find</span>
}

export function SpotBadges({ s }: { s: Spot }) {
  return <>
    {s.status === 'inactive' && <span className="pill red">Inactive</span>}
    {s.verifiedVisits > 0 && <span className="pill green">✔ {s.verifiedVisits} verified</span>}
  </>
}

export function SpotRow({ s, onClick }: { s: Spot; onClick: () => void }) {
  return (
    <div className="spotRow" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="polaroid sm"><div className="ph" style={s.coverPhoto ? { backgroundImage: `url(${photoUrl(s.coverPhoto)})` } : undefined}>{!s.coverPhoto && <span>{emojiFor(s.tags)}</span>}</div></div>
      <div className="grow">
        <h4>{s.name}</h4>
        <div className="meta"><Rating value={s.ratings.overall} />{s.reviewCount > 0 && <span> ({s.reviewCount})</span>}<span className="dot">·</span><b className="peso">{TIER[s.priceBand]}</b> {BANDS[s.priceBand]}</div>
        <div className="meta">{area(s)}{s.distanceM != null && <><span className="dot">·</span>{distance(s.distanceM)}</>}</div>
        <div className="tags"><SpotBadges s={s} />{s.tags.slice(0, 2).map((t) => <span className="pill" key={t}>{t}</span>)}</div>
      </div>
    </div>
  )
}

export function SpotCard({ s, onClick }: { s: Spot; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="polaroid"><div className="ph" style={s.coverPhoto ? { backgroundImage: `url(${photoUrl(s.coverPhoto)})` } : undefined}>{!s.coverPhoto && <span>{emojiFor(s.tags)}</span>}</div><div className="cap">{s.name}</div></div>
      <div className="meta" style={{ marginTop: 8 }}><Rating value={s.ratings.overall} /><span className="dot">·</span><b className="peso">{TIER[s.priceBand]}</b><span className="dot">·</span>{s.tags[0] ?? ''}</div>
      <div className="meta">{area(s)}{s.distanceM != null && <><span className="dot">·</span>{distance(s.distanceM)}</>}</div>
    </div>
  )
}

export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // Portal to <body> so overlays escape the bottom sheet's stacking context.
  return createPortal(
    <div className="overlay dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">{children}</div>
    </div>, document.body)
}

export function FlowShell({ title, step, steps, onClose, footer, children }: { title: string; step?: number; steps?: number; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="flowHead"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close"><Close width={16} height={16} /></button></div>
      {steps ? <div className="progress">{Array.from({ length: steps }, (_, i) => <i key={i} className={i <= (step ?? 0) ? 'on' : ''} />)}</div> : null}
      <div className="flowBody">{children}</div>
      {footer && <div className="flowFoot">{footer}</div>}
    </div>, document.body)
}

export function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="starsInput">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}><Star /></button>
      ))}
    </div>
  )
}

export function Spinner() { return <div className="spin" aria-label="Loading" /> }

export type Snap = 'peek' | 'half' | 'full'
const PEEK = 250

/** Mobile: draggable bottom sheet with three snap points. Desktop (CSS): fixed side panel. */
export function BottomSheet({ snap, setSnap, header, children, onHeight }: {
  snap: Snap; setSnap: (s: Snap) => void; header: ReactNode; children: ReactNode; onHeight?: (h: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [H, setH] = useState(640)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef({ y: 0, h: 0, moved: false })

  useLayoutEffect(() => {
    const measure = () => { const p = ref.current?.parentElement; if (p) setH(p.clientHeight) }
    measure(); window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const heights: Record<Snap, number> = { peek: PEEK, half: Math.round(H * 0.5), full: H - 4 }
  const h = drag ?? heights[snap]
  useEffect(() => { onHeight?.(h) }, [h, onHeight])

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start.current = { y: e.clientY, h, moved: false }
  }
  const move = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const dy = start.current.y - e.clientY
    if (Math.abs(dy) > 5) start.current.moved = true
    setDrag(Math.max(PEEK, Math.min(heights.full, start.current.h + dy)))
  }
  const up = () => {
    if (!start.current.moved) { setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half'); setDrag(null); return }
    const cur = drag ?? h
    const best = (Object.keys(heights) as Snap[]).reduce((a, b) => (Math.abs(heights[b] - cur) < Math.abs(heights[a] - cur) ? b : a))
    setDrag(null); setSnap(best)
  }

  return (
    <div ref={ref} className={`sheet ${drag == null ? 'animate' : ''}`} style={{ height: h }}>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="sheetHandle"><i /></div>
        <div className="sheetHead">{header}</div>
      </div>
      <div className={`sheetBody ${snap === 'peek' ? 'lock' : ''}`}>{children}</div>
    </div>
  )
}
