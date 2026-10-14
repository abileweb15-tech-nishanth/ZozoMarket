'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Heart, ImagePlus, MessageCircle, Repeat2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, Segmented } from '@/components/app/shared'
import { PlatformBadge } from '@/components/app/platform-badge'
import { platforms, type Platform } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const limits: Record<Platform, number> = { Instagram: 2200, Facebook: 63206, LinkedIn: 3000, X: 280, YouTube: 5000, Pinterest: 500, TikTok: 2200 }
const suggestedTags = ['#coffeelover', '#fallvibes', '#maplelatte', '#localroaster', '#coffeetime', '#oatmilk']

const ai = {
  generate: 'Cozy season, meet your new favorite cup. Our Maple Oat Latte is back — warm spices, real maple, and our signature espresso.',
  rewrite: 'The Maple Oat Latte has returned. Real maple, smooth oat milk, and espresso roasted just down the street.',
  tone: 'Okay, it’s official: fall has started. Maple Oat Latte, back by popular demand. Come grab one!',
  ideas: 'Ideas: 1) Behind-the-scenes of maple syrup sourcing  2) Customer taste-test reel  3) “Pair it with” pastry carousel',
  adapt: 'Fall is here at Acme Coffee Co. We’re reintroducing our Maple Oat Latte, made with locally sourced maple and oat milk. Stop by any of our 4 locations.',
}

export default function ComposerPage() {
  const [caption, setCaption] = useState('Autumn is here and so is our Maple Oat Latte. Available in all stores starting today!')
  const [selected, setSelected] = useState<Platform[]>(['Instagram', 'Facebook'])
  const [tags, setTags] = useState<string[]>(['#fallvibes'])
  const [media, setMedia] = useState<string | null>('/images/post-latte.png')
  const [link, setLink] = useState('')
  const [alt, setAlt] = useState('Maple oat latte on a wooden table')
  const [date, setDate] = useState('2026-10-14')
  const [time, setTime] = useState('09:00')
  const [previewOn, setPreviewOn] = useState<Platform>('Instagram')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const toggle = (p: Platform) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
  const fullText = `${caption}${tags.length ? '\n\n' + tags.join(' ') : ''}${link ? '\n' + link : ''}`
  const over = selected.filter((p) => fullText.length > limits[p])
  const runAi = (key: keyof typeof ai | 'hashtags') => {
    setLoading(key)
    setTimeout(() => {
      if (key === 'hashtags') setTags(['#maplelatte', '#fallvibes', '#coffeelover', '#oatmilk'])
      else setCaption(ai[key])
      setLoading(null)
      toast.success('Sample AI output inserted — edit as needed')
    }, 600)
  }
  const validate = () => {
    if (!caption.trim()) return 'Add a caption.'
    if (selected.length === 0) return 'Select at least one platform.'
    if (over.length) return `Caption too long for ${over.join(', ')}.`
    return ''
  }
  const activePreview = selected.includes(previewOn) ? previewOn : selected[0]

  return (
    <div>
      <PageHeader title="Social Media Composer" description="Write once, tailor for each platform." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Compose">
          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Platforms</legend>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <button key={p} type="button" aria-pressed={selected.includes(p)} onClick={() => toggle(p)}
                    className={cn('flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring', selected.includes(p) ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground')}>
                    <PlatformBadge platform={p} /> {p}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="caption">Caption</Label>
                <span className={cn('text-xs tabular-nums', over.length ? 'text-destructive' : 'text-muted-foreground')}>{fullText.length} characters</span>
              </div>
              <Textarea id="caption" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} aria-invalid={!!error && !caption.trim()} />
              <div className="flex flex-wrap gap-2">
                {([['generate', 'Generate Caption'], ['rewrite', 'Rewrite Caption'], ['hashtags', 'Generate Hashtags'], ['tone', 'Adjust Tone'], ['ideas', 'Suggest Ideas'], ['adapt', 'Adapt for Another Platform']] as const).map(([k, l]) => (
                  <Button key={k} variant="outline" size="sm" disabled={!!loading} onClick={() => runAi(k)}><Sparkles /> {loading === k ? 'Generating…' : l}</Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">AI buttons insert sample text — no AI service is connected.</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Hashtag suggestions</span>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((t) => (
                  <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}
                    className={cn('h-7 rounded-full border px-3 text-xs', tags.includes(t) ? 'border-accent-foreground/20 bg-accent text-accent-foreground' : 'border-border text-muted-foreground')}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Media</span>
                {media ? (
                  <div className="relative">
                    <Image src={media} alt={alt} width={300} height={200} unoptimized={media.startsWith('blob:')} className="aspect-video w-full rounded-lg object-cover" />
                    <Button variant="secondary" size="icon-sm" aria-label="Remove media" className="absolute top-2 right-2" onClick={() => setMedia(null)}><X /></Button>
                  </div>
                ) : (
                  <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted">
                    <ImagePlus className="size-5" aria-hidden /> Upload image or video
                    <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setMedia(URL.createObjectURL(f)) }} />
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5"><Label htmlFor="alt">Alt text</Label><Input id="alt" value={alt} onChange={(e) => setAlt(e.target.value)} /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="link">Link</Label><Input id="link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5"><Label htmlFor="date">Date</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                  <div className="flex flex-col gap-1.5"><Label htmlFor="time">Time</Label><Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                </div>
              </div>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => { setError(''); toast.success('Draft saved') }}>Save Draft</Button>
              <Button onClick={() => { const e = validate(); setError(e); if (!e) toast.success(`Scheduled for ${date} at ${time} on ${selected.join(', ')} (simulated)`) }}>Schedule Post</Button>
            </div>
          </div>
        </Panel>

        <Panel title="Preview" className="h-fit xl:sticky xl:top-24">
          {selected.length === 0 ? <p className="text-sm text-muted-foreground">Select a platform to preview.</p> : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto"><Segmented label="Preview platform" value={activePreview} onChange={setPreviewOn} options={selected} /></div>
              <article className="overflow-hidden rounded-xl border border-border">
                <header className="flex items-center gap-2 p-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden>A</span>
                  <div>
                    <p className="text-sm font-semibold">Acme Coffee Co.</p>
                    <p className="text-xs text-muted-foreground">{activePreview === 'X' || activePreview === 'Instagram' || activePreview === 'TikTok' ? '@acmecoffee' : 'Sponsored · Just now'}</p>
                  </div>
                </header>
                {activePreview !== 'Instagram' && <p className="px-3 pb-3 text-sm leading-relaxed whitespace-pre-line">{fullText}</p>}
                {media && <Image src={media} alt={alt} width={420} height={420} unoptimized={media.startsWith('blob:')} className={cn('w-full object-cover', activePreview === 'Instagram' || activePreview === 'TikTok' ? 'aspect-square' : 'aspect-video')} />}
                <div className="flex gap-4 p-3 text-muted-foreground"><Heart className="size-4" aria-hidden /><MessageCircle className="size-4" aria-hidden /><Repeat2 className="size-4" aria-hidden /></div>
                {activePreview === 'Instagram' && <p className="px-3 pb-3 text-sm leading-relaxed whitespace-pre-line"><span className="font-semibold">acmecoffee</span> {fullText}</p>}
              </article>
              <p className="text-xs text-muted-foreground">{fullText.length} / {limits[activePreview]} characters for {activePreview}</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
