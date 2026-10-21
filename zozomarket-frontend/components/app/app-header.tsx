'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronRight, CircleHelp, Menu, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { findNav } from '@/lib/nav'
import { clearSession, loadUser, type SessionUser } from '@/lib/session'
import { AppSidebar } from './app-sidebar'
import { ThemeToggle } from './theme-toggle'

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const nav = findNav(pathname)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const read = () => setUser(loadUser())
    read()
    window.addEventListener('zozo-session', read)
    return () => window.removeEventListener('zozo-session', read)
  }, [])

  const initials = (user?.name || 'You').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()

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

        <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{user?.workspaceName ?? 'Workspace'}</span>

        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => toast('Help center is a demo in this prototype.')}>
          <CircleHelp />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" aria-label="Account menu" className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring" />}>
            {initials}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user?.name ?? 'Account'} · Owner</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>Profile</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" />}>Workspace settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { clearSession(); router.replace('/login') }}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
