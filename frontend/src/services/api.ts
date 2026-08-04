import axios from "axios"
import { toast, extractErrorMessage } from "../lib/toast"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

// Auth endpoints render their own inline error/success UI (login/register
// forms, magic-link screens) — skip the generic toast there so users don't
// see the same message twice.
const isAuthRequest = (url?: string) => !!url && url.includes("/api/auth/")

/**
 * Drops the stored session and sends the user to login.
 *
 * Skips the redirect when already on an auth screen, so a 401 raised by the
 * login page itself can't bounce the browser in a loop.
 */
export const clearSession = () => {
  if (typeof window === "undefined") return
  localStorage.removeItem("token")
  localStorage.removeItem("refreshToken")
  localStorage.removeItem("organizationId")
  const onAuthScreen = /^\/(login|register|magic-link|forgot-password|reset-password)/.test(
    window.location.pathname,
  )
  if (!onAuthScreen) window.location.href = "/login"
}

/**
 * A token is only usable if it's a non-empty string. The literal "undefined"
 * is checked because a previously broken refresh path stored that value, and
 * anyone carrying it would otherwise keep sending `Bearer undefined` forever.
 */
const readToken = (key: string): string | null => {
  const value = localStorage.getItem(key)
  if (!value || value === "undefined" || value === "null") {
    if (value) localStorage.removeItem(key)
    return null
  }
  return value
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request Interceptor: Inject JWT and active Organization ID
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = readToken("token")
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      const orgId = localStorage.getItem("organizationId")
      if (orgId) {
        config.headers["x-organization-id"] = orgId
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

    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;
      const refreshToken =
        typeof window !== "undefined" ? readToken("refreshToken") : null

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
          // The API wraps every response as { success, data, timestamp }. This
          // is a bare axios call, so it does NOT pass through the unwrapping
          // interceptor above — reading res.data.accessToken directly yielded
          // undefined, which was then written to localStorage, so every
          // subsequent request sent "Bearer undefined" and 401'd in a loop.
          const payload = res.data?.data ?? res.data
          const accessToken = payload?.accessToken
          const newRefreshToken = payload?.refreshToken

          if (accessToken) {
            localStorage.setItem("token", accessToken)
            if (newRefreshToken) localStorage.setItem("refreshToken", newRefreshToken)
            originalRequest.headers.Authorization = `Bearer ${accessToken}`
            return api(originalRequest)
          }
          clearSession()
        } catch {
          clearSession()
        }
      } else {
        // No refresh token at all. Previously this fell through without
        // clearing or redirecting, leaving the app rendering an authenticated
        // shell it could never populate.
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
