"use client"

// Client detail / CRM record view.
//
// GET /api/clients/:id already returned contacts, projects, invoices,
// payments and quotations in one call, and /stats returned financial
// aggregates — but with no [id] route in the frontend, none of that history
// was viewable. Client rows weren't even clickable.

import React, { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Building2, Mail, Phone, Globe, MapPin,
  Plus, Trash2, FileText, Receipt, FolderKanban, UserRound,
} from "lucide-react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { currentOrg } = useAuth()

  const [client, setClient] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [showContactForm, setShowContactForm] = useState(false)
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [savingContact, setSavingContact] = useState(false)

  const load = useCallback(async () => {
    if (!id || !currentOrg) return
    setLoading(true)
    try {
      const [clientRes, statsRes] = await Promise.allSettled([
        api.get(`/api/clients/${id}`),
        api.get(`/api/clients/${id}/stats`),
      ])

      if (clientRes.status === "fulfilled") {
        setClient((clientRes.value as any).data ?? clientRes.value)
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

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactName.trim()) return
    setSavingContact(true)
    try {
      await api.post(`/api/clients/${id}/contacts`, {
        name: contactName.trim(),
        email: contactEmail.trim() || undefined,
        phone: contactPhone.trim() || undefined,
      })
      setContactName("")
      setContactEmail("")
      setContactPhone("")
      setShowContactForm(false)
      load()
    } catch {
      /* toast handled globally */
    } finally {
      setSavingContact(false)
    }
  }

  const handleRemoveContact = async (contactId: string) => {
    if (!confirm("Remove this contact?")) return
    try {
      await api.delete(`/api/clients/${id}/contacts/${contactId}`)
      load()
    } catch {
      /* toast handled globally */
    }
  }

  const handleArchive = async () => {
    if (!confirm("Archive this client?")) return
    try {
      await api.delete(`/api/clients/${id}`)
      router.push("/crm/clients")
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

  if (notFound || !client) {
    return (
      <div className="glass p-12 text-center rounded-2xl border border-border">
        <Building2 className="h-10 w-10 mx-auto mb-3 text-slate-500" />
        <h3 className="font-bold text-foreground">Client not found</h3>
        <p className="text-xs text-muted mt-1">
          It may have been archived, or belong to a different organization.
        </p>
        <Link href="/crm/clients" className="inline-block mt-4 text-xs text-violet-400 hover:underline">
          Back to clients
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/crm/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All clients
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight font-heading truncate">
              {client.companyName}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted">
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-slate-200 transition-colors">
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </a>
              )}
              {client.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {client.phone}
                </span>
              )}
              {client.website && (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
              {(client.city || client.country) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {[client.city, client.country].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleArchive}
            className="shrink-0 px-3 py-2 border border-border hover:border-red-500/40 hover:text-red-400 rounded-xl text-xs font-semibold text-muted transition-colors"
          >
            Archive
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Field names mirror ClientsService.getClientStats() exactly. */}
          <StatCard label="Total Invoiced" value={formatCurrency(Number(stats.totalInvoiced ?? 0))} />
          <StatCard label="Total Paid" value={formatCurrency(Number(stats.totalPaid ?? 0))} />
          <StatCard label="Outstanding" value={formatCurrency(Number(stats.totalOutstanding ?? 0))} />
          <StatCard label="Projects" value={String(stats.projectCount ?? client.projects?.length ?? 0)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Projects */}
          <Panel title="Projects" icon={<FolderKanban className="h-4 w-4" />}>
            {(client.projects ?? []).length === 0 ? (
              <EmptyRow text="No projects for this client yet." />
            ) : (
              <div className="space-y-2">
                {client.projects.map((p: any) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between p-3 bg-slate-950/20 border border-border/40 rounded-xl hover:border-violet-500/30 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-violet-400 transition-colors truncate">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {p.status} · {p.progress ?? 0}% complete
                      </p>
                    </div>
                    <span className="text-xs text-slate-300 font-semibold shrink-0 ml-3">
                      {p.budget ? formatCurrency(parseFloat(p.budget)) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* Invoices */}
          <Panel title="Recent Invoices" icon={<Receipt className="h-4 w-4" />}>
            {(client.invoices ?? []).length === 0 ? (
              <EmptyRow text="No invoices raised yet." />
            ) : (
              <div className="space-y-2">
                {client.invoices.map((inv: any) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-3 bg-slate-950/20 border border-border/40 rounded-xl"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {inv.invoiceNumber}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {inv.status}
                        {inv.dueDate && ` · due ${formatDate(inv.dueDate)}`}
                      </p>
                    </div>
                    <span className="text-xs text-slate-300 font-semibold shrink-0 ml-3">
                      {formatCurrency(Number(inv.total ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Quotations */}
          <Panel title="Quotations" icon={<FileText className="h-4 w-4" />}>
            {(client.quotations ?? []).length === 0 ? (
              <EmptyRow text="No quotations sent yet." />
            ) : (
              <div className="space-y-2">
                {client.quotations.map((q: any) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 bg-slate-950/20 border border-border/40 rounded-xl"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {q.quotationNumber}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">{q.status}</p>
                    </div>
                    <span className="text-xs text-slate-300 font-semibold shrink-0 ml-3">
                      {formatCurrency(Number(q.total ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Contacts */}
        <div>
          <Panel
            title="Contacts"
            icon={<UserRound className="h-4 w-4" />}
            action={
              <button
                onClick={() => setShowContactForm((v) => !v)}
                className="text-muted hover:text-violet-400 transition-colors"
                aria-label="Add contact"
              >
                <Plus className="h-4 w-4" />
              </button>
            }
          >
            {showContactForm && (
              <form onSubmit={handleAddContact} className="space-y-2 mb-4 pb-4 border-b border-border/40">
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-xs"
                />
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-xs"
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-xs"
                />
                <button
                  type="submit"
                  disabled={savingContact || !contactName.trim()}
                  className="w-full px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  {savingContact ? "Saving..." : "Add Contact"}
                </button>
              </form>
            )}

            {(client.contacts ?? []).length === 0 ? (
              <EmptyRow text="No contacts recorded." />
            ) : (
              <div className="space-y-2">
                {client.contacts.map((c: any) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 group">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {c.name}
                        {c.isPrimary && (
                          <span className="ml-1.5 text-[9px] uppercase bg-brand-600/20 text-brand-400 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                      </p>
                      {c.email && <p className="text-[10px] text-muted truncate">{c.email}</p>}
                      {c.phone && <p className="text-[10px] text-muted truncate">{c.phone}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveContact(c.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all mt-0.5"
                      aria-label="Remove contact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="glass p-6 rounded-2xl border border-border/60">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass p-4 rounded-2xl border border-border/60">
      <p className="text-muted text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <p className="text-xl font-extrabold text-slate-100 mt-2">{value}</p>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-xs text-muted py-3 text-center">{text}</p>
}
