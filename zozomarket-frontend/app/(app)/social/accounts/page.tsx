'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, StatusBadge, SimulatedNote } from '@/components/app/shared'
import { PlatformBadge } from '@/components/app/platform-badge'
import type { Platform } from '@/lib/mock-data'

type Account = { platform: Platform; handle: string | null; status: 'Connected' | 'Needs attention' | 'Not connected' }
const initial: Account[] = [
  { platform: 'Instagram', handle: '@acmecoffee', status: 'Connected' },
  { platform: 'Facebook', handle: 'Acme Coffee Co.', status: 'Connected' },
  { platform: 'LinkedIn', handle: 'Acme Coffee Company', status: 'Needs attention' },
  { platform: 'X', handle: '@acme_coffee', status: 'Connected' },
  { platform: 'YouTube', handle: null, status: 'Not connected' },
  { platform: 'Pinterest', handle: null, status: 'Not connected' },
  { platform: 'TikTok', handle: '@acmecoffee', status: 'Connected' },
]

export default function SocialAccountsPage() {
  const [accounts, setAccounts] = useState(initial)
  const [authFor, setAuthFor] = useState<Platform | null>(null)
  const set = (p: Platform, patch: Partial<Account>) => setAccounts((a) => a.map((x) => (x.platform === p ? { ...x, ...patch } : x)))

  return (
    <div>
      <PageHeader title="Social Accounts" description="Connect the profiles you publish to and measure." />
      <div className="mb-6"><SimulatedNote>This is a prototype. Connections are simulated — no real social accounts are linked.</SimulatedNote></div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <li key={a.platform} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <PlatformBadge platform={a.platform} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{a.platform}</h2>
                <p className="truncate text-sm text-muted-foreground">{a.handle ?? 'No account linked'}</p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <div className="flex gap-2">
              {a.status === 'Not connected' && <Button className="flex-1" onClick={() => setAuthFor(a.platform)}>Connect</Button>}
              {a.status === 'Needs attention' && <Button className="flex-1" onClick={() => setAuthFor(a.platform)}>Reconnect</Button>}
              {a.status === 'Connected' && <Button variant="outline" className="flex-1" onClick={() => toast(`Managing ${a.platform} (simulated)`)}>Manage</Button>}
              {a.status !== 'Not connected' && (
                <Button variant="ghost" onClick={() => { set(a.platform, { status: 'Not connected', handle: null }); toast(`${a.platform} disconnected`) }}>Disconnect</Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!authFor} onOpenChange={(o) => !o && setAuthFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorize {authFor}</DialogTitle>
            <DialogDescription>ZozoMarket would request permission to publish posts and read insights.</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>Read profile information</li>
            <li>Publish and schedule posts</li>
            <li>Read post engagement metrics</li>
          </ul>
          <SimulatedNote>Mock authorization — no data is sent to {authFor}.</SimulatedNote>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthFor(null)}>Cancel</Button>
            <Button onClick={() => { if (authFor) set(authFor, { status: 'Connected', handle: '@acmecoffee (demo)' }); toast.success(`${authFor} connected (simulated)`); setAuthFor(null) }}>Authorize (demo)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
