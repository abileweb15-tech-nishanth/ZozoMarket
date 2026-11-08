'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GripVertical,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ConfirmDialog,
  PageHeader,
  SearchInput,
  FilterBar,
  StatusBadge,
  TableWrap,
  Segmented,
  Panel,
  NativeSelect,
  th,
  td,
} from '@/components/app/shared'
import { api, type FormField, type FormSubmission, type LeadForm } from '@/lib/api'
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
  const name = words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
  return (name || 'field').replace(/^\d/, 'f')
}

function SignupFields({
  form,
  err,
  onSubmit,
}: {
  form: LeadForm
  err: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
      <h3 className="text-lg font-semibold text-balance">{form.title || form.name}</h3>
      {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" name="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-email">Email</Label>
        <Input id="p-email" name="email" type="email" />
      </div>
      {(form.fields ?? []).map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`p-${field.name}`}>
            {field.label}
            {field.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          {field.type === 'textarea' ? (
            <textarea
              id={`p-${field.name}`}
              name={field.name}
              rows={3}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : field.type === 'checkbox' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id={`p-${field.name}`}
                name={field.name}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              <span>{field.label}</span>
            </label>
          ) : (
            <Input
              id={`p-${field.name}`}
              name={field.name}
              type={field.type === 'email' || field.type === 'tel' || field.type === 'number' ? field.type : 'text'}
            />
          )}
        </div>
      ))}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--primary)]" /> I agree to receive marketing
        emails. Unsubscribe anytime.
      </label>
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
  const [newFieldType, setNewFieldType] = useState<FormField['type']>('text')
  const [newFieldRequired, setNewFieldRequired] = useState(false)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [doubleOptIn, setDoubleOptIn] = useState(false)
  const [submitted, setSubmitted] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<LeadForm | null>(null)

  // Submissions state
  const [activeTab, setActiveTab] = useState<'editor' | 'submissions'>('editor')
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)

  useEffect(() => {
    api.forms.list().then(setItems).catch((error: Error) => toast.error(error.message))
  }, [])

  const list = items.filter((item) => sameList(item.kind, kind) && item.name.toLowerCase().includes(q.toLowerCase()))
  const selected = items.find((item) => item.id === selectedId && sameList(item.kind, kind)) ?? null
  const pageUrl = selected ? visitorLink(selected.slug) : ''

  const loadSubmissions = async (formId: string) => {
    setLoadingSubmissions(true)
    try {
      const list = await api.forms.submissions(formId)
      setSubmissions(list)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load submissions')
    } finally {
      setLoadingSubmissions(false)
    }
  }

  const exportSubmissions = async () => {
    if (!selected) return
    try {
      toast.info('Exporting submissions...')
      await api.forms.exportCsv(selected.id, selected.name)
      toast.success('Submissions downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export submissions')
    }
  }

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
    setActiveTab('editor')
    void loadSubmissions(form.id)
    requestAnimationFrame(() => document.getElementById('form-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const replace = (saved: LeadForm) => {
    setItems((rows) => rows.map((row) => (row.id === saved.id ? saved : row)))
    setKind(saved.kind === 'Landing Pages' ? 'Signup Forms' : saved.kind)
    load(saved)
    document.getElementById('form-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const moveField = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= fields.length) return
    setFields((current) => {
      const updated = [...current]
      const [moved] = updated.splice(fromIdx, 1)
      updated.splice(toIdx, 0, moved)
      return updated
    })
  }

  const updateForm = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const saved = await api.forms.update(selected.id, {
        name: name.trim() || selected.name,
        kind: formKind,
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
    ;(fields ?? []).forEach((field) => {
      if (field.type === 'checkbox') {
        extra[field.name] = form.get(field.name) ? 'true' : 'false'
      } else {
        extra[field.name] = String(form.get(field.name) || '').trim()
      }
    })
    for (const field of fields ?? []) {
      if (field.required) {
        const val = extra[field.name]
        if (!val || (field.type === 'checkbox' && val !== 'true')) {
          return setErr(`Please fill in "${field.label}".`)
        }
      }
    }
    setErr('')
    api.forms
      .submit(selected.slug, { name: person, email, consent: true, fields: extra })
      .then(async (result) => {
        setSubmitted(result.message)
        setItems(await api.forms.list())
        void loadSubmissions(selected.id)
      })
      .catch((error: Error) => setErr(error.message))
  }

  const preview = selected && (
    submitted ? (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden />
        <p className="text-sm">{submitted}</p>
        <Button variant="outline" onClick={() => setSubmitted('')}>
          Reset preview
        </Button>
      </div>
    ) : (
      <SignupFields form={{ ...selected, fields }} err={err} onSubmit={submitPreview} />
    )
  )

  return (
    <div>
      <PageHeader
        title="Forms & Landing Pages"
        description="Each form has a unique public link and collects responses stored on contacts."
        actions={
          <Button
            onClick={async () => {
              try {
                const createdName = `New ${kind.replace(/s$/, '')}`
                const created = await api.forms.create({
                  name: createdName,
                  kind,
                  tags: [createdName],
                  title: createdName,
                  successMessage: 'Thanks for subscribing!',
                })
                setItems((rows) => [created, ...rows])
                load(created)
                toast.success(`${created.name} created as a draft`)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not create the form')
              }
            }}
          >
            <Plus /> Create {kind.replace(/s$/, '')}
          </Button>
        }
      />
      <FilterBar>
        <Segmented
          label="Type"
          value={kind}
          onChange={(value) => {
            setKind(value)
            setSelectedId(null)
          }}
          options={kinds}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Search forms" className="sm:ml-auto" />
      </FilterBar>
      <p className="mb-4 text-sm text-muted-foreground">{kindNotes[kind]}</p>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['Name', 'Unique URL', 'Tags', 'Status', 'Views', 'Signups', 'Conversion', 'Actions'].map((heading) => (
                <th key={heading} scope="col" className={th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((item) => {
              const link = visitorLink(item.slug)
              return (
                <tr key={item.id} className={cn(item.id === selectedId && 'bg-muted/60')}>
                  <td className={`${td} font-medium`}>{item.name}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="max-w-44 truncate font-mono text-xs text-muted-foreground" title={link}>
                        {link}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(link).then(() => toast.success('Unique link copied'))
                        }}
                      >
                        <Copy className="size-3 mr-1" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(link, '_blank', 'noopener')}>
                        <ExternalLink className="size-3 mr-1" /> Open
                      </Button>
                    </div>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{(item.tags ?? []).join(', ') || '—'}</td>
                  <td className={td}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className={`${td} tabular-nums`}>{item.views.toLocaleString()}</td>
                  <td className={`${td} tabular-nums`}>{item.subs.toLocaleString()}</td>
                  <td className={`${td} tabular-nums`}>
                    {item.conversionRate === null ? '—' : `${item.conversionRate}%`}
                  </td>
                  <td className={td}>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => load(item)}>
                        Manage
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setToDelete(item)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing here yet. Click Create {kind.replace(/s$/, '')} to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>

      {selected ? (
        <div id="form-editor" className="mt-8 flex flex-col gap-6">
          {/* Sub-navigation bar for selected form */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={activeTab === 'editor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('editor')}
              >
                Form Builder & Preview
              </Button>
              <Button
                variant={activeTab === 'submissions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTab('submissions')
                  void loadSubmissions(selected.id)
                }}
              >
                Submissions ({submissions.length})
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Unique URL:</span>
              <span className="max-w-xs truncate font-mono text-xs text-muted-foreground hidden sm:inline">
                {pageUrl}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(pageUrl).then(() => toast.success('Public form link copied'))
                }}
              >
                <Copy className="size-3.5 mr-1" /> Copy Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(pageUrl, '_blank', 'noopener')}
              >
                <ExternalLink className="size-3.5 mr-1" /> View Live Page
              </Button>
            </div>
          </div>

          {activeTab === 'editor' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel
                title={`Configure ${selected.name}`}
                description="Customise fields, labels, and actions. Signups are stored as contacts."
              >
                <div className="flex flex-col gap-4">
                  <NativeSelect
                    label="Form type"
                    value={formKind}
                    onChange={(value) => setFormKind(value as FormKind)}
                    options={[...kinds]}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-name">Internal Form Name</Label>
                    <Input id="f-name" value={name} onChange={(event) => setName(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-title">Public Headline / Title</Label>
                    <Input id="f-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-desc">Description</Label>
                    <Input id="f-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
                  </div>

                  {/* Form fields with drag-and-drop & arrow reordering */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Fields & Order</span>
                      <span className="text-xs text-muted-foreground">Drag or use arrows to reorder</span>
                    </div>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex h-10 items-center rounded-lg border border-border bg-muted/60 px-3 text-muted-foreground">
                        <span className="font-medium text-foreground">Name</span>
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">text</span>
                        <span className="ml-auto text-xs text-muted-foreground">Required (System)</span>
                      </li>
                      <li className="flex h-10 items-center rounded-lg border border-border bg-muted/60 px-3 text-muted-foreground">
                        <span className="font-medium text-foreground">Email</span>
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">email</span>
                        <span className="ml-auto text-xs text-muted-foreground">Required (System)</span>
                      </li>
                      {fields.map((field, idx) => (
                        <li
                          key={field.name}
                          draggable
                          onDragStart={() => setDraggedIdx(idx)}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDragOverIdx(idx)
                          }}
                          onDragLeave={() => {
                            if (dragOverIdx === idx) setDragOverIdx(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (draggedIdx !== null && draggedIdx !== idx) {
                              moveField(draggedIdx, idx)
                            }
                            setDraggedIdx(null)
                            setDragOverIdx(null)
                          }}
                          onDragEnd={() => {
                            setDraggedIdx(null)
                            setDragOverIdx(null)
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors',
                            draggedIdx === idx && 'opacity-40 border-dashed border-primary',
                            dragOverIdx === idx && draggedIdx !== idx && 'border-primary bg-primary/5 ring-1 ring-primary'
                          )}
                        >
                          <span
                            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                            title="Drag to reorder"
                          >
                            <GripVertical className="size-4" />
                          </span>
                          <div className="flex flex-1 items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{field.label}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                              {field.type}
                            </span>
                            {field.required && (
                              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                                Required
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={idx === 0}
                              aria-label="Move field up"
                              title="Move up"
                              onClick={() => moveField(idx, idx - 1)}
                            >
                              <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={idx === fields.length - 1}
                              aria-label="Move field down"
                              title="Move down"
                              onClick={() => moveField(idx, idx + 1)}
                            >
                              <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${field.label}`}
                              title="Remove field"
                              onClick={() =>
                                setFields((current) => current.filter((item) => item.name !== field.name))
                              }
                            >
                              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </li>
                      ))}
                      <li className="flex h-10 items-center rounded-lg border border-border bg-muted/60 px-3 text-muted-foreground">
                        <span className="font-medium text-foreground">Consent checkbox</span>
                        <span className="ml-auto text-xs text-muted-foreground">Required (System)</span>
                      </li>
                    </ul>

                    {/* Add new custom field section */}
                    <form
                      className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 bg-muted/20"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const label = newField.trim()
                        const key = fieldKey(label)
                        if (!label || fields.some((field) => field.name === key)) return
                        setFields((current) => [
                          ...current,
                          { name: key, label, type: newFieldType, required: newFieldRequired },
                        ])
                        setNewField('')
                        setNewFieldRequired(false)
                      }}
                    >
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          aria-label="New field name"
                          placeholder="Custom field label (e.g. Company, Phone, Notes)"
                          value={newField}
                          onChange={(event) => setNewField(event.target.value)}
                          className="flex-1"
                        />
                        <select
                          value={newFieldType}
                          onChange={(e) => setNewFieldType(e.target.value as FormField['type'])}
                          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium"
                        >
                          <option value="text">Single Line (Text)</option>
                          <option value="textarea">Multi-line (Textarea)</option>
                          <option value="email">Email</option>
                          <option value="tel">Phone (Tel)</option>
                          <option value="number">Number</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newFieldRequired}
                            onChange={(e) => setNewFieldRequired(e.target.checked)}
                            className="size-3.5 rounded border-input accent-[var(--primary)]"
                          />
                          Make field required
                        </label>
                        <Button type="submit" size="sm" variant="outline" disabled={!newField.trim()}>
                          <Plus className="size-3.5 mr-1" /> Add Field
                        </Button>
                      </div>
                    </form>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-tags">Tags (applied to signups)</Label>
                    <Input
                      id="f-tags"
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="newsletter, launch"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={doubleOptIn}
                      onChange={(event) => setDoubleOptIn(event.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Ask subscribers to confirm by email (Double opt-in)
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="f-success">Success message</Label>
                    <Input
                      id="f-success"
                      value={success}
                      onChange={(event) => setSuccess(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button disabled={saving} onClick={() => { void updateForm() }}>
                      Save Changes
                    </Button>
                    {selected.status === 'Live' ? (
                      <Button variant="outline" onClick={() => { void setStatus('Paused') }}>
                        Pause Form
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => { void setStatus('Live') }}>
                        Set Form Live
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setToDelete(selected)}>
                      Delete Form
                    </Button>
                  </div>

                  {pageUrl && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <Label htmlFor="public-page">
                        {selected.kind === 'Embedded Forms' ? 'Embed Code' : 'Unique Public URL'}
                      </Label>
                      {selected.kind === 'Embedded Forms' ? (
                        <textarea
                          id="public-page"
                          readOnly
                          className="min-h-20 rounded-lg border border-input bg-muted/40 p-2 font-mono text-xs"
                          value={embedCode(pageUrl, selected.title || selected.name)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            id="public-page"
                            readOnly
                            aria-label="Public page"
                            value={pageUrl}
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(pageUrl).then(() => toast.success('Link copied'))
                            }}
                          >
                            <Copy className="size-3.5 mr-1" /> Copy
                          </Button>
                        </div>
                      )}
                      {selected.kind === 'Embedded Forms' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            void navigator
                              .clipboard.writeText(embedCode(pageUrl, selected.title || selected.name))
                              .then(() => toast.success('Embed copied'))
                          }}
                        >
                          <Copy className="size-3.5 mr-1" /> Copy embed snippet
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title={`${selected.kind.replace(/s$/, '')} Live Preview`}
                description={
                  selected.status === 'Live'
                    ? 'Previewing live mode: submissions here create contacts and appear in Submissions.'
                    : 'Set this form to Live before it can collect emails.'
                }
              >
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
            /* Submissions and Responses Tab */
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Submissions for &ldquo;{selected.name}&rdquo;</h3>
                  <p className="text-sm text-muted-foreground">
                    All form response data captured from public submissions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingSubmissions}
                    onClick={() => void loadSubmissions(selected.id)}
                  >
                    <RefreshCw className={cn('size-3.5 mr-1', loadingSubmissions && 'animate-spin')} /> Refresh
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={submissions.length === 0}
                    onClick={() => void exportSubmissions()}
                  >
                    <Download className="size-3.5 mr-1" /> Export to CSV
                  </Button>
                </div>
              </div>

              <TableWrap>
                <table className="w-full">
                  <thead className="border-b border-border bg-muted">
                    <tr>
                      {['Submitted At', 'Name', 'Email', 'Form Responses', 'IP Address'].map((heading) => (
                        <th key={heading} scope="col" className={th}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submissions.map((sub) => {
                      const customEntries = Object.entries(sub.data || {}).filter(([k]) => k !== 'website')
                      return (
                        <tr key={sub.id}>
                          <td className={`${td} text-xs text-muted-foreground whitespace-nowrap`}>
                            {new Date(sub.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className={`${td} font-medium`}>{sub.name || '—'}</td>
                          <td className={td}>
                            <span className="font-mono text-xs">{sub.email}</span>
                          </td>
                          <td className={td}>
                            {customEntries.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {customEntries.map(([key, val]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                                  >
                                    <span className="font-medium text-foreground">{key}:</span>
                                    <span className="text-muted-foreground">{String(val)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Standard signup</span>
                            )}
                          </td>
                          <td className={`${td} text-xs font-mono text-muted-foreground`}>
                            {sub.ipAddress || '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {submissions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          {loadingSubmissions ? (
                            <span>Loading submissions...</span>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <FileText className="size-8 text-muted-foreground/50" />
                              <p className="font-medium">No submissions recorded yet for this form.</p>
                              <p className="text-xs">
                                Share your public link <span className="font-mono text-foreground">{pageUrl}</span> to start collecting responses!
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          Choose Manage on a {kind.replace(/s$/, '').toLowerCase()} to edit fields or view responses.
        </p>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title={`Delete ${toDelete?.name ?? 'form'}?`}
        description="The form stops collecting signups. Contacts already stored stay in Contacts."
        onConfirm={() => {
          void removeForm()
        }}
      />
    </div>
  )
}
