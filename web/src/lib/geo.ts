export interface LatLng { lat: number; lng: number }
let last: LatLng | null = null
export const lastKnownLocation = () => last

export function getLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS is not available on this device.'))
    navigator.geolocation.getCurrentPosition(
      (p) => { last = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(last) },
      () => reject(new Error('Location is off. You can still browse. Allow GPS for "near me".')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    )
  })
}

export async function reverseGeocode({ lat, lng }: LatLng): Promise<{ municipality: string; province: string }> {
  try {
    const a = (await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${lat}&lon=${lng}`)).json()).address || {}
    return { municipality: a.city || a.town || a.municipality || a.village || a.suburb || '', province: a.province || a.state || a.region || '' }
  } catch { return { municipality: '', province: '' } }
}

export async function geocodePlace(q: string) {
  try {
    const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`)).json()
    if (!r[0]) return null
    const b = r[0].boundingbox.map(Number)
    return { name: String(r[0].display_name).split(',')[0], bounds: [[b[0], b[2]], [b[1], b[3]]] as [[number, number], [number, number]] }
  } catch { return null }
}
