"use client"

// First-run onboarding screen. Registering a new account creates a *user*
// but no organization (auth.service.ts register() never creates one), and
// almost every API route requires an `x-organization-id` header via
// TenantGuard. Before this page existed, a brand new signup landed on
// /dashboard with zero orgs, every widget failed silently (console.error
// only), and the sidebar's "+ Create Organization" link pointed at this
// exact route while it 404'd. This is the fix: a real form that calls the
// (already-working) POST /api/organizations endpoint and gets the user
// into a usable state.
//
// Deliberately placed outside the (dashboard) route group so it renders
// without the sidebar/header — there's nothing useful to navigate to yet.

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Sparkles, ArrowRight } from "lucide-react"
import { api } from "../../../services/api"
import { useAuth } from "../../../context/AuthContext"

export default function CreateOrganizationPage() {
  const router = useRouter()
  const { refreshUser, organizations, logout } = useAuth()
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await api.post("/api/organizations", { name })
      await refreshUser()
      router.push("/dashboard")
    } catch (err: any) {
      setError(err?.message || "Couldn't create the organization. Try a different name.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="p-2 bg-violet-600 rounded-lg text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white font-heading">Flow</span>
        </div>

        <h2 className="text-xl font-semibold text-center text-slate-100 font-heading mb-2">
          {organizations.length > 0 ? "Create Another Workspace" : "Set Up Your Workspace"}
        </h2>
        <p className="text-sm text-center text-slate-400 mb-6">
          {organizations.length > 0
            ? "Add a new organization — you can switch between workspaces anytime."
            : "You need an organization before you can use Flow. This takes ten seconds."}
        </p>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Organization Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Building2 className="h-4 w-4" />
              </span>
              <input
                type="text"
                required
                autoFocus
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? "Creating..." : (
              <>
                <span>Create & Continue</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {organizations.length > 0 && (
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-4 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel and go back
          </button>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          Wrong account?{" "}
          <button onClick={() => logout()} className="text-violet-400 hover:underline">
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
