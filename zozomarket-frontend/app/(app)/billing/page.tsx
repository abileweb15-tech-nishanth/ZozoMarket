'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Panel, StatusBadge, TableWrap, SimulatedNote, th, td } from '@/components/app/shared'
import { cn } from '@/lib/utils'

const usage = [
  { label: 'Contacts', used: 7, limit: 10000, display: '7,240 / 10,000', value: 72 },
  { label: 'Emails sent this month', used: 0, limit: 0, display: '94,300 / 150,000', value: 63 },
  { label: 'Social accounts', used: 0, limit: 0, display: '5 / 10', value: 50 },
  { label: 'Team seats', used: 0, limit: 0, display: '3 / 5', value: 60 },
]
const history = [
  { id: 'INV-1042', date: 'Oct 1, 2026', desc: 'Pro Plan — monthly', amount: 'Sample amount', status: 'Paid' },
  { id: 'INV-1031', date: 'Sep 1, 2026', desc: 'Pro Plan — monthly', amount: 'Sample amount', status: 'Paid' },
  { id: 'INV-1019', date: 'Aug 1, 2026', desc: 'Pro Plan — monthly', amount: 'Sample amount', status: 'Paid' },
]
const plans = [
  { name: 'Starter', features: ['2,500 contacts', '3 social accounts', '1 seat'] },
  { name: 'Pro', features: ['10,000 contacts', '10 social accounts', '5 seats', 'Automations'] },
  { name: 'Business', features: ['50,000 contacts', '25 social accounts', '15 seats', 'Priority support'] },
]

export default function BillingPage() {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState('Business')
  return (
    <div>
      <PageHeader title="Billing & Plan" description="Your subscription, usage, and invoices." actions={<Button onClick={() => setOpen(true)}>Upgrade Plan</Button>} />
      <div className="mb-6"><SimulatedNote>Sample billing data. No real charges or payment processing occur in this prototype.</SimulatedNote></div>
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <Panel title="Current plan">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><span className="text-2xl font-semibold">Pro</span><StatusBadge status="Active" /></div>
            <p className="text-sm text-muted-foreground">Renews Nov 1, 2026 · Billed monthly</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {plans[1].features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="size-4 text-success" aria-hidden />{f}</li>)}
            </ul>
          </div>
        </Panel>
        <Panel title="Usage this cycle">
          <ul className="flex flex-col gap-5">
            {usage.map((u) => (
              <li key={u.label} className="flex flex-col gap-2">
                <div className="flex justify-between text-sm"><span>{u.label}</span><span className="tabular-nums text-muted-foreground">{u.display}</span></div>
                <Progress value={u.value} aria-label={`${u.label} usage`} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <h2 className="mb-3 text-sm font-semibold">Billing history</h2>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted"><tr>{['Invoice', 'Date', 'Description', 'Amount', 'Status', ''].map((h, i) => <th key={i} scope="col" className={th}>{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {history.map((h) => (
              <tr key={h.id}>
                <td className={`${td} font-medium`}>{h.id}</td><td className={td}>{h.date}</td><td className={td}>{h.desc}</td>
                <td className={`${td} text-muted-foreground`}>{h.amount}</td><td className={td}><StatusBadge status={h.status} /></td>
                <td className={td}><Button variant="ghost" size="sm" onClick={() => toast('Invoice download is simulated')}>Download</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Change plan</DialogTitle><DialogDescription>Pricing is not shown in this prototype.</DialogDescription></DialogHeader>
          <div role="radiogroup" aria-label="Plans" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <button key={p.name} type="button" role="radio" aria-checked={plan === p.name} onClick={() => setPlan(p.name)}
                className={cn('flex flex-col gap-2 rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-ring', plan === p.name ? 'border-primary bg-primary/5' : 'border-border')}>
                <span className="font-semibold">{p.name}{p.name === 'Pro' && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}</span>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={plan === 'Pro'} onClick={() => { toast.success(`Plan change to ${plan} requested (simulated)`); setOpen(false) }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
