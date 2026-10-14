'use client'

import { useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, SearchInput, FilterBar, StatusBadge, TableWrap, Segmented, Panel, th, td } from '@/components/app/shared'

const kinds = ['Signup Forms', 'Landing Pages', 'Embedded Forms', 'Popup Forms'] as const
const items = [
  { name: 'Newsletter Signup', kind: 'Signup Forms', status: 'Live', views: 8420, subs: 912 },
  { name: 'Barista Workshop RSVP', kind: 'Landing Pages', status: 'Live', views: 3105, subs: 284 },
  { name: 'Fall Menu Landing', kind: 'Landing Pages', status: 'Draft', views: 0, subs: 0 },
  { name: 'Footer Signup', kind: 'Embedded Forms', status: 'Live', views: 15230, subs: 540 },
  { name: '10% Off Exit Popup', kind: 'Popup Forms', status: 'Paused', views: 6200, subs: 610 },
]

export default function FormsPage() {
  const [kind, setKind] = useState<(typeof kinds)[number]>('Signup Forms')
  const [q, setQ] = useState('')
  const [fields, setFields] = useState<string[]>(['Company'])
  const [newField, setNewField] = useState('')
  const [title, setTitle] = useState('Join the Acme Coffee newsletter')
  const [success, setSuccess] = useState('Thanks! Check your inbox to confirm your subscription.')
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState('')
  const list = items.filter((i) => i.kind === kind && i.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageHeader title="Forms & Landing Pages" description="Collect new subscribers with consent built in." actions={<Button onClick={() => toast.success(`New ${kind.slice(0, -1).toLowerCase()} created (draft)`)}><Plus /> Create {kind.replace(/s$/, '')}</Button>} />
      <FilterBar>
        <Segmented label="Type" value={kind} onChange={setKind} options={kinds} />
        <SearchInput value={q} onChange={setQ} placeholder="Search" className="sm:ml-auto" />
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted"><tr>{['Name', 'Status', 'Views', 'Signups', 'Conversion'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((i) => (
              <tr key={i.name}>
                <td className={`${td} font-medium`}>{i.name}</td>
                <td className={td}><StatusBadge status={i.status} /></td>
                <td className={`${td} tabular-nums`}>{i.views.toLocaleString()}</td>
                <td className={`${td} tabular-nums`}>{i.subs.toLocaleString()}</td>
                <td className={`${td} tabular-nums`}>{i.views ? `${((i.subs / i.views) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </TableWrap>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Form editor" description="Customize fields and messages">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5"><Label htmlFor="f-title">Form title</Label><Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Fields</span>
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Name <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
                <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Email <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
                {fields.map((f) => (
                  <li key={f} className="flex h-10 items-center rounded-lg border border-border px-3">{f}
                    <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${f}`} onClick={() => setFields((s) => s.filter((x) => x !== f))}><Trash2 /></Button>
                  </li>
                ))}
                <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Consent checkbox <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
              </ul>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newField.trim() && !fields.includes(newField.trim())) { setFields((s) => [...s, newField.trim()]); setNewField('') } }}>
                <Input aria-label="New field name" placeholder="Add custom field (e.g. Birthday)" value={newField} onChange={(e) => setNewField(e.target.value)} />
                <Button type="submit" variant="outline">Add</Button>
              </form>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="f-success">Success message</Label><Input id="f-success" value={success} onChange={(e) => setSuccess(e.target.value)} /></div>
          </div>
        </Panel>

        <Panel title="Live preview" description="Try submitting the form">
          <div className="rounded-xl border border-border p-6">
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="size-8 text-success" aria-hidden />
                <p className="text-sm">{success}</p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>Reset preview</Button>
              </div>
            ) : (
              <form noValidate className="flex flex-col gap-4" onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                if (!String(f.get('name')).trim()) return setErr('Please enter your name.')
                if (!/^\S+@\S+\.\S+$/.test(String(f.get('email')))) return setErr('Please enter a valid email.')
                if (!f.get('consent')) return setErr('Please agree to receive emails.')
                setErr(''); setSubmitted(true)
              }}>
                <h3 className="text-lg font-semibold text-balance">{title}</h3>
                <div className="flex flex-col gap-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" name="name" /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="p-email">Email</Label><Input id="p-email" name="email" type="email" /></div>
                {fields.map((f) => <div key={f} className="flex flex-col gap-1.5"><Label htmlFor={`p-${f}`}>{f} <span className="text-muted-foreground">(optional)</span></Label><Input id={`p-${f}`} /></div>)}
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--primary)]" /> I agree to receive marketing emails. Unsubscribe anytime.</label>
                {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
                <Button type="submit" className="h-10">Subscribe</Button>
              </form>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
