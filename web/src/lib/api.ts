let token: string | null = null
try { token = localStorage.getItem('lk_token') } catch { /* storage blocked */ }

export const getToken = () => token
export function setToken(t: string | null) {
  token = t
  try { if (t) localStorage.setItem('lk_token', t); else localStorage.removeItem('lk_token') } catch { /* storage blocked */ }
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status: number, data: any) { super(message); this.status = status; this.data = data }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data)
  return data as T
}

export const photoUrl = (id: number) => `/api/photos/${id}`
