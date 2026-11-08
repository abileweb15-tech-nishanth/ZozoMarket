'use client'

import React from 'react'
import { AppSidebar } from '@/components/app/app-sidebar'
import { AppHeader } from '@/components/app/app-header'
import { SidebarProvider, useSidebar } from '@/components/app/sidebar-provider'
import { cn } from '@/lib/utils'

function AppShellContent({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar()

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border lg:block transition-[width] duration-200 ease-in-out',
          isOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className={cn('h-full transition-[width] duration-200 ease-in-out', isOpen ? 'w-64' : 'w-16')}>
          <AppSidebar />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col transition-all duration-200 ease-in-out">
        <AppHeader />
        <main className="flex-1 bg-muted/60 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  )
}

