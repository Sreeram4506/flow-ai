"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { FileSpreadsheet, Plus, DollarSign, Clock, FileCheck, CheckCircle2, ChevronRight, X } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { InvoiceStatus, PaymentMethod } from "@prisma/client"

export default function InvoicesPage() {
  const { currentOrg } = useAuth()
  const [invoices, setInvoices] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Record Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER")
  const [transactionId, setTransactionId] = useState("")

  // Create Invoice Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [selectedClientId, setSelectedClientId] = useState("")
  const [items, setItems] = useState<any[]>([{ description: "", quantity: 1, unitPrice: 0 }])
  const [taxRate, setTaxRate] = useState("10")
  const [discountRate, setDiscountRate] = useState("0")

  const fetchInvoices = async () => {
    if (!currentOrg) return
    try {
      const res: any = await api.get("/api/invoices")
      setInvoices(res.data || [])
      
      const statsRes: any = await api.get("/api/invoices/stats")
      setStats(statsRes.data)
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
      await Promise.all([fetchInvoices(), fetchClients()])
      setLoading(false)
    }
    initData()
  }, [currentOrg])

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/payments", {
        invoiceId: selectedInvoice.id,
        clientId: selectedInvoice.clientId,
        amount: parseFloat(paymentAmount),
        method: paymentMethod,
        transactionId: transactionId || undefined,
      })
      setShowPaymentModal(false)
      setPaymentAmount("")
      setTransactionId("")
      fetchInvoices()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post("/api/invoices", {
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
      fetchInvoices()
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
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Invoices</h1>
          <p className="text-sm text-muted mt-1">Manage client billings, accounts receivables, and income tracking.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Invoice</span>
        </button>
      </div>

      {/* Invoice Stats Panels */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-muted font-bold uppercase block">Total Billing</span>
          <span className="text-xl font-bold mt-2 block">{formatCurrency(stats?.totalAmount || 0)}</span>
          <span className="text-[10px] text-muted block mt-1">{stats?.totalCount || 0} Invoices total</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-emerald-400 font-bold uppercase block">Amount Paid</span>
          <span className="text-xl font-bold mt-2 block text-emerald-400">{formatCurrency(stats?.paidAmount || 0)}</span>
          <span className="text-[10px] text-muted block mt-1">{stats?.paidCount || 0} Invoices paid</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-amber-400 font-bold uppercase block">Pending Collections</span>
          <span className="text-xl font-bold mt-2 block text-amber-400">{formatCurrency(stats?.pendingAmount || 0)}</span>
          <span className="text-[10px] text-muted block mt-1">{stats?.pendingCount || 0} Invoices pending</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-rose-400 font-bold uppercase block">Overdue Invoices</span>
          <span className="text-xl font-bold mt-2 block text-rose-400">{formatCurrency(stats?.overdueAmount || 0)}</span>
          <span className="text-[10px] text-muted block mt-1">{stats?.overdueCount || 0} Invoices overdue</span>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="glass rounded-2xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-border/40 text-muted uppercase tracking-wider font-bold">
                <th className="p-4">Invoice #</th>
                <th className="p-4">Client</th>
                <th className="p-4">Total</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No billing documents mapped. Start by generating a new invoice.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted-bg/35 transition-colors">
                    <td className="p-4 font-bold text-slate-200">{inv.invoiceNumber}</td>
                    <td className="p-4 font-semibold">{inv.client?.companyName || "N/A"}</td>
                    <td className="p-4 font-bold text-emerald-400">{formatCurrency(parseFloat(inv.total))}</td>
                    <td className="p-4 text-muted">{formatDate(inv.dueDate)}</td>
                    <td className="p-4">
                      <span className="bg-slate-900 border border-border px-2 py-0.5 rounded text-[10px] text-slate-300 font-bold uppercase">
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {inv.status !== InvoiceStatus.PAID && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv)
                            setPaymentAmount(inv.amountDue)
                            setShowPaymentModal(true)
                          }}
                          className="px-2.5 py-1 bg-brand-600/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/25 rounded-lg font-semibold text-[10px]"
                        >
                          Log Payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-2">Record Payment</h3>
            <p className="text-xs text-muted mb-4">Record a transaction payment for invoice {selectedInvoice.invoiceNumber}.</p>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Amount ($)</label>
                <input
                  type="number"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="STRIPE">Stripe Card</option>
                  <option value="PAYPAL">PayPal</option>
                  <option value="RAZORPAY">Razorpay</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Transaction ID (optional)</label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="tx-98382..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted-bg rounded-xl text-xs font-semibold text-muted hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-card border border-border p-6 rounded-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Create Invoice</h3>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
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

              {/* Items Table */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase text-slate-400">Line Items</label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-violet-400 hover:underline"
                  >
                    + Add Item
                  </button>
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
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
