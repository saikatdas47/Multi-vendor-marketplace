/**
 * Token storage.
 *
 * Access tokens live in memory only, so an XSS payload cannot read them from
 * storage. The refresh token is persisted so a page reload keeps the session;
 * in production this should move to an httpOnly cookie issued by the backend.
 */

const REFRESH_KEY = 'commercex.refresh'

let accessToken = null
const listeners = new Set()

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token || null
  listeners.forEach((fn) => fn(accessToken))
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setRefreshToken(token) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* storage unavailable (private mode) - session stays in memory */
  }
}

export function setTokens({ access, refresh }) {
  setAccessToken(access)
  if (refresh !== undefined) setRefreshToken(refresh)
}

export function clearTokens() {
  setAccessToken(null)
  setRefreshToken(null)
}

export function onAccessTokenChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Decode a JWT payload without verifying it - display purposes only. */
export function decodeToken(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch {
    return null
  }
}

export function isExpired(token, skewSeconds = 10) {
  const payload = decodeToken(token)
  if (!payload?.exp) return true
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000
}
