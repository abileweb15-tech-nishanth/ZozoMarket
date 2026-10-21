'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Check, Copy, Heading, Image as ImageIcon, Columns2, Minus, MoveVertical, MousePointerClick, Monitor, Pilcrow,
  Redo2, Share2, ShoppingBag, Smartphone, Trash2, Undo2, Megaphone, FileText, ChevronUp, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, Segmented } from '@/components/app/shared'
import { api, type CampaignStatus, type Contact, type EmailBlock, type LeadForm, type MediaAsset } from '@/lib/api'
import { blankDesign, footerText, makeBlock, MERGE_TAGS, preserveSavedDesign, type Brand } from '@/lib/email-design'
import { cn } from '@/lib/utils'

type BlockType = EmailBlock['type']

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

let pendingCreate: Promise<string> | null = null

function createBlank() {
  if (!pendingCreate) {
    pendingCreate = api.workspace.get().then((workspace) =>
      api.campaigns.create({
        name: 'Untitled campaign',
        subject: '',
        preheader: '',
        fromName: workspace.fromName || workspace.name,
        fromEmail: workspace.fromEmail,
        replyTo: workspace.replyTo,
        design: blankDesign(workspace),
      }).then((created) => created.id),
    ).catch((err) => {
      pendingCreate = null
      throw err
    })
  }
  return pendingCreate
}

function storedImage(asset: MediaAsset) {
  return asset.type === 'Image' && (asset.src.includes('/media/') || asset.src.startsWith('http'))
}

function Picture({ src, alt, className, width }: { src?: string; alt: string; className?: string; width?: number }) {
  const style = { width: width ?? '100%', maxWidth: '100%', height: src ? 'auto' : Math.round((width ?? 240) * 0.62) } as React.CSSProperties
  if (!src) return <div style={style} className={cn('inline-flex items-center justify-center bg-muted text-xs text-muted-foreground', className)}>Choose an image</div>
  return <img src={src} alt={alt} style={style} className={className} />
}

function hexColor(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function BlockView({ block }: { block: EmailBlock }) {
  const style = { textAlign: block.align, color: block.color, backgroundColor: block.bg, padding: block.padding, fontSize: block.size, fontFamily: block.font } as React.CSSProperties
  switch (block.type) {
    case 'logo':
      return <div style={style} className="font-bold tracking-tight">{block.image ? <img src={block.image} alt={block.text} style={{ width: block.width ?? 160, maxWidth: '100%', height: 'auto' }} className="inline-block" /> : block.text}</div>
    case 'heading': return <h2 style={style} className="font-bold leading-tight">{block.text}</h2>
    case 'paragraph': return <p style={style} className="leading-relaxed">{block.text}</p>
    case 'image': return <div style={{ textAlign: block.align, backgroundColor: block.bg, padding: block.padding }}><Picture src={block.image} alt={block.text} width={block.width ?? 600} className="inline-block" /></div>
    case 'button': {
      const fill = ['#fff', '#ffffff'].includes(block.bg.toLowerCase()) ? '#4f46e5' : block.bg
      return <div style={{ ...style, backgroundColor: '#ffffff' }}><span className="inline-block rounded-md px-5 py-2.5 font-semibold" style={{ backgroundColor: fill, color: block.color, fontSize: block.size }}>{block.text}</span></div>
    }
    case 'divider': return <div style={style}><hr style={{ borderColor: block.color }} className="border-t" /></div>
    case 'spacer': return <div style={{ height: block.padding }} aria-hidden />
    case 'columns': {
      const [left, right] = block.text.split('|')
      return <div style={style} className="grid grid-cols-2 gap-4"><p className="rounded-md bg-muted p-3">{left}</p><p className="rounded-md bg-muted p-3">{right}</p></div>
    }
    case 'social': return <div style={style}>{block.text}</div>
    case 'product': return <div style={style} className="flex items-center gap-4 text-left"><Picture src={block.image} alt="" width={block.width ?? 80} className="rounded-md object-cover" /><span className="font-medium">{block.text}</span></div>
    case 'banner': return <div style={style} className="font-semibold">{block.text}</div>
    case 'footer': return <div style={style} className="leading-relaxed">{block.text}<br />Unsubscribe</div>
  }
}

function EmailBuilder() {
  const router = useRouter()
  const params = useSearchParams()
  const campaignId = params.get('campaign')
  const [brand, setBrand] = useState<Partial<Brand>>({})
  const [name, setName] = useState('Untitled campaign')
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [status, setStatus] = useState<CampaignStatus>('Draft')
  const [history, setHistory] = useState<EmailBlock[][]>([[]])
  const [index, setIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<'Desktop' | 'Mobile'>('Desktop')
  const [dialog, setDialog] = useState<null | 'test' | 'schedule' | 'template' | 'preview'>(null)
  const [library, setLibrary] = useState<MediaAsset[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [previewContact, setPreviewContact] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('Newsletter')
  const [audienceMode, setAudienceMode] = useState<'all' | 'tags' | 'form'>('all')
  const [tagOptions, setTagOptions] = useState<{ name: string; count: number }[]>([])
  const [forms, setForms] = useState<LeadForm[]>([])
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [pickedForm, setPickedForm] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [mode, setMode] = useState<'visual' | 'code'>('visual')
  const [htmlSource, setHtmlSource] = useState('')
  const [customHtml, setCustomHtml] = useState(false)
  const blockHtmlRef = useRef('')
  const blocks = history[index] ?? []
  const selected = blocks.find((block) => block.id === selectedId) ?? null
  const readOnly = status === 'Sending' || status === 'Sent' || status === 'Failed'
  const idRef = useRef(campaignId)
  const readyRef = useRef(false)
  idRef.current = campaignId
  readyRef.current = ready

  useEffect(() => {
    if (campaignId) pendingCreate = null
  }, [campaignId])

  useEffect(() => {
    api.media.list().then((rows) => setLibrary(rows.filter(storedImage))).catch(() => setLibrary([]))
    api.contacts.list().then(setContacts).catch(() => setContacts([]))
  }, [])

  useEffect(() => {
    let active = true
    setReady(false)
    const load = campaignId
      ? Promise.all([api.campaigns.get(campaignId), api.workspace.get()])
      : createBlank().then((id) => {
          router.replace(`/email/builder?campaign=${id}`)
          return null
        })
    load.then((loaded) => {
      if (!active || !loaded) return
      const [draft, workspace] = loaded
      setBrand(workspace)
      setName(draft.name)
      setSubject(draft.subject)
      setPreheader(draft.preheader)
      setFromName(draft.fromName || workspace.fromName || workspace.name)
      setFromEmail(draft.fromEmail || workspace.fromEmail || '')
      setReplyTo(draft.replyTo || workspace.replyTo || '')
      setStatus(draft.status)
      setPickedTags(draft.audienceTags || [])
      setAudienceMode(draft.audienceTags?.length ? 'tags' : 'all')
      const hasBlocks = draft.design.length > 0
      const design = preserveSavedDesign(hasBlocks ? draft.design : blankDesign(workspace), workspace)
      setHistory([design])
      setIndex(0)
      setSelectedId(design.find((block) => block.type === 'paragraph')?.id ?? design[0]?.id ?? null)
      const savedHtml = draft.html || ''
      const pasted = !hasBlocks && savedHtml.trim().length > 0
      setHtmlSource(savedHtml)
      setCustomHtml(pasted)
      setMode(pasted ? 'code' : 'visual')
      setReady(true)
    }).catch((err: Error) => {
      if (active) toast.error(err.message)
    })
    return () => {
      active = false
    }
  }, [campaignId, router])

  const snapshot = () => ({
    name,
    subject,
    preheader,
    fromName,
    fromEmail: fromEmail || null,
    replyTo: replyTo || null,
    ...(mode === 'code' || customHtml ? { html: htmlSource, design: [] as EmailBlock[] } : { design: blocks }),
  })
  const snapshotRef = useRef(snapshot())
  snapshotRef.current = snapshot()

  const persist = async () => {
    const id = idRef.current
    if (!id || readOnly || !readyRef.current) return
    setSaveState('saving')
    try {
      const saved = await api.campaigns.update(id, snapshotRef.current)
      setStatus(saved.status)
      setSaveState('saved')
    } catch (err) {
      setSaveState('error')
      throw err
    }
  }

  useEffect(() => {
    if (!ready || readOnly || !campaignId) return
    const timer = window.setTimeout(() => {
      persist().catch((err: Error) => toast.error(err.message))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [ready, readOnly, campaignId, name, subject, preheader, fromName, fromEmail, replyTo, blocks, mode, htmlSource, customHtml])

  const openCode = async () => {
    if (mode === 'code') return
    if (customHtml && htmlSource.trim()) {
      setMode('code')
      return
    }
    try {
      const rendered = await api.templates.render({ design: blocks, preheader })
      blockHtmlRef.current = rendered.html
      setHtmlSource(rendered.html)
      setCustomHtml(false)
      setMode('code')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the HTML')
    }
  }

  const editHtml = (value: string) => {
    setHtmlSource(value)
    setCustomHtml(value !== blockHtmlRef.current)
  }

  const useBlocks = () => {
    setCustomHtml(false)
    setMode('visual')
  }

  const commit = (next: EmailBlock[]) => {
    if (readOnly) return
    setHistory((current) => [...current.slice(0, index + 1), next])
    setIndex((current) => current + 1)
  }
  const update = (patch: Partial<EmailBlock>) => selected && commit(blocks.map((block) => (block.id === selected.id ? { ...block, ...patch } : block)))
  const paint = (patch: Partial<EmailBlock>) => {
    if (!selected || readOnly) return
    setHistory((current) => current.map((frame, frameIndex) => (
      frameIndex === index ? frame.map((block) => (block.id === selected.id ? { ...block, ...patch } : block)) : frame
    )))
  }
  const add = (type: BlockType, at = selected ? blocks.indexOf(selected) + 1 : Math.max(blocks.length - 1, 0)) => {
    if (type === 'footer' && blocks.some((block) => block.type === 'footer')) return
    const block = makeBlock(type, brand, type === 'footer' ? { text: footerText(brand) } : undefined)
    commit([...blocks.slice(0, at), block, ...blocks.slice(at)])
    setSelectedId(block.id)
  }
  const move = (id: string, to: number) => {
    const from = blocks.findIndex((block) => block.id === id)
    if (from < 0 || from === to) return
    const next = [...blocks]
    const [item] = next.splice(from, 1)
    next.splice(from < to ? to - 1 : to, 0, item)
    commit(next)
  }
  const onDrop = (event: React.DragEvent, indexAt: number) => {
    event.preventDefault()
    const payload = event.dataTransfer.getData('text/plain')
    if (payload.startsWith('move:')) move(payload.slice(5), indexAt)
    if (payload.startsWith('add:')) add(payload.slice(4) as BlockType, indexAt)
  }
  const del = () => {
    if (!selected || selected.type === 'footer') return
    commit(blocks.filter((block) => block.id !== selected.id))
    setSelectedId(null)
  }
  const dup = () => {
    if (!selected || selected.type === 'footer') return
    const at = blocks.indexOf(selected)
    const copy = { ...selected, id: makeBlock(selected.type).id }
    commit([...blocks.slice(0, at + 1), copy, ...blocks.slice(at + 1)])
    setSelectedId(copy.id)
  }
  const shift = (dir: number) => {
    if (!selected) return
    const from = blocks.indexOf(selected)
    move(selected.id, from + (dir > 0 ? 2 : -1))
  }

  const runTest = async (email: string) => {
    if (!subject.trim()) throw new Error('Add a subject before sending a test')
    await persist()
    const result = await api.campaigns.test(idRef.current!, [email])
    toast.success(`Test sent to ${result.affected} address`)
    setDialog(null)
  }
  const selectedAudienceTags = audienceMode === 'all'
    ? []
    : audienceMode === 'tags'
      ? pickedTags
      : forms.find((form) => form.id === pickedForm)?.tags ?? []

  useEffect(() => {
    if (dialog !== 'schedule') return
    api.contacts.tags().then(setTagOptions).catch(() => setTagOptions([]))
    api.forms.list().then(setForms).catch(() => setForms([]))
  }, [dialog])

  useEffect(() => {
    if (dialog !== 'schedule') return
    if (audienceMode !== 'all' && selectedAudienceTags.length === 0) {
      setRecipientCount(0)
      return
    }
    let active = true
    api.campaigns.estimate(selectedAudienceTags).then((result) => {
      if (active) setRecipientCount(result.recipients)
    }).catch(() => {
      if (active) setRecipientCount(null)
    })
    return () => {
      active = false
    }
  }, [dialog, audienceMode, pickedTags, pickedForm, forms])

  const runSchedule = async (date: string, time: string) => {
    if (!subject.trim()) throw new Error('Add a subject before scheduling')
    if (audienceMode === 'tags' && pickedTags.length === 0) throw new Error('Choose at least one contact tag')
    const form = forms.find((item) => item.id === pickedForm)
    if (audienceMode === 'form' && !form) throw new Error('Choose a form or landing page')
    if (audienceMode === 'form' && selectedAudienceTags.length === 0) {
      throw new Error('This form has no tags yet. Add tags on the form so its subscribers can be selected.')
    }
    await persist()
    const audience = audienceMode === 'all'
      ? 'All subscribers'
      : audienceMode === 'form'
        ? form?.name || 'Form subscribers'
        : pickedTags.join(', ')
    await api.campaigns.update(idRef.current!, { audience, audienceTags: selectedAudienceTags })
    const scheduledAt = new Date(`${date}T${time}`).toISOString()
    const saved = await api.campaigns.schedule(idRef.current!, scheduledAt)
    setStatus(saved.status)
    toast.success(`Scheduled for ${recipientCount ?? 0} subscribers`)
    setDialog(null)
  }
  const saveTemplate = async () => {
    const fromCode = mode === 'code' || customHtml
    if (fromCode && !htmlSource.trim()) throw new Error('Add HTML before saving this template')
    await persist()
    await api.templates.create({
      name: templateName.trim() || name,
      category: templateCategory,
      subject,
      preheader,
      ...(fromCode ? { html: htmlSource, design: [] } : { design: blocks }),
    })
    toast.success('Template saved')
    setDialog(null)
  }
  const showPreview = async (contactId: string) => {
    setPreviewContact(contactId)
    const contact = contacts.find((item) => item.id === contactId)
    const [first, ...rest] = (contact?.name || 'Alex Morgan').split(' ')
    const variables = {
      first_name: first,
      last_name: rest.join(' '),
      name: contact?.name || 'Alex Morgan',
      email: contact?.email || 'alex@example.com',
    }
    if (mode === 'code' || customHtml) {
      setPreviewHtml(htmlSource.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => variables[key as keyof typeof variables] ?? ''))
      return
    }
    const rendered = await api.templates.render({ design: blocks, preheader, variables })
    setPreviewHtml(rendered.html)
  }

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-8 md:-my-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Button variant="ghost" onClick={() => { persist().finally(() => router.push('/email/campaigns')) }}><ArrowLeft /> <span className="hidden sm:inline">Back to Campaigns</span></Button>
        <Input aria-label="Campaign name" value={name} disabled={readOnly} onChange={(event) => setName(event.target.value)} className="h-9 w-48 font-medium sm:w-64" />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5 text-success" aria-hidden />
          {readOnly ? status : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : status}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={readOnly || mode === 'code' || customHtml || index === 0} onClick={() => setIndex((current) => current - 1)}><Undo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={readOnly || mode === 'code' || customHtml || index === history.length - 1} onClick={() => setIndex((current) => current + 1)}><Redo2 /></Button>
          <Segmented label="Editor" value={mode === 'visual' ? 'Visual' : 'Code'} onChange={(value) => { if (value === 'Code') void openCode(); else setMode('visual') }} options={['Visual', 'Code'] as const} />
          <div role="group" aria-label="Preview device" className="flex rounded-lg border border-border p-0.5">
            <Button variant={device === 'Desktop' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Desktop preview" aria-pressed={device === 'Desktop'} onClick={() => setDevice('Desktop')}><Monitor /></Button>
            <Button variant={device === 'Mobile' ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Mobile preview" aria-pressed={device === 'Mobile'} onClick={() => setDevice('Mobile')}><Smartphone /></Button>
          </div>
          <Button variant="outline" onClick={() => { setDialog('preview'); void showPreview(previewContact) }}>Preview</Button>
          <Button variant="outline" disabled={readOnly} onClick={() => { setTemplateName(name); setDialog('template') }}>Save as template</Button>
          <Button variant="outline" disabled={readOnly} onClick={() => setDialog('test')}>Send Test</Button>
          <Button variant="outline" disabled={readOnly} onClick={() => setDialog('schedule')}>Schedule</Button>
          <Button disabled={readOnly} onClick={() => {
            persist().then(() => {
              toast.success(status === 'Scheduled' ? 'Campaign saved' : 'Saved as draft')
              router.push('/email/campaigns')
            }).catch((err: Error) => toast.error(err.message))
          }}>Save draft</Button>
        </div>
      </div>
      <div className="grid gap-2 border-b border-border bg-background px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Subject"><Input aria-label="Subject" value={subject} disabled={readOnly} onChange={(event) => setSubject(event.target.value)} /></Field>
        <Field label="Preheader"><Input aria-label="Preheader" value={preheader} disabled={readOnly} onChange={(event) => setPreheader(event.target.value)} /></Field>
        <Field label="From name"><Input aria-label="From name" value={fromName} disabled={readOnly} onChange={(event) => setFromName(event.target.value)} /></Field>
        <Field label="From email"><Input aria-label="From email" type="email" value={fromEmail} disabled={readOnly} onChange={(event) => setFromEmail(event.target.value)} /></Field>
        <Field label="Reply-to"><Input aria-label="Reply-to" type="email" value={replyTo} disabled={readOnly} onChange={(event) => setReplyTo(event.target.value)} /></Field>
      </div>

      {mode === 'code' ? (
        <section aria-label="HTML code" className="flex flex-1 flex-col gap-3 bg-background p-4">
          <p className="text-sm text-muted-foreground">This HTML is what gets sent. Visual shows this same HTML, and this code stays when you switch back.</p>
          <Textarea aria-label="HTML code" spellCheck={false} value={htmlSource} disabled={readOnly} onChange={(event) => editHtml(event.target.value)} className="min-h-[480px] flex-1 font-mono text-xs" />
        </section>
      ) : customHtml ? (
        <section aria-label="HTML preview" className="flex flex-1 flex-col gap-3 bg-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">This preview is the HTML from Code. Switch back to Code and the same HTML is still there.</p>
            <Button variant="outline" disabled={readOnly} onClick={useBlocks}>Use the previous blocks</Button>
          </div>
          <div className={cn('mx-auto w-full flex-1 overflow-hidden rounded-lg border border-border bg-white', device === 'Desktop' ? 'max-w-6xl' : 'max-w-[440px]')}>
            <iframe title="HTML preview" sandbox="" srcDoc={htmlSource} className="h-[calc(100dvh-12rem)] min-h-[680px] w-full bg-white" />
          </div>
        </section>
      ) : (
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_300px]">
        <aside aria-label="Content blocks" className="border-b border-border bg-background p-4 lg:border-r lg:border-b-0">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Blocks</h2>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
            {palette.map((item) => (
              <button key={item.type} type="button" disabled={readOnly} onClick={() => add(item.type)}
                draggable={!readOnly} onDragStart={(event) => event.dataTransfer.setData('text/plain', `add:${item.type}`)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-2.5 text-center text-xs hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <section aria-label="Email canvas" className="overflow-y-auto bg-muted p-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDrop(event, blocks.length)}>
          <div className={cn('mx-auto overflow-hidden rounded-lg border border-border bg-background transition-all', device === 'Desktop' ? 'max-w-[600px]' : 'max-w-[375px]')} style={{ fontFamily: brand.font }}>
            {blocks.map((block, blockIndex) => (
              <div key={block.id} role="button" tabIndex={0} aria-label={`Select ${block.type} block`} aria-pressed={block.id === selectedId}
                draggable={!readOnly} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', `move:${block.id}`) }}
                onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); onDrop(event, blockIndex) }}
                onClick={() => setSelectedId(block.id)} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), setSelectedId(block.id))}
                className={cn('relative cursor-pointer outline-2 -outline-offset-2 outline-transparent hover:outline-primary/40 focus-visible:outline-ring', block.id === selectedId && 'outline-primary')}>
                <BlockView block={block} />
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
                  <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={readOnly} onClick={() => shift(-1)}><ChevronUp /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={readOnly} onClick={() => shift(1)}><ChevronDown /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Duplicate block" disabled={readOnly || selected.type === 'footer'} onClick={dup}><Copy /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete block" disabled={readOnly || selected.type === 'footer'} onClick={del}><Trash2 className="text-destructive" /></Button>
                </div>
              </div>
              {selected.type === 'footer' && <p className="text-xs text-muted-foreground">This footer stays on every email so recipients can unsubscribe.</p>}
              {!['divider', 'spacer', 'image'].includes(selected.type) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="b-text">Text</Label>
                    <select aria-label="Insert merge tag" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value="" disabled={readOnly} onChange={(event) => { if (event.target.value) update({ text: `${selected.text}${selected.text ? ' ' : ''}${event.target.value}` }) }}>
                      <option value="">Insert tag</option>
                      {MERGE_TAGS.map((tag) => <option key={tag.value} value={tag.value}>{tag.label}</option>)}
                    </select>
                  </div>
                  <Textarea id="b-text" value={selected.text} disabled={readOnly} onChange={(event) => update({ text: event.target.value })} rows={3} />
                  {selected.type === 'columns' && <p className="text-xs text-muted-foreground">Separate columns with “|”.</p>}
                </div>
              )}
              {selected.type === 'button' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="b-link">Button link</Label>
                  <Input id="b-link" value={selected.link} disabled={readOnly} onChange={(event) => update({ link: event.target.value })} />
                </div>
              )}
              {(selected.type === 'image' || selected.type === 'product' || selected.type === 'logo') && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Image</span>
                  {library.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No images yet. <Link href="/media" className="font-medium text-primary underline">Upload one in the Media Library</Link>.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {library.map((asset) => (
                        <button key={asset.id} type="button" disabled={readOnly} aria-label={`Use ${asset.name}`} onClick={() => update({ image: asset.src })} className={cn('overflow-hidden rounded-md border-2', selected.image === asset.src ? 'border-primary' : 'border-transparent')}>
                          <img src={asset.src} alt="" className="aspect-square w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Alignment</span>
                <Segmented label="Alignment" value={selected.align} onChange={(value) => update({ align: value })} options={['left', 'center', 'right'] as const} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium">Style</span>
                {selected.type !== 'image' && selected.type !== 'spacer' && (
                  <ColorField label={selected.type === 'divider' ? 'Line color' : 'Text color'} value={selected.color} fallback="#1f2937" disabled={readOnly} onChange={(color) => paint({ color })} />
                )}
                {selected.type !== 'spacer' && selected.type !== 'divider' && (
                  <ColorField label={selected.type === 'button' ? 'Button color' : 'Background'} value={selected.bg} fallback="#ffffff" disabled={readOnly} onChange={(bg) => paint({ bg })} />
                )}
                {!['image', 'divider', 'spacer', 'logo'].includes(selected.type) && (
                  <RangeField label="Text size" min={8} max={72} value={selected.size} suffix="px" disabled={readOnly} onChange={(size) => paint({ size })} />
                )}
                {selected.type === 'logo' && !selected.image && (
                  <RangeField label="Text size" min={8} max={72} value={selected.size} suffix="px" disabled={readOnly} onChange={(size) => paint({ size })} />
                )}
                {['image', 'logo', 'product'].includes(selected.type) && (
                  <RangeField label="Image size" min={selected.type === 'image' ? 80 : 40} max={selected.type === 'image' ? 600 : selected.type === 'logo' ? 320 : 240} value={selected.width ?? (selected.type === 'image' ? 600 : selected.type === 'logo' ? 160 : 80)} suffix="px" disabled={readOnly} onChange={(width) => paint({ width })} />
                )}
                <RangeField label={selected.type === 'spacer' ? 'Height' : 'Spacing'} min={0} max={selected.type === 'spacer' ? 160 : 64} value={selected.padding} suffix="px" disabled={readOnly} onChange={(padding) => paint({ padding })} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a block on the canvas to edit its settings.</p>
          )}
        </aside>
      </div>
      )}

      <Dialog open={dialog === 'test'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            runTest(String(new FormData(event.currentTarget).get('email'))).catch((err: Error) => toast.error(err.message))
          }}>
            <DialogHeader>
              <DialogTitle>Send test email</DialogTitle>
              <DialogDescription>Sends the saved draft through the configured email provider.</DialogDescription>
            </DialogHeader>
            <Field label="Email address"><Input name="email" type="email" required defaultValue={fromEmail} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit">Send test</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'schedule'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            runSchedule(String(form.get('date')), String(form.get('time'))).catch((err: Error) => toast.error(err.message))
          }}>
            <DialogHeader>
              <DialogTitle>Schedule campaign</DialogTitle>
              <DialogDescription>Choose who receives this email, then when it should go out.</DialogDescription>
            </DialogHeader>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Audience</legend>
              {([
                ['all', 'All subscribers'],
                ['tags', 'Contact tags'],
                ['form', 'Form or landing page'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="audienceMode" checked={audienceMode === value} onChange={() => setAudienceMode(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
            {audienceMode === 'tags' && (
              <div className="flex flex-col gap-2">
                {tagOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags yet. Tag contacts, or use all subscribers.</p>
                ) : tagOptions.map((tag) => (
                  <label key={tag.name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickedTags.includes(tag.name)}
                      onChange={(event) => setPickedTags((current) => event.target.checked ? [...current, tag.name] : current.filter((item) => item !== tag.name))}
                    />
                    {tag.name} ({tag.count})
                  </label>
                ))}
              </div>
            )}
            {audienceMode === 'form' && (
              <Field label="Form or landing page">
                <select aria-label="Form or landing page" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={pickedForm} onChange={(event) => setPickedForm(event.target.value)}>
                  <option value="">Choose one</option>
                  {forms.map((form) => <option key={form.id} value={form.id}>{form.name}{form.tags.length ? ` · ${form.tags.join(', ')}` : ' · no tags'}</option>)}
                </select>
              </Field>
            )}
            <p className="text-sm text-muted-foreground">{recipientCount === null ? 'Checking subscribers…' : `${recipientCount} subscribed contact${recipientCount === 1 ? '' : 's'} will receive this email.`}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input name="date" type="date" required /></Field>
              <Field label="Time"><Input name="time" type="time" required defaultValue="09:00" /></Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit">Schedule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'template'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); saveTemplate().catch((err: Error) => toast.error(err.message)) }}>
            <DialogHeader>
              <DialogTitle>Save as template</DialogTitle>
              <DialogDescription>{mode === 'code' || customHtml ? 'Stores this HTML for the current workspace.' : 'Stores this design for the current workspace.'}</DialogDescription>
            </DialogHeader>
            <Field label="Template name"><Input value={templateName} required onChange={(event) => setTemplateName(event.target.value)} /></Field>
            <Field label="Category"><NativeSelect label="Category" value={templateCategory} onChange={setTemplateCategory} options={['Newsletter', 'Promotional', 'Welcome Email', 'General']} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit">Save template</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'preview'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview as contact</DialogTitle>
            <DialogDescription>Merge tags are filled from the selected contact.</DialogDescription>
          </DialogHeader>
          <select aria-label="Contact" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={previewContact} onChange={(event) => { void showPreview(event.target.value) }}>
            <option value="">Sample contact</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} ({contact.email})</option>)}
          </select>
          <iframe title="Email preview" sandbox="" srcDoc={previewHtml} className="h-[60vh] w-full rounded-md border border-border bg-white" />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{label}{children}</label>
}

function ColorField({ label, value, fallback, disabled, onChange }: { label: string; value: string; fallback: string; disabled?: boolean; onChange: (value: string) => void }) {
  const hex = hexColor(value, fallback)
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input aria-label={label} type="color" value={hex} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-12 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed" />
    </label>
  )
}

function RangeField({ label, min, max, value, suffix, disabled, onChange }: { label: string; min: number; max: number; value: number; suffix: string; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-center justify-between"><span>{label}</span><span className="text-xs text-muted-foreground">{value}{suffix}</span></span>
      <input aria-label={label} type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-primary" />
    </label>
  )
}

export default function EmailBuilderPage() {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Loading builder…</p>}><EmailBuilder /></Suspense>
}
