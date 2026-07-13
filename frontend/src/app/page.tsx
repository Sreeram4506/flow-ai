"use client"

import React from "react"
import Link from "next/link"
import { Sparkles, ArrowRight, Briefcase, CreditCard, Users, MessageSquare, ShieldCheck, Zap } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Background glowing gradients */}
      <div className="absolute top-[-25%] left-[-20%] w-[70%] h-[70%] rounded-full bg-violet-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-20%] w-[70%] h-[70%] rounded-full bg-indigo-900/10 blur-[130px] pointer-events-none" />

      {/* Header bar */}
      <header className="h-20 max-w-7xl mx-auto w-full px-6 flex items-center justify-between relative z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-600 rounded-lg text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-heading">Flow</span>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="text-xs font-semibold text-slate-300 hover:text-white transition-colors">
            Log In
          </Link>
          <Link 
            href="/register" 
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-violet-500/20"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto relative z-10 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-[10px] font-bold uppercase tracking-wider mb-6">
          <Zap className="h-3 w-3" /> Next-generation ERP
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight font-heading leading-[1.1] text-white">
          The AI-Powered Operating System <br />
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            for Modern Business Operations
          </span>
        </h1>
        
        <p className="text-sm sm:text-base text-slate-400 mt-6 max-w-2xl leading-relaxed">
          Flow consolidates client relationships, project pipelines, active task boards, invoicing, 
          time trackers, and HR directories into a unified, glassmorphic executive console.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/register"
            className="px-6 py-3 bg-brand-gradient hover:brightness-110 text-white font-bold rounded-xl text-xs transition-all shadow-xl shadow-indigo-500/10 flex items-center gap-2 group"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          
          <Link
            href="/login"
            className="px-6 py-3 bg-slate-900 hover:bg-slate-900/80 border border-slate-800 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
          >
            View Demo Space
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 w-full text-left">
          {[
            { label: "CRM & Pipelines", desc: "Track qualified leads", icon: Users },
            { label: "Work Management", desc: "Kanban & task trees", icon: Briefcase },
            { label: "Billing & Cashflow", desc: "Invoices & paid logs", icon: CreditCard },
            { label: "Real-time Sync", desc: "WebSocket chat channels", icon: MessageSquare },
          ].map((feat, i) => {
            const Icon = feat.icon
            return (
              <div key={i} className="glass p-5 rounded-2xl border border-slate-800/60 relative group hover:border-violet-500/20 transition-all">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-violet-400 w-fit group-hover:scale-105 transition-transform">
                  <Icon className="h-4 w-4" />
                </div>
                <h4 className="text-xs font-bold mt-4 text-slate-200">{feat.label}</h4>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{feat.desc}</p>
              </div>
            )
          })}
        </div>
      </main>

      {/* Footer bar */}
      <footer className="h-16 border-t border-slate-900/60 bg-slate-950 px-6 flex items-center justify-between text-[10px] text-slate-500 relative z-10 shrink-0 max-w-7xl mx-auto w-full">
        <span>&copy; {new Date().getFullYear()} Flow Technologies. All rights reserved.</span>
        <div className="flex gap-4">
          <a href="#" className="hover:underline">Privacy Policy</a>
          <a href="#" className="hover:underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  )
}
