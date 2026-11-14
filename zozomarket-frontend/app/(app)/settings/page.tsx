'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, NativeSelect, StatusBadge } from '@/components/app/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type WorkspaceSettings } from '@/lib/api'
import { loadUser, saveSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const sections = [
  'Workspace Profile',
  'Brand Settings',
  'Team',
  'Email Sending Defaults',
  'AWS Settings',
] as const
type Section = (typeof sections)[number]

const timezones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London']
const fonts = ['Inter', 'Georgia', 'Helvetica', 'Arial']
const awsRegions = [
  { value: 'us-east-1', label: 'US East (N. Virginia) — us-east-1' },
  { value: 'us-east-2', label: 'US East (Ohio) — us-east-2' },
  { value: 'us-west-1', label: 'US West (N. California) — us-west-1' },
  { value: 'us-west-2', label: 'US West (Oregon) — us-west-2' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) — ap-south-1' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo) — ap-northeast-1' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul) — ap-northeast-2' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore) — ap-southeast-1' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney) — ap-southeast-2' },
  { value: 'ca-central-1', label: 'Canada (Central) — ca-central-1' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt) — eu-central-1' },
  { value: 'eu-west-1', label: 'Europe (Ireland) — eu-west-1' },
  { value: 'eu-west-2', label: 'Europe (London) — eu-west-2' },
  { value: 'eu-west-3', label: 'Europe (Paris) — eu-west-3' },
  { value: 'eu-north-1', label: 'Europe (Stockholm) — eu-north-1' },
  { value: 'sa-east-1', label: 'South America (São Paulo) — sa-east-1' },
]

function Field({
  id,
  label,
  subtitle,
  help,
  children,
}: {
  id: string
  label: string
  subtitle?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <Label htmlFor={id} className="mb-2 text-sm font-medium text-foreground">
        {label}
        {subtitle && <span className="ml-1.5 font-normal text-muted-foreground">{subtitle}</span>}
      </Label>
      {children}
      {help && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{help}</p>}
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
  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [replacingAccessKey, setReplacingAccessKey] = useState(false)
  const [replacingSecretKey, setReplacingSecretKey] = useState(false)

  useEffect(() => {
    api.workspace
      .get()
      .then(setWorkspace)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the workspace'))
  }, [])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspace) return
    setPending(true)
    try {
      if (section === 'AWS Settings') {
        // Also persist sender settings if edited on the AWS connection screen
        await api.workspace.update({
          fromName: workspace.fromName,
          fromEmail: workspace.fromEmail,
          replyTo: workspace.replyTo,
          trackOpens: workspace.trackOpens,
          trackClicks: workspace.trackClicks,
        })
        const saved = await api.workspace.updateAws({
          awsAccessKeyId: awsAccessKey.trim() || undefined,
          awsSecretAccessKey: awsSecretKey.trim() || undefined,
          awsRegion: workspace.awsRegion,
          awsEncryptionDisabled: workspace.awsEncryptionDisabled,
          awsS3MediaEnabled: workspace.awsS3MediaEnabled,
        })
        setWorkspace(saved)
        setAwsAccessKey('')
        setAwsSecretKey('')
        setReplacingAccessKey(false)
        setReplacingSecretKey(false)
        if (saved.awsProvisioningWarnings && saved.awsProvisioningWarnings.length > 0) {
          toast.success('AWS connection saved. Some optional resources could not be configured automatically.')
        } else {
          toast.success('AWS connection & tracking infrastructure saved')
        }
      } else {
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
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the workspace')
    } finally {
      setPending(false)
    }
  }

  const patch = (next: Partial<WorkspaceSettings>) =>
    setWorkspace((current) => (current ? { ...current, ...next } : current))

  const isAwsConfigured = Boolean(workspace?.hasAwsAccessKey && workspace?.hasAwsSecretKey)

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <PageHeader
        title="Workspace Settings"
        description="Manage your workspace profile, brand identity, sender defaults, and Amazon SES connection."
      />
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {!workspace && !error && (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-6 w-48" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
      )}
      {workspace && (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[240px_1fr]">
          <nav
            aria-label="Settings sections"
            className="rounded-xl border border-border bg-card p-2 shadow-2xs"
          >
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {sections.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    aria-current={section === item ? 'page' : undefined}
                    onClick={() => setSection(item)}
                    className={cn(
                      'flex h-10 w-full items-center justify-between rounded-lg px-3.5 text-left text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                      section === item
                        ? 'bg-accent font-semibold text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <span>{item}</span>
                    {item === 'AWS Settings' && (
                      <span
                        className={cn(
                          'ml-2 size-2 rounded-full',
                          isAwsConfigured ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                        title={isAwsConfigured ? 'AWS SES Connected' : 'AWS Keys Not Configured'}
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <form className="flex flex-col gap-6" onSubmit={save}>
            {section === 'Workspace Profile' && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                <div className="mb-6 border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-foreground">Workspace Profile</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    General organization details used across campaigns and compliance footers.
                  </p>
                </div>
                <div className="grid max-w-2xl grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Field id="ws-name" label="Workspace Name">
                      <Input
                        id="ws-name"
                        className="h-10"
                        value={workspace.name}
                        required
                        onChange={(e) => patch({ name: e.target.value })}
                      />
                    </Field>
                    <Field id="ws-tz" label="Time Zone">
                      <NativeSelect
                        label="Time zone"
                        value={workspace.timezone}
                        onChange={(value) => patch({ timezone: value })}
                        options={timezones}
                        className="h-10 w-full"
                      />
                    </Field>
                  </div>
                  <Field id="ws-url" label="Website URL" help="Used in email footers and link tracking.">
                    <Input
                      id="ws-url"
                      type="url"
                      className="h-10"
                      placeholder="https://example.com"
                      value={workspace.website ?? ''}
                      onChange={(e) => patch({ website: e.target.value })}
                    />
                  </Field>
                  <Field
                    id="ws-addr"
                    label="Physical Mailing Address"
                    help="Required by anti-spam laws in every marketing email."
                  >
                    <Textarea
                      id="ws-addr"
                      rows={3}
                      value={workspace.mailingAddress}
                      onChange={(e) => patch({ mailingAddress: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}

            {section === 'Brand Settings' && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                <div className="mb-6 border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-foreground">Brand Settings</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default colors, typography, and logo applied to new email templates.
                  </p>
                </div>
                <div className="grid max-w-2xl grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Field id="b-color" label="Primary Brand Color">
                      <div className="flex items-center gap-3">
                        <Input
                          id="b-color"
                          type="color"
                          value={workspace.brandColor}
                          className="h-10 w-16 cursor-pointer p-1"
                          onChange={(e) => patch({ brandColor: e.target.value })}
                        />
                        <Input
                          type="text"
                          value={workspace.brandColor}
                          onChange={(e) => patch({ brandColor: e.target.value })}
                          className="h-10 font-mono text-sm"
                          aria-label="Brand color hex"
                        />
                      </div>
                    </Field>
                    <Field id="b-font" label="Default Font">
                      <NativeSelect
                        label="Default font"
                        value={workspace.font}
                        onChange={(value) => patch({ font: value })}
                        options={fonts}
                        className="h-10 w-full"
                      />
                    </Field>
                  </div>
                  <Field
                    id="b-logo"
                    label="Workspace Logo"
                    help="PNG, JPEG, GIF, or WebP. The file is stored on the server."
                  >
                    {workspace.logoUrl && (
                      <div className="mb-3 inline-flex rounded-lg border border-border bg-muted/20 p-3">
                        <img
                          src={workspace.logoUrl}
                          alt="Workspace logo"
                          className="h-14 w-auto object-contain"
                        />
                      </div>
                    )}
                    <Input
                      id="b-logo"
                      type="file"
                      className="h-10"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={async (e) => {
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
                      }}
                    />
                  </Field>
                </div>
              </div>
            )}

            {section === 'Team' && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                <div className="mb-6 border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-foreground">Team Members</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    People with access to manage campaigns and settings in this workspace.
                  </p>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  <li className="flex items-center gap-3.5 p-4 text-sm">
                    <span
                      className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                      aria-hidden
                    >
                      {workspace.ownerName
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{workspace.ownerName}</p>
                      <p className="text-xs text-muted-foreground">{workspace.ownerEmail}</p>
                    </div>
                    <StatusBadge status="Owner" />
                  </li>
                </ul>
              </div>
            )}

            {section === 'Email Sending Defaults' && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                <div className="mb-6 border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-foreground">Email Sending Defaults</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default sender identity and engagement tracking for all campaigns and automations.
                  </p>
                </div>
                <div className="grid max-w-2xl grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Field
                      id="from-email"
                      label="From Email"
                      help="Must belong to a verified Amazon SES identity before sending live mail."
                    >
                      <Input
                        id="from-email"
                        type="email"
                        className="h-10"
                        placeholder="info@yourdomain.com"
                        value={workspace.fromEmail ?? ''}
                        onChange={(e) => patch({ fromEmail: e.target.value })}
                      />
                    </Field>
                    <Field
                      id="from-name"
                      label="From Name"
                      help="Displayed in your subscribers' inbox alongside the From Email."
                    >
                      <Input
                        id="from-name"
                        className="h-10"
                        placeholder="ZozoMarket"
                        value={workspace.fromName}
                        onChange={(e) => patch({ fromName: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field
                    id="reply"
                    label="Reply-To Address"
                    help="Optional. Replies from subscribers will be routed to this email address."
                  >
                    <Input
                      id="reply"
                      type="email"
                      className="h-10"
                      placeholder="support@yourdomain.com"
                      value={workspace.replyTo ?? ''}
                      onChange={(e) => patch({ replyTo: e.target.value })}
                    />
                  </Field>
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Track email opens</p>
                        <p className="text-xs text-muted-foreground">
                          Embeds an invisible tracking pixel to measure open rates.
                        </p>
                      </div>
                      <Switch
                        checked={workspace.trackOpens}
                        onCheckedChange={(on) => patch({ trackOpens: on })}
                        aria-label="Track opens"
                      />
                    </div>
                    <div className="border-t border-border/60 pt-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Track link clicks</p>
                        <p className="text-xs text-muted-foreground">
                          Rewrites links in outbound emails to record subscriber clicks.
                        </p>
                      </div>
                      <Switch
                        checked={workspace.trackClicks}
                        onCheckedChange={(on) => patch({ trackClicks: on })}
                        aria-label="Track link clicks"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === 'AWS Settings' && (
              <div className="flex flex-col gap-6">
                {/* Top Header Bar matching reference image */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-6 py-4 shadow-2xs">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Connection Provider</p>
                    <h2 className="text-lg font-semibold text-foreground">Edit AWS SES Connection</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                        isAwsConfigured
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          isAwsConfigured ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                      />
                      {isAwsConfigured ? 'Connected' : 'Setup Required'}
                    </span>
                    <div className="flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-bold tracking-tight text-foreground shadow-2xs">
                      <span>aws</span>
                      <span className="ml-0.5 text-amber-500">•</span>
                    </div>
                  </div>
                </div>

                {/* Card 1: Sender Settings (like reference screenshot) */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                  <div className="mb-5 border-b border-border pb-3.5">
                    <h3 className="text-sm font-semibold text-foreground">Sender Settings</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Used as the verified sender identity for campaigns and automations sent via Amazon SES.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Field
                      id="aws-from-email"
                      label="From Email"
                      help="Must be a verified identity in your Amazon SES account."
                    >
                      <Input
                        id="aws-from-email"
                        type="email"
                        className="h-10"
                        placeholder="info@zozothemes.com"
                        value={workspace.fromEmail ?? ''}
                        onChange={(e) => patch({ fromEmail: e.target.value })}
                      />
                    </Field>
                    <Field
                      id="aws-from-name"
                      label="From Name"
                      help="Sender name shown to recipients in their inbox."
                    >
                      <Input
                        id="aws-from-name"
                        type="text"
                        className="h-10"
                        placeholder="zozo_user"
                        value={workspace.fromName}
                        onChange={(e) => patch({ fromName: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>

                {/* Card 2: Amazon SES API Settings (matching reference screenshot) */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-2xs">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Amazon SES API Settings</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Credentials are stored securely in the database and automatically configure SES, CloudWatch, and SQS.
                      </p>
                    </div>
                    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                      <span className="rounded-md bg-foreground px-3 py-1 font-medium text-background shadow-2xs">
                        Store in Database
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                      <Field
                        id="aws-access-key"
                        label="Access Key"
                        help={
                          workspace.hasAwsAccessKey && !replacingAccessKey
                            ? 'Saved and hidden. This credential is never sent back to your browser - press Replace to enter a new one.'
                            : 'IAM user Access Key ID (e.g. AKIA...).'
                        }
                      >
                        {workspace.hasAwsAccessKey && !replacingAccessKey ? (
                          <div className="flex items-center gap-2.5">
                            <Input
                              id="aws-access-key"
                              type="password"
                              className="h-10 flex-1 bg-muted/40 font-mono tracking-widest"
                              value="••••••••••••••••••••"
                              disabled
                              readOnly
                              aria-label="Saved AWS Access Key"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 shrink-0 px-4"
                              onClick={() => {
                                setReplacingAccessKey(true)
                                setAwsAccessKey('')
                              }}
                            >
                              Replace
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <Input
                              id="aws-access-key"
                              type="text"
                              className="h-10 flex-1 font-mono"
                              placeholder="Enter AWS Access Key ID"
                              value={awsAccessKey}
                              onChange={(e) => setAwsAccessKey(e.target.value)}
                              autoComplete="off"
                            />
                            {workspace.hasAwsAccessKey && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 shrink-0 px-3.5"
                                onClick={() => {
                                  setReplacingAccessKey(false)
                                  setAwsAccessKey('')
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        )}
                      </Field>

                      <Field
                        id="aws-secret-key"
                        label="Secret Key"
                        help={
                          workspace.hasAwsSecretKey && !replacingSecretKey
                            ? 'Saved and hidden. This credential is never sent back to your browser - press Replace to enter a new one.'
                            : 'IAM user Secret Access Key.'
                        }
                      >
                        {workspace.hasAwsSecretKey && !replacingSecretKey ? (
                          <div className="flex items-center gap-2.5">
                            <Input
                              id="aws-secret-key"
                              type="password"
                              className="h-10 flex-1 bg-muted/40 font-mono tracking-widest"
                              value="••••••••••••••••••••"
                              disabled
                              readOnly
                              aria-label="Saved AWS Secret Key"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 shrink-0 px-4"
                              onClick={() => {
                                setReplacingSecretKey(true)
                                setAwsSecretKey('')
                              }}
                            >
                              Replace
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <Input
                              id="aws-secret-key"
                              type="password"
                              className="h-10 flex-1 font-mono"
                              placeholder="Enter AWS Secret Access Key"
                              value={awsSecretKey}
                              onChange={(e) => setAwsSecretKey(e.target.value)}
                              autoComplete="new-password"
                            />
                            {workspace.hasAwsSecretKey && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 shrink-0 px-3.5"
                                onClick={() => {
                                  setReplacingSecretKey(false)
                                  setAwsSecretKey('')
                                }}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Store Media &amp; Email Images in Amazon S3
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Automatically creates and configures an S3 media bucket when you save connection settings.
                          </p>
                        </div>
                        <Switch
                          checked={workspace.awsS3MediaEnabled}
                          onCheckedChange={(on) => patch({ awsS3MediaEnabled: on })}
                          aria-label="Store Media and Email Images in Amazon S3"
                        />
                      </div>

                      <div className="border-t border-border/60 pt-3">
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground select-none">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input accent-primary"
                            checked={workspace.awsEncryptionDisabled}
                            onChange={(e) => patch({ awsEncryptionDisabled: e.target.checked })}
                          />
                          <span>Disable Encryption for Secret Key (Not Recommended)</span>
                        </label>
                      </div>
                    </div>

                    <Field
                      id="aws-region"
                      label="Region"
                      subtitle="(default: US East, N. Virginia / us-east-1)"
                      help="Select the AWS region where your SES identities are verified."
                    >
                      <select
                        id="aws-region"
                        aria-label="AWS Region"
                        value={workspace.awsRegion}
                        onChange={(e) => patch({ awsRegion: e.target.value })}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {awsRegions.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    {/* Auto-configured infrastructure summary */}
                    <div className="rounded-lg border border-border/80 bg-muted/30 p-4">
                      <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Auto-Configured AWS Pipeline
                      </p>
                      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border border-border/60 bg-background p-3">
                          <span className="text-muted-foreground">Configuration Set</span>
                          <p className="mt-1 font-mono font-medium text-foreground">
                            {workspace.sesConfigurationSet || 'zozomarket-tracking'}
                          </p>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                          <span className="text-muted-foreground">CloudWatch Dimension</span>
                          <p className="mt-1 font-mono font-medium text-foreground">
                            campaign = zozomarket
                          </p>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                          <span className="text-muted-foreground">SQS Event Queue</span>
                          <p
                            className="mt-1 truncate font-mono font-medium text-foreground"
                            title={workspace.sqsQueueUrl || 'Auto-created on save'}
                          >
                            {workspace.sqsQueueUrl
                              ? workspace.sqsQueueUrl.split('/').pop()
                              : 'Auto-created on save'}
                          </p>
                        </div>
                        <div className="rounded-md border border-border/60 bg-background p-3">
                          <span className="text-muted-foreground">Email Images & Media</span>
                          <p
                            className="mt-1 truncate font-mono font-medium text-foreground"
                            title={
                              workspace.awsS3MediaEnabled
                                ? workspace.s3BucketName || 'Auto-created S3 bucket on save'
                                : 'Local Storage + Inline MIME (CID)'
                            }
                          >
                            {workspace.awsS3MediaEnabled
                              ? workspace.s3BucketName || 'S3 (Auto-created on save)'
                              : 'Inline MIME (CID)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section !== 'Team' && (
              <div className="flex items-center justify-start">
                <Button type="submit" size="lg" className="h-10 px-6 font-medium" disabled={pending}>
                  {pending
                    ? 'Saving…'
                    : section === 'AWS Settings'
                      ? 'Save Connection Settings'
                      : 'Save Changes'}
                </Button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
