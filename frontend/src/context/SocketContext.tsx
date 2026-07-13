"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
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

  useEffect(() => {
    if (!user || !currentOrg) {
      if (socket) {
        socket.disconnect()
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
      newSocket.emit("join", { userId: user.id, orgId: currentOrg.id })
    })

    newSocket.on("disconnect", () => {
      setConnected(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [user, currentOrg])

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider")
  }
  return context
}
