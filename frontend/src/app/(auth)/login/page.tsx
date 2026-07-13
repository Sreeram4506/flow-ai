"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"
import { LogIn, Key, Mail, ShieldAlert, Sparkles } from "lucide-react"

export default function LoginPage() {
  const { login, verify2FA } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  
  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState("")
  const [totpCode, setTotpCode] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (requires2FA) {
        await verify2FA(tempToken, totpCode)
      } else {
        const res = await login(email, password)
        if (res.requires2FA && res.tempToken) {
          setRequires2FA(true)
          setTempToken(res.tempToken)
        }
      }
    } catch (err: any) {
      setError(err.message || "Invalid email or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      {/* Background gradients */}
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
          {requires2FA ? "Two-Factor Verification" : "Welcome Back"}
        </h2>
        <p className="text-sm text-center text-slate-400 mb-6">
          {requires2FA ? "Enter the 6-digit verification code from your authenticator app." : "Log in to your executive dashboard."}
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm mb-4">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!requires2FA ? (
            <>
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

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
                  <Link href="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Forgot?</Link>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500"><Key className="h-4 w-4" /></span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Verification Code</label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full py-3 bg-slate-900/80 border border-slate-800 rounded-xl text-center text-xl font-bold tracking-widest text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="000000"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? "Processing..." : (
              <>
                <LogIn className="h-4 w-4" />
                <span>{requires2FA ? "Verify & Continue" : "Log In"}</span>
              </>
            )}
          </button>
        </form>

        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button className="py-2 px-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors">
            <span>Google</span>
          </button>
          <button className="py-2 px-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors">
            <span>GitHub</span>
          </button>
        </div>

        <div className="text-center text-xs text-slate-400 space-y-2">
          <div>
            Need to sign in quickly?{" "}
            <Link href="/magic-link" className="text-violet-400 hover:underline">Use Magic Link</Link>
          </div>
          <div>
            Don't have an account?{" "}
            <Link href="/register" className="text-violet-400 hover:underline">Create Account</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
