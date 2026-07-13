"use client"

import React, { useEffect, useState, useRef } from "react"
import { Search, Sparkles, FolderKanban, CheckSquare, Building2, FileSpreadsheet } from "lucide-react"
import { api } from "@/services/api"
import { useRouter } from "next/navigation"

export default function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  // Trigger search on query change (debounce)
  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true)
      try {
        const res: any = await api.get(`/api/search?q=${query}`)
        setResults(res.data)
      } catch (err) {
        console.error("Search failed:", err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [query])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  if (!isOpen) return null

  const handleNavigate = (path: string) => {
    router.push(path)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4">
      <div 
        className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[500px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 border-b border-border py-3">
          <Search className="h-5 w-5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-foreground placeholder-slate-500 focus:outline-none text-sm"
            placeholder="Type search terms or actions (e.g. 'design', 'invoice')..."
          />
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-500"></div>
          )}
          <span className="text-[10px] bg-muted-bg px-2 py-1 rounded text-muted font-bold">ESC</span>
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!results && !query ? (
            <div className="text-center py-8 text-muted text-xs">
              <Sparkles className="h-5 w-5 mx-auto mb-2 text-violet-500" />
              <span>Search across projects, tasks, clients, and billing documents.</span>
            </div>
          ) : null}

          {results ? (
            <>
              {results.projects?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Projects</h3>
                  <div className="space-y-1">
                    {results.projects.map((proj: any) => (
                      <button
                        key={proj.id}
                        onClick={() => handleNavigate(`/projects/${proj.id}`)}
                        className="w-full flex items-center justify-between p-2 hover:bg-muted-bg rounded-xl transition-colors text-left text-sm"
                      >
                        <span className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-violet-400" />{proj.name}</span>
                        <span className="text-xs text-muted uppercase">{proj.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.tasks?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Tasks</h3>
                  <div className="space-y-1">
                    {results.tasks.map((task: any) => (
                      <button
                        key={task.id}
                        onClick={() => handleNavigate(`/tasks?id=${task.id}`)}
                        className="w-full flex items-center justify-between p-2 hover:bg-muted-bg rounded-xl transition-colors text-left text-sm"
                      >
                        <span className="flex items-center gap-2"><CheckSquare className="h-4 w-4 text-emerald-400" />{task.title}</span>
                        <span className="text-xs text-muted uppercase">{task.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.clients?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Clients</h3>
                  <div className="space-y-1">
                    {results.clients.map((client: any) => (
                      <button
                        key={client.id}
                        onClick={() => handleNavigate(`/crm/clients/${client.id}`)}
                        className="w-full flex items-center p-2 hover:bg-muted-bg rounded-xl transition-colors text-left text-sm gap-2"
                      >
                        <Building2 className="h-4 w-4 text-sky-400" />
                        <span>{client.companyName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.invoices?.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Invoices</h3>
                  <div className="space-y-1">
                    {results.invoices.map((inv: any) => (
                      <button
                        key={inv.id}
                        onClick={() => handleNavigate(`/finance/invoices/${inv.id}`)}
                        className="w-full flex items-center justify-between p-2 hover:bg-muted-bg rounded-xl transition-colors text-left text-sm"
                      >
                        <span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-amber-400" />{inv.invoiceNumber}</span>
                        <span className="text-xs text-muted font-semibold">${inv.total}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {Object.values(results).every((arr: any) => arr.length === 0) && (
                <div className="text-center py-8 text-muted text-xs">No matching results found.</div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
