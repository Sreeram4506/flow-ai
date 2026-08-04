"use client"

import React, { useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import Sidebar from "@/components/dashboard/Sidebar"
import Header from "@/components/dashboard/Header"
import AiAssistantBubble from "@/components/dashboard/AiAssistantBubble"
import { useRouter } from "next/navigation"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, organizations, loading } = useAuth()
  const router = useRouter()

  // Registering a user never creates an organization, and every module in
  // this app requires one (TenantGuard rejects requests with no
  // x-organization-id). Without this guard, a fresh signup landed here with
  // an empty sidebar-driven dashboard where every single widget failed
  // silently. Send them to set one up instead of showing a broken shell.
  useEffect(() => {
    if (!loading && user && organizations.length === 0) {
      router.replace("/organizations/create")
    }
  }, [loading, user, organizations, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="text-slate-400 text-sm">Restoring secure user session...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect in AuthContext useEffect
  }

  if (organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="text-slate-400 text-sm">Setting up your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-all font-sans">
      {/* Navigation Panels */}
      <Sidebar />
      <Header />

      {/* Main Content Workspace */}
      <main className="pl-64 pt-16 min-h-screen transition-all">
        <div className="p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* AI Assistant Floating Bubble */}
      <AiAssistantBubble />
    </div>
  )
}
