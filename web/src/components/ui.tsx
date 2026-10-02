import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { photoUrl } from '../lib/api'

/** A community photo. `nat` keeps its natural aspect ratio (detail pages); otherwise it fills its box. */
export function Photo({ id, name, className = '', style, onClick, nat }: { id?: number | null; name?: string; className?: string; style?: React.CSSProperties; onClick?: () => void; nat?: boolean }) {
  const [ok, setOk] = useState(false)
  return (
    <div className={`photo ${nat ? 'nat' : ''} ${id && !ok ? 'skel' : ''} ${className}`} style={style} onClick={onClick}>
      {!id && <span className="ini">{(name ?? '·').trim()[0]?.toUpperCase()}</span>}
      {id ? <img src={photoUrl(id)} alt="" loading="lazy" className={ok ? 'in' : ''} onLoad={() => setOk(true)} /> : null}
    </div>
  )
}

export function Bars({ rows }: { rows: [string, number | null][] }) {
  return <div className="bars">{rows.map(([l, v]) => (
    <div className="r" key={l}><span>{l}</span><div className="t"><i style={{ width: `${((v ?? 0) / 5) * 100}%` }} /></div><b>{v ?? '–'}</b></div>
  ))}</div>
}

export function RateInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="rate5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={n === value} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>)}
    </div>
  )
}

export function ListSkeleton() {
  return <div aria-busy="true">{[0, 1, 2].map((i) => (
    <div className="f-line" key={i} style={{ cursor: 'default' }}><div className="photo skel" style={{ width: 72, height: 90 }} /><div className="grow"><div className="skel" style={{ height: 12, width: '40%', marginBottom: 10 }} /><div className="skel" style={{ height: 20, width: '85%', marginBottom: 8 }} /><div className="skel" style={{ height: 12, width: '55%' }} /></div></div>
  ))}</div>
}

export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
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
