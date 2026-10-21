'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader, SearchInput, NativeSelect, FilterBar, StatusBadge, TableWrap, ConfirmDialog, EmptyState, th, td } from '@/components/app/shared'
import { api, type EmailCampaign } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/format'

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

export default function CampaignsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<EmailCampaign[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [period, setPeriod] = useState('All time')
  const [toDelete, setToDelete] = useState<EmailCampaign | null>(null)
  const [viewing, setViewing] = useState<EmailCampaign | null>(null)
  const [testing, setTesting] = useState<EmailCampaign | null>(null)
  const [statusEdit, setStatusEdit] = useState<EmailCampaign | null>(null)
  const [nextStatus, setNextStatus] = useState<'Draft' | 'Scheduled'>('Draft')

  useEffect(() => {
    let active = true
    api.campaigns.list().then((data) => {
      if (active) setRows(data)
    }).catch((err: Error) => toast.error(err.message))
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => rows.filter((r) =>
    r.name.toLowerCase().includes(q.toLowerCase()) &&
    (status === 'All statuses' || r.status === status) &&
    (period === 'All time' || r.date.startsWith('2026-10'))), [rows, q, status, period])

  return (
    <div>
      <PageHeader
        title="Email Campaigns"
        description="Create, schedule, and track your email campaigns."
        actions={<Button nativeButton={false} render={<Link href="/email/builder" />}><Plus /> Create Email Campaign</Button>}
      />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search campaigns" />
        <NativeSelect label="Status" value={status} onChange={setStatus} options={['All statuses', 'Draft', 'Scheduled', 'Sending', 'Sent', 'Failed']} />
        <NativeSelect label="Date" value={period} onChange={setPeriod} options={['All time', 'October 2026']} />
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['Campaign', 'Subject', 'Audience', 'Status', 'Date', 'Recipients', 'Open'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/50">
                <td className={`${td} font-medium`}><Link href={`/email/builder?campaign=${c.id}`} className="hover:underline">{c.name}</Link></td>
                <td className={`${td} text-muted-foreground`}>{c.subject || '—'}</td>
                <td className={`${td} text-muted-foreground`}>{c.audience || 'All subscribers'}</td>
                <td className={td}>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={c.status} />
                    {(c.status === 'Draft' || c.status === 'Scheduled') && (
                      <button type="button" className="text-xs font-medium text-primary underline" onClick={() => { setStatusEdit(c); setNextStatus(c.status === 'Scheduled' ? 'Scheduled' : 'Draft') }}>Change status</button>
                    )}
                  </div>
                </td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(c.date)}</td>
                <td className={`${td} tabular-nums`}>{fmt(c.recipients)}</td>
                <td className={`${td} tabular-nums`}>{pct(c.open)}</td>
                <td className={td}>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewing(c)}>View</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/email/builder?campaign=${c.id}`)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTesting(c)}>Send test</DropdownMenuItem>
                      {c.status === 'Scheduled' && <DropdownMenuItem onClick={async () => {
                        try {
                          const saved = await api.campaigns.unschedule(c.id)
                          setRows((current) => current.map((row) => row.id === c.id ? { ...row, ...saved, status: 'Draft' } : row))
                          toast.success('Campaign moved back to draft')
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Could not unschedule')
                        }
                      }}>Unschedule</DropdownMenuItem>}
                      <DropdownMenuItem onClick={async () => {
                        try {
                          const newCampaign = await api.campaigns.duplicate(c.id)
                          setRows((r) => [newCampaign, ...r])
                          toast.success('Campaign duplicated')
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Could not duplicate')
                        }
                      }}>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/analytics')}>View Report</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setToDelete(c)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={Inbox} title="No campaigns found" description="Try adjusting your search or filters." />}
      </TableWrap>

      <Dialog open={!!statusEdit} onOpenChange={(open) => !open && setStatusEdit(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            if (!statusEdit) return
            const form = new FormData(event.currentTarget)
            const apply = nextStatus === 'Draft'
              ? statusEdit.status === 'Scheduled'
                ? api.campaigns.unschedule(statusEdit.id)
                : Promise.resolve(statusEdit)
              : api.campaigns.schedule(statusEdit.id, new Date(`${form.get('date')}T${form.get('time')}`).toISOString())
            apply.then((saved) => {
              setRows((current) => current.map((row) => row.id === statusEdit.id ? { ...row, ...saved, status: nextStatus } : row))
              toast.success(nextStatus === 'Draft' ? 'Saved as draft' : 'Campaign scheduled')
              setStatusEdit(null)
            }).catch((err: Error) => toast.error(err.message))
          }}>
            <DialogHeader>
              <DialogTitle>Change status</DialogTitle>
              <DialogDescription>“{statusEdit?.name}” is {statusEdit?.status}. Choose Draft to keep editing, or Scheduled to send it later.</DialogDescription>
            </DialogHeader>
            <NativeSelect label="Status" value={nextStatus} onChange={(value) => setNextStatus(value as 'Draft' | 'Scheduled')} options={['Draft', 'Scheduled']} />
            {nextStatus === 'Scheduled' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><label className="text-sm font-medium" htmlFor="status-date">Date</label><Input id="status-date" name="date" type="date" required /></div>
                <div className="flex flex-col gap-1.5"><label className="text-sm font-medium" htmlFor="status-time">Time</label><Input id="status-time" name="time" type="time" required defaultValue="09:00" /></div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusEdit(null)}>Cancel</Button>
              <Button type="submit">Save status</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!testing} onOpenChange={(open) => !open && setTesting(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            const email = String(new FormData(event.currentTarget).get('email') || '')
            if (!testing) return
            api.campaigns.test(testing.id, [email])
              .then((result) => { toast.success(`Test sent to ${result.affected} address`); setTesting(null) })
              .catch((err: Error) => toast.error(err.message))
          }}>
            <DialogHeader>
              <DialogTitle>Send test</DialogTitle>
              <DialogDescription>Sends “{testing?.name}” with the workspace from name and address.</DialogDescription>
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
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete campaign?"
        description={`“${toDelete?.name}” will be permanently removed. This cannot be undone.`}
        onConfirm={async () => {
          if (!toDelete) return
          await api.campaigns.delete(toDelete.id)
          setRows((r) => r.filter((x) => x.id !== toDelete.id))
          toast.success('Campaign deleted')
        }}
      />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>{viewing?.type} · {viewing?.audience}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={viewing.status} /></dd>
              <dt className="text-muted-foreground">Date</dt><dd>{fmtDate(viewing.date)}</dd>
              <dt className="text-muted-foreground">Recipients</dt><dd>{fmt(viewing.recipients)}</dd>
              <dt className="text-muted-foreground">Delivery / Open / Click</dt><dd>{pct(viewing.delivery)} / {pct(viewing.open)} / {pct(viewing.click)}</dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
