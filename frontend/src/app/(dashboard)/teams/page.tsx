"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { Users, Plus, Shield, ShieldCheck, Mail, Target, Briefcase } from "lucide-react"

export default function TeamsPage() {
  const { currentOrg } = useAuth()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Form State
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("#6366f1")

  const fetchTeams = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res: any = await api.get("/api/teams")
      setTeams(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeams()
  }, [currentOrg])

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/teams", { name, description, color })
      setShowModal(false)
      setName("")
      setDescription("")
      fetchTeams()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Teams</h1>
          <p className="text-sm text-muted mt-1">Organize workspace users into functional groups and departments.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Team</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.length === 0 ? (
          <div className="col-span-full glass p-12 text-center text-muted rounded-2xl border border-border">
            <Users className="h-10 w-10 mx-auto mb-3 text-slate-500" />
            <h3 className="font-bold text-foreground">No Teams</h3>
            <p className="text-xs text-muted mt-1">Create a functional group like Engineering or Sales.</p>
          </div>
        ) : (
          teams.map((team) => (
            <div key={team.id} className="glass p-6 rounded-2xl border border-border/60 hover:border-violet-500/20 transition-all flex flex-col justify-between h-48 relative group">
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full shrink-0" 
                      style={{ backgroundColor: team.color || "#6366f1" }}
                    />
                    <h3 className="text-base font-bold text-slate-100 group-hover:text-violet-400 transition-colors truncate max-w-[150px]">
                      {team.name}
                    </h3>
                  </div>
                  <span className="text-[10px] text-muted font-bold uppercase">{team.members?.length || 0} Members</span>
                </div>
                <p className="text-xs text-slate-400 mt-3 line-clamp-2 leading-relaxed">{team.description || "No description provided."}</p>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted font-bold uppercase border-t border-border/40 pt-3">
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-violet-400" />
                  <span>{team._count?.projects || 0} Active Projects</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Team</h3>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Sales Department..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-20"
                  placeholder="Focus area details..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Color Indicator</label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-10 p-1 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer"
                />
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
                  Save Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
