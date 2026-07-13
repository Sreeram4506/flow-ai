"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { TrendingDown, Plus, Check, X, FileText, DollarSign, Calendar, Tag } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ExpenseStatus, Currency } from "@prisma/client"

export default function ExpensesPage() {
  const { currentOrg, user } = useAuth()
  const [expenses, setExpenses] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Create Expense Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [vendorName, setVendorName] = useState("")
  const [receiptUrl, setReceiptUrl] = useState("")

  const fetchExpensesData = async () => {
    if (!currentOrg) return
    try {
      const expensesRes: any = await api.get("/api/expenses")
      setExpenses(expensesRes.data || [])

      const categoriesRes: any = await api.get("/api/expenses/categories")
      setCategories(categoriesRes || [])
      if (categoriesRes?.length > 0) {
        setSelectedCategoryId(categoriesRes[0].id)
      }

      const statsRes: any = await api.get("/api/expenses/stats")
      setStats(statsRes)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      await fetchExpensesData()
      setLoading(false)
    }
    initData()
  }, [currentOrg])

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post("/api/expenses", {
        title,
        description: description || undefined,
        amount: parseFloat(amount),
        currency: currency as Currency,
        date: new Date(date).toISOString(),
        categoryId: selectedCategoryId || undefined,
        vendorName: vendorName || undefined,
        receiptUrl: receiptUrl || undefined,
      })
      setShowCreateModal(false)
      setTitle("")
      setDescription("")
      setAmount("")
      setVendorName("")
      setReceiptUrl("")
      await fetchExpensesData()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: ExpenseStatus) => {
    setActionLoading(id)
    try {
      const endpoint = status === ExpenseStatus.APPROVED ? "approve" : "reject"
      await api.post(`/api/expenses/${id}/${endpoint}`, {})
      await fetchExpensesData()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusStyle = (status: ExpenseStatus) => {
    switch (status) {
      case ExpenseStatus.APPROVED:
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      case ExpenseStatus.REJECTED:
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20"
      default:
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20"
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
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Expenses</h1>
          <p className="text-sm text-muted mt-1">Track business expenditure, manage categories, and audit claims.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition-colors shadow-md"
        >
          <Plus className="h-4 w-4" />
          <span>New Expense</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-2xl border border-border/60 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Approved</h3>
            <span className="text-2xl font-extrabold text-emerald-400 block mt-2">
              {formatCurrency(stats?.totalApproved || 0)}
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-border/60 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Claims Submitted</h3>
            <span className="text-2xl font-extrabold text-slate-200 block mt-2">
              {stats?.totalCount || 0}
            </span>
          </div>
          <div className="p-3 bg-slate-900 border border-border rounded-xl text-slate-300">
            <FileText className="h-6 w-6" />
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-border/60 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Categories</h3>
            <span className="text-2xl font-extrabold text-violet-400 block mt-2">
              {categories.length}
            </span>
          </div>
          <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400 border border-violet-500/20">
            <Tag className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="glass rounded-2xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-border/40 text-muted uppercase tracking-wider font-bold">
                <th className="p-4">Expense Title</th>
                <th className="p-4">Category</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Vendor</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    No expense claims recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-muted-bg/35 transition-colors">
                    <td className="p-4 font-semibold text-slate-200">
                      <div>
                        <span className="block font-bold">{exp.title}</span>
                        {exp.description && <span className="text-[10px] text-muted font-normal block mt-0.5">{exp.description}</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-slate-900 border border-border rounded text-[10px] font-semibold text-slate-300">
                        {exp.category?.name || "Uncategorized"}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-200">{formatCurrency(exp.amount)}</td>
                    <td className="p-4 text-muted">{exp.vendorName || "N/A"}</td>
                    <td className="p-4 text-muted">{formatDate(exp.date)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusStyle(exp.status)}`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      {actionLoading === exp.id ? (
                        <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-500"></span>
                      ) : (
                        exp.status === ExpenseStatus.PENDING && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(exp.id, ExpenseStatus.APPROVED)}
                              className="p-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20"
                              title="Approve Claim"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(exp.id, ExpenseStatus.REJECTED)}
                              className="p-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded hover:bg-rose-500/20"
                              title="Reject Claim"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )
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
          <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-lg font-bold text-foreground font-heading mb-4">Record Expense Claim</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Expense Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                  placeholder="AWS Cloud bill..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm h-16"
                  placeholder="Additional details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="120.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Category</label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Vendor Name</label>
                  <input
                    type="text"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm"
                    placeholder="Amazon Web Services"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-violet-500 text-sm"
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
                  disabled={submitting}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit Claim"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
