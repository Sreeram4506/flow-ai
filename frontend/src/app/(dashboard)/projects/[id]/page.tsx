"use client"

// Project detail view.
//
// The backend has had a full detail surface all along — GET /api/projects/:id
// returns client, team, members, milestones and counts, and there are
// dedicated /stats, /members and /milestones endpoints — but the frontend had
// no dynamic routes at all, so none of it was reachable. Milestones and
// project members were completely unusable features from the UI. This page is
// the missing half.

import React, { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Calendar, DollarSign, Users, CheckCircle2, Circle,
  Plus, Trash2, Flag, Clock, Briefcase,
} from "lucide-react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { formatCurrency, formatDate } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  ON_HOLD: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  ARCHIVED: "bg-slate-700/20 text-slate-400 border-slate-600/20",
}

const PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "ARCHIVED"]

function secondsToHours(seconds: number) {
  return (seconds / 3600).toFixed(1)
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { currentOrg } = useAuth()

  const [project, setProject] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [milestoneTitle, setMilestoneTitle] = useState("")
  const [milestoneDue, setMilestoneDue] = useState("")
  const [addingMilestone, setAddingMilestone] = useState(false)

  const load = useCallback(async () => {
    if (!id || !currentOrg) return
    setLoading(true)
    try {
      // Stats are secondary — if that call fails the page should still render
      // the project, so the two are settled independently.
      const [projectRes, statsRes] = await Promise.allSettled([
        api.get(`/api/projects/${id}`),
        api.get(`/api/projects/${id}/stats`),
      ])

      if (projectRes.status === "fulfilled") {
        setProject((projectRes.value as any).data ?? projectRes.value)
      } else {
        setNotFound(true)
      }

      if (statsRes.status === "fulfilled") {
        setStats((statsRes.value as any).data ?? statsRes.value)
      }
    } finally {
      setLoading(false)
    }
  }, [id, currentOrg])

  useEffect(() => {
    load()
  }, [load])

  const handleStatusChange = async (status: string) => {
    const previous = project
    setProject({ ...project, status }) // optimistic
    try {
      await api.patch(`/api/projects/${id}`, { status })
    } catch {
      setProject(previous) // interceptor already surfaced the error toast
    }
  }

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!milestoneTitle.trim()) return
    setAddingMilestone(true)
    try {
      await api.post(`/api/projects/${id}/milestones`, {
        title: milestoneTitle.trim(),
        dueDate: milestoneDue || undefined,
      })
      setMilestoneTitle("")
      setMilestoneDue("")
      load()
    } catch {
      /* toast handled globally */
    } finally {
      setAddingMilestone(false)
    }
  }

  const handleCompleteMilestone = async (milestoneId: string) => {
    try {
      await api.patch(`/api/projects/${id}/milestones/${milestoneId}/complete`)
      load()
    } catch {
      /* toast handled globally */
    }
  }

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!confirm("Delete this milestone?")) return
    try {
      await api.delete(`/api/projects/${id}/milestones/${milestoneId}`)
      load()
    } catch {
      /* toast handled globally */
    }
  }

  const handleArchive = async () => {
    if (!confirm("Archive this project? It will be hidden from the active list.")) return
    try {
      await api.delete(`/api/projects/${id}`)
      router.push("/projects")
    } catch {
      /* toast handled globally */
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    )
  }

  if (notFound || !project) {
    return (
      <div className="glass p-12 text-center rounded-2xl border border-border">
        <Briefcase className="h-10 w-10 mx-auto mb-3 text-slate-500" />
        <h3 className="font-bold text-foreground">Project not found</h3>
        <p className="text-xs text-muted mt-1">
          It may have been deleted, or belong to a different organization.
        </p>
        <Link href="/projects" className="inline-block mt-4 text-xs text-violet-400 hover:underline">
          Back to projects
        </Link>
      </div>
    )
  }

  const doneCount =
    stats?.taskStats?.find((s: any) => s.status === "DONE")?._count ?? 0
  const totalTasks =
    stats?.taskStats?.reduce((sum: number, s: any) => sum + (s._count ?? 0), 0) ?? 0

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All projects
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight font-heading truncate">
              {project.name}
            </h1>
            <p className="text-sm text-muted mt-1">
              {project.description || "No description provided."}
            </p>
            {project.client && (
              <p className="text-xs text-muted mt-2">
                Client:{" "}
                <span className="text-slate-300 font-semibold">
                  {project.client.companyName}
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={project.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border focus:outline-none ${
                STATUS_STYLES[project.status] ?? STATUS_STYLES.PLANNING
              }`}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-slate-900 text-slate-100">
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              onClick={handleArchive}
              className="px-3 py-2 border border-border hover:border-red-500/40 hover:text-red-400 rounded-xl text-xs font-semibold text-muted transition-colors"
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Flag className="h-4 w-4" />}
          label="Progress"
          value={`${project.progress ?? 0}%`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Tasks Done"
          value={totalTasks ? `${doneCount}/${totalTasks}` : String(project._count?.tasks ?? 0)}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Budget"
          value={project.budget ? formatCurrency(parseFloat(project.budget)) : "—"}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Hours Logged"
          value={stats ? `${secondsToHours(stats.totalTimeSeconds ?? 0)}h` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Milestones */}
        <div className="lg:col-span-2 glass p-6 rounded-2xl border border-border/60">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
            Milestones
          </h2>

          <div className="space-y-2 mb-5">
            {(project.milestones ?? []).length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">
                No milestones yet. Add one below to break this project into phases.
              </p>
            ) : (
              project.milestones.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-3 bg-slate-950/20 border border-border/40 rounded-xl group"
                >
                  <button
                    onClick={() => !m.isCompleted && handleCompleteMilestone(m.id)}
                    disabled={m.isCompleted}
                    title={m.isCompleted ? "Completed" : "Mark complete"}
                    className="shrink-0 text-muted hover:text-emerald-400 transition-colors disabled:cursor-default"
                  >
                    {m.isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${
                        m.isCompleted ? "line-through text-slate-500" : "text-slate-200"
                      }`}
                    >
                      {m.title}
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}
                      {typeof m._count?.tasks === "number" && ` · ${m._count.tasks} task(s)`}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteMilestone(m.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all"
                    aria-label="Delete milestone"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddMilestone} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              placeholder="New milestone..."
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-xs"
            />
            <input
              type="date"
              value={milestoneDue}
              onChange={(e) => setMilestoneDue(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-xs"
            />
            <button
              type="submit"
              disabled={addingMilestone || !milestoneTitle.trim()}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-border/60">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </h2>
            {(project.members ?? []).length === 0 ? (
              <p className="text-xs text-muted">No members assigned.</p>
            ) : (
              <div className="space-y-2">
                {project.members.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-400 shrink-0">
                      {(m.user?.firstName?.[0] ?? "?").toUpperCase()}
                      {(m.user?.lastName?.[0] ?? "").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {m.user?.firstName} {m.user?.lastName}
                      </p>
                      <p className="text-[10px] text-muted truncate">{m.role ?? "Member"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass p-6 rounded-2xl border border-border/60 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-1">
              Timeline
            </h2>
            <DetailRow
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Start"
              value={project.startDate ? formatDate(project.startDate) : "—"}
            />
            <DetailRow
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Deadline"
              value={project.deadline ? formatDate(project.deadline) : "—"}
            />
            <DetailRow
              icon={<Flag className="h-3.5 w-3.5" />}
              label="Priority"
              value={project.priority ?? "—"}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="glass p-4 rounded-2xl border border-border/60">
      <div className="flex items-center gap-1.5 text-muted text-[10px] font-bold uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-extrabold text-slate-100 mt-2">{value}</p>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </span>
      <span className="text-slate-200 font-semibold">{value}</span>
    </div>
  )
}
