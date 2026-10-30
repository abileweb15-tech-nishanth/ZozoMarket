/**
 * REST client for the ZozoMarket FastAPI backend.
 * JSON is camelCase and wrapped as `{ success, data }`.
 * List endpoints return `{ success, data: [...], total, page, pageSize, pages }`.
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

export type Segment = {
  id: string
  name: string
  description: string
  tags: string[]
  matchType: 'any' | 'all'
  status: 'Subscribed' | 'Unsubscribed' | 'Pending' | null
  source: string | null
  contactCount: number
  createdAt: string
  updatedAt: string
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
  html: string
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

export type Kpi = { value: string; trend: number; raw?: number; detail?: string | null }

export type DashboardKPIs = {
  emailsDelivered: Kpi
  deliveryRate: Kpi
  emailOpenRate: Kpi
  avgClickRate: Kpi
  totalSubscribers: Kpi
  scheduledCampaigns: Kpi
}

export type AutomationStatus = 'Draft' | 'Active' | 'Paused' | 'Archived'

export type FlowNode = {
  id: string
  kind: string
  label: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

export type FlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
}

export type Automation = {
  id: string
  name: string
  description: string
  trigger: string
  triggerType: string
  triggerConfig: Record<string, unknown>
  audience: string
  status: AutomationStatus
  updated: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  enrolledCount: number
  completedCount: number
  emailsSent: number
  createdAt: string
}

export type AutomationEnrollment = {
  id: string
  contactId: string
  contactName: string
  contactEmail: string
  status: string
  currentNodeId: string | null
  nextRunAt: string | null
  completedAt: string | null
  createdAt: string
}

export type AutomationStep = {
  id: string
  enrollmentId: string
  nodeId: string
  action: string
  result: string
  createdAt: string
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

const resolveApiBase = (): string => {
  const raw = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000/api/v1'
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

const API_BASE = resolveApiBase()

/** Single-object response envelope: { success, data: T } */
type Envelope<T> = { success: boolean; data?: T; error?: string }

/** List response envelope: { success, data: T[], total, page, pageSize, pages } */
type ListEnvelope<T> = { success: boolean; data: T[]; total: number; page: number; pageSize: number; pages: number; error?: string }

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
    throw new Error(`Cannot reach the ZozoMarket API at ${API_BASE}.`)
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

/**
 * For list endpoints that return { success, data: T[], total, page, ... }.
 * Correctly extracts the inner `data` array from the ListResponse envelope.
 */
async function listRequest<T>(path: string, init?: RequestInit, retry = true): Promise<T[]> {
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
    throw new Error(`Cannot reach the ZozoMarket API at ${API_BASE}.`)
  }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return listRequest(path, init, false)
    clearSession()
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  }
  const body = (await response.json().catch(() => null)) as ListEnvelope<T> | null
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return body.data ?? []
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error(`Cannot reach the ZozoMarket API at ${API_BASE}.`)
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

/** Dynamic current-year calendar range so the dashboard always shows current data. */
function calendarYearRange() {
  const year = new Date().getFullYear()
  return `start=${year}-01-01&end=${year}-12-31`
}

export const api = {
  auth: {
    signup: (data: {
      name: string
      email: string
      password: string
      workspaceName: string
      website?: string
      timezone: string
      mailingAddress: string
      fromName: string
      fromEmail: string
      replyTo?: string
    }) =>
      request<AuthSession>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<SessionUser>('/auth/me'),
    updateProfile: (data: { name?: string; workspaceName?: string; currentPassword?: string; newPassword?: string }) =>
      request<SessionUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
    deleteAccount: (password: string) =>
      request<unknown>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }).then(() => ({ success: true })),
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
    /** Returns all campaigns (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () => listRequest<EmailCampaign>(`/campaigns?${page}`),
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
      html?: string
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
      html?: string
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
    /** Returns all contacts (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () => listRequest<Contact>(`/contacts?${page}`).then((rows) => rows.map((row) => ({ ...row, tags: row.tags ?? [], attributes: row.attributes ?? {} }))),
    tags: () => request<{ name: string; count: number }[]>('/contacts/tags').then((rows) => rows ?? []),
    stats: () => request<{ total: number; subscribed: number; unsubscribed: number; pending: number }>('/contacts/stats'),
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

  segments: {
    list: () =>
      request<Array<Record<string, unknown>>>('/segments').then((rows) =>
        (rows ?? []).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          description: String(r.description || ''),
          tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
          matchType: (r.match_type || r.matchType || 'any') as 'any' | 'all',
          status: (r.status as 'Subscribed' | 'Unsubscribed' | 'Pending' | null) ?? null,
          source: (r.source as string | null) ?? null,
          contactCount: Number(r.contact_count ?? r.contactCount ?? 0),
          createdAt: String(r.created_at ?? r.createdAt ?? ''),
          updatedAt: String(r.updated_at ?? r.updatedAt ?? ''),
        }))
      ),
    get: (id: string) => request<Segment>(`/segments/${id}`),
    create: (data: {
      name: string
      description?: string
      tags?: string[]
      matchType?: 'any' | 'all'
      status?: string | null
      source?: string | null
    }) =>
      request<Segment>('/segments', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description ?? '',
          tags: data.tags ?? [],
          match_type: data.matchType ?? 'any',
          status: data.status || null,
          source: data.source || null,
        }),
      }),
    update: (
      id: string,
      updates: {
        name?: string
        description?: string
        tags?: string[]
        matchType?: 'any' | 'all'
        status?: string | null
        source?: string | null
      }
    ) =>
      request<Segment>(`/segments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
          ...(updates.matchType !== undefined ? { match_type: updates.matchType } : {}),
          ...(updates.status !== undefined ? { status: updates.status || null } : {}),
          ...(updates.source !== undefined ? { source: updates.source || null } : {}),
        }),
      }),
    delete: (id: string) => request<unknown>(`/segments/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    preview: (data: { tags?: string[]; matchType?: 'any' | 'all'; status?: string | null; source?: string | null }) =>
      request<{ count: number }>('/segments/preview', {
        method: 'POST',
        body: JSON.stringify({
          tags: data.tags ?? [],
          match_type: data.matchType ?? 'any',
          status: data.status || null,
          source: data.source || null,
        }),
      }),
    contacts: (id: string) => listRequest<Contact>(`/segments/${id}/contacts?${page}`),
  },

  calendar: {
    /** Uses dynamic current year so the dashboard always shows the right data. */
    list: () => listRequest<CalendarEvent>(`/calendar?${calendarYearRange()}`),
  },

  analytics: {
    getEmailPerformance: (interval: 'day' | 'week' | 'month' = 'week') =>
      request<EmailPerformancePoint[]>(`/analytics/performance?interval=${interval}`),
  },

  templates: {
    /** Returns all templates (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () =>
      listRequest<Template>(`/templates?${page}`).then((rows) =>
        rows.map((t) => ({ ...t, image: t.image ?? '' })),
      ),
    get: (id: string) => request<TemplateDetail>(`/templates/${id}`),
    create: (data: { name: string; category?: string; subject?: string; preheader?: string; design?: EmailBlock[]; html?: string }) =>
      request<TemplateDetail>('/templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; category?: string; subject?: string; preheader?: string; design?: EmailBlock[]; html?: string }) =>
      request<TemplateDetail>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    render: (data: { design: EmailBlock[]; preheader?: string; variables?: Record<string, string> }) =>
      request<{ html: string; text: string }>('/templates/render', { method: 'POST', body: JSON.stringify(data) }),
    previewHtml: async (id: string) => {
      const token = getAccessToken()
      const response = await fetch(`${API_BASE}/templates/${id}/preview.html`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error('Could not preview this template')
      return response.text()
    },
    delete: (id: string) => request<unknown>(`/templates/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
  },

  media: {
    /** Returns all media assets (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () => listRequest<MediaAsset>(`/media?${page}`),
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
    /** Returns all forms (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () => listRequest<LeadForm>(`/forms?${page}`).then((rows) => (rows ?? []).map(asForm)),
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

  automations: {
    /** Returns all automations (up to 200). Uses listRequest to unwrap the ListResponse envelope. */
    list: () => listRequest<Automation>(`/automations?${page}`),
    get: (id: string) => request<Automation>(`/automations/${id}`),
    create: (data: { name: string; description?: string; trigger?: string; triggerType?: string; triggerConfig?: Record<string, unknown>; nodes?: Omit<FlowNode, 'id'>[]; edges?: Omit<FlowEdge, 'id'>[] }) =>
      request<Automation>('/automations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<Automation, 'name' | 'description' | 'trigger' | 'triggerType' | 'triggerConfig' | 'audience' | 'nodes' | 'edges'>>) =>
      request<Automation>(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    activate: (id: string) => request<Automation>(`/automations/${id}/activate`, { method: 'POST' }),
    pause: (id: string) => request<Automation>(`/automations/${id}/pause`, { method: 'POST' }),
    archive: (id: string) => request<Automation>(`/automations/${id}/archive`, { method: 'POST' }),
    duplicate: (id: string) => request<Automation>(`/automations/${id}/duplicate`, { method: 'POST' }),
    remove: (id: string) => request<unknown>(`/automations/${id}`, { method: 'DELETE' }).then(() => ({ success: true })),
    validate: (id: string) => request<{ ok: boolean; problems: { nodeId: string | null; message: string }[] }>(`/automations/${id}/validate`, { method: 'POST' }),
    test: (id: string, email: string, nodeId?: string) =>
      request<{ enrolled: number }>(`/automations/${id}/test`, { method: 'POST', body: JSON.stringify({ email, ...(nodeId ? { nodeId } : {}) }) }),
    stats: (id: string) => request<Record<string, number>>(`/automations/${id}/stats`),
    enrollments: (id: string) => listRequest<AutomationEnrollment>(`/automations/${id}/enrollments?${page}`),
    steps: (id: string) => listRequest<AutomationStep>(`/automations/${id}/steps?${page}`),
  },
}
