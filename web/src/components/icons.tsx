import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p })
const mk = (d: React.ReactNode) => (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}>{d}</svg>

export const Search = mk(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>)
export const MapIcon = mk(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>)
export const Flame = mk(<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-4-2-7-4-9 0 5-4 7-4 12 0 4 3 8 7 8Z" />)
export const Bookmark = mk(<path d="M6 3h12v18l-6-4-6 4V3Z" />)
export const UserIcon = mk(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)
export const Plus = mk(<path d="M12 5v14M5 12h14" />)
export const Camera = mk(<><path d="M4 8h3l2-3h6l2 3h3v12H4V8Z" /><circle cx="12" cy="13" r="4" /></>)
export const Pin = mk(<><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" /></>)
export const Star = (p: SVGProps<SVGSVGElement>) => <svg {...base({ ...p, fill: 'currentColor', strokeWidth: 1 })}><path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8L12 2Z" /></svg>
export const Heart = mk(<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-7.6a5.5 5.5 0 0 0 0-7.8Z" />)
export const Share = mk(<><path d="M12 3v13M7 8l5-5 5 5" /><path d="M5 12v8h14v-8" /></>)
export const Navigate = mk(<path d="m3 11 19-9-9 19-2-8-8-2Z" />)
export const Close = mk(<path d="M6 6l12 12M18 6 6 18" />)
export const Check = mk(<path d="m5 12 5 5 9-10" />)
export const Sliders = mk(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>)
export const Locate = mk(<><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>)
export const Utensils = mk(<><path d="M5 3v8a2 2 0 0 0 2 2v8M9 3v8M7 3v8" /><path d="M17 21V3c-2 1-3 4-3 8h3" /></>)
export const Back = mk(<path d="m15 18-6-6 6-6" />)
export const Flag = mk(<><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>)
export const Chat = mk(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />)
export const Dice = mk(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /></>)
