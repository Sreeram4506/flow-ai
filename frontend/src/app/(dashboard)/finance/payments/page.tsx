"use client"

import React, { useEffect, useState } from "react"
import { api } from "@/services/api"
import { useAuth } from "@/context/AuthContext"
import { CreditCard, DollarSign, Receipt, ArrowLeftRight, CheckCircle2, RotateCcw, Calendar, Trash2, ShieldAlert } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"

export default function PaymentsPage() {
  const { currentOrg } = useAuth()
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [showRefundConfirm, setShowRefundConfirm] = useState(false)

  const fetchPayments = async () => {
    if (!currentOrg) return
    try {
      const res: any = await api.get("/api/payments")
      setPayments(res.data || [])
    } catch (e) {
      console.error("Failed to fetch payments:", e)
    }
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await fetchPayments()
      setLoading(false)
    }
    init()
  }, [currentOrg])

  const handleRefund = async (paymentId: string) => {
    try {
      await api.patch(`/api/payments/${paymentId}/status`, {
        status: "REFUNDED",
      })
      setShowRefundConfirm(false)
      setSelectedPayment(null)
      await fetchPayments()
    } catch (e) {
      console.error("Failed to refund payment:", e)
    }
  }

  // Calculate local statistics
  const totalReceived = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const totalRefunded = payments
    .filter((p) => p.status === "REFUNDED")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const netRevenue = totalReceived - totalRefunded
  const totalCount = payments.length

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "BANK_TRANSFER": return "Bank Transfer"
      case "CREDIT_CARD": return "Credit Card"
      case "STRIPE": return "Stripe"
      case "PAYPAL": return "PayPal"
      case "CASH": return "Cash"
      default: return method
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
          <h1 className="text-3xl font-extrabold tracking-tight font-heading">Payments</h1>
          <p className="text-sm text-muted mt-1">Track client receipts, payouts status, and transaction methods.</p>
        </div>
      </div>

      {/* Payments Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-muted font-bold uppercase block">Gross Received</span>
          <span className="text-xl font-bold mt-2 block text-slate-100">{formatCurrency(totalReceived)}</span>
          <span className="text-[10px] text-muted block mt-1">{payments.filter(p => p.status === "PAID").length} settled payments</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-rose-400 font-bold uppercase block">Total Refunded</span>
          <span className="text-xl font-bold mt-2 block text-rose-400">{formatCurrency(totalRefunded)}</span>
          <span className="text-[10px] text-muted block mt-1">{payments.filter(p => p.status === "REFUNDED").length} refunds processed</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-emerald-400 font-bold uppercase block">Net Collections</span>
          <span className="text-xl font-bold mt-2 block text-emerald-400">{formatCurrency(netRevenue)}</span>
          <span className="text-[10px] text-muted block mt-1">Revenue after refunds</span>
        </div>

        <div className="glass p-5 rounded-2xl border border-border/60">
          <span className="text-[10px] text-violet-400 font-bold uppercase block">Total Transactions</span>
          <span className="text-xl font-bold mt-2 block text-violet-400">{totalCount}</span>
          <span className="text-[10px] text-muted block mt-1">Receipt entries logged</span>
        </div>
      </div>

      {/* Payments List Table */}
      <div className="glass rounded-2xl border border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/20 border-b border-border/40 text-muted uppercase tracking-wider font-bold">
                <th className="p-4">Transaction ID</th>
                <th className="p-4">Invoice #</th>
                <th className="p-4">Client</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Method</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    No transactions recorded. Record a payment on any outstanding invoice.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-muted-bg/35 transition-colors">
                    <td className="p-4 font-mono text-[11px] text-slate-300">
                      {payment.transactionId || payment.id.substring(0, 12).toUpperCase()}
                    </td>
                    <td className="p-4 font-bold text-slate-200">
                      {payment.invoice?.invoiceNumber || "N/A"}
                    </td>
                    <td className="p-4 font-semibold">
                      {payment.client?.companyName || "N/A"}
                    </td>
                    <td className="p-4 font-bold text-emerald-400">
                      {formatCurrency(parseFloat(payment.amount))}
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 font-medium text-slate-300">
                        <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                        {getMethodLabel(payment.method)}
                      </span>
                    </td>
                    <td className="p-4 text-muted">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        payment.status === "PAID"
                          ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                          : payment.status === "REFUNDED"
                          ? "bg-rose-950/40 border-rose-500/30 text-rose-400"
                          : "bg-slate-900 border-border text-slate-400"
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {payment.status === "PAID" && (
                        <button
                          onClick={() => {
                            setSelectedPayment(payment)
                            setShowRefundConfirm(true)
                          }}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 rounded-lg font-semibold text-[10px] transition-colors"
                        >
                          Refund
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

      {/* Refund Confirmation Modal */}
      {showRefundConfirm && selectedPayment && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-card border border-border p-6 rounded-2xl shadow-2xl relative">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="p-2 bg-rose-500/10 rounded-xl">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold font-heading text-slate-100">Process Refund</h3>
            </div>
            
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                Are you sure you want to issue a refund for this payment?
              </p>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Transaction ID:</span>
                  <span className="font-mono text-slate-200">{selectedPayment.transactionId || selectedPayment.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Invoice:</span>
                  <span className="font-bold text-slate-200">{selectedPayment.invoice?.invoiceNumber || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Client:</span>
                  <span className="font-semibold text-slate-200">{selectedPayment.client?.companyName || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Amount:</span>
                  <span className="font-bold text-rose-400">{formatCurrency(parseFloat(selectedPayment.amount))}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                * Note: Issuing a refund will change this payment's status to **REFUNDED**. 
                It will not automatically deduct the amount from the invoice's balance.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/40">
              <button
                type="button"
                onClick={() => {
                  setShowRefundConfirm(false)
                  setSelectedPayment(null)
                }}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-900 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRefund(selectedPayment.id)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-md shadow-rose-950"
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
