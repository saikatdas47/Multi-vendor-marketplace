/**
 * Single place the app reads Vite env from.
 *
 * Everything here ends up in the JS bundle and is visible to any visitor, so
 * only display and endpoint settings belong in it — never a secret. API keys
 * stay on the Django side, which is why AI calls go through our own backend
 * rather than straight to Groq.
 */

export const config = {
  appName: import.meta.env.VITE_APP_NAME || 'CommerceX',
  currency: import.meta.env.VITE_CURRENCY || 'USD',
  defaultCountry: import.meta.env.VITE_DEFAULT_COUNTRY || 'Bangladesh',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  apiTimeout: Number(import.meta.env.VITE_API_TIMEOUT || 20000),
}

export function formatMoney(amount) {
  const value = Number(amount ?? 0)
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: config.currency,
  })
}
