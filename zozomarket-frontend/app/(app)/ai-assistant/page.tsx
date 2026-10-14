'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Copy, RefreshCw, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, Segmented, NativeSelect, SimulatedNote, EmptyState } from '@/components/app/shared'

const channels = ['Email', 'Social Media', 'Multi-Channel Campaign'] as const
type Channel = (typeof channels)[number]
type Section = { label: string; value: string }

function generate(channel: Channel, goal: string, product: string, audience: string, tone: string, variant: number): Section[] {
  const p = product || 'our new seasonal menu'
  const a = audience || 'loyal customers'
  const v = variant % 2 === 0
  const email: Section[] = [
    { label: 'Subject lines', value: v ? `1. ${p}: made for ${a}\n2. Your next favorite is here\n3. A little something new, just for you` : `1. Don't miss ${p}\n2. ${a}, this one's for you\n3. First look: ${p}` },
    { label: 'Preview text', value: `Discover ${p} — crafted to help you ${goal || 'enjoy more'}.` },
    { label: 'Headline', value: v ? `Meet ${p}` : `Something new is brewing` },
    { label: 'Email body', value: `Hi there,\n\nWe've been working on ${p}, and we think ${a} will love it. In a ${tone.toLowerCase()} spirit, here's what makes it special:\n\n• Thoughtfully made\n• Available starting this week\n• Exclusive early access for subscribers\n\nSee you soon,\nThe Acme team` },
    { label: 'CTA suggestions', value: 'Shop now · Get early access · See what’s new' },
  ]
  const social: Section[] = [
    { label: 'Captions', value: v ? `${p} has arrived. Made for ${a} who appreciate the details.` : `New on the menu: ${p}. Tag someone who needs to try it.` },
    { label: 'Hashtags', value: '#newarrival #shoplocal #coffeelover #fallvibes' },
    { label: 'Content ideas', value: '1. 15-second reveal reel\n2. Behind-the-scenes carousel\n3. Customer reaction story poll' },
    { label: 'Platform variations', value: `Instagram: ${p} is here. Link in bio.\nLinkedIn: We're proud to introduce ${p}, built around feedback from ${a}.\nX: ${p} just dropped. Thoughts?` },
  ]
  if (channel === 'Email') return email
  if (channel === 'Social Media') return social
  return [{ label: 'Campaign concept', value: `Launch ${p} with a coordinated email + social push targeting ${a}.` }, ...email.slice(0, 2), email[3], social[0], social[3]]
}

export default function AiAssistantPage() {
  const router = useRouter()
  const [channel, setChannel] = useState<Channel>('Email')
  const [goal, setGoal] = useState('Drive in-store visits for our fall launch')
  const [product, setProduct] = useState('the Maple Oat Latte')
  const [audience, setAudience] = useState('local coffee lovers')
  const [tone, setTone] = useState('Friendly')
  const [lang, setLang] = useState('English')
  const [results, setResults] = useState<Section[] | null>(null)
  const [variant, setVariant] = useState(0)
  const [loading, setLoading] = useState(false)

  const run = (v = variant) => {
    if (!goal.trim()) { toast.error('Add a campaign goal first'); return }
    setLoading(true)
    setTimeout(() => { setResults(generate(channel, goal, product, audience, tone, v)); setLoading(false) }, 700)
  }

  return (
    <div>
      <PageHeader title="AI Marketing Assistant" description="Draft on-brand email and social content in seconds." />
      <div className="mb-6"><SimulatedNote>Outputs are sample text generated locally in your browser — no AI service is called.</SimulatedNote></div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <Panel title="Brief" className="h-fit">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run() }}>
            <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Channel</span>
              <div className="overflow-x-auto"><Segmented label="Channel" value={channel} onChange={setChannel} options={channels} /></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="goal">Campaign goal</Label><Input id="goal" required value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="product">Product or business</Label><Textarea id="product" rows={2} value={product} onChange={(e) => setProduct(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="aud">Target audience</Label><Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Tone</span><NativeSelect label="Tone" value={tone} onChange={setTone} options={['Friendly', 'Professional', 'Playful', 'Bold', 'Luxurious']} /></div>
              <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Language</span><NativeSelect label="Language" value={lang} onChange={setLang} options={['English', 'Spanish', 'French', 'German', 'Japanese']} /></div>
            </div>
            <Button type="submit" className="h-10" disabled={loading}><Sparkles /> {loading ? 'Generating…' : 'Generate content'}</Button>
          </form>
        </Panel>

        <Panel title="Results" description={results ? `${channel} · ${tone} · ${lang}` : undefined}
          actions={results && <Button variant="outline" size="sm" disabled={loading} onClick={() => { const v = variant + 1; setVariant(v); run(v) }}><RefreshCw /> Regenerate</Button>}>
          {!results ? <EmptyState icon={Sparkles} title="No content yet" description="Fill in the brief and click Generate to see sample drafts." /> : (
            <div className="flex flex-col gap-5" aria-busy={loading}>
              {results.map((s, i) => (
                <div key={s.label + i} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`r-${i}`}>{s.label}</Label>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(s.value); toast.success('Copied') }}><Copy /> Copy</Button>
                      <Button variant="ghost" size="sm" onClick={() => { toast.success('Inserted into composer (demo)'); router.push(channel === 'Social Media' ? '/social/composer' : '/email/builder') }}><Send /> Insert into Composer</Button>
                    </div>
                  </div>
                  <Textarea id={`r-${i}`} rows={Math.min(8, s.value.split('\n').length + 1)} value={s.value} onChange={(e) => setResults((r) => r!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
