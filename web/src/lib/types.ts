export type PriceBand = 'under50' | '50-100' | '100-200' | '200-500' | '500+'
export type SpotStatus = 'active' | 'inactive' | 'archived'

export interface Ratings { food: number | null; value: number | null; service: number | null; cleanliness: number | null; overall: number | null }
export interface Spot {
  id: number; name: string; lat: number; lng: number; municipality: string; province: string; description: string
  priceBand: PriceBand; priceTier: number; hours: string; status: SpotStatus; tags: string[]; ratings: Ratings
  reviewCount: number; verifiedVisits: number; likes: number; comments: number; coverPhoto: number | null
  discoverer: string; createdAt: number; lastActivityAt: number; distanceM?: number
}
export interface Review { id: number; username: string; food: number; value: number; service: number; cleanliness: number; overall: number; body: string; created_at: number; verified: boolean }
export interface Comment { id: number; username: string; body: string; created_at: number }
export interface PhotoRef { id: number; kind: string; username: string; created_at: number }
export interface PriceReport { id: number; item: string; price: number; username: string; created_at: number }
export interface SpotDetail {
  spot: Spot; reviews: Review[]; comments: Comment[]; photos: PhotoRef[]; prices: PriceReport[]
  me: { liked: boolean; saved: string | null; reviewed: boolean; visitId: number | null; signal: 'open' | 'closed' | null }
}
export interface User { id: number; username: string; role: 'user' | 'admin'; status: string }
export interface Badge { id: string; icon: string; name: string; desc: string; earned: boolean; progress?: string }
export interface Profile {
  user: { username: string; joinedAt: number }
  stats: { discoveries: number; verifiedVisits: number; reviews: number; likesReceived: number }
  badges: Badge[]; spots: Spot[]
  reviews: { id: number; overall: number; body: string; created_at: number; verified: boolean; spot_id: number; spot_name: string }[]
}
export interface Discover { near: Spot[]; recent: Spot[]; favorites: Spot[]; budget: Spot[]; missed: Spot[] }

export const BANDS: Record<PriceBand, string> = { under50: 'Under ₱50', '50-100': '₱50–₱100', '100-200': '₱100–₱200', '200-500': '₱200–₱500', '500+': '₱500+' }
export const TIER: Record<PriceBand, string> = { under50: '₱', '50-100': '₱', '100-200': '₱₱', '200-500': '₱₱₱', '500+': '₱₱₱₱' }
export const TAG_GROUPS: Record<string, string[]> = {
  'Food type': ['Filipino', 'Japanese', 'Korean', 'Chinese', 'American', 'Italian'],
  'Filipino food': ['Silog', 'Pares', 'Lugaw', 'Ihaw-Ihaw', 'Carinderia', 'Street Food', 'Halo-Halo', 'BBQ', 'Bakery', 'Café', 'Samgyup'],
  Vibe: ['Budget', 'Student-friendly', 'Open late', 'Spicy', 'Family-friendly', 'Hidden gem', 'Quick meal'],
}
export const QUICK_TAGS = ['Pares', 'Silog', 'Lugaw', 'Ihaw-Ihaw', 'Halo-Halo', 'Carinderia', 'Street Food', 'Café']
export const REASONS: Record<string, string> = {
  fake_spot: 'Fake food spot', wrong_location: 'Wrong location', duplicate: 'Duplicate', closed: 'Appears closed', fake_review: 'Fake review',
  stolen_photo: 'Stolen photo', spam: 'Spam', offensive: 'Offensive content', promotional: 'Promotional / business manipulation',
  incorrect_info: 'Incorrect information', other: 'Other',
}
