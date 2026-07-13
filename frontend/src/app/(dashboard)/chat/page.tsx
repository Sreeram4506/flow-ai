"use client"

import React, { useEffect, useState, useRef } from "react"
import { useAuth } from "@/context/AuthContext"
import { useSocket } from "@/context/SocketContext"
import { api } from "@/services/api"
import { MessageSquare, Send, Users, ShieldAlert, Sparkles, Hash, Lock } from "lucide-react"

export default function ChatPage() {
  const { currentOrg, user } = useAuth()
  const { socket, connected } = useSocket()
  
  const [channels, setChannels] = useState<any[]>([])
  const [activeChannelId, setActiveChannelId] = useState("")
  const [activeChannelName, setActiveChannelName] = useState("")
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState("")
  const messageEndRef = useRef<HTMLDivElement>(null)

  // Fetch list of channels/DMs
  const fetchChannels = async () => {
    if (!currentOrg) return
    try {
      const res: any = await api.get("/api/chat/channels")
      const list = res.data || res || []
      setChannels(list)
      if (list.length > 0) {
        setActiveChannelId(list[0].id)
        setActiveChannelName(list[0].name)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchChannels()
  }, [currentOrg])

  // Join WebSocket chat room on channel change
  useEffect(() => {
    if (!socket || !activeChannelId) return

    socket.emit("join-channel", { channelId: activeChannelId })
    socket.emit("load-history", { channelId: activeChannelId })

    // Load mock initial message log if history is empty
    setMessages([
      { id: "1", userId: "system", content: `Loading messages for #${activeChannelName}...`, createdAt: new Date() }
    ])

    const handleHistory = (data: any) => {
      if (data.channelId === activeChannelId) {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        } else {
          setMessages([{ id: "1", userId: "system", content: `Welcome to the #${activeChannelName} channel!`, createdAt: new Date() }])
        }
      }
    }

    const handleNewMessage = (msg: any) => {
      if (msg.channelId === activeChannelId) {
        setMessages((prev) => [...prev, msg])
      }
    }

    // Listen for history and new messages
    socket.on("channel-history", handleHistory)
    socket.on("new-message", handleNewMessage)

    return () => {
      socket.off("channel-history", handleHistory)
      socket.off("new-message", handleNewMessage)
    }
  }, [socket, activeChannelId, activeChannelName])

  // Scroll to bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !socket || !user) return

    socket.emit("chat-message", {
      channelId: activeChannelId,
      content: newMessage,
      userId: user.id,
    })

    setNewMessage("")
  }

  return (
    <div className="space-y-6 h-[calc(100vh-160px)] flex flex-col justify-between">
      {/* Welcome Banner */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Team Chat</h1>
          <p className="text-sm text-muted mt-1">Real-time messaging, channels, and department sync.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`}></span>
          <span>{connected ? "Channel Connected" : "Connection Offline"}</span>
        </div>
      </div>

      <div className="flex-1 glass border border-border/60 rounded-2xl overflow-hidden flex divide-x divide-border/40">
        {/* Left sidebar listing rooms */}
        <div className="w-64 flex flex-col justify-between bg-slate-950/10 p-4 shrink-0">
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Channels</span>
            <div className="space-y-1">
              {channels.map((chan) => (
                <button
                  key={chan.id}
                  onClick={() => {
                    setActiveChannelId(chan.id)
                    setActiveChannelName(chan.name)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${
                    activeChannelId === chan.id 
                      ? "bg-brand-500/10 text-brand-500" 
                      : "text-muted hover:text-foreground hover:bg-muted-bg"
                  }`}
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate">{chan.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right message log feed */}
        <div className="flex-1 flex flex-col justify-between bg-card/40">
          {/* Channel Header */}
          <div className="px-6 py-3 border-b border-border flex items-center justify-between bg-slate-950/5">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">#{activeChannelName}</span>
            </div>
          </div>

          {/* Messages Logs Area */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className="flex gap-3 text-xs text-left">
                <div className="h-7 w-7 rounded-full bg-slate-900 border border-border flex items-center justify-center font-bold text-slate-400 shrink-0 select-none">
                  {msg.userId === "system" ? "S" : "U"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{msg.userId === "system" ? "System Core" : "Team Member"}</span>
                    <span className="text-[9px] text-muted">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-400 mt-1 leading-relaxed bg-slate-950/20 border border-border/20 px-3 py-2 rounded-xl rounded-tl-none">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messageEndRef} />
          </div>

          {/* Message Prompt Composer */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-slate-950/5 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500 text-slate-100"
              placeholder={`Message #${activeChannelName}...`}
            />
            <button
              type="submit"
              className="p-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
