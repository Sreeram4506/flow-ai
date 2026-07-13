"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { api } from "@/services/api"
import { ShieldCheck, ShieldAlert, Sparkles } from "lucide-react"

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [verifying, setVerifying] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (token) {
      handleVerifyToken(token)
    } else {
      setError("Verification token is missing.")
      setVerifying(false)
    }
  }, [token])

  const handleVerifyToken = async (t: string) => {
    try {
      await api.post("/api/auth/verify-email", { token: t })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || "Email verification failed. The link may be invalid or expired.")
    } finally {
      setVerifying(false)
    }
  }

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
          <h2 className="text-xl font-semibold text-slate-100 font-heading">Verifying Email...</h2>
          <p className="text-sm text-slate-400">Please wait while we verify your email address.</p>
        </div>
      )}

      {success && (
        <div className="space-y-4">
          <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-full text-emerald-400 w-fit mx-auto">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100 font-heading">Email Verified!</h2>
          <p className="text-sm text-slate-400">Your email address has been successfully verified.</p>
          <Link href="/login" className="inline-block px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors mt-4">
            Log In
          </Link>
        </div>
      )}

      {error && (
        <div className="space-y-4">
          <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-full text-red-400 w-fit mx-auto">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-semibold text-slate-100 font-heading">Verification Failed</h2>
          <p className="text-sm text-red-400">{error}</p>
          <Link href="/login" className="inline-block px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors mt-4">
            Back to Login
          </Link>
        </div>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      
      <Suspense fallback={
        <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading email verification...</p>
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  )
}
