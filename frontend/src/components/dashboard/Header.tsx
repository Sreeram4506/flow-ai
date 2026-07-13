"use client"

import React, { useState, useEffect } from "react"
import { Bell, Search, Menu, User, Sparkles } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { api } from "@/services/api"
import CommandPalette from "./CommandPalette"
import Link from "next/link"

export default function Header() {
  const { user } = useAuth()
  const { socket } = useSocket()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationsList, setNotificationsList] = useState<any[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  // Fetch unread count
  useEffect(() => {
    if (!user) return
    const fetchNotifications = async () => {
      try {
        const res: any = await api.get("/api/notifications/unread-count")
        setUnreadNotifications(res.unreadCount || 0)
        
        const listRes: any = await api.get("/api/notifications?limit=5")
        setNotificationsList(listRes.data || [])
      } catch (err) {
        console.error("Failed to load notifications", err)
      }
    }
    fetchNotifications()
  }, [user])

  // Listen to live notification events via WebSocket
  useEffect(() => {
    if (!socket) return

    socket.on("notification", (newNotification) => {
      setUnreadNotifications((prev) => prev + 1)
      setNotificationsList((prev) => [newNotification, ...prev.slice(0, 4)])
    })

    return () => {
      socket.off("notification")
    }
  }, [socket])

  // Key listener for Cmd+K search opening
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await api.post("/api/notifications/mark-all-read")
      setUnreadNotifications(0)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <>
      <header className="h-16 border-b border-border bg-glass-gradient backdrop-blur-md fixed top-0 right-0 left-64 z-20 px-6 flex items-center justify-between transition-all">
        {/* Search / Command trigger */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-muted-bg hover:bg-border/50 border border-border/80 text-muted rounded-xl transition-all w-80 text-left text-xs"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">Search workspace...</span>
          <span className="text-[9px] bg-card px-1.5 py-0.5 border border-border rounded font-bold">⌘K</span>
        </button>

        {/* Right side items */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 hover:bg-muted-bg rounded-xl text-muted hover:text-foreground transition-colors relative"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-2xl shadow-xl z-50 p-2 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-bold text-foreground">Notifications</span>
                  <button 
                    onClick={handleMarkAllRead}
                    className="text-[10px] text-violet-400 hover:underline"
                  >
                    Mark read
                  </button>
                </div>
                <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
                  {notificationsList.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted">All caught up!</div>
                  ) : (
                    notificationsList.map((n) => (
                      <div key={n.id} className="p-3 hover:bg-muted-bg/50 transition-colors text-left">
                        <h4 className="text-xs font-bold text-foreground">{n.title}</h4>
                        <p className="text-[11px] text-muted mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <div className="h-8 w-8 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-500 font-bold text-sm">
              {user ? user.firstName[0] : <User className="h-4 w-4" />}
            </div>
            <div className="hidden md:block text-left text-xs">
              <p className="font-bold text-foreground leading-none">{user ? `${user.firstName} ${user.lastName}` : "Guest"}</p>
              <span className="text-[10px] text-muted mt-0.5 block">{user ? user.email : ""}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Command Search Modal */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  )
}
