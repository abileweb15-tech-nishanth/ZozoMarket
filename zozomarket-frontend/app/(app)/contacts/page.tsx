'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Download,
  Filter,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PageHeader,
  KpiCard,
  SearchInput,
  NativeSelect,
  FilterBar,
  StatusBadge,
  TableWrap,
  ConfirmDialog,
  th,
  td,
} from '@/components/app/shared'
import { api, type Contact, type Segment } from '@/lib/api'
import { fmtDate } from '@/lib/format'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SegmentFormState = {
  name: string
  description: string
  tags: string[]
  matchType: 'any' | 'all'
  status: string
  source: string
}

const defaultSegmentForm: SegmentFormState = {
  name: '',
  description: '',
  tags: [],
  matchType: 'any',
  status: 'All statuses',
  source: 'All sources',
}

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [tagCount, setTagCount] = useState(0)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [tag, setTag] = useState('All tags')
  const [sel, setSel] = useState<string[]>([])
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toDelete, setToDelete] = useState<string[] | null>(null)
  const [dialog, setDialog] = useState<null | 'import' | 'bulkTag'>(null)
  const bulkTagRef = useRef<HTMLInputElement>(null)

  // Segment creation & management state
  const [segmentDialog, setSegmentDialog] = useState<null | 'create' | 'edit'>(null)
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null)
  const [segmentForm, setSegmentForm] = useState<SegmentFormState>(defaultSegmentForm)
  const [segmentErrors, setSegmentErrors] = useState<Record<string, string>>({})
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null)
  const [newTagInput, setNewTagInput] = useState('')
  const [, startTransition] = useTransition()

  const reloadData = () => {
    api.contacts.list().then(setRows).catch((err: Error) => toast.error(err.message))
    api.contacts.tags().then((tags) => setTagCount(tags.length)).catch(() => {})
    api.segments.list().then(setSegments).catch(() => {})
  }

  useEffect(() => {
    reloadData()
  }, [])

  // Live preview for segment criteria
  useEffect(() => {
    if (!segmentDialog) return
    let active = true
    const timer = setTimeout(() => {
      api.segments.preview({
        tags: segmentForm.tags,
        matchType: segmentForm.matchType,
        status: segmentForm.status === 'All statuses' ? null : segmentForm.status,
        source: segmentForm.source === 'All sources' ? null : segmentForm.source,
      }).then((res) => {
        if (active) setPreviewCount(res.count)
      }).catch(() => {
        if (active) setPreviewCount(null)
      })
    }, 200)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [segmentDialog, segmentForm])

  const allTags = Array.from(new Set(rows.flatMap((r) => r.tags)))
  const activeSegment = segments.find((s) => s.id === activeSegmentId) ?? null

  // Contacts filtering: search + status + tag + active segment rules
  const list = rows.filter((r) => {
    // Basic search and dropdown filters
    const matchesSearch = (r.name + r.email).toLowerCase().includes(q.toLowerCase())
    const matchesStatus = status === 'All statuses' || r.status === status
    const matchesTag = tag === 'All tags' || r.tags.includes(tag)

    if (!matchesSearch || !matchesStatus || !matchesTag) return false

    // Segment rule filtering if a segment is currently selected
    if (activeSegment) {
      if (activeSegment.status && r.status !== activeSegment.status) return false
      if (activeSegment.source && r.source !== activeSegment.source) return false
      if (activeSegment.tags && activeSegment.tags.length > 0) {
        if (activeSegment.matchType === 'all') {
          const hasAll = activeSegment.tags.every((t) => r.tags.includes(t))
          if (!hasAll) return false
        } else {
          const hasAny = activeSegment.tags.some((t) => r.tags.includes(t))
          if (!hasAny) return false
        }
      }
    }

    return true
  })

  const allSelected = list.length > 0 && list.every((r) => sel.includes(r.id))

  const openCreateSegment = () => {
    setSegmentErrors({})
    setSegmentForm(defaultSegmentForm)
    setEditingSegment(null)
    setNewTagInput('')
    setSegmentDialog('create')
  }

  const openEditSegment = (seg: Segment) => {
    setSegmentErrors({})
    setEditingSegment(seg)
    setSegmentForm({
      name: seg.name,
      description: seg.description || '',
      tags: [...seg.tags],
      matchType: seg.matchType || 'any',
      status: seg.status || 'All statuses',
      source: seg.source || 'All sources',
    })
    setNewTagInput('')
    setSegmentDialog('edit')
  }

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = segmentForm.name.trim()
    const errs: Record<string, string> = {}
    if (!name) errs.name = 'Segment name is required'
    else if (
      segments.some(
        (s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== editingSegment?.id
      )
    ) {
      errs.name = 'A segment with this name already exists'
    }

    setSegmentErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      if (editingSegment) {
        const updated = await api.segments.update(editingSegment.id, {
          name,
          description: segmentForm.description.trim(),
          tags: segmentForm.tags,
          matchType: segmentForm.matchType,
          status: segmentForm.status === 'All statuses' ? null : segmentForm.status,
          source: segmentForm.source === 'All sources' ? null : segmentForm.source,
        })
        setSegments((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        toast.success(`Segment "${name}" updated`)
      } else {
        const created = await api.segments.create({
          name,
          description: segmentForm.description.trim(),
          tags: segmentForm.tags,
          matchType: segmentForm.matchType,
          status: segmentForm.status === 'All statuses' ? null : segmentForm.status,
          source: segmentForm.source === 'All sources' ? null : segmentForm.source,
        })
        setSegments((prev) => [created, ...prev])
        setActiveSegmentId(created.id)
        toast.success(`Segment "${name}" created with ${created.contactCount} contact(s)`)
      }
      setSegmentDialog(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save segment')
    }
  }

  const handleDeleteSegment = async () => {
    if (!segmentToDelete) return
    try {
      await api.segments.delete(segmentToDelete.id)
      setSegments((prev) => prev.filter((s) => s.id !== segmentToDelete.id))
      if (activeSegmentId === segmentToDelete.id) {
        setActiveSegmentId(null)
      }
      toast.success(`Segment "${segmentToDelete.name}" deleted`)
      setSegmentToDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete segment')
    }
  }

  const toggleFormTag = (tagName: string) => {
    setSegmentForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagName)
        ? prev.tags.filter((t) => t !== tagName)
        : [...prev.tags, tagName],
    }))
  }

  const handleAddCustomTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return
    e.preventDefault()
    const clean = newTagInput.trim()
    if (!clean) return
    if (!segmentForm.tags.includes(clean)) {
      setSegmentForm((prev) => ({ ...prev, tags: [...prev.tags, clean] }))
    }
    setNewTagInput('')
  }

  const saveContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    const email = String(f.get('email')).trim()
    const consent = f.get('consent') === 'on'
    const errs: Record<string, string> = {}
    if (!name) errs.name = 'Name is required.'
    if (!emailRe.test(email)) errs.email = 'Enter a valid email address.'
    else if (rows.some((r) => r.email === email && (editing === 'new' || r.id !== editing?.id))) {
      errs.email = 'This email already exists.'
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    const tags = String(f.get('tags')).split(',').map((t) => t.trim()).filter(Boolean)
    const contactStatus = consent ? 'Subscribed' : 'Pending'
    try {
      if (editing === 'new') {
        const created = await api.contacts.create({ name, email, tags, source: 'Manual', status: contactStatus })
        setRows((r) => [created, ...r])
        toast.success('Contact added')
      } else if (editing) {
        const updated = await api.contacts.update(editing.id, {
          name,
          email,
          tags,
          status: editing.status === 'Unsubscribed' ? 'Unsubscribed' : contactStatus,
        })
        setRows((r) => r.map((x) => (x.id === editing.id ? updated : x)))
        toast.success('Contact updated')
      }
      setEditing(null)
      // Refresh segments to reflect updated counts
      api.segments.list().then(setSegments).catch(() => {})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the contact')
    }
  }

  const exportCsv = () => {
    const exportRows = list
    const csv = [
      'Name,Email,Tags,Source,Status,Added',
      ...exportRows.map((r) => [r.name, r.email, r.tags.join(';'), r.source, r.status, r.added].join(',')),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = activeSegment ? `contacts-${activeSegment.name.toLowerCase().replace(/\s+/g, '-')}.csv` : 'contacts.csv'
    a.click()
    toast.success(`Exported ${exportRows.length} contacts`)
  }

  const current = editing && editing !== 'new' ? editing : null

  return (
    <div>
      <PageHeader
        title="Contacts & Audience"
        description="Manage your audience, create dynamic segments, and organize subscribers."
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog('import')}>
              <Upload /> Import CSV
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={openCreateSegment}>
              <Layers /> Create Segment
            </Button>
            <Button onClick={() => { setErrors({}); setEditing('new') }}>
              <Plus /> Add Contact
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Contacts" value={String(rows.length)} icon={Users} />
        <KpiCard label="Subscribed" value={String(rows.filter((r) => r.status === 'Subscribed').length)} icon={UserCheck} />
        <KpiCard label="Unsubscribed" value={String(rows.filter((r) => r.status === 'Unsubscribed').length)} icon={UserX} />
        <KpiCard label="Audience Segments" value={String(segments.length)} icon={Layers} />
      </div>

      {/* Segments Pill Selector Bar */}
      <div className="mb-6 rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Audience Segments
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {segments.length} saved
            </span>
          </div>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-primary" onClick={openCreateSegment}>
            <Plus className="size-3.5" /> New Segment
          </Button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* All Contacts pill */}
          <button
            type="button"
            onClick={() => setActiveSegmentId(null)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              activeSegmentId === null
                ? 'border-primary bg-primary/10 text-primary shadow-xs'
                : 'border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>All Contacts</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[11px] font-semibold">
              {rows.length}
            </span>
          </button>

          {/* Dynamic Segment Pills */}
          {segments.map((seg) => {
            const isActive = activeSegmentId === seg.id
            return (
              <div
                key={seg.id}
                className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary/30'
                    : 'border-border bg-background hover:bg-muted/70 text-foreground'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveSegmentId(isActive ? null : seg.id)}
                  className="flex items-center gap-2"
                >
                  <span className="font-semibold">{seg.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[11px] font-semibold ${
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {seg.contactCount}
                  </span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Options for segment ${seg.name}`}
                        className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground"
                      />
                    }
                  >
                    <MoreHorizontal className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditSegment(seg)}>
                      <Pencil className="mr-2 size-3.5" /> Edit Segment
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setSegmentToDelete(seg)}
                    >
                      <Trash2 className="mr-2 size-3.5" /> Delete Segment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filter and Bulk Action Bar */}
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
        <NativeSelect
          label="Subscription status"
          value={status}
          onChange={setStatus}
          options={['All statuses', 'Subscribed', 'Pending', 'Unsubscribed']}
        />
        <NativeSelect label="Tag" value={tag} onChange={setTag} options={['All tags', ...allTags]} />

        {activeSegment && (
          <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <Filter className="size-3.5" />
            <span>
              Segment: <strong>{activeSegment.name}</strong> ({list.length} contacts)
            </span>
            <button
              type="button"
              onClick={() => setActiveSegmentId(null)}
              className="ml-1 rounded hover:bg-primary/20 p-0.5"
              aria-label="Clear active segment filter"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {sel.length > 0 && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-sm text-muted-foreground">{sel.length} selected</span>
            <Button variant="outline" onClick={() => setDialog('bulkTag')}>
              Add tag
            </Button>
            <Button variant="destructive" onClick={() => setToDelete(sel)}>
              Delete
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Contacts Table */}
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              <th scope="col" className={th}>
                <Checkbox
                  aria-label="Select all"
                  checked={allSelected}
                  onCheckedChange={(c) => setSel(c ? list.map((r) => r.id) : [])}
                />
              </th>
              {['Name', 'Email', 'Attributes', 'Tags', 'Source', 'Subscription', 'Date Added'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  No contacts found matching the active filters or segment.
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className={td}>
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      checked={sel.includes(c.id)}
                      onCheckedChange={(v) =>
                        setSel((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                      }
                    />
                  </td>
                  <td className={`${td} font-medium`}>{c.name || '—'}</td>
                  <td className={`${td} text-muted-foreground`}>{c.email}</td>
                  <td className={`${td} text-muted-foreground`}>
                    {Object.entries(c.attributes ?? {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ') || '—'}
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length > 0
                        ? c.tags.map((t) => (
                            <span key={t} className="rounded-md border border-border px-1.5 py-0.5 text-xs">
                              {t}
                            </span>
                          ))
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{c.source}</td>
                  <td className={td}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className={`${td} text-muted-foreground`}>{fmtDate(c.added)}</td>
                  <td className={td}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${c.name}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setErrors({})
                            setEditing(c)
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        {c.status !== 'Unsubscribed' ? (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const updated = await api.contacts.update(c.id, {
                                  status: 'Unsubscribed',
                                })
                                setRows((r) => r.map((x) => (x.id === c.id ? updated : x)))
                                toast.success('Marked as unsubscribed')
                                api.segments.list().then(setSegments).catch(() => {})
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : 'Could not update contact'
                                )
                              }
                            }}
                          >
                            Mark unsubscribed
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled>
                            Resubscribe requires new consent
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setToDelete([c.id])}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>

      {/* Create / Edit Segment Dialog */}
      <Dialog open={!!segmentDialog} onOpenChange={(o) => !o && setSegmentDialog(null)}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSaveSegment} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                {segmentDialog === 'edit' ? 'Edit Segment' : 'Create Segment'}
              </DialogTitle>
              <DialogDescription>
                Define criteria to dynamically group subscribers for campaigns and automations.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="segment-name">Segment Name</Label>
              <Input
                id="segment-name"
                value={segmentForm.name}
                onChange={(e) => setSegmentForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. VIP Customers, High Intent Leads"
                aria-invalid={!!segmentErrors.name}
                required
              />
              {segmentErrors.name && (
                <p className="text-xs text-destructive">{segmentErrors.name}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="segment-desc">Description (Optional)</Label>
              <Input
                id="segment-desc"
                value={segmentForm.description}
                onChange={(e) => setSegmentForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What defines this audience group?"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-status">Subscription Status</Label>
                <select
                  id="segment-status"
                  value={segmentForm.status}
                  onChange={(e) => setSegmentForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="All statuses">All statuses</option>
                  <option value="Subscribed">Subscribed only</option>
                  <option value="Pending">Pending only</option>
                  <option value="Unsubscribed">Unsubscribed only</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="segment-match">Tag Matching Rule</Label>
                <select
                  id="segment-match"
                  value={segmentForm.matchType}
                  onChange={(e) =>
                    setSegmentForm((prev) => ({
                      ...prev,
                      matchType: e.target.value as 'any' | 'all',
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="any">Match ANY selected tag</option>
                  <option value="all">Match ALL selected tags</option>
                </select>
              </div>
            </div>

            {/* Tag Selection */}
            <div className="flex flex-col gap-2">
              <Label>Target Tags</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded-lg border border-border p-2 bg-muted/20">
                {allTags.length === 0 && (
                  <span className="text-xs text-muted-foreground p-1">No tags created yet.</span>
                )}
                {allTags.map((t) => {
                  const isSelected = segmentForm.tags.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleFormTag(t)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'border border-border bg-background hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {t}
                      {isSelected && <X className="size-3" />}
                    </button>
                  )
                })}
              </div>

              {/* Add custom tag input */}
              <div className="flex gap-2">
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddCustomTag}
                  placeholder="Type a tag name and hit Add"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomTag}
                  className="h-8 text-xs shrink-0"
                >
                  Add Tag
                </Button>
              </div>
            </div>

            {/* Real-Time Audience Preview Callout */}
            <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-xs text-primary">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 animate-pulse" />
                <span className="font-medium">Live Audience Estimate:</span>
              </div>
              <span className="font-bold text-sm">
                {previewCount !== null ? `${previewCount} contact(s)` : 'Calculating...'}
              </span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSegmentDialog(null)}>
                Cancel
              </Button>
              <Button type="submit">
                {segmentDialog === 'edit' ? 'Update Segment' : 'Create Segment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Segment Confirmation */}
      <ConfirmDialog
        open={!!segmentToDelete}
        onOpenChange={(o) => !o && setSegmentToDelete(null)}
        title={`Delete segment "${segmentToDelete?.name}"?`}
        description="The contacts in this segment will not be deleted. Only the segment definition is removed."
        onConfirm={handleDeleteSegment}
      />

      {/* Contact Edit / Create Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form noValidate onSubmit={saveContact} className="flex flex-col gap-4" key={current?.id ?? 'new'}>
            <DialogHeader>
              <DialogTitle>{current ? 'Edit contact' : 'Add contact'}</DialogTitle>
              <DialogDescription>Only add people who have agreed to receive email.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                name="name"
                defaultValue={current?.name}
                aria-invalid={!!errors.name}
                aria-describedby="c-name-err"
              />
              {errors.name && <p id="c-name-err" className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                name="email"
                type="email"
                defaultValue={current?.email}
                aria-invalid={!!errors.email}
                aria-describedby="c-email-err"
              />
              {errors.email && <p id="c-email-err" className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-tags">Tags</Label>
              <Input id="c-tags" name="tags" defaultValue={current?.tags.join(', ')} placeholder="VIP, Newsletter" />
              <p className="text-xs text-muted-foreground">Separate with commas.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="consent"
                defaultChecked={current?.status === 'Subscribed'}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>Contact has given explicit consent to receive marketing email.</span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import CSV dialog */}
      <Dialog open={dialog === 'import'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import contacts</DialogTitle>
            <DialogDescription>
              Upload a CSV file with name and email columns. Existing contacts are updated by email.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!importFile) {
                  toast.error('Choose a CSV file first')
                  return
                }
                try {
                  const result = await api.contacts.importCsv(importFile)
                  setRows(await api.contacts.list())
                  api.segments.list().then(setSegments).catch(() => {})
                  toast.success(`Imported ${result.created} new, updated ${result.updated}`)
                  setImportFile(null)
                  setDialog(null)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Import failed')
                }
              }}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add tag dialog */}
      <Dialog open={dialog === 'bulkTag'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const tagName = bulkTagRef.current?.value.trim()
              if (!tagName) {
                toast.error('Enter a tag name')
                return
              }
              try {
                await api.contacts.bulkAddTag(sel, tagName)
                setRows((r) =>
                  r.map((x) =>
                    sel.includes(x.id)
                      ? { ...x, tags: Array.from(new Set([...x.tags, tagName])) }
                      : x
                  )
                )
                api.contacts.tags().then((tags) => setTagCount(tags.length)).catch(() => {})
                api.segments.list().then(setSegments).catch(() => {})
                toast.success(`Tag "${tagName}" added to ${sel.length} contact(s)`)
                setDialog(null)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Could not add tag')
              }
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Add tag to {sel.length} contact(s)</DialogTitle>
              <DialogDescription>The tag will be applied to all selected contacts.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-tag-name">Tag name</Label>
              <Input id="bulk-tag-name" ref={bulkTagRef} placeholder="e.g. VIP, Newsletter" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit">Add tag</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Selected Contacts Confirmation */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.length ?? 0} contact(s)?`}
        description="Deleted contacts are removed from all lists and segments."
        onConfirm={async () => {
          if (!toDelete) return
          await api.contacts.bulkDelete(toDelete)
          setRows((r) => r.filter((x) => !toDelete.includes(x.id)))
          setSel([])
          api.segments.list().then(setSegments).catch(() => {})
          toast.success('Deleted')
        }}
      />
    </div>
  )
}
