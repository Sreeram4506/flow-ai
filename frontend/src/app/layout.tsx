import React from "react"
import { ThemeProvider } from "../context/ThemeContext"
import { AuthProvider } from "../context/AuthContext"
import { SocketProvider } from "../context/SocketContext"
import Toaster from "../components/Toaster"
import "./globals.css"

export const metadata = {
  title: "Flow – Enterprise SaaS Platform",
  description: "Manage projects, CRM, billing, HR, documents, and AI insights from one premium dashboard.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              {children}
              <Toaster />
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
