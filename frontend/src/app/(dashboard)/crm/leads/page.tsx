"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { PhoneCall, Plus, DollarSign, Target, ChevronRight, X, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { LeadStage } from "@/lib/enums"

export default function LeadsPage() {
  const { currentOrg } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Form State
  const [companyName, setCompanyName] = useState("")
  const [contactName, setContactName] = useState("")
  const [email, setEmail] = useState("")
  const [value, setValue] = useState("")
  const [stage, setStage] = useState("NEW")
  const [probability, setProbability] = useState("")

  const fetchLeads = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res: any = await api.get("/api/leads")
      setLeads(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [currentOrg])

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/leads", {
        companyName,
        contactName,
        email,
        value: value ? parseFloat(value) : undefined,
        stage,
        probability: probability ? parseInt(probability) : undefined,
      })
      setShowModal(false)
      setCompanyName("")
      setContactName("")
      setEmail("")
      setValue("")
      setProbability("")
      fetchLeads()
    } catch (e) {
      console.error(e)
    }
  }

  const handleStageChange = async (leadId: string, nextStage: LeadStage) => {
    try {
      await api.patch(`/api/leads/${leadId}`, { stage: nextStage })
      fetchLeads()
    } catch (e) {
      console.error(e)
    }
  }

  const stages = [
    LeadStage.NEW,
    LeadStage.CONTACTED,
    LeadStage.QUALIFIED,
    LeadStage.PROPOSAL_SENT,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Leads Pipeline</h1>
          <p className="text-sm text-muted mt-1">Track conversions, negotiations, and lead quality scorings.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Lead</span>
        </button>
      </div>

      {/* Kanban Pipeline Row */}
      <div className="flex gap-4 overflow-x-auto pb-4 max-w-full">
        {stages.map((stg) => {
          const stageLeads = leads.filter((l) => l.stage === stg)
          return (
            <div key={stg} className="flex-shrink-0 w-80 bg-slate-950/20 border border-border/40 p-4 rounded-2xl h-fit">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/30">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {stg.replace('_', ' ')}
                </span>
                <span className="text-[10px] bg-slate-900 border border-border px-1.5 py-0.5 rounded text-muted font-bold">
                  {stageLeads.length}
                </span>
              </div>

              {/* Card stack */}
              <div className="space-y-3 min-h-[300px]">
                {stageLeads.map((lead) => (
                  <div key={lead.id} className="bg-card border border-border/60 p-4 rounded-xl shadow-premium relative group">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-xs font-bold text-slate-100">{lead.companyName}</h4>
                      <span className="text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded font-bold">
                        Score: {lead.aiScore || 0}
                      </span>
                    </div>
                    
                    <p className="text-[10px] text-muted">{lead.contactName}</p>

                    <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center text-emerald-400">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>{lead.value ? formatCurrency(parseFloat(lead.value)) : "0.00"}</span>
                      </span>

                      {/* Dropdown status update for demo simulation */}
                      <select
                        value={lead.stage}
                        onChange={(e) => handleStageChange(lead.id, e.target.value as LeadStage)}
                        className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] text-slate-400 focus:outline-none"
                      >
                        {stages.map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-card border border-border p-6 rounded-2xl shadow-2xl">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Lead</h3>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Acme Inc..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Contact Name</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="contact@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Contract Value ($)</label>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="15000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Probability (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={probability}
                    onChange={(e) => setProbability(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Initial Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
