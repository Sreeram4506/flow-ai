"use client"

import React, { useState, useEffect, useRef } from "react"
import { Sparkles, X, Send, Bot, RotateCcw, ChevronRight } from "lucide-react"
import { api } from "@/services/api"

export default function AiAssistantBubble() {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [suggestedActions, setSuggestedActions] = useState<string[]>([])
  const [chatLog, setChatLog] = useState<any[]>([
    { role: "assistant", text: "Hello! I am your Flow AI Business Assistant. Ask me to draft proposals, analyze projects, or build invoices." }
  ])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatLog])

  const handleSendPrompt = async (e?: React.FormEvent, presetPrompt?: string) => {
    if (e) e.preventDefault()
    
    const userMsg = presetPrompt || prompt
    if (!userMsg.trim()) return

    if (!presetPrompt) setPrompt("")
    setChatLog((prev) => [...prev, { role: "user", text: userMsg }])
    setSuggestedActions([])
    setLoading(true)

    try {
      const res: any = await api.post("/api/ai/chat", { 
        prompt: userMsg,
        conversationId: conversationId || undefined
      })
      
      setChatLog((prev) => [...prev, { role: "assistant", text: res.response }])
      if (res.conversationId) setConversationId(res.conversationId)
      if (res.suggestedActions) setSuggestedActions(res.suggestedActions)
    } catch (err: any) {
      setChatLog((prev) => [...prev, { role: "assistant", text: "Unable to process command. Please verify connection." }])
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = () => {
    setConversationId(null)
    setSuggestedActions([])
    setChatLog([
      { role: "assistant", text: "Hello! I am your Flow AI Business Assistant. Let's start a new conversation." }
    ])
  }

  // Format text to handle newlines
  const formatText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        <br />
      </span>
    ))
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* AI Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="p-4 bg-brand-gradient hover:brightness-110 text-white rounded-full shadow-2xl shadow-violet-500/25 flex items-center justify-center transition-transform hover:scale-105"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {/* Floating Dialog Drawer */}
      {isOpen && (
        <div className="w-80 h-[450px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col justify-between">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="text-xs font-bold font-heading">Flow AI</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleNewChat} className="text-white/80 hover:text-white" title="New Chat">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white ml-2">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Conversations logs */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-950/10">
            {chatLog.map((chat, idx) => (
              <div 
                key={idx}
                className={`max-w-[90%] p-3 rounded-2xl text-xs leading-relaxed ${
                  chat.role === "user" 
                    ? "bg-violet-600 text-white ml-auto rounded-tr-none" 
                    : "bg-muted-bg text-foreground mr-auto rounded-tl-none border border-border/40"
                }`}
              >
                {formatText(chat.text)}
              </div>
            ))}
            
            {loading && (
              <div className="bg-muted-bg border border-border/40 text-foreground mr-auto p-3 rounded-2xl rounded-tl-none w-14 flex items-center justify-center">
                <span className="flex gap-1 animate-pulse">
                  <span className="h-1.5 w-1.5 bg-muted rounded-full"></span>
                  <span className="h-1.5 w-1.5 bg-muted rounded-full"></span>
                  <span className="h-1.5 w-1.5 bg-muted rounded-full"></span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions / Suggestions */}
          {suggestedActions.length > 0 && !loading && (
            <div className="px-3 py-2 flex flex-nowrap overflow-x-auto gap-2 no-scrollbar border-t border-border/30 bg-card">
              {suggestedActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => handleSendPrompt(undefined, action)}
                  className="whitespace-nowrap px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-colors"
                >
                  {action} <ChevronRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          {/* Form Prompter */}
          <form onSubmit={handleSendPrompt} className="p-3 border-t border-border flex gap-2 bg-card">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Ask AI..."
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !prompt.trim()}
              className="p-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
