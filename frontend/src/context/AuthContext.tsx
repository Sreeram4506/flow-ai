"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { api } from "../services/api"

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const refreshUser = async () => {
    try {
      const response: any = await api.get("/api/auth/me")
      // API returns { success, data: {...}, timestamp }
      const userData = response.data || response
      setUser({
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        avatar: userData.avatar || null,
        isEmailVerified: userData.isEmailVerified || false,
        isSuperAdmin: userData.isSuperAdmin || false,
      })
      
      const orgMemberships = userData.organizationMembers || []
      const orgsList = orgMemberships.map((m: any) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        logo: m.organization.logo,
        role: m.role,
      }))
      setOrganizations(orgsList)

      if (orgsList.length > 0) {
        const storedOrgId = localStorage.getItem("organizationId")
        const matchedOrg = orgsList.find((o: any) => o.id === storedOrgId) || orgsList[0]
        setCurrentOrg(matchedOrg)
        localStorage.setItem("organizationId", matchedOrg.id)
      } else {
        setCurrentOrg(null)
      }
    } catch (err) {
      console.error("Error refreshing user:", err)
      setUser(null)
      setOrganizations([])
      setCurrentOrg(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (token) {
      refreshUser()
    } else {
      setLoading(false)
      if (!["/login", "/register", "/magic-link", "/verify-email", "/forgot-password"].includes(pathname)) {
        router.push("/login")
      }
    }
  }, [pathname])

  const login = async (email: string, password: string) => {
    try {
      const response: any = await api.post("/api/auth/login", { email, password })
      // API returns { success, data: { accessToken, refreshToken, user }, timestamp }
      const loginData = response.data || response
      console.log("Login response:", loginData)
      
      if (loginData.requires2FA) {
        return { requires2FA: true, tempToken: loginData.tempToken }
      }
      
      localStorage.setItem("token", loginData.accessToken)
      localStorage.setItem("refreshToken", loginData.refreshToken)
      console.log("Tokens stored, calling refreshUser...")
      await refreshUser()
      console.log("User refreshed, navigating to dashboard...")
      router.push("/dashboard")
      return {}
    } catch (error: any) {
      console.error("Login error:", error)
      const message = error.response?.data?.message || error.message || "Login failed"
      throw new Error(message)
    }
  }

  const register = async (data: any) => {
    try {
      const response: any = await api.post("/api/auth/register", data)
      // API returns { success, data: { accessToken, refreshToken, user }, timestamp }
      const regData = response.data || response
      localStorage.setItem("token", regData.accessToken)
      localStorage.setItem("refreshToken", regData.refreshToken)
      await refreshUser()
      router.push("/dashboard")
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Registration failed"
      throw new Error(message)
    }
  }

  const verify2FA = async (tempToken: string, code: string) => {
    try {
      const response: any = await api.post("/api/auth/2fa/verify", { tempToken, code })
      // API returns { success, data: { accessToken, refreshToken, user }, timestamp }
      const data = response.data || response
      localStorage.setItem("token", data.accessToken)
      localStorage.setItem("refreshToken", data.refreshToken)
      await refreshUser()
      router.push("/dashboard")
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "2FA verification failed"
      throw new Error(message)
    }
  }

  const loginWithMagicLink = async (email: string) => {
    try {
      await api.post("/api/auth/magic-link", { email })
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Failed to send magic link"
      throw new Error(message)
    }
  }

  const verifyMagicLink = async (token: string) => {
    try {
      const response: any = await api.post("/api/auth/magic-link/verify", { token })
      const data = response.data || response
      localStorage.setItem("token", data.accessToken)
      localStorage.setItem("refreshToken", data.refreshToken)
      await refreshUser()
      router.push("/dashboard")
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Magic link verification failed"
      throw new Error(message)
    }
  }

  const logout = async () => {
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
  }

  const switchOrganization = (orgId: string) => {
    const org = organizations.find((o) => o.id === orgId)
    if (org) {
      setCurrentOrg(org)
      localStorage.setItem("organizationId", orgId)
      window.location.reload() // Reload to reset all data contexts properly
    }
  }

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
