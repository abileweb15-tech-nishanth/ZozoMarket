'use client'

import { useEffect, useState } from 'react'
import { Download, Layers, MoreHorizontal, Plus, Upload, UserCheck, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, KpiCard, SearchInput, NativeSelect, FilterBar, StatusBadge, TableWrap, ConfirmDialog, SimulatedNote, th, td } from '@/components/app/shared'
import { contacts as seed, fmtDate, type Contact } from '@/lib/mock-data'
import { api } from '@/lib/api'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>(seed)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [tag, setTag] = useState('All tags')
  const [sel, setSel] = useState<string[]>([])
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toDelete, setToDelete] = useState<string[] | null>(null)
  const [dialog, setDialog] = useState<null | 'import' | 'segment'>(null)

  useEffect(() => {
    let active = true
    api.contacts.list().then((data) => {
      if (active) setRows(data)
    })
    return () => {
      active = false
    }
  }, [])

  const allTags = Array.from(new Set(rows.flatMap((r) => r.tags)))
  const list = rows.filter((r) =>
    (r.name + r.email).toLowerCase().includes(q.toLowerCase()) &&
    (status === 'All statuses' || r.status === status) &&
    (tag === 'All tags' || r.tags.includes(tag)))
  const allSelected = list.length > 0 && list.every((r) => sel.includes(r.id))

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    const email = String(f.get('email')).trim()
    const consent = f.get('consent') === 'on'
    const errs: Record<string, string> = {}
    if (!name) errs.name = 'Name is required.'
    if (!emailRe.test(email)) errs.email = 'Enter a valid email address.'
    else if (rows.some((r) => r.email === email && (editing === 'new' || r.id !== editing?.id))) errs.email = 'This email already exists.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const tags = String(f.get('tags')).split(',').map((t) => t.trim()).filter(Boolean)
    const status = consent ? 'Subscribed' : 'Pending'
    if (editing === 'new') {
      const created = await api.contacts.create({ name, email, tags, source: 'Manual', status, added: new Date().toISOString().slice(0, 10) })
      setRows((r) => [created, ...r])
      toast.success('Contact added')
    } else if (editing) {
      const updated = await api.contacts.update(editing.id, { name, email, tags, status: editing.status === 'Unsubscribed' ? 'Unsubscribed' : status })
      setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)))
      toast.success('Contact updated')
    }
    setEditing(null)
  }

  const exportCsv = () => {
    const csv = ['Name,Email,Tags,Source,Status,Added', ...rows.map((r) => [r.name, r.email, r.tags.join(';'), r.source, r.status, r.added].join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'contacts.csv'
    a.click()
    toast.success('Contacts exported')
  }

  const current = editing && editing !== 'new' ? editing : null

  return (
    <div>
      <PageHeader title="Contacts & Audience" description="Email subscribers and their consent status. Social followers are not email contacts."
        actions={<>
          <Button variant="outline" onClick={() => setDialog('import')}><Upload /> Import CSV</Button>
          <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
          <Button variant="outline" onClick={() => setDialog('segment')}><Layers /> Create Segment</Button>
          <Button onClick={() => { setErrors({}); setEditing('new') }}><Plus /> Add Contact</Button>
        </>} />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Contacts" value={String(rows.length)} icon={Users} />
        <KpiCard label="Subscribed" value={String(rows.filter((r) => r.status === 'Subscribed').length)} icon={UserCheck} />
        <KpiCard label="Unsubscribed" value={String(rows.filter((r) => r.status === 'Unsubscribed').length)} icon={UserX} />
        <KpiCard label="Audience Segments" value="6" icon={Layers} />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
        <NativeSelect label="Subscription status" value={status} onChange={setStatus} options={['All statuses', 'Subscribed', 'Pending', 'Unsubscribed']} />
        <NativeSelect label="Tag" value={tag} onChange={setTag} options={['All tags', ...allTags]} />
        {sel.length > 0 && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-sm text-muted-foreground">{sel.length} selected</span>
            <Button variant="outline" onClick={async () => {
              await api.contacts.bulkAddTag(sel, 'Segment A')
              setRows((r) => r.map((x) => sel.includes(x.id) ? { ...x, tags: Array.from(new Set([...x.tags, 'Segment A'])) } : x))
              toast.success('Tag “Segment A” added')
            }}>Add tag</Button>
            <Button variant="destructive" onClick={() => setToDelete(sel)}>Delete</Button>
          </div>
        )}
      </FilterBar>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              <th scope="col" className={th}><Checkbox aria-label="Select all" checked={allSelected} onCheckedChange={(c) => setSel(c ? list.map((r) => r.id) : [])} /></th>
              {['Name', 'Email', 'Tags', 'Source', 'Subscription', 'Date Added'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((c) => (
              <tr key={c.id} className="hover:bg-muted/50">
                <td className={td}><Checkbox aria-label={`Select ${c.name}`} checked={sel.includes(c.id)} onCheckedChange={(v) => setSel((s) => v ? [...s, c.id] : s.filter((x) => x !== c.id))} /></td>
                <td className={`${td} font-medium`}>{c.name}</td>
                <td className={`${td} text-muted-foreground`}>{c.email}</td>
                <td className={td}><div className="flex gap-1">{c.tags.map((t) => <span key={t} className="rounded-md border border-border px-1.5 py-0.5 text-xs">{t}</span>)}</div></td>
                <td className={`${td} text-muted-foreground`}>{c.source}</td>
                <td className={td}><StatusBadge status={c.status} /></td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(c.added)}</td>
                <td className={td}>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setErrors({}); setEditing(c) }}>Edit</DropdownMenuItem>
                      {c.status !== 'Unsubscribed'
                        ? <DropdownMenuItem onClick={() => setRows((r) => r.map((x) => x.id === c.id ? { ...x, status: 'Unsubscribed' } : x))}>Mark unsubscribed</DropdownMenuItem>
                        : <DropdownMenuItem disabled>Resubscribe requires new consent</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setToDelete([c.id])}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form noValidate onSubmit={save} className="flex flex-col gap-4" key={current?.id ?? 'new'}>
            <DialogHeader><DialogTitle>{current ? 'Edit contact' : 'Add contact'}</DialogTitle><DialogDescription>Only add people who have agreed to receive email.</DialogDescription></DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Full name</Label>
              <Input id="c-name" name="name" defaultValue={current?.name} aria-invalid={!!errors.name} aria-describedby="c-name-err" />
              {errors.name && <p id="c-name-err" className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" name="email" type="email" defaultValue={current?.email} aria-invalid={!!errors.email} aria-describedby="c-email-err" />
              {errors.email && <p id="c-email-err" className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-tags">Tags</Label>
              <Input id="c-tags" name="tags" defaultValue={current?.tags.join(', ')} placeholder="VIP, Newsletter" />
              <p className="text-xs text-muted-foreground">Separate with commas.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" defaultChecked={current?.status === 'Subscribed'} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Contact has given explicit consent to receive marketing email.</span>
            </label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'import' ? 'Import contacts' : 'Create segment'}</DialogTitle>
            <DialogDescription>{dialog === 'import' ? 'Upload a CSV with name and email columns.' : 'Group contacts by shared attributes.'}</DialogDescription>
          </DialogHeader>
          {dialog === 'import' ? (
            <>
              <Input type="file" accept=".csv" aria-label="CSV file" />
              <SimulatedNote>Import is simulated; uploaded files are not processed.</SimulatedNote>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="seg-name">Segment name</Label><Input id="seg-name" placeholder="e.g. Engaged VIPs" /></div>
              <NativeSelect label="Condition" value="Tag is VIP" onChange={() => {}} options={['Tag is VIP', 'Opened in last 30 days', 'Source is Signup Form']} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={() => { toast.success(dialog === 'import' ? 'Import queued (simulated)' : 'Segment created'); setDialog(null) }}>{dialog === 'import' ? 'Import' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Delete ${toDelete?.length ?? 0} contact(s)?`} description="Deleted contacts are removed from all lists and segments." onConfirm={async () => {
        if (!toDelete) return
        await api.contacts.bulkDelete(toDelete)
        setRows((r) => r.filter((x) => !toDelete.includes(x.id)))
        setSel([])
        toast.success('Deleted')
      }} />
    </div>
  )
}
