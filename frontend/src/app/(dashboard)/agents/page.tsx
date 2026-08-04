"use client"

import React, { useEffect, useRef, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { io, Socket } from "socket.io-client"
import {
  Bot,
  Sparkles,
  Calendar,
  Mail,
  Shield,
  Play,
  Power,
  Palette,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Ban,
  RefreshCw,
} from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

type Tab = "team" | "brand" | "calendar" | "emails" | "controls"

const ROLE_COLORS: Record<string, string> = {
  CEO: "from-violet-500 to-purple-600",
  MARKETING: "from-pink-500 to-rose-600",
  CTO: "from-cyan-500 to-blue-600",
}

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-500/15 text-emerald-400",
  SCHEDULED: "bg-blue-500/15 text-blue-400",
  DRAFT: "bg-slate-500/15 text-slate-400",
  PUBLISHING: "bg-amber-500/15 text-amber-400",
  FAILED: "bg-red-500/15 text-red-400",
  CANCELLED: "bg-slate-500/15 text-slate-500",
  SENT: "bg-emerald-500/15 text-emerald-400",
  QUEUED: "bg-blue-500/15 text-blue-400",
  DRAFTED: "bg-amber-500/15 text-amber-400",
  RECEIVED: "bg-slate-500/15 text-slate-300",
  TRIAGED: "bg-violet-500/15 text-violet-400",
}

/**
 * Inline preview of whatever a run produced.
 *
 * Video is a real `<video>` element rather than a thumbnail because the point
 * is to check the clip before it goes out — a poster frame hides most of what
 * can be wrong with generated video.
 */
function MediaPreview({
  imageUrl,
  videoUrl,
  className = "w-full max-h-48",
}: {
  imageUrl?: string
  videoUrl?: string
  className?: string
}) {
  if (!imageUrl && !videoUrl) return null
  return (
    <div className="space-y-2">
      {videoUrl && (
        <video
          src={videoUrl}
          controls
          muted
          playsInline
          preload="metadata"
          className={`${className} rounded-xl bg-black object-contain`}
        />
      )}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className={`${className} rounded-xl object-cover`} />
      )}
    </div>
  )
}

/**
 * Per-stage outcome of the generation pipeline.
 *
 * Only the stages that did NOT come back clean are shown: a run where
 * everything worked needs no explanation, whereas a placeholder image or a
 * skipped video is exactly what someone reviewing the output needs to see.
 * `*Note` keys carry the reason and are rendered as the tooltip.
 */
function PipelineReport({ pipeline }: { pipeline?: Record<string, string> | null }) {
  if (!pipeline) return null
  // `pagesRead` is a count, not an outcome — it is reported alongside the
  // sources instead, so it must not be flagged as though something went wrong.
  const INFORMATIONAL = new Set(["pagesRead"])
  const problems = Object.entries(pipeline).filter(
    ([key, value]) =>
      !key.endsWith("Note") && !INFORMATIONAL.has(key) && value !== "ok" && value !== "running",
  )
  if (!problems.length) return null

  return (
    <div className="flex flex-wrap gap-1">
      {problems.map(([stage, value]) => (
        <span
          key={stage}
          title={pipeline[`${stage}Note`] || undefined}
          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold"
        >
          {stage}: {value}
        </span>
      ))}
    </div>
  )
}

export default function AgentsPage() {
  const { user, currentOrg } = useAuth()
  const [tab, setTab] = useState<Tab>("team")
  const [agents, setAgents] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [feed, setFeed] = useState<any[]>([])
  const [content, setContent] = useState<any[]>([])
  const [emails, setEmails] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [brand, setBrand] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [importUrl, setImportUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState<any>(null)
  const socketRef = useRef<Socket | null>(null)

  // Directive form (give agents work)
  const [directives, setDirectives] = useState<any[]>([])
  const [dirInstruction, setDirInstruction] = useState("")
  const [dirRole, setDirRole] = useState("CEO")
  const [dirPriority, setDirPriority] = useState("MEDIUM")
  const [dirRunNow, setDirRunNow] = useState(true)
  const [dirSubmitting, setDirSubmitting] = useState(false)

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(""), 4000)
  }

  const fetchAll = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const [agentsRes, runsRes, contentRes, emailsRes, settingsRes, directivesRes]: any[] = await Promise.all([
        api.get("/api/agents"),
        api.get("/api/agents/runs"),
        api.get("/api/content?limit=50"),
        api.get("/api/orchestrator/emails"),
        api.get("/api/orchestrator/settings"),
        api.get("/api/orchestrator/directives"),
      ])
      setAgents(agentsRes.data || [])
      setRuns(runsRes.data || [])
      setContent(contentRes.data?.data || contentRes.data || [])
      setEmails(emailsRes.data || [])
      setSettings(settingsRes.data || null)
      setDirectives(directivesRes.data || [])
      try {
        const brandRes: any = await api.get("/api/brand")
        setBrand(brandRes.data || {})
      } catch {
        setBrand({})
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [currentOrg])

  // Live agent activity feed
  useEffect(() => {
    if (!user || !currentOrg) return
    const socket = io(`${API_URL}/ws`, { transports: ["websocket"] })
    socketRef.current = socket
    socket.emit("join", { userId: user.id, orgId: currentOrg.id })
    socket.on("agent-activity", (event: any) => {
      setFeed((prev) => [event, ...prev].slice(0, 100))
    })
    // Debounced: agent runs emit many content-updates in bursts — refetch once per 2s max
    let refetchTimer: ReturnType<typeof setTimeout> | null = null
    socket.on("content-update", (event: any) => {
      // Surface generation in the live feed as it happens — the pipeline takes
      // 70s+ for an image post and minutes with video, so without the
      // per-stage events the run looks like nothing is happening. The finished
      // event carries the media, so the preview appears here too rather than
      // only after switching to the Content Calendar.
      const isJobEvent = typeof event?.type === "string" && event.type.startsWith("content-job-")
      if (isJobEvent || event?.imageUrl || event?.videoUrl) {
        setFeed((prev) => [{ ...event, agent: event.agent || "Content" }, ...prev].slice(0, 100))
      }
      if (refetchTimer) return
      refetchTimer = setTimeout(() => {
        refetchTimer = null
        api.get("/api/content?limit=50").then((res: any) => setContent(res.data?.data || res.data || [])).catch(() => {})
      }, 2000)
    })
    return () => {
      socket.disconnect()
    }
  }, [user?.id, currentOrg?.id])

  const runDailyPlan = async () => {
    setSaving(true)
    try {
      await api.post("/api/orchestrator/daily-plan/run")
      flash("CEO planning run started — watch the activity feed")
      setTimeout(fetchAll, 3000)
    } catch (e: any) {
      flash(e?.message || "Failed to start planning run")
    } finally {
      setSaving(false)
    }
  }

  const toggleKillSwitch = async () => {
    if (!settings) return
    const activating = !settings.killSwitch
    if (activating && !confirm("Halt ALL agent activity (posts, emails, runs)?")) return
    try {
      const res: any = await api.post("/api/orchestrator/kill-switch", { active: activating })
      setSettings(res.data || { ...settings, killSwitch: activating })
      flash(activating ? "Kill-switch ACTIVE — all agents halted" : "Agents resumed")
    } catch (e) {
      console.error(e)
    }
  }

  /**
   * Reads the company website and fills in the profile. Reading several pages
   * and running the extraction takes a while, so the button shows progress.
   */
  const importBrand = async () => {
    setImporting(true)
    setImportReport(null)
    try {
      const res: any = await api.post("/api/brand/import", { websiteUrl: importUrl.trim(), save: true })
      const report = res.data || res
      setImportReport(report)
      // Re-read the profile so the form shows exactly what was persisted,
      // rather than optimistically showing values the confidence gate withheld.
      const refreshed: any = await api.get("/api/brand")
      setBrand(refreshed.data || {})
      const savedCount = Object.values(report.fields || {}).filter((f: any) => f.saved).length
      flash(savedCount ? `Imported ${savedCount} field(s) from ${report.websiteUrl}` : "Nothing new to import")
    } catch (e: any) {
      flash(e?.message || "Could not read that website")
    } finally {
      setImporting(false)
    }
  }

  const saveBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put("/api/brand", {
        companyName: brand.companyName || currentOrg?.name || "My Company",
        tagline: brand.tagline,
        description: brand.description,
        mission: brand.mission,
        industry: brand.industry,
        targetAudience: brand.targetAudience,
        toneOfVoice: brand.toneOfVoice,
        contentGuidelines: brand.contentGuidelines,
        websiteUrl: brand.websiteUrl,
        instagramHandle: brand.instagramHandle,
        linkedinPage: brand.linkedinPage,
      })
      flash("Brand profile saved — agents will use it on their next run")
    } catch (e: any) {
      flash(e?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async (patch: any) => {
    try {
      const res: any = await api.patch("/api/orchestrator/settings", patch)
      setSettings(res.data || { ...settings, ...patch })
      flash("Settings updated")
    } catch (e) {
      console.error(e)
    }
  }

  const submitDirective = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dirInstruction.trim()) return
    setDirSubmitting(true)
    try {
      const res: any = await api.post("/api/orchestrator/directives", {
        instruction: dirInstruction,
        assigneeRole: dirRole,
        priority: dirPriority,
        runNow: dirRunNow,
      })
      setDirInstruction("")
      flash(
        res.data?.run
          ? `Done — ${res.data.run.output?.slice(0, 140) || "agent run finished"}`
          : res.data?.note || "Task queued for the agent",
      )
      fetchAll()
    } catch (e: any) {
      flash(e?.message || "Failed to assign task")
    } finally {
      setDirSubmitting(false)
    }
  }

  const emailAction = async (id: string, action: "approve" | "cancel") => {
    try {
      await api.post(`/api/orchestrator/emails/${id}/${action}`)
      const res: any = await api.get("/api/orchestrator/emails")
      setEmails(res.data || [])
      flash(action === "approve" ? "Email queued (hold-buffer active)" : "Email cancelled")
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

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "team", label: "Team & Activity", icon: Bot },
    { id: "brand", label: "Brand Profile", icon: Palette },
    { id: "calendar", label: "Content Calendar", icon: Calendar },
    { id: "emails", label: "Email Desk", icon: Mail },
    { id: "controls", label: "Safety Controls", icon: Shield },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-violet-500" /> AI Agent Company
          </h1>
          <p className="text-sm text-muted mt-1">
            Your CEO, CTO and Marketing agents plan, create, post and email — autonomously.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runDailyPlan}
            disabled={saving || settings?.killSwitch}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50 transition"
          >
            <Play className="w-4 h-4" /> Run Daily Plan
          </button>
          <button
            onClick={toggleKillSwitch}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              settings?.killSwitch
                ? "bg-red-600 text-white animate-pulse"
                : "bg-slate-800 text-red-400 border border-red-500/30 hover:bg-red-500/10"
            }`}
          >
            <Power className="w-4 h-4" /> {settings?.killSwitch ? "HALTED — Resume" : "Kill-Switch"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-300 text-sm">
          {notice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                tab === t.id
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ===== TEAM & ACTIVITY ===== */}
      {tab === "team" && (
        <div className="space-y-6">
          {/* Assign work to agents */}
          <form onSubmit={submitDirective} className="p-5 rounded-2xl bg-card border border-violet-500/30 space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Send className="w-4 h-4 text-violet-400" /> Give your agents work
            </h3>
            <textarea
              value={dirInstruction}
              onChange={(e) => setDirInstruction(e.target.value)}
              rows={2}
              placeholder={`e.g. "Plan a launch campaign for our new feature" (CEO) · "Create an Instagram post about our summer offer, schedule for 6pm" (Marketing) · "Write a blog post on how we build our product" (CTO)`}
              className="w-full px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700 focus:border-violet-500 outline-none text-sm"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={dirRole}
                onChange={(e) => setDirRole(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700 text-sm"
              >
                <option value="CEO">CEO — plans & delegates</option>
                <option value="MARKETING">Marketing — posts & campaigns</option>
                <option value="CTO">CTO — blog & tech</option>
              </select>
              <select
                value={dirPriority}
                onChange={(e) => setDirPriority(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700 text-sm"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input type="checkbox" checked={dirRunNow} onChange={(e) => setDirRunNow(e.target.checked)} />
                Run immediately
              </label>
              <button
                type="submit"
                disabled={dirSubmitting || !dirInstruction.trim()}
                className="ml-auto px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {dirSubmitting ? "Working…" : "Assign"}
              </button>
            </div>
          </form>

          {/* Agent task board */}
          {directives.length > 0 && (
            <div className="p-5 rounded-2xl bg-card border border-slate-800">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-violet-400" /> Agent Task Board
              </h3>
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {directives.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 text-sm flex-wrap">
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                        t.status === "DONE"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : t.status === "IN_PROGRESS"
                            ? "bg-amber-500/15 text-amber-400"
                            : t.status === "IN_REVIEW"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-slate-500/15 text-slate-400"
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="flex-1 min-w-[200px]">{t.title}</span>
                    <span className="text-xs text-violet-400 font-semibold">
                      {t.assigneeAgent ? `${t.assigneeAgent.name} (${t.assigneeAgent.role})` : "unassigned"}
                    </span>
                    <span className="text-xs text-muted">{new Date(t.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {agents.map((agent) => (
              <div key={agent.id} className="p-5 rounded-2xl bg-card border border-slate-800">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${ROLE_COLORS[agent.role] || "from-slate-500 to-slate-700"} flex items-center justify-center text-white font-bold text-lg`}
                  >
                    {agent.name?.[0]}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{agent.name}</div>
                    <div className="text-xs text-muted">{agent.title || agent.role}</div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                      agent.isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"
                    }`}
                  >
                    {agent.isActive ? "ACTIVE" : "OFF"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-800/40">
                    <div className="text-sm font-bold">{agent._count?.runs ?? 0}</div>
                    <div className="text-[10px] text-muted">Runs</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/40">
                    <div className="text-sm font-bold">{agent._count?.contentItems ?? 0}</div>
                    <div className="text-[10px] text-muted">Posts</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/40">
                    <div className="text-sm font-bold">{agent._count?.tasks ?? 0}</div>
                    <div className="text-[10px] text-muted">Tasks</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 p-5 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-400" /> Live Activity
              </h3>
              <button onClick={fetchAll} className="text-muted hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {feed.length === 0 && (
                <p className="text-sm text-muted">
                  Waiting for live events… trigger “Run Daily Plan” to watch the agents work.
                </p>
              )}
              {feed.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/30 text-sm">
                  <span className="text-[10px] font-bold text-violet-400 mt-0.5 whitespace-nowrap">{ev.agent}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="text-slate-300 break-all block">
                      {ev.type === "thought" && `💭 ${ev.text}`}
                      {ev.type === "action" && `🔧 ${ev.tool}(${JSON.stringify(ev.args)?.slice(0, 120)})`}
                      {ev.type === "run-started" && `▶️ Run started — ${ev.instruction?.slice(0, 100)}`}
                      {ev.type === "run-finished" && `✅ ${ev.output?.slice(0, 160)}`}
                      {ev.type === "run-failed" && `❌ ${ev.error}`}
                      {ev.type === "task-created" && `📋 Created task "${ev.title}" → ${ev.assignedTo}`}
                      {ev.type === "task-completed" && `☑️ Completed "${ev.title}"`}
                      {ev.type === "email-drafted" && `✉️ Drafted email to ${ev.to}: ${ev.subject}`}
                      {ev.type === "email-sent" && `📤 Sent email to ${ev.to}`}
                      {ev.type === "email-failed" && `⚠️ Email to ${ev.to} failed: ${ev.error}`}
                      {ev.type === "content-job-started" && `🎬 Generating ${ev.channel} post — "${ev.topic}"`}
                      {ev.type === "content-job-progress" && `⚙️ ${ev.stage}: ${ev.status}`}
                      {ev.type === "content-job-failed" && `❌ Generation failed: ${ev.error}`}
                      {(ev.type === "content-ready" || ev.type === "content-job-finished") &&
                        `🖼️ ${ev.channel || "Content"} ${ev.status ? ev.status.toLowerCase() : "ready"}${
                          ev.title ? ` — ${ev.title}` : ""
                        }`}
                    </span>

                    <MediaPreview imageUrl={ev.imageUrl} videoUrl={ev.videoUrl} />

                    {ev.caption && (ev.type === "content-ready" || ev.type === "content-job-finished") && (
                      <p className="text-xs text-slate-400 line-clamp-3">{ev.caption}</p>
                    )}
                    <PipelineReport pipeline={ev.pipeline} />
                    {ev.error && ev.type === "content-ready" && <p className="text-xs text-red-400">{ev.error}</p>}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="font-bold mt-6 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-400" /> Recent Runs
            </h3>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {runs.map((run) => (
                <details key={run.id} className="p-3 rounded-xl bg-slate-800/30 text-sm">
                  <summary className="cursor-pointer flex items-center gap-2 flex-wrap">
                    {run.status === "COMPLETED" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : run.status === "FAILED" ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="font-semibold">{run.agent?.name}</span>
                    <span className="text-xs text-muted">({run.trigger})</span>
                    <span className="text-xs text-muted ml-auto">
                      {new Date(run.startedAt).toLocaleString()} · {run.steps} steps
                    </span>
                  </summary>
                  <div className="mt-2 pl-6 space-y-1 text-xs text-slate-400">
                    {run.output && <p className="text-slate-300">{run.output}</p>}
                    {run.actions?.map((a: any) => (
                      <p key={a.id}>
                        <span className="text-violet-400">{a.tool}</span>
                        {a.status !== "ok" && <span className="text-red-400"> [{a.status}]</span>}
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ===== BRAND ===== */}
      {tab === "brand" && (
        <form onSubmit={saveBrand} className="max-w-3xl space-y-4">
          <p className="text-sm text-muted">
            Everything here is injected into every agent prompt — this is what makes posts and emails sound like{" "}
            <span className="text-foreground font-semibold">your</span> company.
          </p>

          {/* Fill the form from the company's own website instead of typing it all. */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted">Set up from your website</label>
              <p className="text-xs text-muted mt-0.5">
                We&apos;ll read your site and fill in what we can. Fields you&apos;ve already written are kept.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="acme.com"
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700 focus:border-violet-500 outline-none text-sm"
              />
              <button
                type="button"
                onClick={importBrand}
                disabled={importing || !importUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold whitespace-nowrap"
              >
                {importing ? "Reading site…" : "Import"}
              </button>
            </div>
            {importReport && (
              <div className="text-xs space-y-1">
                <p className="text-muted">
                  Read {importReport.pagesRead?.length ?? 0} page(s). Review below, then Save.
                </p>
                {Object.entries(importReport.fields || {}).map(([field, info]: [string, any]) => (
                  <p key={field} className={info.saved ? "text-emerald-400" : "text-amber-400"}>
                    {info.saved ? "✓" : "•"} {field}
                    <span className="text-muted">
                      {" "}
                      — {info.confidence} confidence
                      {info.skippedReason ? ` (not applied: ${info.skippedReason})` : ""}
                    </span>
                  </p>
                ))}
                {importReport.warning && <p className="text-amber-400">{importReport.warning}</p>}
              </div>
            )}
          </div>
          {[
            ["companyName", "Company name *", "Acme Studio"],
            ["tagline", "Tagline", "Design that ships"],
            ["industry", "Industry", "Design agency / SaaS / ..."],
            ["websiteUrl", "Website URL", "https://acme.com"],
            ["instagramHandle", "Instagram handle", "@acmestudio"],
            ["linkedinPage", "LinkedIn page", "linkedin.com/company/acme"],
          ].map(([key, label, ph]) => (
            <div key={key}>
              <label className="text-xs font-semibold text-muted">{label}</label>
              <input
                value={brand[key] || ""}
                onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                placeholder={ph}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700 focus:border-violet-500 outline-none text-sm"
              />
            </div>
          ))}
          {[
            ["description", "About the company", "What you do, for whom, and what makes you different"],
            ["mission", "Mission", "Why the company exists"],
            ["targetAudience", "Target audience", "Who your content should speak to"],
            ["toneOfVoice", "Tone of voice", "e.g. confident, friendly, no corporate jargon, light humor"],
            ["contentGuidelines", "Content do's & don'ts", "e.g. never discuss pricing; always end with a question; avoid emoji on LinkedIn"],
          ].map(([key, label, ph]) => (
            <div key={key}>
              <label className="text-xs font-semibold text-muted">{label}</label>
              <textarea
                value={brand[key] || ""}
                onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                placeholder={ph}
                rows={3}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700 focus:border-violet-500 outline-none text-sm"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Brand Profile"}
          </button>
        </form>
      )}

      {/* ===== CALENDAR ===== */}
      {tab === "calendar" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {content.length === 0 && (
              <p className="text-sm text-muted col-span-full">
                No content yet. Run the daily plan and the Marketing agent will fill this calendar.
              </p>
            )}
            {content.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-card border border-slate-800 space-y-3">
                <MediaPreview imageUrl={item.imageUrl} videoUrl={item.videoUrl} className="w-full h-36" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-violet-500/15 text-violet-400 font-semibold">
                    {item.channel}
                  </span>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLES[item.status] || ""}`}>
                    {item.status}
                  </span>
                  {item.agent && <span className="text-[10px] text-muted ml-auto">by {item.agent.name}</span>}
                </div>
                <p className="text-sm text-slate-300 line-clamp-3">{item.title || item.caption || item.body}</p>
                <PipelineReport pipeline={item.pipeline} />
                {Array.isArray(item.sources) && item.sources.length > 0 && (
                  <p className="text-[10px] text-muted">
                    Researched from {item.sources.length} source(s)
                    {Array.isArray(item.readPages) && item.readPages.length > 0
                      ? `, ${item.readPages.length} read in full`
                      : ""}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {item.publishedAt
                      ? `Published ${new Date(item.publishedAt).toLocaleString()}`
                      : item.scheduledFor
                        ? `Scheduled ${new Date(item.scheduledFor).toLocaleString()}`
                        : "Draft"}
                  </span>
                  {(item.status === "DRAFT" || item.status === "SCHEDULED") && (
                    <button
                      onClick={() => api.post(`/api/content/${item.id}/publish`).then(fetchAll)}
                      className="text-violet-400 hover:text-violet-300 font-semibold"
                    >
                      Publish now
                    </button>
                  )}
                </div>
                {item.error && <p className="text-xs text-red-400">{item.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== EMAILS ===== */}
      {tab === "emails" && (
        <div className="space-y-3 max-w-4xl">
          <p className="text-sm text-muted">
            Inbound mail is triaged by the CEO agent; drafted replies wait here. Approved emails sit in a{" "}
            {settings?.emailHoldMinutes ?? 10}-minute hold-buffer so you can still cancel.
          </p>
          {emails.length === 0 && <p className="text-sm text-muted">No emails yet.</p>}
          {emails.map((em) => (
            <div key={em.id} className="p-4 rounded-2xl bg-card border border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] px-2 py-1 rounded-full bg-slate-500/15 text-slate-300 font-semibold">
                  {em.direction}
                </span>
                <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLES[em.status] || ""}`}>
                  {em.status}
                </span>
                <span className="text-xs text-muted ml-auto">{new Date(em.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm font-semibold mt-2">{em.subject || "(no subject)"}</p>
              <p className="text-xs text-muted">
                {em.direction === "INBOUND" ? `From: ${em.fromAddress}` : `To: ${em.toAddress}`}
              </p>
              <p className="text-sm text-slate-300 mt-2 line-clamp-4 whitespace-pre-wrap">{em.bodyText}</p>
              {(em.status === "DRAFTED" || em.status === "QUEUED") && (
                <div className="flex gap-2 mt-3">
                  {em.status === "DRAFTED" && (
                    <button
                      onClick={() => emailAction(em.id, "approve")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/30"
                    >
                      <Send className="w-3 h-3" /> Approve & Send
                    </button>
                  )}
                  <button
                    onClick={() => emailAction(em.id, "cancel")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-xs font-semibold hover:bg-red-600/30"
                  >
                    <Ban className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== CONTROLS ===== */}
      {tab === "controls" && settings && (
        <div className="max-w-2xl space-y-6">
          <div className="p-5 rounded-2xl bg-card border border-slate-800 space-y-5">
            <h3 className="font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" /> Safety Rails
            </h3>

            {[
              ["maxPostsPerDay", "Max posts per day (per channel)", 1, 25],
              ["maxAgentStepsPerRun", "Max steps per agent run", 2, 20],
              ["emailHoldMinutes", "Email hold-buffer (minutes)", 1, 120],
              ["dailyPlanHour", "Daily planning hour (0-23, server time)", 0, 23],
            ].map(([key, label, min, max]) => (
              <div key={key as string} className="flex items-center justify-between gap-4">
                <label className="text-sm">{label}</label>
                <input
                  type="number"
                  min={min as number}
                  max={max as number}
                  value={settings[key as string] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [key as string]: Number(e.target.value) })}
                  onBlur={() => saveSettings({ [key as string]: settings[key as string] })}
                  className="w-24 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700 text-sm text-right"
                />
              </div>
            ))}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Auto-send emails</p>
                <p className="text-xs text-muted">Off = every agent-drafted email needs your approval (recommended)</p>
              </div>
              <button
                onClick={() => saveSettings({ autoSendEmail: !settings.autoSendEmail })}
                className={`w-12 h-6 rounded-full transition relative ${settings.autoSendEmail ? "bg-violet-600" : "bg-slate-700"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.autoSendEmail ? "left-6" : "left-0.5"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Autonomy</p>
                <p className="text-xs text-muted">Off = agents stop running on schedule (manual triggers only)</p>
              </div>
              <button
                onClick={() => saveSettings({ autonomyEnabled: !settings.autonomyEnabled })}
                className={`w-12 h-6 rounded-full transition relative ${settings.autonomyEnabled ? "bg-violet-600" : "bg-slate-700"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${settings.autonomyEnabled ? "left-6" : "left-0.5"}`}
                />
              </button>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Paused channels</p>
              <div className="flex gap-2 flex-wrap">
                {["INSTAGRAM", "LINKEDIN", "EMAIL", "WEBSITE"].map((ch) => {
                  const paused = settings.pausedChannels?.includes(ch)
                  return (
                    <button
                      key={ch}
                      onClick={() =>
                        saveSettings({
                          pausedChannels: paused
                            ? settings.pausedChannels.filter((c: string) => c !== ch)
                            : [...(settings.pausedChannels || []), ch],
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        paused ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-slate-800/40 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {ch} {paused ? "· PAUSED" : ""}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-slate-800">
            <h3 className="font-bold mb-2">Token budget today</h3>
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-pink-500"
                style={{ width: `${Math.min(100, ((settings.tokensUsedToday || 0) / (settings.maxTokensPerDay || 1)) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-2">
              {(settings.tokensUsedToday || 0).toLocaleString()} / {(settings.maxTokensPerDay || 0).toLocaleString()} tokens
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
