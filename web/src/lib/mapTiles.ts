// CARTO Voyager basemap. The anonymous `{s}.basemaps.cartocdn.com` endpoint now serves a watermark,
// so we use the keyed `rastertiles` endpoint (same approach as the ISMSI project).
const KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined

export const TILE_URL = KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${KEY}`
  : 'https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png'

export const TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'

// Launch area: Bulacan (Bocaue / Malolos).
export const DEFAULT_CENTER: [number, number] = [14.8, 120.9]
export const DEFAULT_ZOOM = 12
