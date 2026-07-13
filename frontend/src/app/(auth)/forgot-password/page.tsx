"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { api } from "@/services/api"
import { Mail, ShieldCheck, ShieldAlert, Sparkles, Send, Key } from "lucide-react"

function ForgotPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  // Request Reset Email Form State
  const [email, setEmail] = useState("")
  const [emailSent, setEmailSent] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState("")

  // Reset Password Form State
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState("")

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setRequestError("")
    setRequestLoading(true)

    try {
      await api.post("/api/auth/forgot-password", { email })
      setEmailSent(true)
    } catch (err: any) {
      setRequestError(err.message || "Failed to send password reset email.")
    } finally {
      setRequestLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError("")

    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.")
      return
    }

    setResetLoading(true)

    try {
      await api.post("/api/auth/reset-password", {
        token,
        newPassword,
      })
      setResetSuccess(true)
    } catch (err: any) {
      setResetError(err.message || "Failed to reset password. The link may be invalid or expired.")
    } finally {
      setResetLoading(false)
    }
  }

  // --- Render Password Reset Form ---
  if (token) {
    return (
      <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="p-2 bg-violet-600 rounded-lg text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white font-heading">Flow</span>
        </div>

        <h2 className="text-xl font-semibold text-center text-slate-100 font-heading mb-2">
          Reset Password
        </h2>
        <p className="text-sm text-center text-slate-400 mb-6">
          Enter your new password below.
        </p>

        {resetError && (
          <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm mb-4">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{resetError}</span>
          </div>
        )}

        {resetSuccess ? (
          <div className="text-center space-y-4 py-4">
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-full text-emerald-400 w-fit mx-auto">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-medium text-slate-200">Password Reset!</h3>
            <p className="text-sm text-slate-400">
              Your password has been updated successfully. You can now log in with your new password.
            </p>
            <Link href="/login" className="inline-block px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors">
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">New Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500"><Key className="h-4 w-4" /></span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500"><Key className="h-4 w-4" /></span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <span>{resetLoading ? "Updating..." : "Update Password"}</span>
            </button>
          </form>
        )}
      </div>
    )
  }

  // --- Render Password Reset Request Form ---
  return (
    <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10">
      <div className="flex items-center gap-2 justify-center mb-6">
        <div className="p-2 bg-violet-600 rounded-lg text-white">
          <Sparkles className="h-6 w-6" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-white font-heading">Flow</span>
      </div>

      <h2 className="text-xl font-semibold text-center text-slate-100 font-heading mb-2">Forgot Password</h2>
      <p className="text-sm text-center text-slate-400 mb-6">We'll email you a link to reset your password.</p>

      {requestError && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm mb-4">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{requestError}</span>
        </div>
      )}

      {emailSent ? (
        <div className="text-center space-y-4 py-4">
          <div className="p-3 bg-violet-950/40 border border-violet-900/50 rounded-full text-violet-400 w-fit mx-auto">
            <Send className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-medium text-slate-200">Email Sent!</h3>
          <p className="text-sm text-slate-400">
            If the email is associated with an account, a password reset link has been sent. Please check your inbox and spam folder.
          </p>
          <Link href="/login" className="inline-block text-xs text-violet-400 hover:underline">
            Back to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleRequestReset} className="space-y-4">
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
            disabled={requestLoading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            <span>{requestLoading ? "Sending Link..." : "Send Reset Link"}</span>
          </button>
        </form>
      )}

      {!emailSent && (
        <div className="mt-6 text-center text-xs text-slate-400">
          Remember password?{" "}
          <Link href="/login" className="text-violet-400 hover:underline">Log In</Link>
        </div>
      )}
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      
      <Suspense fallback={
        <div className="w-full max-w-md glass p-8 rounded-2xl shadow-premium border border-slate-800/50 relative z-10 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading forgot password interface...</p>
        </div>
      }>
        <ForgotPasswordContent />
      </Suspense>
    </div>
  )
}
