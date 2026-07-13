"use client"

import React, { useEffect, useState } from "react"
import { api } from "../../../services/api"
import { useAuth } from "../../../context/AuthContext"
import { Settings, Shield, Key, Check, Copy, RefreshCw, Loader } from "lucide-react"

export default function SettingsPage() {
  const { currentOrg, user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [mfaSecret, setMfaSecret] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [mfaCode, setMfaCode] = useState("")
  const [mfaSetup, setMfaSetup] = useState(false)

  // API Key state
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const fetchApiKeys = async () => {
    if (!currentOrg) return
    try {
      const res: any = await api.get(`/api/organizations/${currentOrg.id}/api-keys`)
      setApiKeys(res.data || res || [])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!currentOrg) return
    const initData = async () => {
      setLoading(true)
      try {
        const profileRes: any = await api.get("/api/auth/me")
        setTwoFactorEnabled(profileRes.data?.twoFactorAuth?.isEnabled || false)
        await fetchApiKeys()
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    initData()
  }, [currentOrg])

  const handleSetupMfa = async () => {
    try {
      const res: any = await api.post("/api/auth/2fa/setup", {})
      setMfaSecret(res.secret)
      setQrCodeUrl(res.qrCodeUrl)
      setMfaSetup(true)
    } catch (e) {
      console.error(e)
    }
  }

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/auth/2fa/enable", { code: mfaCode })
      setTwoFactorEnabled(true)
      setMfaSetup(false)
      setMfaCode("")
      refreshUser()
      alert("Two-Factor Authentication enabled successfully!")
    } catch (e) {
      console.error(e)
      alert("Invalid verification code. Please try again.")
    }
  }

  const handleDisableMfa = async () => {
    const code = prompt("Enter 2FA verification code to disable:")
    if (!code) return
    try {
      await api.post("/api/auth/2fa/disable", { code })
      setTwoFactorEnabled(false)
      refreshUser()
      alert("MFA disabled successfully.")
    } catch (e) {
      console.error(e)
      alert("Invalid code.")
    }
  }

  const handleGenerateApiKey = async () => {
    if (!newKeyName.trim() || !currentOrg) return
    try {
      const res: any = await api.post(`/api/organizations/${currentOrg.id}/api-keys`, { name: newKeyName })
      setGeneratedKey(res.data?.key || res.key)
      setNewKeyName("")
      await fetchApiKeys()
    } catch (e) {
      console.error(e)
    }
  }

  const handleRevokeApiKey = async (keyId: string) => {
    if (!currentOrg || !confirm("Are you sure you want to revoke this API key? Any applications using it will immediately lose access.")) return
    try {
      await api.delete(`/api/organizations/${currentOrg.id}/api-keys/${keyId}`)
      await fetchApiKeys()
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Settings</h1>
        <p className="text-sm text-muted mt-1">Configure profile parameters, MFA security, and API integrations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card Summary */}
        <div className="glass p-6 rounded-2xl border border-border/60">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">User Profile</h3>
          <div className="space-y-4 text-xs">
            <div>
              <span className="text-muted uppercase block">Full Name</span>
              <span className="font-bold text-slate-200 mt-1 block">{user?.firstName} {user?.lastName}</span>
            </div>
            <div>
              <span className="text-muted uppercase block">Email Address</span>
              <span className="font-bold text-slate-200 mt-1 block">{user?.email}</span>
            </div>
            <div>
              <span className="text-muted uppercase block">Account Scope</span>
              <span className="font-bold text-violet-400 mt-1 block uppercase">
                {user?.isSuperAdmin ? "Super Admin Access" : "Organization Member"}
              </span>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication Security */}
        <div className="glass p-6 rounded-2xl border border-border/60 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2">Two-Factor Authentication</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Protect your account by adding an additional security layer requiring an authenticator code.
            </p>
          </div>

          <div className="space-y-4">
            {twoFactorEnabled ? (
              <div className="space-y-3">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl">
                  <Shield className="h-4 w-4" /> Two-Factor Active
                </span>
                <button
                  onClick={handleDisableMfa}
                  className="w-full py-2 bg-rose-600/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors"
                >
                  Disable MFA
                </button>
              </div>
            ) : mfaSetup ? (
              <form onSubmit={handleEnableMfa} className="space-y-4">
                <div className="flex justify-center border border-border/40 p-2 rounded-xl bg-white w-fit mx-auto">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Verify Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-center text-sm font-bold tracking-widest focus:outline-none"
                    placeholder="000000"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold"
                >
                  Verify & Enable
                </button>
              </form>
            ) : (
              <button
                onClick={handleSetupMfa}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-md"
              >
                Set Up Two-Factor
              </button>
            )}
          </div>
        </div>

        {/* API Tokens */}
        <div className="glass p-6 rounded-2xl border border-border/60 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2">Workspace API Keys</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Manage developer tokens to integrate external services with your Flow portal.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 max-h-28 overflow-y-auto">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex justify-between items-center text-xs border border-border/40 p-2 rounded-xl bg-slate-950/20">
                  <div>
                    <span className="font-bold text-slate-200 block">{key.name}</span>
                    <span className="text-[10px] text-muted font-mono">{key.key}</span>
                  </div>
                  <button 
                    onClick={() => handleRevokeApiKey(key.id)}
                    className="text-[10px] uppercase font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>

            {generatedKey && (
              <div className="p-2 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-xl text-xs font-mono select-all flex items-center justify-between">
                <span className="truncate max-w-[200px]">{generatedKey}</span>
                <span className="text-[9px] uppercase font-bold text-muted bg-border px-1.5 py-0.5 rounded cursor-pointer" onClick={() => navigator.clipboard.writeText(generatedKey)}>
                  Copy
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs placeholder-slate-500 focus:outline-none"
                placeholder="Key label..."
              />
              <button
                onClick={handleGenerateApiKey}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
