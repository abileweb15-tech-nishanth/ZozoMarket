'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog, StatusBadge } from '@/components/app/shared'
import { api, type FlowNode, type LeadForm, type Template, type WorkspaceSettings } from '@/lib/api'
import {
  buildTree, countBranch, defaultStep, deleteUnreachable, ensureTrigger, hasChild, layout, placeAfter,
  removeStep, withEdges, type Graph, type Handle, type StepKind, type TreeNode,
} from '@/lib/automation-tree'
import { cn } from '@/lib/utils'
import { EmailStepSettings } from './email-step'
import { CONDITION_OPTIONS, LATER_TRIGGERS, PICKER, STEP_META, TRIGGERS, summary } from './steps'

type Problems = { byNode: Record<string, string[]>; general: string[] }
const noProblems: Problems = { byNode: {}, general: [] }

export default function AutomationBuilder({ id }: { id: string }) {
  const router = useRouter()
  const [name, setName] = useState('Automation')
  const [status, setStatus] = useState('Draft')
  const [triggerType, setTriggerType] = useState('contact_subscribed')
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>({})
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] })
  const [selected, setSelected] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FlowNode | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [forms, setForms] = useState<LeadForm[]>([])
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null)
  const [problems, setProblems] = useState<Problems>(noProblems)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.automations.get(id), api.templates.list(), api.forms.list(), api.workspace.get()])
      .then(([automation, templateRows, formRows, workspaceRow]) => {
        if (!active) return
        const type = automation.triggerType || 'contact_subscribed'
        const label = TRIGGERS.find((item) => item.type === type)?.label ?? 'Trigger'
        setName(automation.name)
        setStatus(automation.status)
        setTriggerType(type)
        setTriggerConfig(Object.fromEntries(Object.entries(automation.triggerConfig ?? {}).map(([key, value]) => [key, String(value ?? '')])))
        setGraph(ensureTrigger(withEdges({ nodes: automation.nodes ?? [], edges: automation.edges ?? [] }), label))
        setTemplates(templateRows)
        setForms(formRows)
        setWorkspace(workspaceRow)
        setReady(true)
        return api.automations.validate(id)
      })
      .then((check) => { if (active && check) setProblems(toProblems(check.problems)) })
      .catch((err: Error) => toast.error(err.message))
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = useCallback((next: Graph | ((current: Graph) => Graph)) => {
    setGraph(next)
    setDirty(true)
  }, [])

  const { root, unreachable } = useMemo(() => buildTree(graph), [graph])
  const selectedNode = graph.nodes.find((node) => node.id === selected) ?? null
  const ctx = { triggerType, triggerConfig, templates, forms }

  const patchNode = (nodeId: string, patch: Partial<FlowNode>) =>
    change((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node) }))

  const addStep = (parentId: string, handle: Handle, kind: StepKind) => {
    const step = defaultStep(kind)
    change((current) => placeAfter(current, parentId, handle, step))
    setSelected(step.id)
  }

  const moveHere = (parentId: string, handle: Handle) => {
    const node = graph.nodes.find((item) => item.id === moving)
    if (!node) return
    change((current) => placeAfter(current, parentId, handle, node))
    setMoving(null)
  }

  const deleteStep = (node: FlowNode) => {
    if (node.kind === 'Condition' && countBranch(graph, node.id) > 3) {
      setConfirmDelete(node)
      return
    }
    change((current) => removeStep(current, node.id))
    setSelected(null)
  }

  const save = async (): Promise<boolean> => {
    setBusy(true)
    try {
      const laidOut = layout(graph)
      const trigger = TRIGGERS.find((item) => item.type === triggerType)
      const saved = await api.automations.update(id, {
        name: name.trim() || 'Automation',
        trigger: trigger?.label ?? 'Trigger',
        triggerType,
        triggerConfig,
        nodes: laidOut.nodes,
        edges: laidOut.edges,
      })
      setStatus(saved.status)
      setGraph(laidOut)
      setDirty(false)
      const check = await api.automations.validate(id)
      setProblems(toProblems(check.problems))
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = async () => {
    if (await save()) toast.success(status === 'Active' ? 'Saved. New contacts get this version.' : 'Draft saved')
  }

  const activate = async () => {
    if (!(await save())) return
    const check = await api.automations.validate(id).catch((err: Error) => { toast.error(err.message); return null })
    if (!check) return
    if (!check.ok) {
      setProblems(toProblems(check.problems))
      toast.error(`Fix ${check.problems.length} problem${check.problems.length === 1 ? '' : 's'} before activating`)
      return
    }
    try {
      setStatus((await api.automations.activate(id)).status)
      toast.success('Automation is live')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not activate')
    }
  }

  const pause = async () => {
    try {
      setStatus((await api.automations.pause(id)).status)
      toast.success('Automation paused. Waiting contacts stay where they are.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not pause')
    }
  }

  const leave = (href: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    router.push(href)
  }

  if (!ready) return <p className="p-6 text-sm text-muted-foreground">Loading automation…</p>

  const problemCount = Object.values(problems.byNode).reduce((sum, list) => sum + list.length, 0) + problems.general.length

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-8 md:-my-8">
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" aria-label="Back to automations" onClick={() => leave('/email/automations')}><ArrowLeft /></Button>
        <Input aria-label="Automation name" value={name} onChange={(event) => { setName(event.target.value); setDirty(true) }} className="h-9 max-w-xs font-medium" />
        <StatusBadge status={status} />
        {dirty && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-amber-500" aria-hidden /> Unsaved changes</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => leave(`/email/automations/${id}/activity`)}>Activity</Button>
          <Button variant="outline" disabled={busy} onClick={() => { void saveDraft() }}>{status === 'Active' ? 'Save changes' : 'Save draft'}</Button>
          {status === 'Active'
            ? <Button variant="outline" onClick={() => { void pause() }}>Pause</Button>
            : <Button disabled={busy} onClick={() => { void activate() }}>Activate</Button>}
        </div>
      </div>

      {status === 'Active' && (
        <p className="border-b border-border bg-sky-50 px-4 py-2 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          This automation is live. Saved changes apply to new contacts. People already in the funnel keep the version they started with.
        </p>
      )}
      {problemCount > 0 && (
        <div className="border-b border-border bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4" aria-hidden /> {problemCount} thing{problemCount === 1 ? '' : 's'} to fix before this can go live</p>
          {problems.general.map((message) => <p key={message} className="ml-5">{message}</p>)}
        </div>
      )}
      {moving && (
        <p className="flex items-center gap-3 border-b border-border bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Click a + to place this step.
          <Button size="sm" variant="outline" onClick={() => setMoving(null)}>Cancel</Button>
        </p>
      )}

      <div className="flex-1 overflow-auto bg-muted/40 px-4 py-8" style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        {unreachable.length > 0 && (
          <div className="mx-auto mb-8 max-w-xl rounded-xl border border-dashed border-amber-400 bg-background p-4">
            <p className="text-sm font-medium">Unconnected steps</p>
            <p className="mb-3 text-xs text-muted-foreground">These steps are not on any path from the trigger, so nobody reaches them. Move each one onto the flow or delete it.</p>
            <ul className="flex flex-col gap-2">
              {unreachable.map((node) => (
                <li key={node.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{STEP_META[node.kind]?.title ?? node.kind}: {summary(node, ctx)}</span>
                  <Button size="sm" variant="outline" onClick={() => setMoving(node.id)}>Move onto the flow</Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${node.label}`} onClick={() => change((current) => deleteUnreachable(current, node.id))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex min-w-max justify-center">
          {root && (
            <Branch
              tree={root}
              ctx={ctx}
              selected={selected}
              problems={problems.byNode}
              graph={graph}
              moving={moving}
              onSelect={setSelected}
              onAdd={addStep}
              onMove={moveHere}
            />
          )}
        </div>
      </div>

      <Sheet open={!!selectedNode} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selectedNode && (
            <>
              <SheetHeader className="border-b border-border">
                <SheetTitle>{STEP_META[selectedNode.kind]?.title ?? selectedNode.kind}</SheetTitle>
                <SheetDescription>{STEP_META[selectedNode.kind]?.hint}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                {(problems.byNode[selectedNode.id] ?? []).map((message) => (
                  <p key={message} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{message}</p>
                ))}
                {selectedNode.kind !== 'Trigger' && selectedNode.kind !== 'End' && (
                  <Field label="Step name">
                    <Input value={selectedNode.label} onChange={(event) => patchNode(selectedNode.id, { label: event.target.value })} />
                  </Field>
                )}
                <StepSettings
                  automationId={id}
                  node={selectedNode}
                  triggerType={triggerType}
                  triggerConfig={triggerConfig}
                  templates={templates}
                  forms={forms}
                  workspace={workspace}
                  onTriggerType={(value) => {
                    setTriggerType(value)
                    setTriggerConfig({})
                    patchNode(selectedNode.id, { label: TRIGGERS.find((item) => item.type === value)?.label ?? 'Trigger' })
                  }}
                  onTriggerConfig={(value) => { setTriggerConfig(value); setDirty(true) }}
                  onConfig={(config) => patchNode(selectedNode.id, { config })}
                  onTemplateCreated={(template) => setTemplates((current) => [template, ...current])}
                  saveDraft={save}
                />
                {selectedNode.kind !== 'Trigger' && (
                  <Button variant="outline" className="mt-2 text-destructive" onClick={() => deleteStep(selectedNode)}>
                    <Trash2 /> {selectedNode.kind === 'Condition' ? 'Delete this condition and both branches' : 'Delete step'}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
        title="Delete this condition?"
        description="The Yes and No branches and every step in them will be removed."
        onConfirm={async () => {
          if (!confirmDelete) return
          change((current) => removeStep(current, confirmDelete.id))
          setSelected(null)
        }}
      />
    </div>
  )
}

function toProblems(list: { nodeId: string | null; message: string }[]): Problems {
  const byNode: Record<string, string[]> = {}
  const general: string[] = []
  list.forEach((problem) => {
    if (problem.nodeId) (byNode[problem.nodeId] ??= []).push(problem.message)
    else general.push(problem.message)
  })
  return { byNode, general }
}

type Ctx = Parameters<typeof summary>[1]

function Branch({ tree, ctx, selected, problems, graph, moving, onSelect, onAdd, onMove }: {
  tree: TreeNode
  ctx: Ctx
  selected: string | null
  problems: Record<string, string[]>
  graph: Graph
  moving: string | null
  onSelect: (id: string) => void
  onAdd: (parentId: string, handle: Handle, kind: StepKind) => void
  onMove: (parentId: string, handle: Handle) => void
}) {
  const node = tree.node
  const shared = { ctx, selected, problems, graph, moving, onSelect, onAdd, onMove }
  const plus = (handle: Handle) => (
    <AddButton
      canEnd={!hasChild(graph, node.id, handle)}
      moving={!!moving}
      onAdd={(kind) => onAdd(node.id, handle, kind)}
      onMove={() => onMove(node.id, handle)}
    />
  )

  return (
    <div className="flex flex-col items-center">
      <StepCard node={node} text={summary(node, ctx)} active={selected === node.id} problems={problems[node.id]} onClick={() => onSelect(node.id)} />
      {node.kind === 'Condition' ? (
        <>
          <Line />
          <div className="relative flex gap-10">
            <div aria-hidden className="absolute top-0 right-[25%] left-[25%] h-px bg-border" />
            {(['true', 'false'] as const).map((handle) => {
              const child = handle === 'true' ? tree.yes : tree.no
              return (
                <div key={handle} className="flex min-w-72 flex-col items-center">
                  <Line />
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', handle === 'true' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300')}>
                    {handle === 'true' ? 'Yes' : 'No'}
                  </span>
                  <Line />
                  {plus(handle)}
                  {child && (<><Line /><Branch tree={child} {...shared} /></>)}
                </div>
              )
            })}
          </div>
        </>
      ) : node.kind !== 'End' ? (
        <>
          <Line />
          {plus(null)}
          {tree.next && (<><Line /><Branch tree={tree.next} {...shared} /></>)}
        </>
      ) : null}
    </div>
  )
}

function Line() {
  return <div aria-hidden className="h-6 w-px bg-border" />
}

function StepCard({ node, text, active, problems, onClick }: { node: FlowNode; text: string; active: boolean; problems?: string[]; onClick: () => void }) {
  const meta = STEP_META[node.kind] ?? STEP_META.End
  const Icon = meta.icon
  const title = node.kind === 'Trigger' || node.kind === 'End' ? meta.title : node.label || meta.title
  return (
    <button
      type="button"
      onClick={onClick}
      data-step={node.id}
      className={cn(
        'relative flex w-72 items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-ring',
        active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-foreground/30',
        problems?.length && 'border-red-400',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', meta.tone)}><Icon className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{meta.title}</span>
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{text}</span>
      </span>
      {!!problems?.length && (
        <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white" title={problems.join(' ')}>
          {problems.length}
        </span>
      )}
    </button>
  )
}

function AddButton({ canEnd, moving, onAdd, onMove }: { canEnd: boolean; moving: boolean; onAdd: (kind: StepKind) => void; onMove: () => void }) {
  if (moving) {
    return (
      <button type="button" onClick={onMove} className="flex h-8 items-center gap-1 rounded-full border-2 border-dashed border-amber-500 bg-background px-3 text-xs font-medium text-amber-700">
        <Plus className="size-3.5" aria-hidden /> Move here
      </button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" aria-label="Add a step" className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring" />}
      >
        <Plus className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        {PICKER.map((section, index) => (
          <div key={section.group}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{section.group}</DropdownMenuLabel>
              {section.kinds.map((kind) => {
                const meta = STEP_META[kind]
                const Icon = meta.icon
                const blocked = kind === 'End' && !canEnd
                return (
                  <DropdownMenuItem key={kind} disabled={blocked} onClick={() => onAdd(kind)}>
                    <Icon aria-hidden />
                    <span className="flex flex-col">
                      <span>{meta.title}</span>
                      <span className="text-xs text-muted-foreground">{blocked ? 'Only at the end of a path' : meta.hint}</span>
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium">{label}{children}</label>
}

const selectClass = 'h-10 rounded-lg border border-input bg-background px-3 text-sm'

function StepSettings({ automationId, node, triggerType, triggerConfig, templates, forms, workspace, onTriggerType, onTriggerConfig, onConfig, onTemplateCreated, saveDraft }: {
  automationId: string
  node: FlowNode
  triggerType: string
  triggerConfig: Record<string, string>
  templates: Template[]
  forms: LeadForm[]
  workspace: WorkspaceSettings | null
  onTriggerType: (value: string) => void
  onTriggerConfig: (value: Record<string, string>) => void
  onConfig: (config: Record<string, unknown>) => void
  onTemplateCreated: (template: Template) => void
  saveDraft: () => Promise<boolean>
}) {
  const config = node.config as Record<string, string | number | undefined>
  const set = (key: string, value: string | number) => onConfig({ ...node.config, [key]: value })

  switch (node.kind) {
    case 'Trigger':
      return (
        <>
          <Field label="Start when">
            <select className={selectClass} value={triggerType} onChange={(event) => onTriggerType(event.target.value)}>
              {TRIGGERS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
              {LATER_TRIGGERS.map((label) => <option key={label} disabled>{label} (coming soon)</option>)}
            </select>
          </Field>
          {triggerType === 'tag_added' && (
            <Field label="Tag">
              <Input value={triggerConfig.tag ?? ''} placeholder="Leave empty for any tag" onChange={(event) => onTriggerConfig({ ...triggerConfig, tag: event.target.value })} />
            </Field>
          )}
          {triggerType === 'form_submitted' && (
            <Field label="Form">
              <select className={selectClass} value={triggerConfig.formId ?? ''} onChange={(event) => onTriggerConfig({ ...triggerConfig, formId: event.target.value })}>
                <option value="">Any form</option>
                {forms.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}
              </select>
            </Field>
          )}
          {triggerType === 'manual' && <p className="text-sm text-muted-foreground">Contacts join when you enroll them from the API.</p>}
          <p className="text-xs text-muted-foreground">Each contact enters this automation once.</p>
        </>
      )
    case 'Email':
      return (
        <EmailStepSettings
          automationId={automationId}
          node={node}
          templates={templates}
          workspace={workspace}
          onConfig={onConfig}
          onTemplateCreated={onTemplateCreated}
          saveDraft={saveDraft}
        />
      )
    case 'Delay':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait for">
            <Input type="number" min={1} value={Number(config.amount ?? 1)} onChange={(event) => set('amount', Math.max(0, Number(event.target.value)))} />
          </Field>
          <Field label="Unit">
            <select className={selectClass} value={String(config.unit ?? 'days')} onChange={(event) => set('unit', event.target.value)}>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </Field>
        </div>
      )
    case 'Condition':
      return (
        <>
          <Field label="Check whether the contact">
            <select className={selectClass} value={String(config.type ?? 'opened_previous')} onChange={(event) => set('type', event.target.value)}>
              {CONDITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {config.type === 'has_tag' && (
            <Field label="Tag">
              <Input value={String(config.tag ?? '')} onChange={(event) => set('tag', event.target.value)} />
            </Field>
          )}
          <p className="text-xs text-muted-foreground">“Previous email” is the last email this contact got from this automation. Yes and No each continue on their own path.</p>
        </>
      )
    case 'Add tag':
    case 'Remove tag':
      return (
        <Field label="Tag">
          <Input value={String(config.tag ?? '')} placeholder="e.g. Engaged" onChange={(event) => set('tag', event.target.value)} />
        </Field>
      )
    case 'Goal':
      return <p className="text-sm text-muted-foreground">The step name is recorded in the activity log, then the contact continues.</p>
    default:
      return <p className="text-sm text-muted-foreground">Contacts who reach this step leave the automation.</p>
  }
}
