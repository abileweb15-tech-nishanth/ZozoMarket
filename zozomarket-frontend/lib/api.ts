/**
 * REST client for the ZozoMarket FastAPI backend.
 * JSON is camelCase and wrapped as `{ success, data }`.
 */

import { clearSession, getAccessToken, getRefreshToken, saveSession, type AuthSession, type SessionUser } from '@/lib/session'

export type CampaignStatus = 'Draft' | 'Scheduled' | 'Sending' | 'Sent' | 'Failed'
export type EmailCampaign = {
  id: string
  name: string
  audience: string
  type: 'Newsletter' | 'Promotional' | 'Automated' | 'Announcement'
  status: CampaignStatus
  date: string
  recipients: number
  delivery: number | null
  open: number | null
  click: number | null
  subject?: string
  fromName?: string | null
  fromEmail?: string | null
  audienceTags?: string[]
}

export type Contact = {
  id: string
  name: string
  email: string
  tags: string[]
  source: string
  status: 'Subscribed' | 'Unsubscribed' | 'Pending'
  added: string
  attributes: Record<string, string>
}

export type CalendarEvent = {
  id: string
  title: string
  date: string
  time: string
  type: 'Newsletter' | 'Promotional' | 'Automated' | 'Announcement'
  status: string
}

export type EmailBlock = {
  id: string
  type: 'heading' | 'paragraph' | 'image' | 'button' | 'divider' | 'spacer' | 'columns' | 'social' | 'product' | 'banner' | 'footer' | 'logo'
  text: string
  align: 'left' | 'center' | 'right'
  size: number
  color: string
  bg: string
  padding: number
  link?: string
  image?: string
  font?: string
  width?: number
}

export type CampaignDraft = EmailCampaign & {
  subject: string
  preheader: string
  fromName: string | null
  fromEmail: string | null
  replyTo: string | null
  templateId: string | null
  design: EmailBlock[]
  audienceTags: string[]
}

export type Template = {
  id: string
  name: string
  category: string
  image: string
  subject?: string
  preheader?: string
}

export type TemplateDetail = Template & {
  subject: string
  preheader: string
  design: EmailBlock[]
  html: string
}

export type MediaAsset = {
  id: string
  name: string
  type: string
  size: string
  src: string
}

export type EmailPerformancePoint = {
  week: string
  delivered: number
  opens: number
  clicks: number
}

export type Kpi = { value: string; trend: number; raw?: number }

export type DashboardKPIs = {
  emailsDelivered: Kpi
  deliveryRate: Kpi
  emailOpenRate: Kpi
  avgClickRate: Kpi
  totalSubscribers: Kpi
  scheduledCampaigns: Kpi
}

export type FormField = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'checkbox' | 'select'
  required: boolean
}

export type LeadForm = {
  id: string
  name: string
  slug: string
  kind: 'Signup Forms' | 'Landing Pages' | 'Embedded Forms' | 'Popup Forms'
  status: 'Live' | 'Draft' | 'Paused'
  title: string
  description: string
  successMessage: string
  fields: FormField[]
  tags: string[]
  doubleOptIn: boolean
  views: number
  subs: number
  conversionRate: number | null
  publicUrl: string
}

export type PublicForm = {
  slug: string
  kind: LeadForm['kind']
  title: string
  description: string
  fields: FormField[]
  doubleOptIn: boolean
}

export type WorkspaceSettings = {
  id: string
  name: string
  website: string | null
  timezone: string
  mailingAddress: string
  brandColor: string
  font: string
  logoUrl: string | null
  fromName: string
  fromEmail: string | null
  replyTo: string | null
  trackOpens: boolean
  trackClicks: boolean
  ownerName: string
  ownerEmail: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

type Envelope<T> = { success: boolean; data?: T; error?: string }

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  const body = (await response.json().catch(() => null)) as Envelope<AuthSession> | null
  if (!response.ok || !body?.success || !body.data) return false
  saveSession(body.data)
  return true
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const token = getAccessToken()
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('Cannot reach the ZozoMarket API. Start it with: uvicorn app.main:app --port 8000')
  }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return request(path, init, false)
    clearSession()
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  }
  const body = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return body.data as T
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error('Cannot reach the ZozoMarket API. Start it with: uvicorn app.main:app --port 8000')
  }
  const body = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return body.data as T
}

const page = 'pageSize=200'

function asForm(row: LeadForm): LeadForm {
  return {
    ...row,
    slug: row.slug ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    successMessage: row.successMessage ?? '',
    fields: row.fields ?? [],
    tags: row.tags ?? [],
    doubleOptIn: row.doubleOptIn ?? false,
    publicUrl: row.publicUrl ?? '',
  }
}

export const api = {
  auth: {
    signup: (data: { name: string; email: string; password: string; workspaceName?: string }) =>
      request<AuthSession>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<SessionUser>('/auth/me'),
    updateProfile: (data: { name?: string; workspaceName?: string; currentPassword?: string; newPassword?: string }) =>
      request<SessionUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  },

  workspace: {
    get: () => request<WorkspaceSettings>('/workspace'),
    update: (data: Partial<WorkspaceSettings>) =>
      request<WorkspaceSettings>('/workspace', { method: 'PATCH', body: JSON.stringify(data) }),
    uploadLogo: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return request<WorkspaceSettings>('/workspace/logo', { method: 'POST', body })
    },
  },

  dashboard: {
    getKPIs: () => request<DashboardKPIs>('/dashboard/kpis'),
  },

  campaigns: {
    list: () => request<EmailCampaign[]>(`/campaigns?${page}`).then((rows) => rows ?? []),
    get: (id: string) => request<CampaignDraft>(`/campaigns/${id}`),
    create: (data: {
      name: string
      audience?: string
      audienceTags?: string[]
      type?: EmailCampaign['type']
      subject?: string
      preheader?: string
      fromName?: string
      fromEmail?: string | null
      replyTo?: string | null
      templateId?: string
      design?: EmailBlock[]
    }) => request<CampaignDraft>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, updates: {
      name?: string
      audience?: string
      audienceTags?: string[]
      type?: EmailCampaign['type']
      subject?: string
      preheader?: string
      fromName?: string
      fromEmail?: string | null
      replyTo?: string | null
      design?: EmailBlock[]
    }) => request<CampaignDraft>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    estimate: (tags: string[]) => {
      const query = tags.map((tag) => `tags=${encodeURIComponent(tag)}`).join('&')
      return request<{ recipients: number; audienceTags: string[] }>(`/campaigns/estimate${query ? `?${query}` : ''}`)
    },
    delete: (id: string) => request<unknown>(`/campaigns/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    duplicate: (id: string) => request<EmailCampaign>(`/campaigns/${id}/duplicate`, { method: 'POST' }),
    test: (id: string, emails: string[]) =>
      request<{ affected: number }>(`/campaigns/${id}/test`, { method: 'POST', body: JSON.stringify({ emails }) }),
    schedule: (id: string, scheduledAt: string) =>
      request<CampaignDraft>(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledAt }) }),
    unschedule: (id: string) => request<EmailCampaign>(`/campaigns/${id}/unschedule`, { method: 'POST' }),
    send: (id: string) => request<EmailCampaign>(`/campaigns/${id}/send`, { method: 'POST' }),
  },

  contacts: {
    list: () => request<Contact[]>(`/contacts?${page}`).then((rows) => (rows ?? []).map((row) => ({ ...row, tags: row.tags ?? [], attributes: row.attributes ?? {} }))),
    tags: () => request<{ name: string; count: number }[]>('/contacts/tags').then((rows) => rows ?? []),
    get: (id: string) => request<Contact>(`/contacts/${id}`),
    create: (data: Pick<Contact, 'name' | 'email' | 'tags' | 'source' | 'status'>) =>
      request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, updates: Partial<Pick<Contact, 'name' | 'email' | 'tags' | 'source' | 'status'>>) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string) => request<unknown>(`/contacts/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    bulkDelete: (ids: string[]) =>
      request<unknown>('/contacts/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }).then(() => ({ success: true })),
    bulkAddTag: (ids: string[], tag: string) =>
      request<unknown>('/contacts/bulk-tag', { method: 'POST', body: JSON.stringify({ ids, tag }) }).then(() => ({ success: true })),
    importCsv: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return request<{ created: number; updated: number; skipped: number }>('/contacts/import', { method: 'POST', body })
    },
  },

  calendar: {
    /** Demo records live in 2026; a full-year window keeps month navigation working. */
    list: () => request<CalendarEvent[]>('/calendar?start=2026-01-01&end=2026-12-31'),
  },

  analytics: {
    getEmailPerformance: () => request<EmailPerformancePoint[]>('/analytics/performance?interval=week'),
  },

  templates: {
    list: () =>
      request<Template[]>(`/templates?${page}`).then((rows) =>
        rows.map((t) => ({ ...t, image: t.image ?? '' })),
      ),
    get: (id: string) => request<TemplateDetail>(`/templates/${id}`),
    create: (data: { name: string; category?: string; subject?: string; preheader?: string; design: EmailBlock[] }) =>
      request<TemplateDetail>('/templates', { method: 'POST', body: JSON.stringify(data) }),
    render: (data: { design: EmailBlock[]; preheader?: string; variables?: Record<string, string> }) =>
      request<{ html: string; text: string }>('/templates/render', { method: 'POST', body: JSON.stringify(data) }),
    previewHtml: async (id: string) => {
      const token = getAccessToken()
      const response = await fetch(`${API_BASE}/templates/${id}/preview.html`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error('Could not preview this template')
      return response.text()
    },
    delete: (id: string) => request<unknown>(`/templates/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
  },

  media: {
    list: () => request<MediaAsset[]>(`/media?${page}`),
    upload: async (file: File) => {
      const body = new FormData()
      body.append('files', file)
      const created = await request<MediaAsset[]>('/media', { method: 'POST', body })
      return created[0]
    },
    delete: (id: string) => request<unknown>(`/media/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    rename: (id: string, name: string) =>
      request<MediaAsset>(`/media/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  },

  forms: {
    list: () => request<LeadForm[]>(`/forms?${page}`).then((rows) => (rows ?? []).map(asForm)),
    create: (data: { name: string; kind: LeadForm['kind']; tags?: string[]; title?: string; successMessage?: string }) =>
      request<LeadForm>('/forms', { method: 'POST', body: JSON.stringify(data) }).then(asForm),
    update: (id: string, data: Partial<Pick<LeadForm, 'name' | 'kind' | 'title' | 'description' | 'successMessage' | 'tags' | 'fields' | 'status' | 'doubleOptIn'>>) =>
      request<LeadForm>(`/forms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(asForm),
    delete: (id: string) => request<unknown>(`/forms/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    public: (slug: string) => publicRequest<PublicForm>(`/public/forms/${slug}`),
    view: (slug: string) => publicRequest<unknown>(`/public/forms/${slug}/view`, { method: 'POST', body: '{}' }),
    submit: (slug: string, data: { name: string; email: string; consent: boolean; fields?: Record<string, string> }) =>
      publicRequest<{ message: string; redirectUrl: string | null; requiresConfirmation: boolean }>(`/public/forms/${slug}/submit`, { method: 'POST', body: JSON.stringify(data) }),
  },
}
