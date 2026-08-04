"use client"

import React, { useEffect, useState } from "react"
import { CheckCircle2, XCircle, Info, X } from "lucide-react"
import { toast, ToastMessage } from "@/lib/toast"

const VARIANT_STYLES: Record<ToastMessage["variant"], string> = {
  success: "border-emerald-500/30 bg-emerald-950/90 text-emerald-300",
  error: "border-red-500/30 bg-red-950/90 text-red-300",
  info: "border-violet-500/30 bg-violet-950/90 text-violet-300",
}

const VARIANT_ICON: Record<ToastMessage["variant"], React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

export default function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([])

  useEffect(() => toast.subscribe(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {items.map((t) => {
        const Icon = VARIANT_ICON[t.variant]
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 p-3 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-semibold transition-all ${VARIANT_STYLES[t.variant]}`}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed">{t.text}</span>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
