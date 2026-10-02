import { createContext, useContext } from 'react'
import type { User } from './lib/types'

export interface AppCtx {
  user: User | null
  setUser: (u: User | null) => void
  toast: (msg: string) => void
  /** Resolves true when logged in; otherwise opens the sign-in dialog and resolves false. */
  requireLogin: () => boolean
  openAuth: () => void
  openSpot: (id: number) => void
  openLapag: () => void
  /** Bumped whenever community data changes so lists can refetch. */
  version: number
  bump: () => void
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx)
export const useApp = () => useContext(Ctx)
