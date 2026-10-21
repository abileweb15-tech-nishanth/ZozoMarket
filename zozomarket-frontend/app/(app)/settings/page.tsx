'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, NativeSelect, StatusBadge } from '@/components/app/shared'
import { api, type WorkspaceSettings } from '@/lib/api'
import { loadUser, saveSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const sections = ['Workspace Profile', 'Brand Settings', 'Team', 'Email Sending Defaults'] as const
type Section = (typeof sections)[number]
const timezones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London']
const fonts = ['Inter', 'Georgia', 'Helvetica', 'Arial']

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

function rememberName(name: string) {
  const user = loadUser()
  const accessToken = localStorage.getItem('zozo.accessToken')
  const refreshToken = localStorage.getItem('zozo.refreshToken')
  if (!user || !accessToken || !refreshToken) return
  saveSession({
    accessToken,
    refreshToken,
    tokenType: 'bearer',
    expiresIn: 0,
    user: { ...user, workspaceName: name },
  })
}

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('Workspace Profile')
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api.workspace.get()
      .then(setWorkspace)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the workspace'))
  }, [])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspace) return
    setPending(true)
    try {
      const saved = await api.workspace.update({
        name: workspace.name,
        website: workspace.website,
        timezone: workspace.timezone,
        mailingAddress: workspace.mailingAddress,
        brandColor: workspace.brandColor,
        font: workspace.font,
        fromName: workspace.fromName,
        fromEmail: workspace.fromEmail,
        replyTo: workspace.replyTo,
        trackOpens: workspace.trackOpens,
        trackClicks: workspace.trackClicks,
      })
      setWorkspace(saved)
      rememberName(saved.name)
      toast.success('Workspace saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the workspace')
    } finally {
      setPending(false)
    }
  }

  const patch = (next: Partial<WorkspaceSettings>) => setWorkspace((current) => current ? { ...current, ...next } : current)

  return (
    <div>
      <PageHeader title="Workspace Settings" description="The profile, brand, and sending defaults for this workspace." />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {!workspace && !error && <p className="text-sm text-muted-foreground">Loading workspace…</p>}
      {workspace && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Settings sections">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {sections.map((item) => (
                <li key={item}>
                  <button type="button" aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}
                    className={cn('h-9 w-full rounded-lg px-3 text-left text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring', section === item ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground')}>{item}</button>
                </li>
              ))}
            </ul>
          </nav>
          <Panel title={section}>
            <form className="flex max-w-xl flex-col gap-5" onSubmit={save}>
              {section === 'Workspace Profile' && <>
                <Field id="ws-name" label="Workspace name"><Input id="ws-name" value={workspace.name} required onChange={(e) => patch({ name: e.target.value })} /></Field>
                <Field id="ws-url" label="Website" help="Used in email footers and link tracking."><Input id="ws-url" type="url" value={workspace.website ?? ''} onChange={(e) => patch({ website: e.target.value })} /></Field>
                <Field id="ws-tz" label="Time zone"><NativeSelect label="Time zone" value={workspace.timezone} onChange={(value) => patch({ timezone: value })} options={timezones} /></Field>
                <Field id="ws-addr" label="Physical mailing address" help="Required by anti-spam laws in every marketing email."><Textarea id="ws-addr" value={workspace.mailingAddress} onChange={(e) => patch({ mailingAddress: e.target.value })} /></Field>
              </>}
              {section === 'Brand Settings' && <>
                <Field id="b-color" label="Primary brand color"><Input id="b-color" type="color" value={workspace.brandColor} className="w-24 p-1" onChange={(e) => patch({ brandColor: e.target.value })} /></Field>
                <Field id="b-font" label="Default font"><NativeSelect label="Default font" value={workspace.font} onChange={(value) => patch({ font: value })} options={fonts} /></Field>
                <Field id="b-logo" label="Logo" help="PNG, JPEG, GIF, or WebP. The file is stored on the server.">
                  {workspace.logoUrl && <img src={workspace.logoUrl} alt="Workspace logo" className="mb-2 h-16 w-auto rounded-md border border-border object-contain" />}
                  <Input id="b-logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setPending(true)
                    try {
                      const saved = await api.workspace.uploadLogo(file)
                      setWorkspace(saved)
                      toast.success('Logo saved')
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not upload the logo')
                    } finally {
                      setPending(false)
                    }
                  }} />
                </Field>
              </>}
              {section === 'Team' && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  <li className="flex items-center gap-3 p-3 text-sm">
                    <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground" aria-hidden>{workspace.ownerName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                    <div className="flex-1"><p className="font-medium">{workspace.ownerName}</p><p className="text-xs text-muted-foreground">{workspace.ownerEmail}</p></div>
                    <StatusBadge status="Owner" />
                  </li>
                </ul>
              )}
              {section === 'Email Sending Defaults' && <>
                <Field id="from-name" label="Default from name"><Input id="from-name" value={workspace.fromName} onChange={(e) => patch({ fromName: e.target.value })} /></Field>
                <Field id="from-email" label="Default from email" help="Must belong to a verified sending domain before live mail is turned on."><Input id="from-email" type="email" value={workspace.fromEmail ?? ''} onChange={(e) => patch({ fromEmail: e.target.value })} /></Field>
                <Field id="reply" label="Reply-to address"><Input id="reply" type="email" value={workspace.replyTo ?? ''} onChange={(e) => patch({ replyTo: e.target.value })} /></Field>
                <div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">Track opens</p><Switch checked={workspace.trackOpens} onCheckedChange={(on) => patch({ trackOpens: on })} aria-label="Track opens" /></div>
                <div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">Track link clicks</p><Switch checked={workspace.trackClicks} onCheckedChange={(on) => patch({ trackClicks: on })} aria-label="Track link clicks" /></div>
              </>}
              {section !== 'Team' && <div className="border-t border-border pt-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button></div>}
            </form>
          </Panel>
        </div>
      )}
    </div>
  )
}
