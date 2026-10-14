'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import {
  ArrowLeft, Check, Copy, Heading, Image as ImageIcon, Columns2, Minus, MoveVertical, MousePointerClick, Monitor, Pilcrow,
  Redo2, Share2, ShoppingBag, Smartphone, Sparkles, Trash2, Undo2, Megaphone, FileText, ChevronUp, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Segmented, NativeSelect } from '@/components/app/shared'
import { cn } from '@/lib/utils'

type BlockType = 'heading' | 'paragraph' | 'image' | 'button' | 'divider' | 'spacer' | 'columns' | 'social' | 'product' | 'banner' | 'footer' | 'logo'
type Block = { id: string; type: BlockType; text: string; align: 'left' | 'center' | 'right'; size: number; color: string; bg: string; padding: number; link?: string; image?: string }

const palette: { type: BlockType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'heading', label: 'Heading', icon: Heading },
  { type: 'paragraph', label: 'Paragraph', icon: Pilcrow },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'button', label: 'Button', icon: MousePointerClick },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: MoveVertical },
  { type: 'columns', label: 'Two columns', icon: Columns2 },
  { type: 'social', label: 'Social icons', icon: Share2 },
  { type: 'product', label: 'Product card', icon: ShoppingBag },
  { type: 'banner', label: 'Promo banner', icon: Megaphone },
  { type: 'footer', label: 'Footer & Unsubscribe', icon: FileText },
]

const defaults: Record<BlockType, Partial<Block>> = {
  logo: { text: 'Acme Coffee Co.', size: 18 },
  heading: { text: 'Fall flavors are here', size: 28 },
  paragraph: { text: 'Discover our new seasonal menu, crafted with locally roasted beans and warm autumn spices.', size: 15 },
  image: { text: 'Hero image', image: '/images/post-latte.png' },
  button: { text: 'Shop the menu', link: 'https://example.com', size: 15 },
  divider: { text: '' },
  spacer: { text: '', padding: 24 },
  columns: { text: 'Left column content|Right column content', size: 14 },
  social: { text: 'Instagram · Facebook · LinkedIn', size: 13 },
  product: { text: 'Maple Oat Latte — $5.50', image: '/images/post-beans.png', size: 15 },
  banner: { text: '20% off this weekend only', size: 16, bg: '#eef2ff', color: '#3730a3' },
  footer: { text: 'Acme Coffee Co. · 12 Market St · Unsubscribe · Manage preferences', size: 12, color: '#6b7280' },
}

let n = 0
const make = (type: BlockType): Block => ({ id: `b${++n}-${type}`, type, align: 'center', size: 15, color: '#1f2937', bg: '#ffffff', padding: 16, ...defaults[type] } as Block)
const initial: Block[] = (['logo', 'image', 'heading', 'paragraph', 'button', 'columns', 'footer'] as BlockType[]).map(make)

const aiTips = [
  { area: 'Subject line', tip: '“Your fall favorite just dropped” — predicted +6% opens' },
  { area: 'Headline', tip: 'Shorten to “Fall flavors are here” for faster scanning' },
  { area: 'CTA', tip: 'Try “Order your Maple Latte” — more specific action' },
  { area: 'Readability', tip: 'Body copy is grade 7 — great for broad audiences' },
  { area: 'Mobile layout', tip: 'Stack two-column block on mobile for legibility' },
]

function BlockView({ b }: { b: Block }) {
  const style = { textAlign: b.align, color: b.color, backgroundColor: b.bg, padding: b.padding, fontSize: b.size } as React.CSSProperties
  switch (b.type) {
    case 'logo': return <div style={style} className="font-bold tracking-tight">{b.text}</div>
    case 'heading': return <h2 style={style} className="font-bold leading-tight">{b.text}</h2>
    case 'paragraph': return <p style={style} className="leading-relaxed">{b.text}</p>
    case 'image': return <div style={{ ...style, padding: 0 }}><Image src={b.image!} alt={b.text} width={600} height={300} className="h-56 w-full object-cover" /></div>
    case 'button': return <div style={style}><span className="inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground">{b.text}</span></div>
    case 'divider': return <div style={style}><hr className="border-border" /></div>
    case 'spacer': return <div style={{ height: b.padding }} aria-hidden />
    case 'columns': { const [l, r] = b.text.split('|'); return <div style={style} className="grid grid-cols-2 gap-4"><p className="rounded-md bg-muted p-3">{l}</p><p className="rounded-md bg-muted p-3">{r}</p></div> }
    case 'social': return <div style={style} className="text-muted-foreground">{b.text}</div>
    case 'product': return <div style={style} className="flex items-center gap-4 text-left"><Image src={b.image!} alt="" width={80} height={80} className="size-20 rounded-md object-cover" /><span className="font-medium">{b.text}</span></div>
    case 'banner': return <div style={style} className="font-semibold">{b.text}</div>
    case 'footer': return <div style={style} className="leading-relaxed">{b.text}</div>
  }
}

export default function EmailBuilderPage() {
  const [name, setName] = useState('Fall Menu Launch')
  const [history, setHistory] = useState<Block[][]>([initial])
  const [index, setIndex] = useState(0)
  const blocks = history[index]
  const [selectedId, setSelectedId] = useState<string | null>(initial[2].id)
  const [device, setDevice] = useState<'Desktop' | 'Mobile'>('Desktop')
  const [showAi, setShowAi] = useState(true)
  const [dialog, setDialog] = useState<null | 'test' | 'schedule'>(null)
  const selected = blocks.find((b) => b.id === selectedId) ?? null

  const commit = (next: Block[]) => {
    setHistory((h) => [...h.slice(0, index + 1), next])
    setIndex((i) => i + 1)
  }
  const update = (patch: Partial<Block>) => selected && commit(blocks.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)))
  const add = (type: BlockType) => { const b = make(type); const at = selected ? blocks.indexOf(selected) + 1 : blocks.length - 1; commit([...blocks.slice(0, at), b, ...blocks.slice(at)]); setSelectedId(b.id) }
  const dup = () => { if (!selected) return; const at = blocks.indexOf(selected); const c = { ...selected, id: `b${++n}-${selected.type}` }; commit([...blocks.slice(0, at + 1), c, ...blocks.slice(at + 1)]); setSelectedId(c.id) }
  const del = () => { if (!selected) return; commit(blocks.filter((b) => b.id !== selected.id)); setSelectedId(null) }
  const shift = (dir: number) => { if (!selected) return; const i = blocks.indexOf(selected); const j = i + dir; if (j < 0 || j >= blocks.length) return; const c = [...blocks]; [c[i], c[j]] = [c[j], c[i]]; commit(c) }

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-8 md:-my-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Button variant="ghost" nativeButton={false} render={<Link href="/email/campaigns" />}><ArrowLeft /> <span className="hidden sm:inline">Back to Campaigns</span></Button>
        <Input aria-label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-48 font-medium sm:w-64" />
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5 text-success" aria-hidden /> Saved</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}><Undo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={index === history.length - 1} onClick={() => setIndex((i) => i + 1)}><Redo2 /></Button>
          <div role="group" aria-label="Preview device" className="flex rounded-lg border border-border p-0.5">
            <Button variant={device === 'Desktop' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Desktop preview" aria-pressed={device === 'Desktop'} onClick={() => setDevice('Desktop')}><Monitor /></Button>
            <Button variant={device === 'Mobile' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Mobile preview" aria-pressed={device === 'Mobile'} onClick={() => setDevice('Mobile')}><Smartphone /></Button>
          </div>
          <Button variant="outline" onClick={() => setShowAi((s) => !s)} aria-pressed={showAi}><Sparkles /> AI</Button>
          <Button variant="outline" onClick={() => setDialog('test')}>Send Test</Button>
          <Button variant="outline" onClick={() => setDialog('schedule')}>Schedule</Button>
          <Button onClick={() => toast.success('Campaign saved — continue to review (simulated)')}>Continue</Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_300px]">
        <aside aria-label="Content blocks" className="border-b border-border bg-background p-4 lg:border-r lg:border-b-0">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Blocks</h2>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
            {palette.map((p) => (
              <button key={p.type} type="button" onClick={() => add(p.type)}
                draggable onDragEnd={() => add(p.type)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-2.5 text-center text-xs hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">
                <p.icon className="size-4 text-muted-foreground" />
                {p.label}
              </button>
            ))}
          </div>
        </aside>

        <section aria-label="Email canvas" className="overflow-y-auto bg-muted p-6">
          <div className={cn('mx-auto overflow-hidden rounded-lg border border-border bg-background transition-all', device === 'Desktop' ? 'max-w-[600px]' : 'max-w-[375px]')}>
            {blocks.map((b) => (
              <div key={b.id} role="button" tabIndex={0} aria-label={`Select ${b.type} block`} aria-pressed={b.id === selectedId}
                onClick={() => setSelectedId(b.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedId(b.id))}
                className={cn('relative cursor-pointer outline-2 -outline-offset-2 outline-transparent hover:outline-primary/40 focus-visible:outline-ring', b.id === selectedId && 'outline-primary')}>
                <BlockView b={b} />
              </div>
            ))}
          </div>
        </section>

        <aside aria-label="Block settings" className="flex flex-col gap-6 border-t border-border bg-background p-4 lg:border-t-0 lg:border-l">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold capitalize">{selected.type} settings</h2>
                <div className="flex">
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => shift(-1)}><ChevronUp /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => shift(1)}><ChevronDown /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Duplicate block" onClick={dup}><Copy /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete block" onClick={del}><Trash2 className="text-destructive" /></Button>
                </div>
              </div>
              {!['divider', 'spacer', 'image'].includes(selected.type) && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-text">Text</Label>
                  <Textarea id="b-text" value={selected.text} onChange={(e) => update({ text: e.target.value })} rows={3} />
                  {selected.type === 'columns' && <p className="text-xs text-muted-foreground">Separate columns with “|”.</p>}
                </div>
              )}
              {selected.type === 'button' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-link">Button link</Label>
                  <Input id="b-link" value={selected.link} onChange={(e) => update({ link: e.target.value })} />
                </div>
              )}
              {(selected.type === 'image' || selected.type === 'product') && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Image</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['/images/post-latte.png', '/images/post-beans.png', '/images/post-coldbrew.png', '/images/post-cups.png', '/images/post-roastery.png', '/images/post-workshop.png'].map((src) => (
                      <button key={src} type="button" aria-label={`Use ${src.split('/').pop()}`} onClick={() => update({ image: src })} className={cn('overflow-hidden rounded-md border-2', selected.image === src ? 'border-primary' : 'border-transparent')}>
                        <Image src={src} alt="" width={80} height={80} className="aspect-square object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Alignment</span>
                <Segmented label="Alignment" value={selected.align} onChange={(v) => update({ align: v })} options={['left', 'center', 'right'] as const} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-size">Font size</Label>
                  <NativeSelect label="Font size" value={String(selected.size)} onChange={(v) => update({ size: Number(v) })} options={['12', '13', '14', '15', '16', '18', '22', '28', '36']} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-pad">Padding</Label>
                  <Input id="b-pad" type="number" min={0} max={64} value={selected.padding} onChange={(e) => update({ padding: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-color">Text color</Label>
                  <Input id="b-color" type="color" value={selected.color} onChange={(e) => update({ color: e.target.value })} className="p-1" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-bg">Background</Label>
                  <Input id="b-bg" type="color" value={selected.bg} onChange={(e) => update({ bg: e.target.value })} className="p-1" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a block on the canvas to edit its settings.</p>
          )}

          {showAi && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-accent/50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-accent-foreground"><Sparkles className="size-4" aria-hidden /> AI recommendations</h2>
              <ul className="flex flex-col gap-2">
                {aiTips.map((t) => (
                  <li key={t.area} className="text-xs leading-relaxed"><span className="font-semibold">{t.area}:</span> <span className="text-muted-foreground">{t.tip}</span></li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Sample suggestions — no AI service is connected.</p>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); toast.success(dialog === 'test' ? 'Test email queued (simulated)' : 'Campaign scheduled (simulated)'); setDialog(null) }} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{dialog === 'test' ? 'Send test email' : 'Schedule campaign'}</DialogTitle>
              <DialogDescription>{dialog === 'test' ? 'Send a preview to your inbox.' : 'Choose when this campaign should go out.'}</DialogDescription>
            </DialogHeader>
            {dialog === 'test' ? (
              <div className="flex flex-col gap-1.5"><Label htmlFor="test-email">Email address</Label><Input id="test-email" type="email" required defaultValue="jamie@acme.coffee" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><Label htmlFor="s-date">Date</Label><Input id="s-date" type="date" required defaultValue="2026-10-15" /></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="s-time">Time</Label><Input id="s-time" type="time" required defaultValue="09:00" /></div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit">{dialog === 'test' ? 'Send test' : 'Schedule'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
