"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { io, Socket } from "socket.io-client"
import { useAuth } from "./AuthContext"

interface SocketContextType {
  socket: Socket | null
  connected: boolean
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, currentOrg } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)

  // Held in a ref so the teardown path doesn't depend on state, which would
  // otherwise read a stale value from the effect's closure.
  const socketRef = useRef<Socket | null>(null)

  // Depend on the *ids*, not the user/org objects.
  //
  // Those objects were rebuilt on every profile refresh, so this effect saw a
  // changed dependency on every route change and tore the connection down and
  // re-handshook it — on every single navigation. Primitives only change when
  // the session or the active organization genuinely changes, which is the
  // only time a reconnect is actually warranted.
  const userId = user?.id ?? null
  const orgId = currentOrg?.id ?? null

  useEffect(() => {
    // Logged out, or no organization selected: ensure nothing is connected.
    if (!userId || !orgId) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setSocket(null)
        setConnected(false)
      }
      return
    }

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    const newSocket = io(`${socketUrl}/ws`, {
      transports: ["websocket"],
      autoConnect: true,
    })

    newSocket.on("connect", () => {
      setConnected(true)
      // Join rooms for real-time notifications/updates
      newSocket.emit("join", { userId, orgId })
    })

    newSocket.on("disconnect", () => {
      setConnected(false)
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    return () => {
      newSocket.removeAllListeners()
      newSocket.disconnect()
      if (socketRef.current === newSocket) {
        socketRef.current = null
      }
      setConnected(false)
    }
  }, [userId, orgId])

  // Memoized for the same reason as AuthContext's value: a fresh object
  // literal here re-renders every useSocket() consumer on each render pass.
  const value = useMemo<SocketContextType>(
    () => ({ socket, connected }),
    [socket, connected],
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider")
  }
  return context
}
