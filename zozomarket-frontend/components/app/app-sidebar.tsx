'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { navGroups } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { CreateNewMenu } from './create-new-menu'
import { Logo } from './logo'

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex flex-col gap-4 border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-base font-semibold tracking-tight">ZozoMarket</span>
        </div>
        <CreateNewMenu fullWidth />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-4">
          {navGroups.map((group) => {
            const isCollapsed = collapsed[group.label]
            const id = `nav-${group.label.replace(/\W+/g, '-')}`
            return (
              <li key={group.label}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={id}
                  onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {group.label}
                  <ChevronDown className={cn('size-3.5 transition-transform', isCollapsed && '-rotate-90')} aria-hidden />
                </button>
                {!isCollapsed && (
                  <ul id={id} className="mt-1 flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = pathname.startsWith(item.href)
                      const Icon = item.icon
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                              active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                            )}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
