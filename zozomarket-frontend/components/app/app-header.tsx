'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Bell, ChevronDown, ChevronRight, CircleHelp, Menu, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { findNav } from '@/lib/nav'
import { AppSidebar } from './app-sidebar'
import { ThemeToggle } from './theme-toggle'

const workspaces = ['Acme Coffee Co.', 'Northwind Studio', 'Bloom Skincare']

export function AppHeader() {
  const pathname = usePathname()
  const nav = findNav(pathname)
  const [workspace, setWorkspace] = useState(workspaces[0])
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
        <Menu />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {nav && (
            <li className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
              {nav.group} <ChevronRight className="size-3.5" aria-hidden />
            </li>
          )}
          <li className="truncate font-medium" aria-current="page">{nav?.item.label ?? 'ZozoMarket'}</li>
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search" placeholder="Search campaigns, templates, contacts…" className="h-9 w-64 pl-9" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="hidden sm:inline-flex" />}>
            <span className="max-w-32 truncate">{workspace}</span> <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem key={w} onClick={() => setWorkspace(w)}>{w}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />}>
            <Bell />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuItem>“Spring Launch” email finished sending</DropdownMenuItem>
              <DropdownMenuItem>“October Newsletter” scheduled for Oct 15</DropdownMenuItem>
              <DropdownMenuItem>42 new contacts from Signup Form</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => toast('Help center is a demo in this prototype.')}>
          <CircleHelp />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" aria-label="Account menu" className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring" />}>
            JD
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Jamie Doe · Owner</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Workspace settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast('Signed out (simulated)')}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
