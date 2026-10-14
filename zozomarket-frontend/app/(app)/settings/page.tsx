'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, NativeSelect, StatusBadge } from '@/components/app/shared'
import { cn } from '@/lib/utils'

const sections = ['Workspace Profile', 'Brand Settings', 'Team Members', 'Notifications', 'Email Sending Defaults', 'Social Publishing Preferences', 'Security', 'API Configuration'] as const
type S = (typeof sections)[number]

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}
function Toggle({ label, help, defaultOn = false }: { label: string; help?: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><p className="text-sm font-medium">{label}</p>{help && <p className="text-xs text-muted-foreground">{help}</p>}</div>
      <Switch checked={on} onCheckedChange={setOn} aria-label={label} />
    </div>
  )
}

function Body({ s }: { s: S }) {
  const [tz, setTz] = useState('America/New_York')
  const [font, setFont] = useState('Inter')
  const [tzSocial, setTzSocial] = useState('Best time (recommended)')
  const [role, setRole] = useState('Editor')
  switch (s) {
    case 'Workspace Profile': return <>
      <Field id="ws-name" label="Workspace name"><Input id="ws-name" defaultValue="Acme Coffee Co." required /></Field>
      <Field id="ws-url" label="Website" help="Used in email footers and link tracking."><Input id="ws-url" type="url" defaultValue="https://acme.coffee" /></Field>
      <Field id="ws-tz" label="Time zone"><NativeSelect label="Time zone" value={tz} onChange={setTz} options={['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']} /></Field>
      <Field id="ws-addr" label="Physical mailing address" help="Required by anti-spam laws in every marketing email."><Textarea id="ws-addr" defaultValue="12 Market St, Portland, OR 97201" /></Field>
    </>
    case 'Brand Settings': return <>
      <Field id="b-color" label="Primary brand color"><Input id="b-color" type="color" defaultValue="#f59e0b" className="w-24 p-1" /></Field>
      <Field id="b-font" label="Default font"><NativeSelect label="Default font" value={font} onChange={setFont} options={['Inter', 'Georgia', 'Helvetica', 'Arial']} /></Field>
      <Field id="b-logo" label="Logo" help="PNG or SVG, at least 200px wide."><Input id="b-logo" type="file" accept="image/*" /></Field>
    </>
    case 'Team Members': return <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {[['Jamie Doe', 'jamie@acme.coffee', 'Owner'], ['Riley Chen', 'riley@acme.coffee', 'Admin'], ['Sam Ortiz', 'sam@acme.coffee', 'Editor']].map(([n, e, r]) => (
          <li key={e} className="flex items-center gap-3 p-3 text-sm"><span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>{n.split(' ').map((x) => x[0]).join('')}</span><div className="flex-1"><p className="font-medium">{n}</p><p className="text-xs text-muted-foreground">{e}</p></div><StatusBadge status={r} /></li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1"><Field id="invite" label="Invite by email"><Input id="invite" type="email" placeholder="teammate@company.com" /></Field></div>
        <NativeSelect label="Role" value={role} onChange={setRole} options={['Admin', 'Editor', 'Viewer']} />
        <Button variant="outline" onClick={() => toast.success('Invitation sent (simulated)')}>Invite</Button>
      </div>
    </>
    case 'Notifications': return <>
      <Toggle label="Campaign sent" help="Email me when a campaign finishes sending." defaultOn />
      <Toggle label="Post published or failed" defaultOn />
      <Toggle label="Weekly performance digest" defaultOn />
      <Toggle label="New contact signups" />
    </>
    case 'Email Sending Defaults': return <>
      <Field id="from-name" label="Default from name"><Input id="from-name" defaultValue="Acme Coffee Co." /></Field>
      <Field id="from-email" label="Default from email" help="Must belong to a verified sending domain."><Input id="from-email" type="email" defaultValue="hello@mail.acme.coffee" /></Field>
      <Field id="reply" label="Reply-to address"><Input id="reply" type="email" defaultValue="support@acme.coffee" /></Field>
      <Toggle label="Track opens" defaultOn />
      <Toggle label="Track link clicks" defaultOn />
    </>
    case 'Social Publishing Preferences': return <>
      <Field id="post-time" label="Default scheduling"><NativeSelect label="Default scheduling" value={tzSocial} onChange={setTzSocial} options={['Best time (recommended)', 'Fixed time: 9:00 AM', 'Publish immediately']} /></Field>
      <Toggle label="Require approval before publishing" help="Editors' posts need an admin to approve." />
      <Toggle label="Auto-shorten links" defaultOn />
    </>
    case 'Security': return <>
      <Toggle label="Require two-factor authentication" help="Applies to all team members." defaultOn />
      <Toggle label="Single sign-on (SSO)" help="Available on Enterprise plans." />
      <Field id="session" label="Session timeout (minutes)"><Input id="session" type="number" min={15} defaultValue={60} /></Field>
    </>
    case 'API Configuration': return <>
      <Field id="api-key" label="Live API key" help="Keys are mock values in this prototype."><Input id="api-key" readOnly value="zm_live_••••••••••••3f9a" className="font-mono" /></Field>
      <Field id="api-hook" label="Webhook URL"><Input id="api-hook" type="url" placeholder="https://example.com/webhooks" /></Field>
      <Button variant="outline" className="w-fit" onClick={() => toast.success('New key generated (mock)')}>Regenerate key</Button>
    </>
  }
}

export default function SettingsPage() {
  const [s, setS] = useState<S>('Workspace Profile')
  return (
    <div>
      <PageHeader title="Workspace Settings" description="Configure your workspace, brand, and team." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {sections.map((x) => (
              <li key={x}>
                <button type="button" aria-current={s === x ? 'page' : undefined} onClick={() => setS(x)}
                  className={cn('h-9 w-full rounded-lg px-3 text-left text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring', s === x ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground')}>{x}</button>
              </li>
            ))}
          </ul>
        </nav>
        <Panel title={s}>
          <form key={s} className="flex max-w-xl flex-col gap-5" onSubmit={(e) => { e.preventDefault(); toast.success(`${s} saved`) }}>
            <Body s={s} />
            <div className="border-t border-border pt-4"><Button type="submit">Save Changes</Button></div>
          </form>
        </Panel>
      </div>
    </div>
  )
}
