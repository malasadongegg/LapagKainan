// Emoji used on map pins and cards so every spot "looks like" what it serves.
const BY_TAG: Record<string, string> = {
  pares: '🍜', lugaw: '🥣', silog: '🍳', 'ihaw-ihaw': '🍢', 'street food': '🍢', 'halo-halo': '🍧', bbq: '🍖', 'café': '☕', bakery: '🥐',
  samgyup: '🥓', carinderia: '🍛', korean: '🍲', japanese: '🍣', chinese: '🥟', italian: '🍝', american: '🍔', filipino: '🍚',
}
export const emojiFor = (tags: string[]) => {
  for (const t of tags) { const e = BY_TAG[t.toLowerCase()]; if (e) return e }
  return '🍽️'
}
