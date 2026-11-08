'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface SidebarContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Initialize and persist preference in localStorage
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('zozo-sidebar-open')
      if (saved !== null) {
        setIsOpen(saved === 'true')
      }
    } catch {
      // Ignore if localStorage is restricted
    }
  }, [])

  const toggle = () => {
    setIsOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('zozo-sidebar-open', String(next))
      } catch {}
      return next
    })
  }

  const open = () => {
    setIsOpen(true)
    try {
      localStorage.setItem('zozo-sidebar-open', 'true')
    } catch {}
  }

  const close = () => {
    setIsOpen(false)
    try {
      localStorage.setItem('zozo-sidebar-open', 'false')
    } catch {}
  }

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle,
        open,
        close,
        mobileOpen,
        setMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

