import type { EmailBlock, WorkspaceSettings } from '@/lib/api'

export type Brand = Pick<WorkspaceSettings, 'name' | 'brandColor' | 'font' | 'logoUrl' | 'mailingAddress' | 'fromName' | 'fromEmail' | 'replyTo'>

export const MERGE_TAGS = [
  { label: 'First name', value: '{{first_name}}' },
  { label: 'Last name', value: '{{last_name}}' },
  { label: 'Email', value: '{{email}}' },
  { label: 'Unsubscribe link', value: '{{unsubscribe_url}}' },
] as const

let blockSeq = 0

export function makeBlock(type: EmailBlock['type'], brand?: Partial<Brand>, extra?: Partial<EmailBlock>): EmailBlock {
  const color = brand?.brandColor || '#f59e0b'
  const font = brand?.font || 'Inter'
  const base: EmailBlock = {
    id: `b${++blockSeq}-${type}`,
    type,
    text: '',
    align: 'center',
    size: 15,
    color: '#1f2937',
    bg: '#ffffff',
    padding: 16,
    font,
  }
  const presets: Partial<Record<EmailBlock['type'], Partial<EmailBlock>>> = {
    logo: { text: brand?.name || 'Your brand', size: 18, color, image: brand?.logoUrl || undefined },
    heading: { text: 'Headline', size: 28 },
    paragraph: { text: 'Write your message here.', size: 15 },
    image: { text: 'Image', image: '' },
    button: { text: 'Call to action', link: 'https://example.com', size: 15, bg: color, color: '#ffffff' },
    divider: { text: '' },
    spacer: { text: '', padding: 24 },
    columns: { text: 'Left column|Right column', size: 14 },
    social: { text: 'Instagram · Facebook · LinkedIn', size: 13 },
    product: { text: 'Product name', image: '', size: 15 },
    banner: { text: 'A short offer', size: 16, bg: color, color: '#ffffff' },
    footer: { text: footerText(brand), size: 12, color: '#6b7280' },
  }
  return { ...base, ...presets[type], ...extra }
}

export function footerText(brand?: Partial<Brand>) {
  const place = brand?.mailingAddress?.trim() || brand?.name || 'Your company'
  return `${place} · {{unsubscribe_url}}`
}

export function blankDesign(brand?: Partial<Brand>): EmailBlock[] {
  return [makeBlock('logo', brand), makeBlock('paragraph', brand), makeBlock('footer', brand)]
}

const PLACEHOLDER_FOOTER = 'Your company · {{unsubscribe_url}}'

export function preserveSavedDesign(blocks: EmailBlock[], brand?: Partial<Brand>): EmailBlock[] {
  const next = blocks.map((block) => {
    if (block.type !== 'footer') return block
    const text = block.text.trim()
    if (!text || text === PLACEHOLDER_FOOTER) return { ...block, text: footerText(brand) }
    return block
  })
  return ensureFooter(next, brand)
}

export function ensureFooter(blocks: EmailBlock[], brand?: Partial<Brand>): EmailBlock[] {
  const has = blocks.some((block) => block.type === 'footer' || block.text.includes('unsubscribe_url'))
  return has ? blocks : [...blocks, makeBlock('footer', brand)]
}

export type StarterLayout = {
  key: string
  name: string
  category: string
  subject: string
  preheader: string
  design: (brand?: Partial<Brand>) => EmailBlock[]
}

export const starterLayouts: StarterLayout[] = [
  {
    key: 'newsletter',
    name: 'Newsletter',
    category: 'Newsletter',
    subject: 'This week from {{first_name}}’s inbox',
    preheader: 'A short note and one clear next step.',
    design: (brand) => ensureFooter([
      makeBlock('logo', brand),
      makeBlock('heading', brand, { text: 'What is new this week' }),
      makeBlock('paragraph', brand, { text: 'Hi {{first_name}}, here is the update we saved for you.' }),
      makeBlock('button', brand, { text: 'Read the update', link: 'https://example.com' }),
    ], brand),
  },
  {
    key: 'promotional',
    name: 'Promotional',
    category: 'Promotional',
    subject: 'A short offer for {{first_name}}',
    preheader: 'One offer, one button, one deadline.',
    design: (brand) => ensureFooter([
      makeBlock('logo', brand),
      makeBlock('banner', brand, { text: 'Limited time' }),
      makeBlock('heading', brand, { text: 'Save on your next order' }),
      makeBlock('paragraph', brand, { text: 'Use this note to tell {{first_name}} exactly what they get.' }),
      makeBlock('button', brand, { text: 'Shop the offer', link: 'https://example.com' }),
    ], brand),
  },
  {
    key: 'welcome',
    name: 'Welcome',
    category: 'Welcome Email',
    subject: 'Welcome, {{first_name}}',
    preheader: 'Thanks for subscribing.',
    design: (brand) => ensureFooter([
      makeBlock('logo', brand),
      makeBlock('heading', brand, { text: `Welcome to ${brand?.name || 'our list'}` }),
      makeBlock('paragraph', brand, { text: 'Hi {{first_name}}, thanks for joining. Here is what happens next.' }),
      makeBlock('button', brand, { text: 'Get started', link: 'https://example.com' }),
    ], brand),
  },
]
