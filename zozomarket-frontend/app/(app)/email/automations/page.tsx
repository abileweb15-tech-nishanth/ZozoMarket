'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ConfirmDialog, EmptyState, FilterBar, NativeSelect, PageHeader, SearchInput, StatusBadge, TableWrap, td, th } from '@/components/app/shared'
import { api, type Automation } from '@/lib/api'
import { fmtDate } from '@/lib/format'

const STATUSES = ['All statuses', 'Draft', 'Active', 'Paused', 'Archived']

export default function AutomationsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Automation[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [toDelete, setToDelete] = useState<Automation | null>(null)
  const [testing, setTesting] = useState<Automation | null>(null)

  function load() {
    api.automations.list().then(setRows).catch((err: Error) => toast.error(err.message))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((row) =>
    row.name.toLowerCase().includes(q.toLowerCase()) &&
    (status === 'All statuses' || row.status === status),
  ), [q, rows, status])

  async function create() {
    try {
      const created = await api.automations.create({
        name: 'New automation',
        trigger: 'Contact subscribes',
        triggerType: 'contact_subscribed',
        nodes: [{ kind: 'Trigger', label: 'Contact subscribes', config: {}, position: { x: 280, y: 40 } }],
        edges: [],
      })
      router.push(`/email/automations/${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the automation')
    }
  }

  async function run(action: Promise<Automation>, message: string) {
    try {
      const saved = await action
      setRows((current) => current.map((row) => row.id === saved.id ? saved : row))
      toast.success(message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That action failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Email Automation"
        description="Build a funnel that sends, waits, and branches for each contact."
        actions={<Button onClick={() => { void create() }}><Plus /> New automation</Button>}
      />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search automations" />
        <NativeSelect label="Status" value={status} onChange={setStatus} options={STATUSES} />
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['Name', 'Trigger', 'Status', 'Enrolled', 'Completed', 'Updated'].map((heading) => <th key={heading} scope="col" className={th}>{heading}</th>)}
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-muted/50">
                <td className={`${td} font-medium`}><Link href={`/email/automations/${row.id}`} className="hover:underline">{row.name}</Link></td>
                <td className={`${td} text-muted-foreground`}>{row.trigger || '—'}</td>
                <td className={td}><StatusBadge status={row.status} /></td>
                <td className={`${td} tabular-nums`}>{row.enrolledCount}</td>
                <td className={`${td} tabular-nums`}>{row.completedCount}</td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(row.updated)}</td>
                <td className={td}>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/email/automations/${row.id}`)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/email/automations/${row.id}/activity`)}>Activity</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { void run(api.automations.duplicate(row.id).then((copy) => { setRows((current) => [copy, ...current]); return copy }), 'Automation duplicated') }}>Duplicate</DropdownMenuItem>
                      {row.status !== 'Active' && <DropdownMenuItem onClick={() => { void run(api.automations.activate(row.id), 'Automation is live') }}>Activate</DropdownMenuItem>}
                      {row.status === 'Active' && <DropdownMenuItem onClick={() => { void run(api.automations.pause(row.id), 'Automation paused') }}>Pause</DropdownMenuItem>}
                      {row.status !== 'Archived' && <DropdownMenuItem onClick={() => { void run(api.automations.archive(row.id), 'Automation archived') }}>Archive</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => setTesting(row)}>Send test</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setToDelete(row)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={Workflow} title="No automations yet" description="Create a funnel, then connect a trigger to an email and a delay." />}
      </TableWrap>
      <Dialog open={!!testing} onOpenChange={(open) => !open && setTesting(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            if (!testing) return
            const email = String(new FormData(event.currentTarget).get('email') || '')
            api.automations.test(testing.id, email)
              .then(() => { toast.success(`Test sent to ${email}`); setTesting(null) })
              .catch((err: Error) => toast.error(err.message))
          }}>
            <DialogHeader>
              <DialogTitle>Send a test</DialogTitle>
              <DialogDescription>Sends the first email step in “{testing?.name}” to one address. It does not enroll that person.</DialogDescription>
            </DialogHeader>
            <Input name="email" type="email" required placeholder="Email address" aria-label="Email address" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTesting(null)}>Cancel</Button>
              <Button type="submit">Send test</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete automation?"
        description={`“${toDelete?.name ?? 'This automation'}” and its waiting contacts will be removed.`}
        onConfirm={async () => {
          if (!toDelete) return
          await api.automations.remove(toDelete.id)
          setRows((current) => current.filter((row) => row.id !== toDelete.id))
          toast.success('Automation deleted')
        }}
      />
    </div>
  )
}
