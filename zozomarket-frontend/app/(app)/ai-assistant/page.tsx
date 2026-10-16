'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Copy, Mail, RefreshCw, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Panel, Segmented, NativeSelect, SimulatedNote, EmptyState } from '@/components/app/shared'

const emailFormats = ['Newsletter', 'Promotional Blast', 'Welcome Sequence', 'Announcement'] as const
type EmailFormat = (typeof emailFormats)[number]
type Section = { label: string; value: string }

function generateEmail(format: EmailFormat, goal: string, product: string, audience: string, tone: string, variant: number): Section[] {
  const p = product || 'our new seasonal collection'
  const a = audience || 'loyal subscribers'
  const v = variant % 2 === 0

  if (format === 'Newsletter') {
    return [
      { label: 'Subject line options', value: v ? `1. Inside our world: ${p}\n2. Stories & updates curated for ${a}\n3. This month’s highlights & favorites` : `1. The monthly roundup: ${p}\n2. Fresh perspectives for ${a}\n3. What we’re loving right now` },
      { label: 'Preview text', value: `Your monthly digest on ${p} and helpful tips inside.` },
      { label: 'Newsletter header', value: v ? `The Monthly Edit: ${p}` : `October Insights for ${a}` },
      { label: 'Featured article', value: `Hi {{first_name}},\n\nWelcome to this month's digest! We've gathered the most exciting news around ${p}, crafted in a ${tone.toLowerCase()} voice.\n\nHere are 3 key highlights:\n• Fresh updates and improvements\n• Customer story spotlight\n• Exclusive perks for subscribers\n\nWarmly,\nThe ZozoMarket Team` },
      { label: 'Call to action', value: 'Read full story · Explore the collection · Share feedback' },
    ]
  }

  if (format === 'Promotional Blast') {
    return [
      { label: 'High-converting subject lines', value: v ? `1. Limited time: 20% off ${p}\n2. ${a}, unlock early access now\n3. Don't miss out on ${p}` : `1. Flash sale: exclusive savings on ${p}\n2. Just for you: special offer inside\n3. Ending soon: your pass to ${p}` },
      { label: 'Pre-header text', value: `Claim your VIP discount on ${p} before midnight.` },
      { label: 'Headline banner', value: v ? `Special Savings on ${p}` : `An Exclusive Treat for ${a}` },
      { label: 'Promotional body', value: `Hello {{first_name}},\n\nFor a limited time, enjoy an exclusive perk on ${p}. Whether you’re gearing up for the season or treating yourself, we’ve made sure ${a} get the best value.\n\nUse code ZOZOVIP at checkout.\n\nOffer expires this Sunday at midnight!` },
      { label: 'Primary CTA button', value: 'Shop the Sale Now · Claim Your Code' },
    ]
  }

  if (format === 'Welcome Sequence') {
    return [
      { label: 'Welcome subject lines', value: v ? `1. Welcome to the family! (Your gift inside)\n2. We're glad you're here, {{first_name}}\n3. Getting started with ${p}` : `1. Welcome! Here's what to expect\n2. First look at ${p}\n3. A warm welcome from our founders` },
      { label: 'Preview text', value: `Thanks for subscribing! Enjoy 15% off your first order.` },
      { label: 'Welcome header', value: `You’re officially in, {{first_name}}!` },
      { label: 'Welcome message', value: `Hi {{first_name}},\n\nThank you for joining our community! We created this space to share helpful guides, special product announcements, and early access to ${p}.\n\nAs a thank you, here’s 15% off your next order with coupon WELCOME15.\n\nCheers,\nThe ZozoMarket Team` },
      { label: 'Onboarding steps', value: '1. Complete your profile\n2. Browse popular collections\n3. Join our loyalty program' },
    ]
  }

  // Announcement
  return [
    { label: 'Announcement subject lines', value: v ? `1. Introducing: ${p}\n2. Big news for ${a}\n3. It’s finally here: ${p}` : `1. Exciting update: meet ${p}\n2. Designed for ${a}\n3. Something brand new has landed` },
    { label: 'Preview text', value: `Discover all the details about ${p} and what it means for you.` },
    { label: 'Headline', value: `Introducing ${p}` },
    { label: 'Announcement body', value: `Dear {{first_name}},\n\nWe’ve been working behind the scenes on something special, and we are thrilled to officially unveil ${p}.\n\nBuilt specifically for ${a}, this update addresses your most requested features with speed and elegance.\n\nDiscover all the details below.` },
    { label: 'Call to action', value: 'Explore the Launch · Learn More · Watch Video' },
  ]
}

export default function AiAssistantPage() {
  const router = useRouter()
  const [format, setFormat] = useState<EmailFormat>('Newsletter')
  const [goal, setGoal] = useState('Announce our seasonal launch and drive store orders')
  const [product, setProduct] = useState('the Autumn Maple Roast')
  const [audience, setAudience] = useState('VIP coffee subscribers')
  const [tone, setTone] = useState('Friendly')
  const [lang, setLang] = useState('English')
  const [results, setResults] = useState<Section[] | null>(null)
  const [variant, setVariant] = useState(0)
  const [loading, setLoading] = useState(false)

  const run = (v = variant) => {
    if (!goal.trim()) { toast.error('Add an email campaign goal first'); return }
    setLoading(true)
    setTimeout(() => { setResults(generateEmail(format, goal, product, audience, tone, v)); setLoading(false) }, 600)
  }

  return (
    <div>
      <PageHeader
        title="AI Email Copywriter"
        description="Draft high-converting email subject lines, preview text, headers, and body copy in seconds."
      />
      <div className="mb-6">
        <SimulatedNote>Outputs are generated in your browser — copy text directly or click &quot;Insert into Email Builder&quot;.</SimulatedNote>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <Panel title="Campaign Brief" className="h-fit">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run() }}>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Email Format</span>
              <div className="overflow-x-auto">
                <Segmented label="Format" value={format} onChange={setFormat} options={emailFormats} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal">Campaign Goal</Label>
              <Input id="goal" required value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product">Product or Topic</Label>
              <Textarea id="product" rows={2} value={product} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="aud">Target Audience</Label>
              <Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Tone</span>
                <NativeSelect label="Tone" value={tone} onChange={setTone} options={['Friendly', 'Professional', 'Urgent', 'Playful', 'Luxurious']} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Language</span>
                <NativeSelect label="Language" value={lang} onChange={setLang} options={['English', 'Spanish', 'French', 'German', 'Japanese']} />
              </div>
            </div>
            <Button type="submit" className="h-10" disabled={loading}>
              <Sparkles /> {loading ? 'Drafting copy…' : 'Generate Email Copy'}
            </Button>
          </form>
        </Panel>

        <Panel
          title="Generated Email Drafts"
          description={results ? `${format} · ${tone} tone · ${lang}` : undefined}
          actions={
            results && (
              <Button variant="outline" size="sm" disabled={loading} onClick={() => { const v = variant + 1; setVariant(v); run(v) }}>
                <RefreshCw /> Regenerate
              </Button>
            )
          }
        >
          {!results ? (
            <EmptyState
              icon={Sparkles}
              title="No drafts generated yet"
              description="Fill in your campaign brief and click Generate Email Copy to produce subject lines, headers, and body drafts."
            />
          ) : (
            <div className="flex flex-col gap-5" aria-busy={loading}>
              {results.map((s, i) => (
                <div key={s.label + i} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`r-${i}`}>{s.label}</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { navigator.clipboard?.writeText(s.value); toast.success('Copied to clipboard') }}
                      >
                        <Copy /> Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          toast.success('Draft inserted into Email Builder')
                          router.push('/email/builder')
                        }}
                      >
                        <Send /> Open in Builder
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id={`r-${i}`}
                    rows={Math.min(8, s.value.split('\n').length + 1)}
                    value={s.value}
                    onChange={(e) =>
                      setResults((r) => r!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
