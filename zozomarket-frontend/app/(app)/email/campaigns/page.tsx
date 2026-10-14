'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, SearchInput, NativeSelect, FilterBar, StatusBadge, TableWrap, ConfirmDialog, EmptyState, th, td } from '@/components/app/shared'
import { emailCampaigns as seedData, fmt, fmtDate, type EmailCampaign } from '@/lib/mock-data'
import { api } from '@/lib/api'

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)

export default function CampaignsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<EmailCampaign[]>(seedData)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [period, setPeriod] = useState('All time')
  const [toDelete, setToDelete] = useState<EmailCampaign | null>(null)
  const [viewing, setViewing] = useState<EmailCampaign | null>(null)

  useEffect(() => {
    let active = true
    api.campaigns.list().then((data) => {
      if (active) setRows(data)
    })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => rows.filter((r) =>
    r.name.toLowerCase().includes(q.toLowerCase()) &&
    (status === 'All statuses' || r.status === status) &&
    (period === 'All time' || (period === 'October 2026' ? r.date.startsWith('2026-10') : r.date.startsWith('2026-09')))), [rows, q, status, period])

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
        <NativeSelect label="Date" value={period} onChange={setPeriod} options={['All time', 'October 2026', 'September 2026']} />
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['Campaign', 'Audience', 'Type', 'Status', 'Date', 'Recipients', 'Delivery', 'Open', 'Click'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/50">
                <td className={`${td} font-medium`}>{c.name}</td>
                <td className={`${td} text-muted-foreground`}>{c.audience}</td>
                <td className={`${td} text-muted-foreground`}>{c.type}</td>
                <td className={td}><StatusBadge status={c.status} /></td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(c.date)}</td>
                <td className={`${td} tabular-nums`}>{fmt(c.recipients)}</td>
                <td className={`${td} tabular-nums`}>{pct(c.delivery)}</td>
                <td className={`${td} tabular-nums`}>{pct(c.open)}</td>
                <td className={`${td} tabular-nums`}>{pct(c.click)}</td>
                <td className={td}>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewing(c)}>View</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/email/builder')}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        const newCampaign = await api.campaigns.create({
                          ...c,
                          name: `${c.name} (copy)`,
                          status: 'Draft',
                          delivery: null,
                          open: null,
                          click: null,
                        })
                        setRows((r) => [newCampaign, ...r])
                        toast.success('Campaign duplicated')
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
