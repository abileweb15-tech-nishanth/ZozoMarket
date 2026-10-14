'use client'

import { useState } from 'react'
import { Clock, GitBranch, Mail, Plus, Flag, Zap, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, SearchInput, NativeSelect, FilterBar, StatusBadge, TableWrap, Panel, SimulatedNote, th, td } from '@/components/app/shared'
import { cn } from '@/lib/utils'

type NodeKind = 'Trigger' | 'Delay' | 'Condition' | 'Email' | 'End'
type FlowNode = { id: string; kind: NodeKind; label: string }
type Automation = { id: string; name: string; trigger: string; audience: string; status: 'Active' | 'Paused' | 'Draft'; updated: string; nodes: FlowNode[] }

const N = (kind: NodeKind, label: string): FlowNode => ({ id: Math.random().toString(36).slice(2), kind, label })
const initial: Automation[] = [
  { id: 'a1', name: 'Welcome Series', trigger: 'Contact subscribes', audience: 'New Signups', status: 'Active', updated: 'Oct 9, 2026', nodes: [N('Trigger', 'Contact subscribes to Newsletter'), N('Email', 'Send “Welcome to Acme”'), N('Delay', 'Wait 2 days'), N('Email', 'Send “Our story”'), N('Delay', 'Wait 3 days'), N('Email', 'Send “10% first order”'), N('End', 'End workflow')] },
  { id: 'a2', name: 'Re-engagement', trigger: 'No opens in 90 days', audience: 'Inactive', status: 'Paused', updated: 'Sep 30, 2026', nodes: [N('Trigger', 'No email opened in 90 days'), N('Email', 'Send “We miss you”'), N('Delay', 'Wait 5 days'), N('Condition', 'Opened previous email?'), N('Email', 'Send final coupon'), N('End', 'End workflow')] },
  { id: 'a3', name: 'Abandoned Signup Follow-up', trigger: 'Form started, not submitted', audience: 'Leads', status: 'Draft', updated: 'Oct 2, 2026', nodes: [N('Trigger', 'Signup form abandoned'), N('Delay', 'Wait 1 hour'), N('Email', 'Send reminder'), N('End', 'End workflow')] },
  { id: 'a4', name: 'Post-Purchase Follow-up', trigger: 'Order completed', audience: 'Customers', status: 'Active', updated: 'Oct 11, 2026', nodes: [N('Trigger', 'Order completed'), N('Delay', 'Wait 7 days'), N('Email', 'Ask for a review'), N('Condition', 'Left a review?'), N('Email', 'Send thank-you reward'), N('End', 'End workflow')] },
]

const nodeStyle: Record<NodeKind, { icon: typeof Zap; cls: string }> = {
  Trigger: { icon: Zap, cls: 'border-primary bg-primary/10' },
  Delay: { icon: Clock, cls: 'border-border bg-muted' },
  Condition: { icon: GitBranch, cls: 'border-warning/40 bg-warning/10' },
  Email: { icon: Mail, cls: 'border-accent-foreground/30 bg-accent' },
  End: { icon: Flag, cls: 'border-border bg-background' },
}

export default function AutomationsPage() {
  const [rows, setRows] = useState(initial)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [activeId, setActiveId] = useState('a1')
  const [createOpen, setCreateOpen] = useState(false)
  const active = rows.find((r) => r.id === activeId)!
  const list = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) && (status === 'All statuses' || r.status === status))

  const setNodes = (nodes: FlowNode[]) => setRows((rs) => rs.map((r) => (r.id === activeId ? { ...r, nodes } : r)))
  const addNode = (kind: NodeKind) => {
    const endIdx = active.nodes.findIndex((n) => n.kind === 'End')
    const at = endIdx === -1 ? active.nodes.length : endIdx
    const label = { Delay: 'Wait 1 day', Condition: 'Clicked a link?', Email: 'Send new email', Trigger: '', End: '' }[kind]
    setNodes([...active.nodes.slice(0, at), N(kind, label), ...active.nodes.slice(at)])
  }

  return (
    <div>
      <PageHeader title="Email Automations" description="Send the right message at the right moment, automatically." actions={<Button onClick={() => setCreateOpen(true)}><Plus /> Create Automation</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search automations" />
        <NativeSelect label="Status" value={status} onChange={setStatus} options={['All statuses', 'Active', 'Paused', 'Draft']} />
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>{['Automation', 'Trigger', 'Audience', 'Status', 'Last updated'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((a) => (
              <tr key={a.id} className={cn('cursor-pointer hover:bg-muted/50', a.id === activeId && 'bg-accent/40')} onClick={() => setActiveId(a.id)}>
                <td className={`${td} font-medium`}><button type="button" className="hover:underline" onClick={() => setActiveId(a.id)}>{a.name}</button></td>
                <td className={`${td} text-muted-foreground`}>{a.trigger}</td>
                <td className={`${td} text-muted-foreground`}>{a.audience}</td>
                <td className={td}><StatusBadge status={a.status} /></td>
                <td className={`${td} text-muted-foreground`}>{a.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <Panel className="mt-8" title={`Workflow: ${active.name}`} description="Visual builder · mock data, workflows are not executed"
        actions={<div className="flex flex-wrap gap-2">
          {(['Delay', 'Condition', 'Email'] as NodeKind[]).map((k) => <Button key={k} variant="outline" size="sm" onClick={() => addNode(k)}><Plus /> {k}</Button>)}
          <Button size="sm" onClick={() => { setRows((rs) => rs.map((r) => r.id === activeId ? { ...r, status: r.status === 'Active' ? 'Paused' : 'Active' } : r)); toast.success('Status updated') }}>{active.status === 'Active' ? 'Pause' : 'Activate'}</Button>
        </div>}>
        <ol className="mx-auto flex max-w-md flex-col items-center">
          {active.nodes.map((node, i) => {
            const S = nodeStyle[node.kind]
            return (
              <li key={node.id} className="flex w-full flex-col items-center">
                {i > 0 && <span className="h-6 w-px bg-border" aria-hidden />}
                <div className={cn('group flex w-full items-center gap-3 rounded-xl border px-4 py-3', S.cls)}>
                  <S.icon className="size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{node.kind}</p>
                    <input aria-label={`${node.kind} label`} value={node.label} onChange={(e) => setNodes(active.nodes.map((n) => n.id === node.id ? { ...n, label: e.target.value } : n))} className="w-full bg-transparent text-sm font-medium outline-none focus-visible:underline" />
                  </div>
                  {node.kind !== 'Trigger' && node.kind !== 'End' && (
                    <Button variant="ghost" size="icon-sm" aria-label="Remove step" onClick={() => setNodes(active.nodes.filter((n) => n.id !== node.id))}><X /></Button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </Panel>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const a: Automation = { id: crypto.randomUUID(), name: String(f.get('name')), trigger: String(f.get('trigger')), audience: 'All Subscribers', status: 'Draft', updated: 'Oct 12, 2026', nodes: [N('Trigger', String(f.get('trigger'))), N('End', 'End workflow')] }
            setRows((r) => [a, ...r]); setActiveId(a.id); setCreateOpen(false); toast.success('Automation created')
          }}>
            <DialogHeader><DialogTitle>Create automation</DialogTitle><DialogDescription>Name it and choose a trigger to start.</DialogDescription></DialogHeader>
            <div className="flex flex-col gap-1.5"><Label htmlFor="a-name">Name</Label><Input id="a-name" name="name" required minLength={3} placeholder="e.g. Birthday reward" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="a-trigger">Trigger</Label>
              <select id="a-trigger" name="trigger" className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                {['Contact subscribes', 'Tag added', 'Order completed', 'Form submitted', 'Date-based'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <SimulatedNote>Automations are a frontend prototype and will not send real email.</SimulatedNote>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
