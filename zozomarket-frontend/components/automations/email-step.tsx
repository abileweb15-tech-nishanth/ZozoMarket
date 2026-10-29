'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/app/shared'
import { api, type FlowNode, type Template, type WorkspaceSettings } from '@/lib/api'
import { ensureFooter, MERGE_TAGS, starterLayouts } from '@/lib/email-design'
import { cn } from '@/lib/utils'

type Config = Record<string, unknown>

const MODES = ['Template', 'Write HTML'] as const

export function EmailStepSettings({ automationId, node, templates, workspace, onConfig, onTemplateCreated, saveDraft }: {
  automationId: string
  node: FlowNode
  templates: Template[]
  workspace: WorkspaceSettings | null
  onConfig: (config: Config) => void
  onTemplateCreated: (template: Template) => void
  saveDraft: () => Promise<boolean>
}) {
  const config = node.config as Record<string, string | undefined>
  const [mode, setMode] = useState<(typeof MODES)[number]>(config.html && !config.templateId ? 'Write HTML' : 'Template')
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [testTo, setTestTo] = useState(workspace?.ownerEmail ?? '')

  useEffect(() => {
    let active = true
    templates.forEach((template) => {
      if (thumbs[template.id]) return
      api.templates.previewHtml(template.id)
        .then((html) => { if (active) setThumbs((current) => ({ ...current, [template.id]: html })) })
        .catch(() => undefined)
    })
    starterLayouts.forEach((layout) => {
      const key = `starter-${layout.key}`
      if (thumbs[key]) return
      api.templates.render({ design: layout.design(workspace ?? undefined), preheader: layout.preheader })
        .then((rendered) => { if (active) setThumbs((current) => ({ ...current, [key]: rendered.html })) })
        .catch(() => undefined)
    })
    return () => { active = false }
  }, [templates, workspace])

  const set = (patch: Config) => onConfig({ ...node.config, ...patch })

  const pickSaved = (template: Template) => {
    set({ templateId: template.id, html: '', subject: config.subject || template.subject || '' })
  }

  const pickStarter = async (key: string) => {
    const layout = starterLayouts.find((item) => item.key === key)
    if (!layout) return
    setBusy(key)
    try {
      const created = await api.templates.create({
        name: layout.name,
        category: layout.category,
        subject: layout.subject,
        preheader: layout.preheader,
        design: ensureFooter(layout.design(workspace ?? undefined), workspace ?? undefined),
      })
      onTemplateCreated(created)
      setThumbs((current) => ({ ...current, [created.id]: current[`starter-${key}`] ?? '' }))
      set({ templateId: created.id, html: '', subject: config.subject || created.subject || layout.subject })
      toast.success(`${layout.name} saved to your templates`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use this layout')
    } finally {
      setBusy('')
    }
  }

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error('Enter an address for the test')
      return
    }
    setBusy('test')
    try {
      if (!(await saveDraft())) return
      await api.automations.test(automationId, testTo.trim(), node.id)
      toast.success(`Test of “${node.label}” sent to ${testTo.trim()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The test was not sent')
    } finally {
      setBusy('')
    }
  }

  const selected = typeof config.templateId === 'string' ? config.templateId : ''
  const previewHtml = mode === 'Template' ? thumbs[selected] ?? '' : String(config.html ?? '')

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Subject
        <Input value={String(config.subject ?? '')} placeholder="Welcome, {{first_name}}" onChange={(event) => set({ subject: event.target.value })} />
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">Merge tags: {MERGE_TAGS.map((tag) => tag.value).join(', ')}</p>

      <Segmented label="Email content" value={mode} onChange={(value) => {
        setMode(value)
        if (value === 'Write HTML') set({ templateId: '' })
      }} options={MODES} />

      {mode === 'Template' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Your templates</p>
          {templates.length === 0 && <p className="text-sm text-muted-foreground">No saved templates yet. Pick a starter layout below.</p>}
          <div className="grid grid-cols-2 gap-3">
            {templates.map((template) => (
              <TemplateCard key={template.id} name={template.name} html={thumbs[template.id]} active={selected === template.id} onPick={() => pickSaved(template)} />
            ))}
          </div>
          <p className="mt-2 text-sm font-medium">Starter layouts</p>
          <div className="grid grid-cols-2 gap-3">
            {starterLayouts.map((layout) => (
              <TemplateCard
                key={layout.key}
                name={layout.name}
                html={thumbs[`starter-${layout.key}`]}
                active={false}
                busy={busy === layout.key}
                onPick={() => { void pickStarter(layout.key) }}
              />
            ))}
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email HTML
          <textarea
            className="min-h-48 rounded-lg border border-input bg-background p-3 font-mono text-xs"
            value={String(config.html ?? '')}
            placeholder="<h1>Hi {{first_name}}</h1>"
            onChange={(event) => set({ html: event.target.value, templateId: '' })}
          />
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Preview</p>
        {previewHtml ? (
          <iframe key={previewHtml} title="Email preview" sandbox="" srcDoc={previewHtml} className="h-80 w-full rounded-lg border border-border bg-white" />
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {mode === 'Template' ? 'Pick a template to preview it.' : 'Write some HTML to preview it.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Send a test of this email</p>
        <p className="text-xs text-muted-foreground">Saves the draft first. The test does not enroll anyone.</p>
        <div className="flex gap-2">
          <Input type="email" aria-label="Test address" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" />
          <Button disabled={busy === 'test'} onClick={() => { void sendTest() }}>{busy === 'test' ? 'Sending…' : 'Send test'}</Button>
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ name, html, active, busy, onPick }: { name: string; html?: string; active: boolean; busy?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={busy}
      onClick={onPick}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-foreground/30',
      )}
    >
      <span className="relative block aspect-[4/5] overflow-hidden bg-white">
        {html ? (
          <iframe title="" sandbox="" srcDoc={html} tabIndex={-1} className="pointer-events-none absolute top-0 left-0 h-[300%] w-[300%] origin-top-left scale-[0.3333] border-0 bg-white" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{busy ? 'Saving…' : 'Loading…'}</span>
        )}
        {active && <span className="absolute top-2 right-2 rounded-full bg-primary p-1 text-primary-foreground"><Check className="size-3" /></span>}
      </span>
      <span className="truncate px-2 py-1.5 text-xs font-medium">{name}</span>
    </button>
  )
}
