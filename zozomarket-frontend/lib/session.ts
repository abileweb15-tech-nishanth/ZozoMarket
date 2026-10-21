export type SessionUser = {
  id: string
  email: string
  name: string
  workspaceId: string
  workspaceName: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: SessionUser
}

const ACCESS = 'zozo.accessToken'
const REFRESH = 'zozo.refreshToken'
const USER = 'zozo.user'

export function getAccessToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS)
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH)
}

export function loadUser(): SessionUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(ACCESS, session.accessToken)
  localStorage.setItem(REFRESH, session.refreshToken)
  localStorage.setItem(USER, JSON.stringify(session.user))
  window.dispatchEvent(new Event('zozo-session'))
}

export function clearSession() {
  localStorage.removeItem(ACCESS)
  localStorage.removeItem(REFRESH)
  localStorage.removeItem(USER)
  window.dispatchEvent(new Event('zozo-session'))
}
