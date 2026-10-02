import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { photoUrl } from '../lib/api'

/** A user-generated photo. While loading (or when a spot has none) it shows an intentional placeholder, never a spinner. */
export function Photo({ id, name, className = '', style, onClick }: { id?: number | null; name?: string; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const [ok, setOk] = useState(false)
  return (
    <div className={`photo ${id && !ok ? 'skel' : ''} ${className}`} style={style} onClick={onClick}>
      {!id && <span className="ini">{(name ?? '·').trim()[0]?.toUpperCase()}</span>}
      {id ? <img src={photoUrl(id)} alt="" loading="lazy" className={ok ? 'in' : ''} onLoad={() => setOk(true)} /> : null}
    </div>
  )
}

export function Dots({ value }: { value: number | null }) {
  const n = Math.round(value ?? 0)
  return <span className="dots" aria-label={value ? `${value} out of 5` : 'no ratings yet'}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'f' : ''} />)}</span>
}

export function RateInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="rate5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={n === value} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>)}
    </div>
  )
}

export function ListSkeleton() {
  return <div className="pad" aria-busy="true">{[0, 1, 2].map((i) => (
    <div className="line" key={i} style={{ cursor: 'default' }}><div className="photo skel" style={{ width: 84, height: 84, flex: 'none' }} /><div className="grow"><div className="skel" style={{ height: 14, width: '60%', marginBottom: 8 }} /><div className="skel" style={{ height: 12, width: '90%', marginBottom: 6 }} /><div className="skel" style={{ height: 12, width: '40%' }} /></div></div>
  ))}</div>
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
      <div className="fhead"><h2 className="h-md">{title}</h2>{steps ? <span className="step">{Math.min((step ?? 0) + 1, steps)}/{steps}</span> : null}<button className="link" onClick={onClose}>Isara</button></div>
      {steps ? <div className="bar"><i style={{ width: `${(((step ?? 0) + 1) / steps) * 100}%` }} /></div> : null}
      <div className="fbody">{children}</div>
      {footer && <div className="ffoot">{footer}</div>}
    </div>, document.body)
}

export type Snap = 'peek' | 'half' | 'full'
export const PEEK = 236

/** Mobile: draggable bottom sheet with three snap points. Desktop (CSS): a contextual panel floating over the map. */
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

  const heights: Record<Snap, number> = { peek: PEEK, half: Math.round(H * 0.56), full: H - 64 }
  const h = drag ?? heights[snap]
  useEffect(() => { onHeight?.(h) }, [h, onHeight])

  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, h, moved: false } }
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
        <div className="grip"><i /></div>
        <div className="shead">{header}</div>
      </div>
      <div className={`sbody ${snap === 'peek' ? 'lock' : ''}`}>{children}</div>
    </div>
  )
}
