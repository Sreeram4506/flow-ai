"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "../../../services/api"
import { useAuth } from "../../../context/AuthContext"
import { FolderKanban, Plus, Clock, Briefcase, DollarSign, CheckCircle2 } from "lucide-react"
import { formatCurrency, formatDate } from "../../../lib/utils"

export default function ProjectsPage() {
  const { currentOrg } = useAuth()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  
  // Create form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [budget, setBudget] = useState("")
  const [priority, setPriority] = useState("MEDIUM")
  const [deadline, setDeadline] = useState("")
  const [autoGenerateTasks, setAutoGenerateTasks] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const fetchProjects = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res: any = await api.get("/api/projects")
      setProjects(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [currentOrg])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsGenerating(true)
    try {
      const projRes: any = await api.post("/api/projects", {
        name,
        description,
        budget: budget ? parseFloat(budget) : undefined,
        priority,
        deadline: deadline || undefined,
      })
      
      const createdProjId = projRes.data?.id || projRes.id

      if (autoGenerateTasks && createdProjId) {
        // AI Task generation
        const aiRes: any = await api.post("/api/ai/generate-tasks", {
          projectDescription: description || name,
          numberOfTasks: 5
        })
        
        const generatedTasks = aiRes.data?.tasks || aiRes.tasks || []
        
        // Save them to the DB
        for (const t of generatedTasks) {
          await api.post("/api/tasks", {
            projectId: createdProjId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimatedHours: t.estimatedHours
          })
        }
      }

      setShowModal(false)
      setName("")
      setDescription("")
      setBudget("")
      setDeadline("")
      setAutoGenerateTasks(false)
      fetchProjects()
    } catch (e) {
      console.error(e)
    } finally {
      setIsGenerating(false)
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
      {/* Header banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Projects</h1>
          <p className="text-sm text-muted mt-1">Manage project portfolios, progress, and resource allocations.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-full glass p-12 text-center text-muted rounded-2xl border border-border">
            <FolderKanban className="h-10 w-10 mx-auto mb-3 text-slate-500" />
            <h3 className="font-bold text-foreground">No Projects</h3>
            <p className="text-xs text-muted mt-1">Get started by creating your first business project mapping.</p>
          </div>
        ) : (
          projects.map((proj) => (
            <Link
              href={`/projects/${proj.id}`}
              key={proj.id}
              className="glass p-6 rounded-2xl border border-border/60 hover:border-violet-500/20 transition-all flex flex-col justify-between h-56 relative group"
            >
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-bold text-slate-100 group-hover:text-violet-400 transition-colors truncate max-w-[180px]">{proj.name}</h3>
                  <span className="text-[10px] bg-slate-900 border border-border px-2 py-0.5 rounded text-muted uppercase font-bold">
                    {proj.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{proj.description || "No description provided."}</p>
              </div>

              <div className="space-y-4">
                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted font-bold uppercase">
                    <span>Progress</span>
                    <span>{proj.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${proj.progress}%` }} 
                      className="bg-brand-gradient h-full rounded-full transition-all"
                    />
                  </div>
                </div>

                {/* Bottom stats details */}
                <div className="flex items-center justify-between text-xs text-muted border-t border-border/40 pt-3">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>{proj.budget ? formatCurrency(parseFloat(proj.budget)) : "No budget"}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDate(proj.deadline)}</span>
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Website Launch..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-20"
                  placeholder="Brief project details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Budget ($)</label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="5000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Deadline Date</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>

              <div className="flex items-center gap-2 mt-4 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                <input
                  type="checkbox"
                  id="autoGenerate"
                  checked={autoGenerateTasks}
                  onChange={(e) => setAutoGenerateTasks(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="autoGenerate" className="text-xs font-bold text-violet-300 flex items-center gap-1.5 cursor-pointer">
                  Auto-generate Tasks with AI
                </label>
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
                  disabled={isGenerating}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    "Save Project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
