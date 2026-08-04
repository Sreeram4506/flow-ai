"use client"

import React, { useEffect, useState } from "react"
import { api } from "../../../services/api"
import { useAuth } from "../../../context/AuthContext"
import { useSocket } from "../../../context/SocketContext"
import { 
  CheckSquare, Plus, Clock, Play, Pause, ChevronRight, X, Sparkles, MessageSquare, ListTodo, Paperclip, Loader
} from "lucide-react"
import { formatDate } from "../../../lib/utils"
import { TaskStatus, TaskPriority } from "@/lib/enums"

export default function TasksPage() {
  const { currentOrg, user } = useAuth()
  const { socket } = useSocket()
  
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTimer, setActiveTimer] = useState<any>(null)
  const [timerTime, setTimerTime] = useState(0)

  // Drawer details
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [newChecklist, setNewChecklist] = useState("")

  // Create Task Form State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskPriority, setTaskPriority] = useState("MEDIUM")
  const [taskStatus, setTaskStatus] = useState("TODO")
  const [dueDate, setDueDate] = useState("")

  const fetchProjects = async () => {
    try {
      const res: any = await api.get("/api/projects")
      setProjects(res.data || [])
      if (res.data?.length > 0) {
        setSelectedProjectId(res.data[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchTasks = async () => {
    if (!currentOrg || !selectedProjectId) return
    setLoading(true)
    try {
      const res: any = await api.get(`/api/tasks?projectId=${selectedProjectId}`)
      setTasks(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchRunningTimer = async () => {
    try {
      const res: any = await api.get("/api/time-tracking/running")
      if (res.data) {
        setActiveTimer(res.data)
        const diff = Math.floor((new Date().getTime() - new Date(res.data.startTime).getTime()) / 1000)
        setTimerTime(diff > 0 ? diff : 0)
      } else {
        setActiveTimer(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchProjects()
    fetchRunningTimer()
  }, [currentOrg])

  useEffect(() => {
    fetchTasks()
  }, [selectedProjectId])

  // Live timer interval loop
  useEffect(() => {
    let interval: any
    if (activeTimer) {
      interval = setInterval(() => {
        setTimerTime((t) => t + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [activeTimer])

  // WebSocket Live Board Cards Listener
  useEffect(() => {
    if (!socket || !selectedProjectId) return

    socket.emit("join-project", { projectId: selectedProjectId })

    socket.on("task-update", () => {
      fetchTasks()
    })

    return () => {
      socket.off("task-update")
    }
  }, [socket, selectedProjectId])

  const handleStartTimer = async (taskId: string) => {
    try {
      const res: any = await api.post("/api/time-tracking/start", { taskId, projectId: selectedProjectId })
      setActiveTimer(res.data)
      setTimerTime(0)
    } catch (e) {
      console.error(e)
    }
  }

  const handleStopTimer = async () => {
    if (!activeTimer) return
    try {
      await api.post("/api/time-tracking/stop", { entryId: activeTimer.id })
      setActiveTimer(null)
      setTimerTime(0)
      fetchTasks()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/tasks", {
        title: taskTitle,
        description: taskDescription,
        projectId: selectedProjectId,
        priority: taskPriority,
        status: taskStatus,
        dueDate: dueDate || undefined,
      })
      setShowCreateModal(false)
      setTaskTitle("")
      setTaskDescription("")
      setDueDate("")
      fetchTasks()
    } catch (e) {
      console.error(e)
    }
  }

  const handleOpenDrawer = async (task: any) => {
    try {
      const detailsRes: any = await api.get(`/api/tasks/${task.id}`)
      setSelectedTask(detailsRes.data)
      setShowDrawer(true)
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    try {
      await api.post(`/api/tasks/${selectedTask.id}/comments`, { content: newComment })
      setNewComment("")
      // Reload drawer details
      const detailsRes: any = await api.get(`/api/tasks/${selectedTask.id}`)
      setSelectedTask(detailsRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChecklist.trim()) return
    try {
      await api.post(`/api/tasks/${selectedTask.id}/checklist`, { title: newChecklist })
      setNewChecklist("")
      const detailsRes: any = await api.get(`/api/tasks/${selectedTask.id}`)
      setSelectedTask(detailsRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleToggleChecklist = async (itemId: string) => {
    try {
      await api.patch(`/api/tasks/${selectedTask.id}/checklist/${itemId}/toggle`)
      const detailsRes: any = await api.get(`/api/tasks/${selectedTask.id}`)
      setSelectedTask(detailsRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await api.patch(`/api/tasks/${taskId}`, { status })
      fetchTasks()
    } catch (e) {
      console.error(e)
    }
  }

  // ---- Drag & drop between columns ----
  // Uses the native HTML5 drag events rather than pulling in a DnD library:
  // no new dependency, and the board only needs card-to-column moves.
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingTaskId(taskId)
    e.dataTransfer.effectAllowed = "move"
    // Required for Firefox to initiate a drag at all.
    e.dataTransfer.setData("text/plain", taskId)
  }

  const handleDragEnd = () => {
    setDraggingTaskId(null)
    setDragOverStatus(null)
  }

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    // Without preventDefault the browser refuses the drop outright.
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragOverStatus !== status) setDragOverStatus(status)
  }

  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault()
    const taskId = draggingTaskId || e.dataTransfer.getData("text/plain")
    setDraggingTaskId(null)
    setDragOverStatus(null)
    if (!taskId) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === status) return

    // Optimistic: the card moves the instant it's dropped. Snapping back only
    // on failure feels far better than a spinner on every drag.
    const previous = tasks
    setTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, status } : t)),
    )

    try {
      await api.patch(`/api/tasks/${taskId}`, { status })
    } catch {
      setTasks(previous) // error toast already raised by the interceptor
    }
  }

  const formatSeconds = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const statuses = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.DONE]

  return (
    <div className="space-y-8 relative">
      {/* Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Tasks Board</h1>
          <p className="text-sm text-muted mt-1">Scope work items, checklists, and billable hour logs.</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:outline-none focus:border-violet-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-md"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Floating live active timer tracker bar */}
      {activeTimer && (
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3 text-xs font-bold">
            <Clock className="h-4 w-4" />
            <span>Active Timer Counter: {formatSeconds(timerTime)}</span>
            <span className="opacity-80">({activeTimer.task?.title || "Project task"})</span>
          </div>
          <button 
            onClick={handleStopTimer}
            className="px-4 py-1.5 bg-white text-violet-600 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors"
          >
            Stop & Save
          </button>
        </div>
      )}

      {/* Board Layout Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statuses.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status)
          const isDropTarget = dragOverStatus === status
          return (
            <div
              key={status}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
              onDrop={(e) => handleDrop(e, status)}
              className={`flex flex-col border p-4 rounded-2xl h-fit transition-colors ${
                isDropTarget
                  ? "bg-violet-500/10 border-violet-500/40"
                  : "bg-slate-950/20 border-border/40"
              }`}
            >
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/30">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{status}</span>
                <span className="text-[10px] bg-slate-900 border border-border px-1.5 py-0.5 rounded text-muted font-bold">
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="space-y-3 min-h-[300px]">
                {colTasks.length === 0 && (
                  <div
                    className={`h-24 rounded-xl border border-dashed flex items-center justify-center text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      isDropTarget
                        ? "border-violet-500/50 text-violet-400"
                        : "border-border/40 text-slate-600"
                    }`}
                  >
                    {isDropTarget ? "Release to move here" : "Drop tasks here"}
                  </div>
                )}
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleOpenDrawer(task)}
                    title="Drag to change status, or click to open"
                    className={`bg-card border border-border/60 hover:border-violet-500/20 p-4 rounded-xl shadow-premium cursor-grab active:cursor-grabbing transition-all hover:translate-y-[-2px] relative group ${
                      draggingTaskId === task.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h4 className="text-xs font-bold leading-snug text-slate-100 group-hover:text-violet-400 transition-colors line-clamp-2">
                        {task.title}
                      </h4>
                      <span className="text-[9px] bg-slate-900 border border-border px-1.5 py-0.5 rounded text-muted font-bold uppercase shrink-0">
                        {task.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                      <span className="text-[10px] text-muted">{formatDate(task.dueDate)}</span>
                      
                      {/* Live timer play buttons */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {activeTimer?.taskId === task.id ? (
                          <button 
                            onClick={handleStopTimer}
                            className="p-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500/20 transition-colors"
                          >
                            <Pause className="h-3 w-3" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleStartTimer(task.id)}
                            className="p-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Drawer Details */}
      {showDrawer && selectedTask && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card border-l border-border z-40 shadow-2xl flex flex-col justify-between">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">{selectedTask.project?.name}</span>
              <button 
                onClick={() => setShowDrawer(false)}
                className="p-1 hover:bg-muted-bg rounded-lg text-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Task Title & Status */}
            <div>
              <h2 className="text-xl font-bold text-slate-100 font-heading">{selectedTask.title}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <select
                  value={selectedTask.status}
                  onChange={(e) => handleStatusChange(selectedTask.id, e.target.value as TaskStatus)}
                  className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="text-[10px] bg-slate-900 border border-border px-2 py-0.5 rounded text-muted font-bold uppercase">
                  {selectedTask.priority} Priority
                </span>
                {selectedTask.dueDate && (
                  <span className="text-[10px] text-muted">Due: {formatDate(selectedTask.dueDate)}</span>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase mb-2">Description</h3>
              <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/20 border border-border/40 p-3 rounded-xl">
                {selectedTask.description || "No description provided."}
              </p>
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase mb-2">
                <ListTodo className="h-3.5 w-3.5 text-violet-400" />
                <span>Checklist</span>
              </div>
              <div className="space-y-2 mb-3">
                {selectedTask.checklists?.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={() => handleToggleChecklist(item.id)}
                      className="rounded border-slate-800 bg-slate-900 text-violet-500 focus:ring-violet-500/20"
                    />
                    <span className={item.isCompleted ? "line-through opacity-50" : ""}>{item.title}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddChecklist} className="flex gap-2">
                <input
                  type="text"
                  value={newChecklist}
                  onChange={(e) => setNewChecklist(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  placeholder="New item..."
                />
                <button type="submit" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold">
                  Add
                </button>
              </form>
            </div>

            {/* Comments Section */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase mb-3">
                <MessageSquare className="h-3.5 w-3.5 text-violet-400" />
                <span>Discussion ({selectedTask.comments?.length || 0})</span>
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  placeholder="Add to discussion..."
                />
                <button type="submit" className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold">
                  Send
                </button>
              </form>

              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {selectedTask.comments?.map((comment: any) => (
                  <div key={comment.id} className="bg-slate-950/20 border border-border/30 p-2.5 rounded-xl text-left">
                    <div className="flex justify-between items-center text-[10px] text-muted">
                      <span className="font-bold text-slate-300">
                        {comment.user?.firstName} {comment.user?.lastName}
                      </span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{comment.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-card border border-border p-6 rounded-2xl shadow-2xl">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="Write documentation..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-20"
                  placeholder="Describe the tasks scope..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Status</label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
