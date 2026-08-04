"use client"

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react"
import { useRouter, usePathname } from "next/navigation"
import { api } from "../services/api"
import { extractErrorMessage } from "../lib/toast"

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  avatar: string | null
  isEmailVerified: boolean
  isSuperAdmin: boolean
}

interface Organization {
  id: string
  name: string
  slug: string
  logo: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  organizations: Organization[]
  currentOrg: Organization | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean; tempToken?: string }>
  register: (data: any) => Promise<void>
  verify2FA: (tempToken: string, code: string) => Promise<void>
  loginWithMagicLink: (email: string) => Promise<void>
  verifyMagicLink: (token: string) => Promise<void>
  logout: () => Promise<void>
  switchOrganization: (orgId: string) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** Routes reachable without a session. */
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/magic-link",
  "/verify-email",
  "/forgot-password",
]

/**
 * Identity-preserving state setters.
 *
 * `refreshUser` rebuilds the user and organization objects from a fresh JSON
 * response every time, so a naive `setState` hands every consumer a brand new
 * object reference even when nothing actually changed. Sixteen pages key their
 * data fetch on `[currentOrg]`, and SocketContext keys its connection on
 * `[user, currentOrg]` — so a new reference meant every page refetched and the
 * WebSocket tore down and re-handshook. These comparisons keep the previous
 * object when the underlying values are identical, which keeps all of those
 * effects quiet.
 */
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.avatar === b.avatar &&
    a.isEmailVerified === b.isEmailVerified &&
    a.isSuperAdmin === b.isSuperAdmin
  )
}

function sameOrg(a: Organization | null, b: Organization | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.slug === b.slug &&
    a.logo === b.logo &&
    a.role === b.role
  )
}

function sameOrgList(a: Organization[], b: Organization[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((org, i) => sameOrg(org, b[i]))
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Guards against overlapping /api/auth/me calls (e.g. a navigation landing
  // while the initial restore is still in flight).
  const refreshInFlight = useRef<Promise<void> | null>(null)

  const refreshUser = useCallback(async (): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current

    const run = (async () => {
      try {
        const response: any = await api.get("/api/auth/me")
        // API returns { success, data: {...}, timestamp }
        const userData = response.data || response

        const nextUser: User = {
          id: userData.id,
          email: userData.email,
          firstName: userData.firstName || "",
          lastName: userData.lastName || "",
          avatar: userData.avatar || null,
          isEmailVerified: userData.isEmailVerified || false,
          isSuperAdmin: userData.isSuperAdmin || false,
        }
        setUser((prev) => (sameUser(prev, nextUser) ? prev : nextUser))

        const orgMemberships = userData.organizationMembers || []
        const orgsList: Organization[] = orgMemberships.map((m: any) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          logo: m.organization.logo,
          role: m.role,
        }))
        setOrganizations((prev) => (sameOrgList(prev, orgsList) ? prev : orgsList))

        if (orgsList.length > 0) {
          const storedOrgId = localStorage.getItem("organizationId")
          const matchedOrg =
            orgsList.find((o) => o.id === storedOrgId) || orgsList[0]
          setCurrentOrg((prev) => (sameOrg(prev, matchedOrg) ? prev : matchedOrg))
          localStorage.setItem("organizationId", matchedOrg.id)
        } else {
          setCurrentOrg(null)
        }
      } catch (err: any) {
        // A 401 here just means "no valid session" — the ordinary state for a
        // signed-out visitor or an expired token. Logging it as an error sent
        // people chasing a bug that wasn't one, so only genuinely unexpected
        // failures (server down, network, 5xx) are reported.
        const status = err?.status ?? err?.statusCode
        if (status !== 401) {
          console.error("Could not restore session:", err?.message || err)
        }
        setUser(null)
        setOrganizations([])
        setCurrentOrg(null)
      } finally {
        setLoading(false)
      }
    })()

    // Cleared via a chained .finally() rather than inside the async body, so
    // the reset can't race the assignment below regardless of how early the
    // body settles.
    const tracked = run.finally(() => {
      refreshInFlight.current = null
    })
    refreshInFlight.current = tracked
    return tracked
  }, [])

  // Restore the session ONCE, on mount.
  //
  // This previously depended on [pathname], which meant every single route
  // change fired a fresh GET /api/auth/me — a network round-trip plus a
  // database read with a join — and then cascaded new object identities
  // through the whole tree. Navigation cost was roughly: 1 profile request,
  // a socket reconnect, and a duplicate data fetch on the page being opened
  // (once on mount, again when currentOrg's reference changed). Session
  // restoration only needs to happen when the app boots; everything after
  // that is driven by explicit login/logout/refresh calls.
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (token) {
      refreshUser()
    } else {
      setLoading(false)
    }
  }, [refreshUser])

  // Route guard. Pure client-side — no network calls — so navigating between
  // sections costs nothing beyond the page's own data.
  useEffect(() => {
    if (loading) return
    if (!user && !PUBLIC_ROUTES.includes(pathname)) {
      router.replace("/login")
    }
  }, [loading, user, pathname, router])

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const response: any = await api.post("/api/auth/login", { email, password })
        // API returns { success, data: { accessToken, refreshToken, user }, timestamp }
        const loginData = response.data || response

        if (loginData.requires2FA) {
          return { requires2FA: true, tempToken: loginData.tempToken }
        }

        localStorage.setItem("token", loginData.accessToken)
        localStorage.setItem("refreshToken", loginData.refreshToken)
        await refreshUser()
        router.push("/dashboard")
        return {}
      } catch (error: any) {
        console.error("Login error:", error)
        throw new Error(extractErrorMessage(error, "Login failed"))
      }
    },
    [refreshUser, router],
  )

  const register = useCallback(
    async (data: any) => {
      try {
        const response: any = await api.post("/api/auth/register", data)
        const regData = response.data || response
        localStorage.setItem("token", regData.accessToken)
        localStorage.setItem("refreshToken", regData.refreshToken)
        await refreshUser()
        router.push("/dashboard")
      } catch (error: any) {
        throw new Error(extractErrorMessage(error, "Registration failed"))
      }
    },
    [refreshUser, router],
  )

  const verify2FA = useCallback(
    async (tempToken: string, code: string) => {
      try {
        const response: any = await api.post("/api/auth/2fa/verify", { tempToken, code })
        const data = response.data || response
        localStorage.setItem("token", data.accessToken)
        localStorage.setItem("refreshToken", data.refreshToken)
        await refreshUser()
        router.push("/dashboard")
      } catch (error: any) {
        throw new Error(extractErrorMessage(error, "2FA verification failed"))
      }
    },
    [refreshUser, router],
  )

  const loginWithMagicLink = useCallback(async (email: string) => {
    try {
      await api.post("/api/auth/magic-link", { email })
    } catch (error: any) {
      throw new Error(extractErrorMessage(error, "Failed to send magic link"))
    }
  }, [])

  const verifyMagicLink = useCallback(
    async (token: string) => {
      try {
        const response: any = await api.post("/api/auth/magic-link/verify", { token })
        const data = response.data || response
        localStorage.setItem("token", data.accessToken)
        localStorage.setItem("refreshToken", data.refreshToken)
        await refreshUser()
        router.push("/dashboard")
      } catch (error: any) {
        throw new Error(extractErrorMessage(error, "Magic link verification failed"))
      }
    },
    [refreshUser, router],
  )

  const logout = useCallback(async () => {
    try {
      const rt = localStorage.getItem("refreshToken")
      await api.post("/api/auth/logout", { refreshToken: rt })
    } catch (e) {
      // Ignore network error on logout
    } finally {
      localStorage.removeItem("token")
      localStorage.removeItem("refreshToken")
      localStorage.removeItem("organizationId")
      setUser(null)
      setOrganizations([])
      setCurrentOrg(null)
      router.push("/login")
    }
  }, [router])

  const switchOrganization = useCallback(
    (orgId: string) => {
      const org = organizations.find((o) => o.id === orgId)
      if (!org || org.id === currentOrg?.id) return

      localStorage.setItem("organizationId", orgId)
      setCurrentOrg(org)

      // This used to be `window.location.reload()`, which discarded the entire
      // JS bundle and re-ran the whole boot sequence just to get pages to
      // refetch. Setting currentOrg is sufficient: every page's data effect is
      // keyed on it, so they reload their own data — and now that identity is
      // stable, they do so only on a genuine switch.
    },
    [organizations, currentOrg],
  )

  // Memoized so consumers don't re-render on every provider render. Without
  // this the object literal is new on each pass, and every useAuth()
  // subscriber re-renders regardless of whether anything it reads changed.
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      organizations,
      currentOrg,
      loading,
      login,
      register,
      verify2FA,
      loginWithMagicLink,
      verifyMagicLink,
      logout,
      switchOrganization,
      refreshUser,
    }),
    [
      user,
      organizations,
      currentOrg,
      loading,
      login,
      register,
      verify2FA,
      loginWithMagicLink,
      verifyMagicLink,
      logout,
      switchOrganization,
      refreshUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
