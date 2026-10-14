'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, SearchInput, FilterBar, EmptyState } from '@/components/app/shared'
import { templates } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const categories = ['All', 'Newsletter', 'Promotional', 'Welcome Email', 'Product Launch', 'Event Invitation', 'Abandoned Cart', 'Re-engagement']

export default function TemplatesPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [preview, setPreview] = useState<(typeof templates)[number] | null>(null)
  const list = templates.filter((t) => (cat === 'All' || t.category === cat) && t.name.toLowerCase().includes(q.toLowerCase()))
  const use = (name: string) => { toast.success(`“${name}” loaded into the builder`); router.push('/email/builder') }

  return (
    <div>
      <PageHeader title="Email Templates" description="Start from a professionally designed layout." />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search templates" />
      </FilterBar>
      <div role="group" aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
            className={cn('h-8 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring', cat === c ? 'border-accent-foreground/20 bg-accent font-medium text-accent-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}>
            {c}
          </button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon={LayoutTemplate} title="No templates match" description="Try a different category or search term." /> : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => (
            <li key={t.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="bg-muted p-4">
                <Image src={t.image} alt={`${t.name} template preview`} width={300} height={400} className="aspect-[3/4] w-full rounded-md object-cover object-top" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold">{t.name}</h2>
                  <p className="text-xs text-muted-foreground">{t.category}</p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setPreview(t)}>Preview</Button>
                  <Button onClick={() => use(t.name)}>Use Template</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>{preview?.category}</DialogDescription>
          </DialogHeader>
          {preview && <Image src={preview.image} alt={`${preview.name} full preview`} width={500} height={660} className="max-h-[60vh] w-full rounded-md object-contain" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
            <Button onClick={() => preview && use(preview.name)}>Use Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
