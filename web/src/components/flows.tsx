import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { api, ApiError } from '../lib/api'
import { useApp } from '../app-context'
import { distance, readImage } from '../lib/format'
import { getLocation, lastKnownLocation, reverseGeocode, type LatLng } from '../lib/geo'
import { TILE_ATTRIBUTION, TILE_URL, DEFAULT_CENTER } from '../lib/mapTiles'
import { BANDS, TAG_GROUPS, type PriceBand, type Spot } from '../lib/types'
import { Camera, Locate } from './icons'
import { FlowShell, RateInput } from './ui'

const DIMS = [['food', 'Food'], ['value', 'Value'], ['service', 'Service'], ['cleanliness', 'Cleanliness'], ['overall', 'Overall experience']] as const
type Vals = Record<string, number>

function RatingsStep({ vals, setVals, body, setBody, err }: { vals: Vals; setVals: React.Dispatch<React.SetStateAction<Vals>>; body: string; setBody: (s: string) => void; err: string }) {
  return <>
    {DIMS.map(([k, l]) => <div className="dimrow" key={k}><b>{l}</b><RateInput value={vals[k] ?? 0} onChange={(n) => setVals((v) => ({ ...v, [k]: n }))} /></div>)}
    <span className="lbl">Kwento mo</span>
    <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Ano’ng na-feel mo sa food? Sulit ba?" />
    <p className="err">{err}</p>
  </>
}

async function submitReview(spotId: number, vals: Vals, body: string, visitId: number | null) {
  if (DIMS.some(([k]) => !vals[k])) throw new Error('I-rate lahat ng lima (1–5).')
  await api('POST', `/spots/${spotId}/reviews`, { ...vals, body, visitId: visitId ?? undefined })
}

export function ReviewFlow({ spot, visitId, onClose, onDone }: { spot: Spot; visitId: number | null; onClose: () => void; onDone: () => void }) {
  const app = useApp()
  const [vals, setVals] = useState<Vals>({}), [body, setBody] = useState(''), [err, setErr] = useState('')
  return (
    <FlowShell title={spot.name} onClose={onClose} footer={
      <button className="btn solid block" onClick={async () => { try { await submitReview(spot.id, vals, body, visitId); app.toast('Salamat sa review!'); onDone(); onClose() } catch (e: any) { setErr(e.message) } }}>I-post ang review</button>}>
      <p className="meta">{visitId ? 'Lalabas ito na Verified Visit.' : 'Tip: pindutin ang “Nandito ako” sa mismong lugar para maging Verified Visit.'}</p>
      <RatingsStep vals={vals} setVals={setVals} body={body} setBody={setBody} err={err} />
    </FlowShell>
  )
}

/** "Nandito ako": photo, then a GPS proximity check, then the review, as one continuous flow. */
export function ImHereFlow({ spot, onClose, onDone }: { spot: Spot; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0), [photo, setPhoto] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [err, setErr] = useState(''), [visitId, setVisitId] = useState<number | null>(null)
  const [vals, setVals] = useState<Vals>({}), [body, setBody] = useState('')

  const verify = async () => {
    setBusy(true); setErr('')
    try {
      const l = await getLocation()
      const r = await api('POST', `/spots/${spot.id}/visits`, { lat: l.lat, lng: l.lng, photo })
      setVisitId(r.visitId); onDone(); setStep(1)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const post = async () => {
    setBusy(true)
    try { await submitReview(spot.id, vals, body, visitId); onDone(); setStep(2) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <FlowShell title={step === 2 ? 'Tapos na' : spot.name} step={step} steps={3} onClose={onClose} footer={
      step === 0 ? <button className="btn solid block" disabled={!photo || busy} onClick={verify}>{busy ? 'Chine-check ang location…' : 'I-verify ang visit ko'}</button>
        : step === 1 ? <><button className="btn" onClick={() => setStep(2)}>Skip</button><button className="btn solid grow" disabled={busy} onClick={post}>I-post ang review</button></>
          : <button className="btn dark block" onClick={onClose}>Isara</button>}>
      {step === 0 && <>
        <h2 className="h-lg">Kuhanan mo muna.</h2>
        <p className="meta" style={{ margin: '6px 0 16px' }}>Photo ng order mo o ng lugar. Chine-check lang namin kung malapit ka. Hindi ipinapakita sa kahit sino ang eksaktong location mo.</p>
        <label className="shoot">
          {photo ? <img className="preview" src={photo} alt="Photo mo" /> : <><Camera /><b>Mag-photo</b><span className="meta">Imperfect is fine. Mas totoo, mas maganda.</span></>}
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { try { setPhoto(await readImage(e.target.files?.[0])); setErr('') } catch (er: any) { setErr(er.message) } }} />
        </label>
        <p className="err">{err}</p>
      </>}
      {step === 1 && <>
        <div className="ok" style={{ marginBottom: 10 }}>Nandoon ka talaga. Verified.</div>
        <h2 className="h-lg" style={{ marginBottom: 6 }}>Kumusta ang kain?</h2>
        <RatingsStep vals={vals} setVals={setVals} body={body} setBody={setBody} err={err} />
      </>}
      {step === 2 && <div className="done"><h2 className="h-xl">Salamat.</h2><p className="meta">{visitId ? 'Verified na ang visit mo. ' : ''}Nakatulong ka sa susunod na maghahanap ng masarap.</p></div>}
    </FlowShell>
  )
}

const pickIcon = (photo: string | null) => L.divIcon({
  className: '', iconSize: [64, 64], iconAnchor: [32, 32],
  html: `<div class="lt ph sel new"${photo ? ` style="--img:url(${photo})"` : ''}></div>`,
})
function PickPoint({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Lapag: photo, then the place, then a few details. */
export function LapagFlow({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Spot) => void }) {
  const app = useApp()
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  const [loc, setLoc] = useState<LatLng | null>(lastKnownLocation())
  const [muni, setMuni] = useState(''), [prov, setProv] = useState('')
  const [name, setName] = useState(''), [tags, setTags] = useState<string[]>([]), [band, setBand] = useState<PriceBand>('50-100')
  const [desc, setDesc] = useState(''), [hours, setHours] = useState('')
  const [dupes, setDupes] = useState<Spot[]>([]), [confirmNew, setConfirmNew] = useState(false)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [gpsMsg, setGpsMsg] = useState('')
  const markerRef = useRef<L.Marker>(null)

  const place = async (p: LatLng) => {
    setLoc(p); setConfirmNew(false)
    reverseGeocode(p).then((g) => { setMuni((m) => m || g.municipality); setProv((v) => v || g.province) })
    api<{ matches: Spot[] }>('GET', `/spots/check?lat=${p.lat}&lng=${p.lng}`).then((r) => setDupes(r.matches)).catch(() => {})
  }
  const useGps = () => { setGpsMsg('Hinahanap ka…'); getLocation().then((p) => { setGpsMsg(''); place(p) }).catch((e) => setGpsMsg(e.message)) }
  useEffect(() => { if (step === 1 && !loc) useGps(); else if (step === 1 && loc && !dupes.length) place(loc) }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (force: boolean) => {
    setBusy(true); setErr('')
    try {
      const { spot } = await api<{ spot: Spot }>('POST', '/spots', { name, lat: loc!.lat, lng: loc!.lng, municipality: muni, province: prov, description: desc, hours, priceBand: band, tags, photo, confirmNew: force })
      app.toast('Na-lapag na! Salamat sa pagshare.'); app.bump(); onCreated(spot)
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.data.matches) { setDupes(e.data.matches); setStep(1); setConfirmNew(false) } else setErr(e.message)
    } finally { setBusy(false) }
  }

  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])
  const showDupes = dupes.length > 0 && !confirmNew
  const canNext = step === 0 ? !!photo : step === 1 ? !!loc && !showDupes : name.trim().length >= 2 && tags.length > 0

  return (
    <FlowShell title="Lapag mo" step={step} steps={3} onClose={onClose} footer={<>
      {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Balik</button>}
      {step < 2 ? <button className="btn solid grow" disabled={!canNext} onClick={() => setStep(step + 1)}>Susunod</button>
        : <button className="btn solid grow" disabled={!canNext || busy} onClick={() => submit(confirmNew)}>{busy ? 'Nilalapag…' : 'Lapag!'}</button>}
    </>}>
      {step === 0 && <>
        <h2 className="h-xl">May nakita ka bang solid?</h2>
        <p className="meta" style={{ margin: '8px 0 18px' }}>Simulan sa photo. Kahit crooked, kahit ₱70 na silog lang. Mas totoo, mas maganda.</p>
        <label className="shoot">
          {photo ? <img className="preview" src={photo} alt="Preview" /> : <><Camera /><b>Mag-photo o pumili</b><span className="meta">Food, menu, o ang mismong tindahan</span></>}
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { try { setPhoto(await readImage(e.target.files?.[0])); setErr('') } catch (er: any) { setErr(er.message) } }} />
        </label>
        <p className="err">{err}</p>
      </>}

      {step === 1 && <>
        <h2 className="h-lg">Nasaan ito?</h2>
        <p className="meta" style={{ margin: '6px 0 12px' }}>I-drag ang pin o i-tap ang mapa.</p>
        <div className="miniMap">
          <MapContainer center={loc ? [loc.lat, loc.lng] : DEFAULT_CENTER} zoom={loc ? 18 : 14} zoomControl={false} style={{ height: '100%' }} key={loc ? 'p' : 'n'}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
            <PickPoint onPick={place} />
            {loc && <Marker position={[loc.lat, loc.lng]} icon={pickIcon(photo)} draggable ref={markerRef} eventHandlers={{ dragend: () => { const m = markerRef.current?.getLatLng(); if (m) place({ lat: m.lat, lng: m.lng }) } }} />}
          </MapContainer>
        </div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn sm" onClick={useGps}><Locate />Gamitin ang GPS</button><span className="meta">{gpsMsg || (loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Wala pang location')}</span></div>
        {showDupes && (
          <div className="dupe">
            <b>May lapag na malapit dito:</b>
            {dupes.map((m) => (
              <div key={m.id} style={{ marginTop: 10 }}>
                <div><b>{m.name}</b> <span className="meta">· {distance(m.distanceM)} ang layo</span></div>
                <div className="meta">Ito ba ang gusto mong i-add?</div>
                <button className="btn sm dark" style={{ marginTop: 6 }} onClick={() => { onClose(); app.openSpot(m.id) }}>Oo, ito nga</button>
              </div>
            ))}
            <button className="link" style={{ marginTop: 12 }} onClick={() => setConfirmNew(true)}>Hindi, bagong lugar ito</button>
          </div>
        )}
      </>}

      {step === 2 && <>
        <span className="lbl" style={{ marginTop: 0 }}>Pangalan ng lugar</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aling Nena's Pares" maxLength={80} autoFocus />
        <span className="lbl">Kwento mo <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· ito ang makikita ng iba</span></span>
        <textarea className="field" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000} placeholder="Nakita ko ‘to habang naghihintay ng jeep. Hindi ako umasa, pero…" />
        <span className="lbl">Category</span>
        {Object.entries(TAG_GROUPS).map(([g, ts]) => <div key={g} style={{ marginBottom: 10 }}><div className="meta" style={{ marginBottom: 4 }}>{g}</div><div className="opt">{ts.map((t) => <button key={t} type="button" className={tags.includes(t) ? 'on' : ''} onClick={() => toggle(t)}>{t}</button>)}</div></div>)}
        <span className="lbl">Presyo</span>
        <div className="opt">{(Object.keys(BANDS) as PriceBand[]).map((b) => <button key={b} type="button" className={band === b ? 'on' : ''} onClick={() => setBand(b)}>{BANDS[b]}</button>)}</div>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div className="grow"><span className="lbl">Bayan / Lungsod</span><input className="field" value={muni} onChange={(e) => setMuni(e.target.value)} maxLength={80} /></div>
          <div className="grow"><span className="lbl">Probinsya</span><input className="field" value={prov} onChange={(e) => setProv(e.target.value)} maxLength={80} /></div>
        </div>
        <span className="lbl">Oras ng bukas <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· optional</span></span>
        <input className="field" value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} placeholder="Lun–Sab 6am–10pm" />
        <p className="err">{err}</p>
      </>}
    </FlowShell>
  )
}
