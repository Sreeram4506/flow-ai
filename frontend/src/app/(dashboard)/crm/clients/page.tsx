"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { Building2, Plus, Mail, Phone, Globe, DollarSign, Briefcase } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export default function ClientsPage() {
  const { currentOrg } = useAuth()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Form State
  const [companyName, setCompanyName] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [website, setWebsite] = useState("")
  const [address, setAddress] = useState("")
  const [taxId, setTaxId] = useState("")

  const fetchClients = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res: any = await api.get("/api/clients")
      setClients(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [currentOrg])

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/clients", {
        companyName,
        contactPerson,
        email,
        phone,
        website,
        address,
        taxId,
      })
      setShowModal(false)
      setCompanyName("")
      setContactPerson("")
      setEmail("")
      setPhone("")
      setWebsite("")
      setAddress("")
      setTaxId("")
      fetchClients()
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
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">CRM - Clients</h1>
          <p className="text-sm text-muted mt-1">Manage client records, billing details, and contract history.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Client</span>
        </button>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.length === 0 ? (
          <div className="col-span-full glass p-12 text-center text-muted rounded-2xl border border-border">
            <Building2 className="h-10 w-10 mx-auto mb-3 text-slate-500" />
            <h3 className="font-bold text-foreground">No Clients</h3>
            <p className="text-xs text-muted mt-1">Register a client to link quotations, projects, and invoices.</p>
          </div>
        ) : (
          clients.map((client) => (
            <Link
              href={`/crm/clients/${client.id}`}
              key={client.id}
              className="glass p-6 rounded-2xl border border-border/60 hover:border-violet-500/20 transition-all flex flex-col justify-between h-48 relative group"
            >
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-slate-100 group-hover:text-violet-400 transition-colors truncate max-w-[200px]">
                    {client.companyName}
                  </h3>
                  <span className="text-[10px] text-muted font-bold uppercase">{client.contactPerson}</span>
                </div>
                
                <div className="space-y-2 mt-4">
                  {client.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Mail className="h-3.5 w-3.5" />
                      <span>{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Connected counters */}
              <div className="flex items-center justify-between text-[10px] text-muted font-bold uppercase border-t border-border/40 pt-3">
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5 text-violet-400" />
                  <span>{client._count?.projects || 0} Projects</span>
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{client._count?.invoices || 0} Invoices</span>
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-card border border-border p-6 rounded-2xl shadow-2xl">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Client</h3>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="TechStart Inc..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
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
                    placeholder="contact@company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="+1 555-000-0000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Website</label>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="https://company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="123 Street Rd"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Tax ID</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="TX-999-00"
                  />
                </div>
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
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
