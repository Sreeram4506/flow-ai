"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  Clock, 
  Sparkles, 
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function DashboardPage() {
  const { currentOrg } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentOrg) return
    const fetchDashboardData = async () => {
      try {
        const statsRes: any = await api.get("/api/analytics/dashboard")
        setStats(statsRes.data)

        const chartRes: any = await api.get("/api/analytics/revenue?months=6")
        setChartData(chartRes.data || [])
      } catch (err) {
        console.error("Dashboard fetching failed:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [currentOrg])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    )
  }

  const parseChange = (change: string) => ({
    value: change || "Flat",
    isPositive: change?.startsWith("+") || change === "Flat",
    isNegative: change?.startsWith("-")
  })

  const revTrend = parseChange(stats?.revenueChange)
  const expTrend = parseChange(stats?.expensesChange)
  const profTrend = parseChange(stats?.profitChange)

  const statCards = [
    { label: "Total Revenue", value: formatCurrency(stats?.revenue || 0), change: revTrend.value, isPositive: revTrend.isPositive, icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/5" },
    { label: "Total Expenses", value: formatCurrency(stats?.expenses || 0), change: expTrend.value, isPositive: expTrend.isNegative, icon: TrendingDown, color: "text-rose-500 bg-rose-500/5" }, // Decrease in expenses is good
    { label: "Operating Profit", value: formatCurrency(stats?.profit || 0), change: profTrend.value, isPositive: profTrend.isPositive, icon: Sparkles, color: "text-violet-500 bg-violet-500/5" },
    { label: "Active Projects", value: stats?.activeProjects || 0, change: "Flat", isPositive: true, icon: Briefcase, color: "text-sky-500 bg-sky-500/5" },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight font-heading">Executive Dashboard</h1>
        <p className="text-sm text-muted mt-1">Real-time business indicators and operations overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className="glass p-6 rounded-2xl shadow-premium border border-border/60 hover:border-violet-500/30 transition-all group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">{card.label}</span>
                <div className={`p-2 rounded-xl ${card.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2.5">
                <span className="text-2xl font-bold tracking-tight">{card.value}</span>
                <span className={`text-xs font-bold flex items-center gap-0.5 ${card.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {card.change}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Analytical Plots & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Performance Chart */}
        <div className="lg:col-span-2 glass p-6 rounded-2xl border border-border/60 flex flex-col h-[350px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground uppercase">Revenue Tracking</h3>
              <p className="text-[11px] text-muted">Monthly performance history</p>
            </div>
            <span className="text-xs bg-muted-bg px-2.5 py-1 rounded-xl text-muted font-semibold flex items-center gap-1">
              6 Months <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
          
          {/* Custom SVG Bar Chart */}
          <div className="flex-1 flex items-end justify-between gap-4 px-2">
            {chartData.length === 0 ? (
              <div className="w-full text-center text-xs text-muted mb-12">No billing entries present.</div>
            ) : (
              chartData.map((data, idx) => {
                const maxVal = Math.max(...chartData.map(d => d.amount), 1)
                const pct = (data.amount / maxVal) * 100
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full relative bg-slate-900 rounded-t-lg overflow-hidden h-40">
                      <div 
                        style={{ height: `${pct}%` }}
                        className="absolute bottom-0 left-0 right-0 bg-brand-gradient group-hover:brightness-110 transition-all rounded-t-lg"
                      />
                      {/* Hover details badge */}
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-card border border-border text-[9px] font-bold px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity">
                        ${data.amount}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted font-semibold uppercase">{data.month.split('-')[1]}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* AI Insight Box */}
        <div className="glass p-6 rounded-2xl border border-border/60 bg-gradient-to-br from-violet-600/5 to-indigo-600/5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-600/10 rounded-full blur-2xl"></div>
          <div>
            <div className="flex items-center gap-2 text-violet-400 font-bold text-xs uppercase tracking-wider mb-4">
              <Sparkles className="h-4 w-4" />
              <span>AI Operations Insight</span>
            </div>
            <h3 className="text-lg font-bold text-slate-100 leading-snug">
              {stats?.aiInsight?.title || "Project Delays & Utilization Outlook"}
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {stats?.aiInsight?.message || "All operations are running smoothly. Your billing utilization is optimal."}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-between text-xs">
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> {stats?.aiInsight?.confidence || "High Confidence"}
            </span>
            <button className="text-violet-400 font-semibold hover:underline">Resolve Action</button>
          </div>
        </div>
      </div>

      {/* Bottom Layout: Active Projects & Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Projects progress */}
        <div className="glass p-6 rounded-2xl border border-border/60">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Active Projects Progress</h3>
          <div className="space-y-4">
            {stats?.recentProjects?.length === 0 ? (
              <p className="text-xs text-muted">No active projects found.</p>
            ) : (
              stats?.recentProjects?.map((proj: any) => (
                <div key={proj.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span>{proj.name}</span>
                    <span className="text-muted">{proj.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${proj.progress}%` }} 
                      className="bg-brand-500 h-full rounded-full transition-all"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div className="glass p-6 rounded-2xl border border-border/60">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Upcoming Deadlines</h3>
          <div className="divide-y divide-border/40">
            {stats?.upcomingDeadlines?.length === 0 ? (
              <p className="text-xs text-muted py-2">No active deadlines for the next 7 days.</p>
            ) : (
              stats?.upcomingDeadlines?.map((task: any) => (
                <div key={task.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div>
                    <h4 className="text-xs font-bold">{task.title}</h4>
                    <span className="text-[10px] text-muted uppercase tracking-wider">{task.priority} Priority</span>
                  </div>
                  <span className="text-xs bg-slate-900 border border-border px-2.5 py-1 rounded-xl text-rose-400 font-semibold">
                    {formatDate(task.dueDate)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
