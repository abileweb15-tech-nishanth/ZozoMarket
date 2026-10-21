'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog, PageHeader, SearchInput, FilterBar, StatusBadge, TableWrap, Segmented, Panel, NativeSelect, th, td } from '@/components/app/shared'
import { api, type FormField, type LeadForm } from '@/lib/api'
import { cn } from '@/lib/utils'

const kinds = ['Signup Forms', 'Embedded Forms', 'Popup Forms'] as const
type FormKind = (typeof kinds)[number]

const kindNotes: Record<FormKind, string> = {
  'Signup Forms': 'Each form has its own link. A live signup is stored as a contact.',
  'Embedded Forms': 'Paste the embed on your site. Signups are stored as contacts.',
  'Popup Forms': 'A popup card. A live signup is stored as a contact.',
}

function sameList(kind: LeadForm['kind'], selected: FormKind) {
  return (kind === 'Landing Pages' ? 'Signup Forms' : kind) === selected
}

function visitorLink(slug: string) {
  if (typeof window === 'undefined') return `/f/${slug}`
  return `${window.location.origin}/f/${slug}`
}

function embedCode(pageUrl: string, title: string) {
  return `<iframe src="${pageUrl}" title="${title}" style="width:100%;max-width:480px;height:640px;border:0"></iframe>`
}

function fieldKey(label: string) {
  const words = label.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const name = words.map((word, index) => {
    const lower = word.toLowerCase()
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join('')
  return (name || 'field').replace(/^\d/, 'f')
}

function SignupFields({ form, err, onSubmit }: { form: LeadForm; err: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
      <h3 className="text-lg font-semibold text-balance">{form.title || form.name}</h3>
      {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
      <div className="flex flex-col gap-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" name="name" /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="p-email">Email</Label><Input id="p-email" name="email" type="email" /></div>
      {(form.fields ?? []).map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`p-${field.name}`}>{field.label}</Label>
          <Input id={`p-${field.name}`} name={field.name} />
        </div>
      ))}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--primary)]" /> I agree to receive marketing emails. Unsubscribe anytime.</label>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="h-10">Subscribe</Button>
    </form>
  )
}

export default function FormsPage() {
  const [items, setItems] = useState<LeadForm[]>([])
  const [kind, setKind] = useState<FormKind>('Signup Forms')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formKind, setFormKind] = useState<FormKind>('Signup Forms')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [success, setSuccess] = useState('')
  const [tags, setTags] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [newField, setNewField] = useState('')
  const [doubleOptIn, setDoubleOptIn] = useState(false)
  const [submitted, setSubmitted] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<LeadForm | null>(null)

  useEffect(() => {
    api.forms.list().then(setItems).catch((error: Error) => toast.error(error.message))
  }, [])

  const list = items.filter((item) => sameList(item.kind, kind) && item.name.toLowerCase().includes(q.toLowerCase()))
  const selected = items.find((item) => item.id === selectedId && sameList(item.kind, kind)) ?? null
  const pageUrl = selected ? visitorLink(selected.slug) : ''

  const load = (form: LeadForm) => {
    setSelectedId(form.id)
    setFormKind(form.kind === 'Landing Pages' ? 'Signup Forms' : form.kind)
    setName(form.name)
    setTitle(form.title || form.name)
    setDescription(form.description || '')
    setSuccess(form.successMessage || 'Thanks for subscribing!')
    setTags((form.tags ?? []).join(', '))
    setFields(form.fields ?? [])
    setDoubleOptIn(form.doubleOptIn)
    setSubmitted('')
    setErr('')
    requestAnimationFrame(() => document.getElementById('form-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const replace = (saved: LeadForm) => {
    setItems((rows) => rows.map((row) => row.id === saved.id ? saved : row))
    setKind(saved.kind === 'Landing Pages' ? 'Signup Forms' : saved.kind)
    load(saved)
    document.getElementById('form-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const updateForm = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const saved = await api.forms.update(selected.id, {
        name: name.trim() || selected.name,
        kind: formKind === 'Landing Pages' ? 'Signup Forms' : formKind,
        title,
        description,
        successMessage: success,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        fields,
        doubleOptIn,
      })
      replace(saved)
      toast.success('Form updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the form')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: LeadForm['status']) => {
    if (!selected) return
    try {
      const saved = await api.forms.update(selected.id, { status })
      replace(saved)
      toast.success(status === 'Live' ? 'Form is live' : 'Form paused')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the form')
    }
  }

  const removeForm = async () => {
    if (!toDelete) return
    try {
      await api.forms.delete(toDelete.id)
      setItems((rows) => rows.filter((row) => row.id !== toDelete.id))
      if (selectedId === toDelete.id) setSelectedId(null)
      toast.success(`${toDelete.name} deleted`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the form')
    }
  }

  const submitPreview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const person = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim()
    if (!person) return setErr('Please enter your name.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Please enter a valid email.')
    if (!form.get('consent')) return setErr('Please agree to receive emails.')
    if (selected.status !== 'Live') return setErr('Set this form to Live before it can collect emails.')
    const extra: Record<string, string> = {}
    ;(selected.fields ?? []).forEach((field) => { extra[field.name] = String(form.get(field.name) || '') })
    setErr('')
    api.forms.submit(selected.slug, { name: person, email, consent: true, fields: extra }).then(async (result) => {
      setSubmitted(result.message)
      setItems(await api.forms.list())
    }).catch((error: Error) => setErr(error.message))
  }

  const preview = selected && (
    submitted ? (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <p className="text-sm">{submitted}</p>
        <Button variant="outline" onClick={() => setSubmitted('')}>Reset preview</Button>
      </div>
    ) : (
      <SignupFields form={selected} err={err} onSubmit={submitPreview} />
    )
  )

  return (
    <div>
      <PageHeader title="Forms & Landing Pages" description="Each form type collects a signup and stores it on a contact." actions={<Button onClick={async () => {
        try {
          const createdName = `New ${kind.replace(/s$/, '')}`
          const created = await api.forms.create({ name: createdName, kind, tags: [createdName], title: createdName, successMessage: 'Thanks for subscribing!' })
          setItems((rows) => [created, ...rows])
          load(created)
          toast.success(`${created.name} created as a draft`)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not create the form')
        }
      }}><Plus /> Create {kind.replace(/s$/, '')}</Button>} />
      <FilterBar>
        <Segmented label="Type" value={kind} onChange={(value) => { setKind(value); setSelectedId(null) }} options={kinds} />
        <SearchInput value={q} onChange={setQ} placeholder="Search" className="sm:ml-auto" />
      </FilterBar>
      <p className="mb-4 text-sm text-muted-foreground">{kindNotes[kind]}</p>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted"><tr>{['Name', 'Link', 'Tags', 'Status', 'Views', 'Signups', 'Conversion', 'Actions'].map((heading) => <th key={heading} scope="col" className={th}>{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((item) => {
              const link = visitorLink(item.slug)
              return (
              <tr key={item.id} className={cn(item.id === selectedId && 'bg-muted/60')}>
                <td className={`${td} font-medium`}>{item.name}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <span className="max-w-40 truncate text-xs text-muted-foreground">{link}</span>
                    <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(link).then(() => toast.success('Link copied')) }}>Copy</Button>
                    <Button variant="outline" size="sm" onClick={() => window.open(link, '_blank', 'noopener')}>Open</Button>
                  </div>
                </td>
                <td className={`${td} text-muted-foreground`}>{(item.tags ?? []).join(', ') || '—'}</td>
                <td className={td}><StatusBadge status={item.status} /></td>
                <td className={`${td} tabular-nums`}>{item.views.toLocaleString()}</td>
                <td className={`${td} tabular-nums`}>{item.subs.toLocaleString()}</td>
                <td className={`${td} tabular-nums`}>{item.conversionRate === null ? '—' : `${item.conversionRate}%`}</td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => load(item)}>Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => setToDelete(item)}>Delete</Button>
                  </div>
                </td>
              </tr>
              )
            })}
            {list.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </TableWrap>

      {selected ? (
        <div id="form-editor" className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title={`Update ${selected.kind.replace(/s$/, '').toLowerCase()}`} description="Saved fields are what a live signup stores on the contact.">
            <div className="flex flex-col gap-4">
              <NativeSelect label="Form type" value={formKind} onChange={(value) => setFormKind(value as FormKind)} options={[...kinds]} />
              <div className="flex flex-col gap-1.5"><Label htmlFor="f-name">Form name</Label><Input id="f-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="f-title">Form title</Label><Input id="f-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="f-desc">Description</Label><Input id="f-desc" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Extra fields</span>
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Name <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
                  <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Email <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
                  {fields.map((field) => (
                    <li key={field.name} className="flex h-10 items-center rounded-lg border border-border px-3">{field.label}
                      <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove ${field.label}`} onClick={() => setFields((current) => current.filter((item) => item.name !== field.name))}><Trash2 /></Button>
                    </li>
                  ))}
                  <li className="flex h-10 items-center rounded-lg border border-border bg-muted px-3">Consent checkbox <span className="ml-auto text-xs text-muted-foreground">Required</span></li>
                </ul>
                <form className="flex gap-2" onSubmit={(event) => {
                  event.preventDefault()
                  const label = newField.trim()
                  const key = fieldKey(label)
                  if (!label || fields.some((field) => field.name === key)) return
                  setFields((current) => [...current, { name: key, label, type: 'text', required: false }])
                  setNewField('')
                }}>
                  <Input aria-label="New field name" placeholder="Add custom field (e.g. Birthday)" value={newField} onChange={(event) => setNewField(event.target.value)} />
                  <Button type="submit" variant="outline">Add</Button>
                </form>
              </div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="f-tags">Tags</Label><Input id="f-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="newsletter, launch" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doubleOptIn} onChange={(event) => setDoubleOptIn(event.target.checked)} className="size-4 accent-[var(--primary)]" /> Ask subscribers to confirm by email</label>
              <div className="flex flex-col gap-1.5"><Label htmlFor="f-success">Success message</Label><Input id="f-success" value={success} onChange={(event) => setSuccess(event.target.value)} /></div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => { void updateForm() }}>Update</Button>
                {selected.status === 'Live' ? (
                  <Button variant="outline" onClick={() => { void setStatus('Paused') }}>Pause</Button>
                ) : (
                  <Button variant="outline" onClick={() => { void setStatus('Live') }}>Set live</Button>
                )}
                <Button variant="outline" onClick={() => setToDelete(selected)}>Delete</Button>
              </div>
              {pageUrl && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="public-page">{selected.kind === 'Embedded Forms' ? 'Embed this page' : 'Public page'}</Label>
                  {selected.kind === 'Embedded Forms' ? (
                    <textarea id="public-page" readOnly className="min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm" value={embedCode(pageUrl, selected.title || selected.name)} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input id="public-page" readOnly aria-label="Public page" value={pageUrl} />
                      <Button type="button" variant="outline" onClick={() => {
                        void navigator.clipboard.writeText(pageUrl).then(() => toast.success('Link copied'))
                      }}>Copy</Button>
                    </div>
                  )}
                  {selected.kind === 'Embedded Forms' && (
                    <Button type="button" variant="outline" onClick={() => {
                      void navigator.clipboard.writeText(embedCode(pageUrl, selected.title || selected.name)).then(() => toast.success('Embed copied'))
                    }}>Copy embed</Button>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`${selected.kind.replace(/s$/, '')} preview`} description={selected.status === 'Live' ? 'A submit here creates a real contact.' : 'Set this form to Live before it can collect emails.'}>
            {selected.kind === 'Landing Pages' && (
              <div className="rounded-xl border border-border bg-muted/40 p-8">{preview}</div>
            )}
            {selected.kind === 'Popup Forms' && (
              <div className="rounded-xl bg-foreground/40 p-6">
                <div className="mx-auto max-w-sm rounded-xl bg-card p-6 shadow-lg">{preview}</div>
              </div>
            )}
            {selected.kind === 'Embedded Forms' && (
              <div className="rounded-xl border border-dashed border-border p-4">{preview}</div>
            )}
            {selected.kind === 'Signup Forms' && (
              <div className="rounded-xl border border-border p-6">{preview}</div>
            )}
          </Panel>
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">Choose Edit on a {kind.replace(/s$/, '').toLowerCase()} to change it, or create one.</p>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => { if (!open) setToDelete(null) }}
        title={`Delete ${toDelete?.name ?? 'form'}?`}
        description="The form stops collecting signups. Contacts already stored stay in Contacts."
        onConfirm={() => { void removeForm() }}
      />
    </div>
  )
}
