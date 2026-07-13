"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"
import { Mail, ShieldCheck, ShieldAlert, Sparkles, Send } from "lucide-react"

function MagicLinkContent() {
  const { loginWithMagicLink, verifyMagicLink } = useAuth()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (token) {
      handleVerifyToken(token)
    }
  }, [token])

  const handleVerifyToken = async (t: string) => {
    setVerifying(true)
    setError("")
    try {
      await verifyMagicLink(t)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || "Invalid or expired magic link.")
    } finally {
      setVerifying(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await loginWithMagicLink(email)
      setSent(true)
    } catch (err: any) {
      setError(err.message || "Failed to send magic link.")
    }
  }

  if (token) {
    return (
      <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10 text-center">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="p-2 bg-violet-600 rounded-lg text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white font-heading">Flow</span>
        </div>

        {verifying && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
            <h2 className="text-xl font-semibold text-slate-100 font-heading">Verifying Magic Link...</h2>
            <p className="text-sm text-slate-400">Please wait while we establish your secure session.</p>
          </div>
        )}

        {success && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-full text-emerald-400 w-fit mx-auto">
              <ShieldCheck className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-semibold text-slate-100 font-heading">Authenticated!</h2>
            <p className="text-sm text-slate-400">Redirecting to your executive dashboard...</p>
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-full text-red-400 w-fit mx-auto">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-semibold text-slate-100 font-heading">Authentication Failed</h2>
            <p className="text-sm text-red-400">{error}</p>
            <Link href="/login" className="inline-block px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors">
              Back to Login
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10">
      <div className="flex items-center gap-2 justify-center mb-6">
        <div className="p-2 bg-violet-600 rounded-lg text-white">
          <Sparkles className="h-6 w-6" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-white font-heading">Flow</span>
      </div>

      <h2 className="text-xl font-semibold text-center text-slate-100 font-heading mb-2">Sign in with Magic Link</h2>
      <p className="text-sm text-center text-slate-400 mb-6">We'll email you a passwordless login link.</p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm mb-4">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sent ? (
        <div className="text-center space-y-4 py-4">
          <div className="p-3 bg-violet-950/40 border border-violet-900/50 rounded-full text-violet-400 w-fit mx-auto">
            <Send className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-medium text-slate-200">Email Sent!</h3>
          <p className="text-sm text-slate-400">
            Check your inbox for a login link. Be sure to check your spam folder if it doesn't arrive.
          </p>
          <Link href="/login" className="inline-block text-xs text-violet-400 hover:underline">
            Back to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500"><Mail className="h-4 w-4" /></span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                placeholder="name@company.com"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
          >
            <span>Send Login Link</span>
          </button>
        </form>
      )}

      {!sent && (
        <div className="mt-6 text-center text-xs text-slate-400">
          Remember password?{" "}
          <Link href="/login" className="text-violet-400 hover:underline">Log In</Link>
        </div>
      )}
    </div>
  )
}

export default function MagicLinkPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      
      <Suspense fallback={
        <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading magic link interface...</p>
        </div>
      }>
        <MagicLinkContent />
      </Suspense>
    </div>
  )
}
