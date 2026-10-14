'use client'

import { useState } from 'react'
import { AtSign, Cloud, Code2, Globe, KeyRound, Radar, Webhook, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, StatusBadge, SimulatedNote } from '@/components/app/shared'

type Integration = { id: string; name: string; category: string; desc: string; icon: LucideIcon; status: 'Connected' | 'Not connected' | 'Sandbox' }
const initial: Integration[] = [
  { id: 'ses', name: 'Amazon SES', category: 'Email Delivery', desc: 'Send campaigns through your own Amazon SES account.', icon: Cloud, status: 'Sandbox' },
  { id: 'social', name: 'Social platform accounts', category: 'Social Media', desc: 'Instagram, Facebook, LinkedIn, X, YouTube, Pinterest, TikTok.', icon: AtSign, status: 'Connected' },
  { id: 'wp', name: 'WordPress', category: 'Website & Lead Capture', desc: 'Embed forms and sync signups from your WordPress site.', icon: Globe, status: 'Not connected' },
  { id: 'track', name: 'Website Tracking', category: 'Website & Lead Capture', desc: 'Track visits and conversions from email and social clicks.', icon: Radar, status: 'Connected' },
  { id: 'api', name: 'API Keys', category: 'Developer Tools', desc: 'Create keys to access ZozoMarket programmatically.', icon: KeyRound, status: 'Not connected' },
  { id: 'hooks', name: 'Webhooks', category: 'Developer Tools', desc: 'Receive events for opens, clicks, and new contacts.', icon: Webhook, status: 'Not connected' },
]
const categories = ['Email Delivery', 'Social Media', 'Website & Lead Capture', 'Developer Tools']

const dns = [
  { type: 'TXT (SPF)', host: 'mail.acme.coffee', value: 'v=spf1 include:amazonses.com ~all', status: 'Connected' },
  { type: 'CNAME (DKIM)', host: 'abc123._domainkey.acme.coffee', value: 'abc123.dkim.amazonses.com', status: 'Connected' },
  { type: 'TXT (DMARC)', host: '_dmarc.acme.coffee', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@acme.coffee', status: 'Pending' },
]

export default function IntegrationsPage() {
  const [items, setItems] = useState(initial)
  const [open, setOpen] = useState<Integration | null>(null)

  return (
    <div>
      <PageHeader title="Integrations" description="Connect delivery, publishing, and data tools." />
      <div className="mb-8"><SimulatedNote>All connection states on this page are simulated for the prototype.</SimulatedNote></div>
      <div className="flex flex-col gap-8">
        {categories.map((cat) => (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{cat}</h2>
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.filter((i) => i.category === cat).map((i) => (
                <li key={i.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-muted"><i.icon className="size-5" aria-hidden /></span>
                    <div className="flex-1"><h3 className="text-sm font-semibold">{i.name}</h3><p className="text-sm leading-relaxed text-muted-foreground">{i.desc}</p></div>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <StatusBadge status={i.status === 'Sandbox' ? 'Sandbox' : i.status} />
                    <Button variant={i.status === 'Not connected' ? 'default' : 'outline'} onClick={() => setOpen(i)}>{i.status === 'Not connected' ? 'Connect' : 'Configure'}</Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{open?.name}</DialogTitle><DialogDescription>{open?.desc}</DialogDescription></DialogHeader>
          {open?.id === 'ses' ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5"><Label htmlFor="domain">Sending domain</Label><Input id="domain" defaultValue="mail.acme.coffee" /></div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted"><tr>{['Record', 'Host', 'Value', 'Status'].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-border">
                    {dns.map((d) => <tr key={d.type}><td className="px-3 py-2 font-medium whitespace-nowrap">{d.type}</td><td className="px-3 py-2 font-mono">{d.host}</td><td className="px-3 py-2 font-mono break-all">{d.value}</td><td className="px-3 py-2"><StatusBadge status={d.status === 'Connected' ? 'Verified' : d.status} /></td></tr>)}
                  </tbody>
                </table>
              </div>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li><strong className="text-foreground">SPF</strong> authorizes Amazon SES to send on behalf of your domain.</li>
                <li><strong className="text-foreground">DKIM</strong> cryptographically signs messages so inboxes can verify them.</li>
                <li><strong className="text-foreground">DMARC</strong> tells receivers how to handle unauthenticated mail.</li>
              </ul>
              <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span>Production access</span><StatusBadge status="Sandbox" />
              </div>
              <p className="text-xs text-muted-foreground">SES accounts start in sandbox mode and can only send to verified addresses until AWS grants production access.</p>
            </div>
          ) : open?.id === 'api' || open?.id === 'hooks' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="int-input">{open.id === 'api' ? 'Key name' : 'Endpoint URL'}</Label>
              <Input id="int-input" placeholder={open.id === 'api' ? 'Production key' : 'https://example.com/webhooks/zozo'} />
            </div>
          ) : <SimulatedNote>Clicking connect will simulate an authorization for {open?.name}.</SimulatedNote>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
            <Button onClick={() => { setItems((it) => it.map((x) => x.id === open?.id && x.status === 'Not connected' ? { ...x, status: 'Connected' } : x)); toast.success(`${open?.name} saved (simulated)`); setOpen(null) }}>{open?.status === 'Not connected' ? 'Connect (demo)' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
