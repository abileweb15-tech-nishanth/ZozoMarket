import marketingData from '@/data/marketing-data.json'

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
}

export type Platform = 'Instagram' | 'Facebook' | 'LinkedIn' | 'X' | 'YouTube' | 'Pinterest' | 'TikTok'
export type PostStatus = 'Draft' | 'Scheduled' | 'Published' | 'Failed'
export type SocialPost = {
  id: string
  caption: string
  platforms: Platform[]
  date: string
  status: PostStatus
  image: string
  likes?: number
  comments?: number
  shares?: number
}

export type Contact = {
  id: string
  name: string
  email: string
  tags: string[]
  source: string
  status: 'Subscribed' | 'Unsubscribed' | 'Pending'
  added: string
}

export type CalendarEvent = {
  id: string
  title: string
  date: string
  time: string
  channel: 'Email' | 'Social'
  status: string
}

export type Template = {
  id: string
  name: string
  category: string
  image: string
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

export type SocialPerformancePoint = {
  week: string
  engagement: number
  reach: number
  impressions: number
  followers: number
}

export type PlatformBreakdownItem = {
  platform: string
  engagement: number
}

export type DashboardKPIs = typeof marketingData.dashboardKpis

// Helper for simulated network latency
const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

const getStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue
  try {
    const stored = window.localStorage.getItem(`zozomarket_${key}`)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

const setStorage = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`zozomarket_${key}`, JSON.stringify(value))
  } catch (err) {
    console.error('Failed to save to localStorage', err)
  }
}

export const api = {
  dashboard: {
    async getKPIs(): Promise<DashboardKPIs> {
      await delay()
      return marketingData.dashboardKpis
    },
  },

  campaigns: {
    async list(): Promise<EmailCampaign[]> {
      await delay()
      return getStorage<EmailCampaign[]>('campaigns', marketingData.emailCampaigns as EmailCampaign[])
    },
    async get(id: string): Promise<EmailCampaign | null> {
      await delay()
      const list = await api.campaigns.list()
      return list.find((c) => c.id === id) || null
    },
    async create(data: Omit<EmailCampaign, 'id'> & { id?: string }): Promise<EmailCampaign> {
      await delay()
      const campaigns = await api.campaigns.list()
      const created: EmailCampaign = {
        ...data,
        id: data.id || `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      }
      setStorage('campaigns', [created, ...campaigns])
      return created
    },
    async update(id: string, updates: Partial<EmailCampaign>): Promise<EmailCampaign> {
      await delay()
      const campaigns = await api.campaigns.list()
      const index = campaigns.findIndex((c) => c.id === id)
      if (index === -1) throw new Error(`Campaign with id ${id} not found`)
      const updated = { ...campaigns[index], ...updates }
      campaigns[index] = updated
      setStorage('campaigns', campaigns)
      return updated
    },
    async delete(id: string): Promise<{ success: boolean }> {
      await delay()
      const campaigns = await api.campaigns.list()
      setStorage('campaigns', campaigns.filter((c) => c.id !== id))
      return { success: true }
    },
  },

  socialPosts: {
    async list(): Promise<SocialPost[]> {
      await delay()
      return getStorage<SocialPost[]>('social_posts', marketingData.socialPosts as SocialPost[])
    },
    async get(id: string): Promise<SocialPost | null> {
      await delay()
      const posts = await api.socialPosts.list()
      return posts.find((p) => p.id === id) || null
    },
    async create(data: Omit<SocialPost, 'id'> & { id?: string }): Promise<SocialPost> {
      await delay()
      const posts = await api.socialPosts.list()
      const created: SocialPost = {
        ...data,
        id: data.id || `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      }
      setStorage('social_posts', [created, ...posts])
      return created
    },
    async update(id: string, updates: Partial<SocialPost>): Promise<SocialPost> {
      await delay()
      const posts = await api.socialPosts.list()
      const index = posts.findIndex((p) => p.id === id)
      if (index === -1) throw new Error(`Post with id ${id} not found`)
      const updated = { ...posts[index], ...updates }
      posts[index] = updated
      setStorage('social_posts', posts)
      return updated
    },
    async delete(id: string): Promise<{ success: boolean }> {
      await delay()
      const posts = await api.socialPosts.list()
      setStorage('social_posts', posts.filter((p) => p.id !== id))
      return { success: true }
    },
  },

  contacts: {
    async list(): Promise<Contact[]> {
      await delay()
      return getStorage<Contact[]>('contacts', marketingData.contacts as Contact[])
    },
    async get(id: string): Promise<Contact | null> {
      await delay()
      const list = await api.contacts.list()
      return list.find((c) => c.id === id) || null
    },
    async create(data: Omit<Contact, 'id'> & { id?: string }): Promise<Contact> {
      await delay()
      const contacts = await api.contacts.list()
      const created: Contact = {
        ...data,
        id: data.id || `u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      }
      setStorage('contacts', [created, ...contacts])
      return created
    },
    async update(id: string, updates: Partial<Contact>): Promise<Contact> {
      await delay()
      const contacts = await api.contacts.list()
      const index = contacts.findIndex((c) => c.id === id)
      if (index === -1) throw new Error(`Contact with id ${id} not found`)
      const updated = { ...contacts[index], ...updates }
      contacts[index] = updated
      setStorage('contacts', contacts)
      return updated
    },
    async delete(id: string): Promise<{ success: boolean }> {
      await delay()
      const contacts = await api.contacts.list()
      setStorage('contacts', contacts.filter((c) => c.id !== id))
      return { success: true }
    },
    async bulkDelete(ids: string[]): Promise<{ success: boolean }> {
      await delay()
      const contacts = await api.contacts.list()
      setStorage('contacts', contacts.filter((c) => !ids.includes(c.id)))
      return { success: true }
    },
    async bulkAddTag(ids: string[], tag: string): Promise<{ success: boolean }> {
      await delay()
      const contacts = await api.contacts.list()
      const updated = contacts.map((c) =>
        ids.includes(c.id) && !c.tags.includes(tag) ? { ...c, tags: [...c.tags, tag] } : c
      )
      setStorage('contacts', updated)
      return { success: true }
    },
  },

  calendar: {
    async list(): Promise<CalendarEvent[]> {
      await delay()
      return getStorage<CalendarEvent[]>('calendar_events', marketingData.calendarEvents as CalendarEvent[])
    },
  },

  analytics: {
    async getEmailPerformance(): Promise<EmailPerformancePoint[]> {
      await delay()
      return marketingData.emailPerformance
    },
    async getSocialPerformance(): Promise<SocialPerformancePoint[]> {
      await delay()
      return marketingData.socialPerformance
    },
    async getPlatformBreakdown(): Promise<PlatformBreakdownItem[]> {
      await delay()
      return marketingData.platformBreakdown
    },
  },

  templates: {
    async list(): Promise<Template[]> {
      await delay()
      return marketingData.templates
    },
  },

  media: {
    async list(): Promise<MediaAsset[]> {
      await delay()
      return getStorage<MediaAsset[]>('media_assets', marketingData.mediaAssets as MediaAsset[])
    },
    async create(asset: MediaAsset): Promise<MediaAsset> {
      await delay()
      const assets = await api.media.list()
      setStorage('media_assets', [asset, ...assets])
      return asset
    },
    async delete(id: string): Promise<{ success: boolean }> {
      await delay()
      const assets = await api.media.list()
      setStorage('media_assets', assets.filter((a) => a.id !== id))
      return { success: true }
    },
    async rename(id: string, name: string): Promise<MediaAsset> {
      await delay()
      const assets = await api.media.list()
      const item = assets.find((a) => a.id === id)
      if (!item) throw new Error('Asset not found')
      item.name = name
      setStorage('media_assets', [...assets])
      return item
    },
  },
}
