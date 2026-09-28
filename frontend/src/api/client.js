import axios from 'axios'

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokens'

// Blank base URL means "same origin", which in development routes through the
// Vite proxy configured from VITE_API_TARGET.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export const API_ROOT = `${BASE_URL}/api/v1`

const client = axios.create({
  baseURL: API_ROOT,
  headers: { 'Content-Type': 'application/json' },
  timeout: Number(import.meta.env.VITE_API_TIMEOUT || 20000),
})

/** Endpoints that must never carry an Authorization header or trigger refresh. */
const PUBLIC_PATHS = ['/auth/login/', '/auth/register/', '/auth/refresh/']

const isPublic = (url = '') => PUBLIC_PATHS.some((p) => url.includes(p))

client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token && !isPublic(config.url)) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

/*
 * Refresh handling.
 *
 * When a 401 arrives, the first failing request performs the refresh; every
 * other request that fails while that is in flight waits on the same promise
 * instead of firing its own refresh. This avoids a thundering herd of refresh
 * calls (and, with ROTATE_REFRESH_TOKENS on, avoids invalidating the token
 * mid-flight).
 */
let refreshPromise = null
const sessionExpiredHandlers = new Set()

export function onSessionExpired(fn) {
  sessionExpiredHandlers.add(fn)
  return () => sessionExpiredHandlers.delete(fn)
}

function notifySessionExpired() {
  clearTokens()
  sessionExpiredHandlers.forEach((fn) => fn())
}

async function refreshAccessToken() {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error('No refresh token')

  // Bare axios: the instance interceptors would recurse.
  const { data } = await axios.post(`${API_ROOT}/auth/refresh/`, { refresh })
  setTokens({ access: data.access, refresh: data.refresh ?? refresh })
  return data.access
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error

    if (!response || response.status !== 401 || !config || config._retried) {
      return Promise.reject(normalizeError(error))
    }
    if (isPublic(config.url)) {
      return Promise.reject(normalizeError(error))
    }
    if (!getRefreshToken()) {
      notifySessionExpired()
      return Promise.reject(normalizeError(error))
    }

    config._retried = true
    try {
      refreshPromise = refreshPromise || refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const access = await refreshPromise
      config.headers.Authorization = `Bearer ${access}`
      return client(config)
    } catch {
      notifySessionExpired()
      return Promise.reject(normalizeError(error))
    }
  },
)

/**
 * Flattens DRF error bodies into something a form can render.
 * DRF returns {field: ["msg"]} or {detail: "msg"} or a bare list.
 */
export function normalizeError(error) {
  const data = error?.response?.data
  const status = error?.response?.status ?? 0

  let message = 'Something went wrong. Please try again.'
  const fields = {}

  if (!error.response) {
    message = 'Cannot reach the server. Is the backend running?'
  } else if (typeof data === 'string') {
    message = data
  } else if (data?.detail) {
    message = data.detail
  } else if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value)
      if (key === 'non_field_errors') message = text
      else fields[key] = text
    }
    if (message === 'Something went wrong. Please try again.') {
      const first = Object.values(fields)[0]
      if (first) message = first
    }
  }

  if (status === 401 && !data?.detail) message = 'Please sign in to continue.'
  if (status === 403 && !data?.detail) message = 'You do not have permission to do that.'
  if (status === 404 && !data?.detail) message = 'Not found.'
  if (status === 429) message = 'Too many requests. Please slow down.'

  return Object.assign(new Error(message), { status, fields, raw: data })
}

export default client
