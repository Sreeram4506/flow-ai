"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { UserCheck, Plus, CheckCircle, Clock, ShieldAlert, LogOut, ArrowRight, User } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { AttendanceStatus } from "@/lib/enums"

export default function HrPage() {
  const { currentOrg, user } = useAuth()
  const [employees, setEmployees] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Attendance state
  const [checkedInToday, setCheckedInToday] = useState(false)
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null)

  // Leave Form State
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaveType, setLeaveType] = useState("CASUAL")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [totalDays, setTotalDays] = useState("")
  const [reason, setReason] = useState("")
  const [leavesList, setLeavesList] = useState<any[]>([])

  const fetchHRData = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const empRes: any = await api.get("/api/hr/employees")
      setEmployees(empRes.data || [])

      const attRes: any = await api.get("/api/hr/attendance")
      setAttendance(Array.isArray(attRes) ? attRes : [])

      // Check if already checked in today
      const todayStr = new Date().toISOString().split("T")[0]
      const todayAtt = Array.isArray(attRes) ? attRes.find((a: any) => a.date && a.date.startsWith(todayStr)) : null
      if (todayAtt) {
        setCheckedInToday(true)
        setCheckInTime(todayAtt.checkIn)
        setCheckOutTime(todayAtt.checkOut)
      } else {
        setCheckedInToday(false)
        setCheckInTime(null)
        setCheckOutTime(null)
      }

      const leaveRes: any = await api.get("/api/hr/leaves")
      setLeavesList(leaveRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHRData()
  }, [currentOrg])

  const handleCheckIn = async () => {
    try {
      const res: any = await api.post("/api/hr/attendance/check-in", {})
      setCheckedInToday(true)
      setCheckInTime(res.checkIn)
      fetchHRData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCheckOut = async () => {
    try {
      const res: any = await api.post("/api/hr/attendance/check-out", {})
      setCheckOutTime(res.checkOut)
      fetchHRData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/hr/leaves", {
        type: leaveType,
        startDate,
        endDate,
        totalDays: parseFloat(totalDays),
        reason,
      })
      setShowLeaveModal(false)
      setStartDate("")
      setEndDate("")
      setTotalDays("")
      setReason("")
      fetchHRData()
    } catch (e) {
      console.error(e)
    }
  }

  const handleApproveLeave = async (id: string) => {
    try {
      await api.post(`/api/hr/leaves/${id}/approve`, {})
      fetchHRData()
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
      {/* Header banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">HR & Operations</h1>
          <p className="text-sm text-muted mt-1">Manage staff, clock attendances, and coordinate leave requests.</p>
        </div>

        <button
          onClick={() => setShowLeaveModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>Apply Leave</span>
        </button>
      </div>

      {/* Attendance Clock & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Digital Punch Clock */}
        <div className="glass p-6 rounded-2xl border border-border/60 flex flex-col justify-between h-48">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Time Card Attendance</h3>
            <span className="text-[10px] text-muted block mt-1">PUNCH IN/OUT FOR THE CURRENT DATE</span>
          </div>

          <div className="flex items-center gap-4">
            {!checkedInToday ? (
              <button
                onClick={handleCheckIn}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-colors"
              >
                <Clock className="h-4 w-4" />
                <span>Clock In</span>
              </button>
            ) : !checkOutTime ? (
              <button
                onClick={handleCheckOut}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-colors animate-pulse"
              >
                <LogOut className="h-4 w-4" />
                <span>Clock Out</span>
              </button>
            ) : (
              <div className="w-full text-center py-2.5 bg-slate-900 border border-border text-emerald-400 rounded-xl font-bold text-xs">
                Already Clocked Out Today
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-[10px] text-muted font-semibold uppercase">
            <span>In: {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
            <span>Out: {checkOutTime ? new Date(checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
          </div>
        </div>

        {/* Attendance logs list */}
        <div className="md:col-span-2 glass p-6 rounded-2xl border border-border/60 h-48 flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">Recent Clocks</h3>
          <div className="flex-1 overflow-y-auto divide-y divide-border/30 pr-1">
            {attendance.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted">No attendance logs logged yet.</div>
            ) : (
              attendance.map((att) => (
                <div key={att.id} className="py-2 flex items-center justify-between first:pt-0 last:pb-0">
                  <span className="text-xs text-slate-200">{formatDate(att.date)}</span>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="text-muted">In: {att.checkIn ? new Date(att.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}</span>
                    <span className="text-muted">Hours: {att.totalHours || "0"} h</span>
                    <span className="bg-slate-900 border border-border px-1.5 py-0.5 rounded text-[10px] text-slate-400 uppercase font-bold">
                      {att.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Directory & Leaves Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Employees directory */}
        <div className="lg:col-span-1 glass p-6 rounded-2xl border border-border/60">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">Staff Directory</h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
            {employees.length === 0 ? (
              <p className="text-xs text-muted">No staff listings registered.</p>
            ) : (
              employees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-900 border border-border flex items-center justify-center text-xs font-bold text-slate-300 uppercase">
                    {emp.user?.firstName?.[0] || "?"}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      {emp.user?.firstName} {emp.user?.lastName}
                    </h4>
                    <span className="text-[10px] text-muted block mt-0.5">{emp.designation || "Employee"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Leave Requests dashboard */}
        <div className="lg:col-span-2 glass p-6 rounded-2xl border border-border/60 flex flex-col h-[360px]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">Leave Requests Board</h3>
          <div className="flex-1 overflow-y-auto divide-y divide-border/30 pr-1">
            {leavesList.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted">No leave requests pending.</div>
            ) : (
              leavesList.map((leave) => (
                <div key={leave.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">
                      {leave.user?.firstName} {leave.user?.lastName}
                    </h4>
                    <span className="text-[10px] text-muted mt-0.5 block font-semibold uppercase">
                      {leave.type} ({leave.totalDays} days) - "{leave.reason}"
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="bg-slate-900 border border-border px-2 py-0.5 rounded text-[10px] text-slate-400 font-bold uppercase">
                      {leave.status}
                    </span>
                    {leave.status === "PENDING" && (
                      <button
                        onClick={() => handleApproveLeave(leave.id)}
                        className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Apply for Leave</h3>
            <form onSubmit={handleSubmitLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                >
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="VACATION">Vacation</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Total Days</label>
                <input
                  type="number"
                  required
                  step={0.5}
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Reason for request</label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-20"
                  placeholder="Family commitment..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
