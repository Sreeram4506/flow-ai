// Minimal dependency-free toast/notification bus.
//
// Why this exists: almost every mutating action in the app (create/update/
// delete project, task, client, invoice...) only did `console.error(e)` on
// failure and gave no visual confirmation on success. Users had no way to
// know whether a click actually worked short of refreshing and looking for
// the row. This gives the whole app a single, consistent feedback channel
// that both React components (via `subscribe`) and non-component code like
// the axios interceptor in `services/api.ts` can push into.

export type ToastVariant = "success" | "error" | "info"

export interface ToastMessage {
  id: number
  variant: ToastVariant
  text: string
}

type Listener = (toasts: ToastMessage[]) => void

let toasts: ToastMessage[] = []
let listeners: Listener[] = []
let nextId = 1

function emit() {
  listeners.forEach((listener) => listener(toasts))
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(variant: ToastVariant, text: string, durationMs = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, variant, text }]
  emit()
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), durationMs)
  }
  return id
}

function subscribe(listener: Listener): () => void {
  listeners.push(listener)
  listener(toasts)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", text, 6000),
  info: (text: string) => push("info", text),
  dismiss,
  subscribe,
}

/**
 * Pulls a human-readable message out of a NestJS error payload.
 * class-validator errors come back as `message: string[]`, everything else
 * as `message: string` — this normalizes both into one line.
 */
export function extractErrorMessage(payload: any, fallback = "Something went wrong. Please try again."): string {
  const msg = payload?.message ?? payload?.error
  if (!msg) return fallback
  if (Array.isArray(msg)) return msg.join(", ")
  return String(msg)
}
