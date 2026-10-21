'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, SearchInput, FilterBar, EmptyState, ConfirmDialog } from '@/components/app/shared'
import { api, type EmailBlock } from '@/lib/api'
import { ensureFooter, starterLayouts } from '@/lib/email-design'
import { cn } from '@/lib/utils'

const categories = ['All', 'Newsletter', 'Promotional', 'Welcome Email', 'Product Launch', 'Event Invitation', 'Abandoned Cart', 'Re-engagement', 'General']

type Card = {
  id: string
  name: string
  category: string
  subject: string
  preheader: string
  saved: boolean
  design?: EmailBlock[]
}

export default function TemplatesPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<Card[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [preview, setPreview] = useState<Card | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<Card | null>(null)

  useEffect(() => {
    let active = true
    api.templates.list()
      .then((rows) => {
        if (!active) return
        const cards = rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          subject: row.subject || '',
          preheader: row.preheader || '',
          saved: true,
        }))
        setSaved(cards)
        cards.forEach((card) => {
          api.templates.previewHtml(card.id)
            .then((html) => { if (active) setThumbs((current) => ({ ...current, [card.id]: html })) })
            .catch(() => undefined)
        })
      })
      .catch((err: Error) => { if (active) toast.error(err.message) })
    starterLayouts.forEach((layout) => {
      const id = `starter-${layout.key}`
      api.templates.render({ design: layout.design(), preheader: layout.preheader })
        .then((rendered) => { if (active) setThumbs((current) => ({ ...current, [id]: rendered.html })) })
        .catch(() => undefined)
    })
    return () => { active = false }
  }, [])

  const starters: Card[] = starterLayouts.map((layout) => ({
    id: `starter-${layout.key}`,
    name: layout.name,
    category: layout.category,
    subject: layout.subject,
    preheader: layout.preheader,
    saved: false,
    design: layout.design(),
  }))
  const list = [...saved, ...starters].filter((item) =>
    (cat === 'All' || item.category === cat) && item.name.toLowerCase().includes(q.toLowerCase()),
  )

  const loadHtml = async (item: Card) => {
    if (thumbs[item.id]) return thumbs[item.id]
    const html = item.saved
      ? await api.templates.previewHtml(item.id)
      : (await api.templates.render({ design: item.design || [], preheader: item.preheader })).html
    setThumbs((current) => ({ ...current, [item.id]: html }))
    return html
  }

  const openPreview = async (item: Card) => {
    const ready = thumbs[item.id] || ''
    setPreview(item)
    setPreviewHtml(ready)
    if (ready) return
    try {
      setPreviewHtml(await loadHtml(item))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not preview this template')
    }
  }

  const useTemplate = async (item: Card) => {
    setBusy(true)
    try {
      const workspace = await api.workspace.get()
      const source = item.saved ? (await api.templates.get(item.id)).design : item.design || []
      const created = await api.campaigns.create({
        name: item.name,
        subject: item.subject,
        preheader: item.preheader,
        design: ensureFooter(source, workspace),
        templateId: item.saved ? item.id : undefined,
        fromName: workspace.fromName || workspace.name,
        fromEmail: workspace.fromEmail,
        replyTo: workspace.replyTo,
      })
      router.push(`/email/builder?campaign=${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open this template')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Email Templates" description="Start from a saved layout or one of the starter emails." />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search templates" />
      </FilterBar>
      <div role="group" aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
        {categories.map((item) => (
          <button key={item} type="button" aria-pressed={cat === item} onClick={() => setCat(item)}
            className={cn('h-8 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring', cat === item ? 'border-accent-foreground/20 bg-accent font-medium text-accent-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}>{item}</button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon={LayoutTemplate} title="No templates match" description="Try a different category or search term." /> : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((item) => (
            <li key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              <button type="button" aria-label={`Preview ${item.name}`} onClick={() => { void openPreview(item) }} className="relative aspect-[3/4] overflow-hidden bg-white text-left">
                {thumbs[item.id] ? (
                  <iframe title="" sandbox="" srcDoc={thumbs[item.id]} tabIndex={-1} className="pointer-events-none absolute top-0 left-0 h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-white" />
                ) : (
                  <span className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading preview…</span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold">{item.name}</h2>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => { void openPreview(item) }}>Preview</Button>
                  <Button disabled={busy} onClick={() => { void useTemplate(item) }}>Use Template</Button>
                  {item.saved && (
                    <Button variant="outline" className="col-span-2" onClick={() => setToDelete(item)}>Delete</Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>{preview?.category}</DialogDescription>
          </DialogHeader>
          {previewHtml ? (
            <iframe key={previewHtml} title={`${preview?.name || 'Template'} preview`} sandbox="" srcDoc={previewHtml} className="h-[60vh] w-full rounded-md border border-border bg-white" />
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">Loading preview…</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            {preview?.saved && <Button variant="outline" onClick={() => { setToDelete(preview); setPreview(null) }}>Delete</Button>}
            <Button disabled={busy} onClick={() => preview && void useTemplate(preview)}>Use Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete template?"
        description={`“${toDelete?.name}” will be removed from this workspace. Campaigns already created from it stay as they are.`}
        onConfirm={() => {
          if (!toDelete) return
          const id = toDelete.id
          api.templates.delete(id).then(() => {
            setSaved((rows) => rows.filter((row) => row.id !== id))
            setThumbs((current) => {
              const next = { ...current }
              delete next[id]
              return next
            })
            toast.success('Template deleted')
          }).catch((err: Error) => toast.error(err.message))
        }}
      />
    </div>
  )
}
