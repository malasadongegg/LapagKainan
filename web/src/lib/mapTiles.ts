// CARTO dark basemap, warmed toward charcoal-brown in CSS (.leaflet-tile-pane) so discoveries read as lights.
// The anonymous `{s}.basemaps.cartocdn.com` endpoint now serves a watermark, so we use the keyed
// `rastertiles` endpoint (same approach as the ISMSI project).
const KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined
const STYLE = 'dark_all'

export const TILE_URL = KEY
  ? `https://basemaps.cartocdn.com/rastertiles/${STYLE}/{z}/{x}/{y}.png?key=${KEY}`
  : `https://{s}.basemaps.cartocdn.com/${STYLE}/{z}/{x}/{y}{r}.png`
export const TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'
export const tileFor = (z: number, x: number, y: number) => TILE_URL.replace('{s}', 'a').replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{r}', '')

// Launch area: Bulacan (Bocaue / Malolos).
export const DEFAULT_CENTER: [number, number] = [14.8, 120.9]
export const DEFAULT_ZOOM = 12
