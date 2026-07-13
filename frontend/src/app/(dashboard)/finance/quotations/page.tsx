"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { FileCheck, Plus, FileSpreadsheet, Briefcase, Check, X, ArrowRight, Loader } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { QuotationStatus } from "@prisma/client"

export default function QuotationsPage() {
  const { currentOrg, user } = useAuth()
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [selectedClientId, setSelectedClientId] = useState("")
  const [items, setItems] = useState<any[]>([{ description: "", quantity: 1, unitPrice: 0 }])
  const [taxRate, setTaxRate] = useState("10")
  const [discountRate, setDiscountRate] = useState("0")
  const [isSuggestingPrice, setIsSuggestingPrice] = useState(false)

  const fetchQuotations = async () => {
    if (!currentOrg) return
    try {
      const res: any = await api.get("/api/quotations")
      setQuotations(res.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  const fetchClients = async () => {
    try {
      const res: any = await api.get("/api/clients")
      setClients(res.data || [])
      if (res.data?.length > 0) {
        setSelectedClientId(res.data[0].id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      await Promise.all([fetchQuotations(), fetchClients()])
      setLoading(false)
    }
    initData()
  }, [currentOrg])

  const handleUpdateStatus = async (id: string, status: QuotationStatus) => {
    setActionLoading(id)
    try {
      await api.patch(`/api/quotations/${id}`, { status })
      await fetchQuotations()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const handleConvertToInvoice = async (id: string) => {
    setActionLoading(id)
    try {
      await api.post(`/api/quotations/${id}/convert-to-invoice`)
      alert("Quotation converted to Invoice successfully!")
      await fetchQuotations()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/quotations", {
        clientId: selectedClientId,
        taxRate: parseFloat(taxRate),
        discountRate: parseFloat(discountRate),
        items: items.map(i => ({
          description: i.description,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
        }))
      })
      setShowCreateModal(false)
      setItems([{ description: "", quantity: 1, unitPrice: 0 }])
      fetchQuotations()
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  const handleSuggestPrice = async () => {
    const description = items.map(i => i.description).filter(d => d.trim() !== "").join(", ")
    if (!description) {
      alert("Please enter item descriptions first so AI has context.")
      return
    }

    setIsSuggestingPrice(true)
    try {
      const res: any = await api.post("/api/ai/suggest-pricing", { description })
      if (res.suggestedPrice) {
        // Apply the suggested price to the first item for simplicity, or divide evenly
        const updated = [...items]
        updated[0].unitPrice = res.suggestedPrice
        setItems(updated)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSuggestingPrice(false)
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
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Quotations</h1>
          <p className="text-sm text-muted mt-1">Design bids, send quotations, and convert them to project/invoice sheets.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Quotation</span>
        </button>
      </div>

      {/* List */}
      <div className="glass rounded-2xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-border/40 text-muted uppercase tracking-wider font-bold">
                <th className="p-4">Quotation #</th>
                <th className="p-4">Client</th>
                <th className="p-4">Total</th>
                <th className="p-4">Expires</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {quotations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No quotations generated. Start by bidding a new project scope.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-muted-bg/35 transition-colors">
                    <td className="p-4 font-bold text-slate-200">{q.quotationNumber}</td>
                    <td className="p-4 font-semibold">{q.client?.companyName || "N/A"}</td>
                    <td className="p-4 font-bold text-emerald-400">{formatCurrency(parseFloat(q.total))}</td>
                    <td className="p-4 text-muted">{formatDate(q.validUntil)}</td>
                    <td className="p-4">
                      <span className="bg-slate-900 border border-border px-2 py-0.5 rounded text-[10px] text-slate-300 font-bold uppercase">
                        {q.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      {actionLoading === q.id ? (
                        <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-violet-500"></span>
                      ) : (
                        <>
                          {q.status === QuotationStatus.SENT && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(q.id, QuotationStatus.APPROVED)}
                                className="p-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20"
                                title="Approve"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(q.id, QuotationStatus.REJECTED)}
                                className="p-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500/20"
                                title="Reject"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {q.status === QuotationStatus.APPROVED && (
                            <button
                              onClick={() => handleConvertToInvoice(q.id)}
                              className="px-2.5 py-1 bg-brand-600/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/25 rounded-lg font-semibold text-[10px] inline-flex items-center gap-1"
                            >
                              <span>Convert to Invoice</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-card border border-border p-6 rounded-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Quotation</h3>
            <form onSubmit={handleCreateQuotation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Select Client</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.companyName}</option>
                  ))}
                </select>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase text-slate-400">Line Items</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSuggestPrice}
                      disabled={isSuggestingPrice}
                      className="text-[10px] bg-brand-600/10 hover:bg-brand-600/20 text-brand-400 px-2 py-1 rounded font-bold uppercase tracking-wide flex items-center gap-1 transition-colors"
                    >
                      {isSuggestingPrice ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-500"></div>
                      ) : (
                        <span className="flex items-center gap-1">✨ AI Suggest Price</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-xs text-violet-400 hover:underline"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-6 gap-2">
                      <input
                        type="text"
                        required
                        value={item.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        className="col-span-3 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        placeholder="Item details..."
                      />
                      <input
                        type="number"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                        className="col-span-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500 text-center"
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        required
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                        className="col-span-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-500 focus:outline-none focus:border-violet-500"
                        placeholder="Price ($)"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Discount Rate (%)</label>
                  <input
                    type="number"
                    value={discountRate}
                    onChange={(e) => setDiscountRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
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
                  Save Quotation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
