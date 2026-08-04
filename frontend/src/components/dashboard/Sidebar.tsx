"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"
import {
  Sparkles,
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  Building2,
  PhoneCall,
  FileSpreadsheet,
  FileCheck,
  CreditCard,
  TrendingDown,
  UserCheck,
  FolderOpen,
  LogOut,
  Moon,
  Sun,
  Settings,
  ChevronDown
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function Sidebar() {
  const pathname = usePathname()
  const { user, organizations, currentOrg, switchOrganization, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [showOrgDropdown, setShowOrgDropdown] = React.useState(false)

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "AI Agents", href: "/agents", icon: Sparkles },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    { label: "Clients (CRM)", href: "/crm/clients", icon: Building2 },
    { label: "Leads Pipeline", href: "/crm/leads", icon: PhoneCall },
    { label: "Quotations", href: "/finance/quotations", icon: FileCheck },
    { label: "Invoices", href: "/finance/invoices", icon: FileSpreadsheet },
    { label: "Payments", href: "/finance/payments", icon: CreditCard },
    { label: "Expenses", href: "/finance/expenses", icon: TrendingDown },
    { label: "HR Module", href: "/hr", icon: UserCheck },
    { label: "Documents", href: "/documents", icon: FolderOpen },
    { label: "Team", href: "/teams", icon: Users },
  ]

  return (
    <aside className="w-64 bg-sidebar border-r border-border h-screen flex flex-col fixed left-0 top-0 z-30 transition-all">
      {/* Brand & Org Switcher */}
      <div className="p-4 border-b border-border relative">
        <div 
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          className="flex items-center justify-between p-2 hover:bg-muted-bg rounded-xl cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-600 rounded-lg text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold tracking-tight text-foreground truncate max-w-[120px]">
                {currentOrg ? currentOrg.name : "Select Org"}
              </h1>
              <span className="text-[10px] text-muted block uppercase tracking-wider font-semibold">
                {currentOrg ? currentOrg.role : "No Role"}
              </span>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted" />
        </div>

        {/* Dropdown Menu */}
        {showOrgDropdown && (
          <div className="absolute top-16 left-4 right-4 bg-card border border-border rounded-xl shadow-lg z-50 p-1.5 max-h-48 overflow-y-auto">
            <span className="text-[9px] uppercase tracking-wider text-muted font-bold block px-2.5 py-1.5 border-b border-border/50">
              Switch Organization
            </span>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  switchOrganization(org.id)
                  setShowOrgDropdown(false)
                }}
                className={cn(
                  "w-full text-left px-2.5 py-2 text-xs font-semibold rounded-lg flex items-center justify-between hover:bg-muted-bg transition-colors mt-1",
                  currentOrg?.id === org.id ? "text-violet-500 bg-violet-500/5" : "text-foreground"
                )}
              >
                <span>{org.name}</span>
                <span className="text-[9px] uppercase bg-border px-1.5 py-0.5 rounded text-muted">
                  {org.role}
                </span>
              </button>
            ))}
            <Link
              href="/organizations/create"
              className="w-full text-left px-2.5 py-2 text-xs font-semibold rounded-lg block text-violet-400 hover:bg-muted-bg transition-colors mt-1"
            >
              + Create Organization
            </Link>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group glow-hover",
                isActive
                  ? "bg-brand-500/10 text-brand-500 shadow-sm"
                  : "text-muted hover:text-foreground hover:bg-muted-bg"
              )}
            >
              <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", isActive ? "text-brand-500" : "text-muted")} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-muted hover:text-foreground hover:bg-muted-bg rounded-xl transition-colors"
        >
          {theme === "light" ? (
            <>
              <Moon className="h-4 w-4" />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="h-4 w-4" />
              <span>Light Mode</span>
            </>
          )}
        </button>

        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-muted hover:text-foreground hover:bg-muted-bg rounded-xl transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Link>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/5 rounded-xl transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  )
}
