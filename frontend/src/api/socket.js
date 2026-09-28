import { io } from 'socket.io-client'

import { getAccessToken } from './tokens'

let socket

export function connectSocket() {
  const token = getAccessToken()
  if (!token) return null
  if (!socket) {
    socket = io(import.meta.env.VITE_API_BASE_URL || window.location.origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
  } else if (!socket.connected) {
    socket.auth = { token }
    socket.connect()
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
