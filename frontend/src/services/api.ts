import axios from "axios"
import { toast, extractErrorMessage } from "../lib/toast"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

// Auth endpoints render their own inline error/success UI (login/register
// forms, magic-link screens) — skip the generic toast there so users don't
// see the same message twice.
const isAuthRequest = (url?: string) => !!url && url.includes("/api/auth/")

/**
 * Session tokens live in httpOnly cookies the server sets on login — never in
 * localStorage or any other place page JavaScript can read. That's the whole
 * point: an XSS on this page (rich text, uploaded file names, AI-generated
 * summaries — this dashboard has real XSS surface) can run arbitrary JS, but
 * an httpOnly cookie is invisible to it regardless. `organizationId` is just
 * a UI preference (which org is active), not a credential, so it stays in
 * localStorage.
 */
const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/** Drops the session and sends the user to login. Server clears the auth cookies; this clears local UI state and redirects. */
export const clearSession = () => {
  if (typeof window === "undefined") return
  localStorage.removeItem("organizationId")
  const onAuthScreen = /^\/(login|register|magic-link|forgot-password|reset-password)/.test(
    window.location.pathname,
  )
  if (!onAuthScreen) window.location.href = "/login"
}

export const api = axios.create({
  baseURL: API_URL,
  // Sends the httpOnly auth cookies on every request, including cross-origin
  // ones (frontend and backend run on different ports/origins in dev and
  // typically in production too). The server's CORS config allows this only
  // for the specific origins in CORS_ORIGINS, never '*', which credentialed
  // CORS requires.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request Interceptor: active Organization ID + CSRF double-submit header.
// The JWT itself travels as a cookie now and is attached by the browser
// automatically — nothing to inject here.
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const orgId = localStorage.getItem("organizationId")
      if (orgId) {
        config.headers["x-organization-id"] = orgId
      }

      // Double-submit CSRF defense: the server pairs a non-httpOnly csrf_token
      // cookie with the httpOnly auth cookies. Echoing its value back as a
      // header proves this request came from JS running on our own origin —
      // a cross-site attacker's page can trigger the request (cookies attach
      // automatically) but can't read the cookie to also set the header.
      const method = config.method?.toLowerCase()
      if (method && ["post", "put", "patch", "delete"].includes(method)) {
        const csrfToken = readCookie("csrf_token")
        if (csrfToken) config.headers["x-csrf-token"] = csrfToken
      }
    }

    // File uploads send FormData. The instance-level default of
    // application/json would override the browser's own header and strip the
    // multipart boundary, so the server would receive an unparseable body.
    // Deleting it lets the browser set the correct value itself.
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      delete config.headers["Content-Type"]
    }

    return config;
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Handle JWT token rotation (refresh token) + give
// every page automatic success/error feedback so failed requests never fail
// silently (previously most pages only did `console.error`, so a broken
// request looked identical to a successful one from the user's seat).
const MUTATING_METHODS = ["post", "put", "patch", "delete"]

api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toLowerCase()
    if (method && MUTATING_METHODS.includes(method) && !isAuthRequest(response.config.url)) {
      const label = method === "delete" ? "Deleted" : method === "post" ? "Created" : "Saved"
      toast.success(label)
    }
    return response.data
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRequest(originalRequest?.url)) {
      originalRequest._retry = true;

      // The refresh token lives in an httpOnly cookie now, so there's nothing
      // for JS to check before trying — the browser attaches it automatically
      // if one exists. A 401 here (no cookie, or an expired/revoked one)
      // means the session genuinely can't be refreshed.
      try {
        await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
        // New cookies are already set by the response; the server no longer
        // returns tokens in the body, so there's nothing to store — just
        // retry with the cookie jar the browser now holds.
        return api(originalRequest)
      } catch {
        clearSession()
      }
    }

    if (!isAuthRequest(originalRequest?.url)) {
      toast.error(extractErrorMessage(error.response?.data))
    }

    // Reject with an object that still carries the status and a message.
    // Rejecting the raw response body lost both whenever the body was empty,
    // which is why failures surfaced in the console as a bare "{}".
    const body = error.response?.data
    return Promise.reject(
      Object.assign(body && typeof body === "object" ? { ...body } : {}, {
        status: error.response?.status ?? 0,
        message: extractErrorMessage(body) || error.message || "Request failed",
      }),
    )
  }
)
