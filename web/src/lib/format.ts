export function ago(ms: number) {
  const m = (Date.now() - ms) / 6e4
  if (m < 2) return 'just now'
  if (m < 60) return `${Math.round(m)}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  if (m < 43200) return `${Math.round(m / 1440)}d ago`
  return `${Math.round(m / 43200)}mo ago`
}
/** Relative time in Taglish, e.g. "3 araw na". */
export function agoTl(ms: number) {
  const m = (Date.now() - ms) / 6e4
  if (m < 2) return 'kakalapag lang'
  if (m < 60) return `${Math.round(m)} minuto na`
  if (m < 1440) return `${Math.round(m / 60)} oras na`
  if (m < 43200) return `${Math.round(m / 1440)} araw na`
  return `${Math.round(m / 43200)} buwan na`
}
/** The discoverer's own words, trimmed to a readable headline. */
export function quoteOf(desc: string, max = 110) {
  const t = desc.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const first = t.split(/(?<=[.!?])\s/)[0]
  return first.length <= max ? first : first.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}
export const PRICE_SHORT: Record<string, string> = { under50: 'under ₱50', '50-100': '₱50–100', '100-200': '₱100–200', '200-500': '₱200–500', '500+': '₱500+' }
export const distance =(m?: number) => (m == null ? '' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)
export const area = (s: { municipality: string; province: string }) => [s.municipality, s.province].filter(Boolean).join(', ') || 'Unknown area'

// Downscale in the browser so uploads stay small and fast on mobile data.
export function readImage(file: File | undefined, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Pick an image file.'))
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = url
  })
}
