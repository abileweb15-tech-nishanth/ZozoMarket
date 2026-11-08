'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, PanelLeftClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navGroups } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { CreateNewMenu } from './create-new-menu'
import { Logo, LogoWithText } from './logo'
import { useSidebar } from './sidebar-provider'

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const { isOpen, close, toggle } = useSidebar()

  // When onNavigate is set (mobile Sheet drawer), it is always expanded.
  // On desktop, if isOpen is false, it renders the compact icon rail!
  const isCompact = !isOpen && !onNavigate

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Sidebar Header */}
      {isCompact ? (
        <div className="flex flex-col items-center gap-3 border-b border-sidebar-border py-3 px-2">
          <button
            type="button"
            onClick={toggle}
            title="Expand menu"
            aria-label="Expand menu"
            className="flex size-10 items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <Logo className="size-8" priority />
          </button>
          <CreateNewMenu compact />
        </div>
      ) : (
        <div className="flex flex-col gap-4 border-b border-sidebar-border p-4">
          <div className="flex items-center justify-between">
            <LogoWithText priority />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={close}
              className="hidden size-7 text-muted-foreground hover:text-foreground lg:flex cursor-pointer"
              aria-label="Collapse sidebar"
              title="Collapse menu"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
          <CreateNewMenu fullWidth />
        </div>
      )}

      {/* Navigation Links */}
      <nav aria-label="Main" className={cn('flex-1 overflow-y-auto', isCompact ? 'px-2 py-3' : 'px-3 py-4')}>
        <ul className={cn('flex flex-col', isCompact ? 'gap-3' : 'gap-4')}>
          {navGroups.map((group, groupIdx) => {
            const isGroupCollapsed = collapsed[group.label]
            const id = `nav-${group.label.replace(/\W+/g, '-')}`

            if (isCompact) {
              return (
                <li key={group.label}>
                  {groupIdx > 0 && <div className="my-1.5 border-t border-sidebar-border/60 mx-1" />}
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => {
                      const active =
                        pathname.startsWith(item.href) ||
                        (item.href === '/email/campaigns' && pathname.startsWith('/email/builder'))
                      const Icon = item.icon
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            title={item.label}
                            aria-label={item.label}
                            className={cn(
                              'flex size-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-ring mx-auto',
                              active
                                ? 'bg-accent font-semibold text-accent-foreground shadow-xs'
                                : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <Icon className="size-5 shrink-0" aria-hidden />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            }

            return (
              <li key={group.label}>
                <button
                  type="button"
                  aria-expanded={!isGroupCollapsed}
                  aria-controls={id}
                  onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {group.label}
                  <ChevronDown className={cn('size-3.5 transition-transform', isGroupCollapsed && '-rotate-90')} aria-hidden />
                </button>
                {!isGroupCollapsed && (
                  <ul id={id} className="mt-1 flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active =
                        pathname.startsWith(item.href) ||
                        (item.href === '/email/campaigns' && pathname.startsWith('/email/builder'))
                      const Icon = item.icon
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                              active
                                ? 'bg-accent font-medium text-accent-foreground'
                                : 'text-foreground/80 hover:bg-muted hover:text-foreground'
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
