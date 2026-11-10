import type { Contact, EmailBlock, WorkspaceSettings } from '@/lib/api'

export type Brand = Pick<WorkspaceSettings, 'name' | 'brandColor' | 'font' | 'logoUrl' | 'mailingAddress' | 'fromName' | 'fromEmail' | 'replyTo'>

export const MERGE_TAGS = [
  { label: 'First name',       value: '{{first_name}}' },
  { label: 'Last name',        value: '{{last_name}}' },
  { label: 'Full name',        value: '{{name}}' },
  { label: 'Email address',    value: '{{email}}' },
  { label: 'Unsubscribe link', value: '{{unsubscribe_url}}' },
  { label: 'Preferences link', value: '{{preferences_url}}' },
] as const

/** Sample values for canvas preview — mirrors backend SAMPLE_VARIABLES. */
export const SAMPLE_VALUES: Record<string, string> = {
  first_name:       'Alex',
  last_name:        'Morgan',
  name:             'Alex Morgan',
  email:            'alex@example.com',
  unsubscribe_url:  '#unsubscribe',
  preferences_url:  '#preferences',
}

const TAG_ALIASES: Record<string, string> = {
  firstname: 'first_name',
  first_name: 'first_name',
  fname: 'first_name',
  lastname: 'last_name',
  last_name: 'last_name',
  lname: 'last_name',
  fullname: 'name',
  full_name: 'name',
  name: 'name',
  email: 'email',
  emailaddress: 'email',
  email_address: 'email',
  unsubscribeurl: 'unsubscribe_url',
  unsubscribe_url: 'unsubscribe_url',
  preferencesurl: 'preferences_url',
  preferences_url: 'preferences_url',
}

/** Resolve merge-tag placeholders against any variables dict, supporting aliases and dot notation. */
export function applyMergeTags(
  text: string,
  variables: Record<string, string> = SAMPLE_VALUES,
  unknownAsBracket = false,
): string {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(variables)) {
    lower[k.toLowerCase()] = v
  }
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_, rawKey: string) => {
    if (rawKey in variables) return variables[rawKey]
    const stripped = rawKey.includes('.') ? rawKey.slice(rawKey.indexOf('.') + 1) : rawKey
    if (stripped in variables) return variables[stripped]
    const low = stripped.toLowerCase()
    if (low in lower) return lower[low]
    const canonical = TAG_ALIASES[low]
    if (canonical && canonical in variables) return variables[canonical]
    if (canonical && canonical in lower) return lower[canonical]
    return unknownAsBracket ? `[${rawKey}]` : ''
  })
}

/** Build preview variables for a selected Contact (or sample values when empty). */
export function contactVariables(contact?: Contact | null): Record<string, string> {
  if (!contact) return { ...SAMPLE_VALUES }
  const extraLower: Record<string, string> = {}
  for (const [k, v] of Object.entries(contact.attributes || {})) {
    if (v !== undefined && v !== null && String(v).trim()) {
      extraLower[k.toLowerCase().replace(/-/g, '_')] = String(v).trim()
    }
  }
  const cleanName = (contact.name || '').trim()
  const spaceIdx = cleanName.indexOf(' ')
  const parsedFirst = spaceIdx === -1 ? cleanName : cleanName.slice(0, spaceIdx)
  const parsedLast = spaceIdx === -1 ? '' : cleanName.slice(spaceIdx + 1).trim()

  const first = parsedFirst || extraLower.first_name || extraLower.firstname || extraLower.fname || ''
  const last = parsedLast || extraLower.last_name || extraLower.lastname || extraLower.lname || ''
  const fullName = cleanName || extraLower.full_name || extraLower.fullname || extraLower.name || [first, last].filter(Boolean).join(' ')

  return {
    ...contact.attributes,
    first_name: first || 'there',
    last_name: last,
    name: fullName || contact.email,
    email: contact.email,
    unsubscribe_url: '#unsubscribe',
    preferences_url: '#preferences',
  }
}

/** Replace {{tag}} placeholders with sample values for display only. */
export function applySampleTags(text: string): string {
  return applyMergeTags(text, SAMPLE_VALUES, true)
}

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
