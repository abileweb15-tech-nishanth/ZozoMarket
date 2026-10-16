import marketingData from '@/data/marketing-data.json'
import type {
  CampaignStatus,
  EmailCampaign,
  Contact,
  CalendarEvent,
  Template,
  MediaAsset,
  EmailPerformancePoint,
} from './api'

export type {
  CampaignStatus,
  EmailCampaign,
  Contact,
  CalendarEvent,
  Template,
  MediaAsset,
  EmailPerformancePoint,
}

export const emailCampaigns: EmailCampaign[] = marketingData.emailCampaigns as EmailCampaign[]
export const contacts: Contact[] = marketingData.contacts as Contact[]
export const calendarEvents: CalendarEvent[] = marketingData.calendarEvents as CalendarEvent[]
export const emailPerformance = marketingData.emailPerformance
export const templates = marketingData.templates
export const mediaAssets = marketingData.mediaAssets

export const fmt = (n: number) => n.toLocaleString('en-US')
export const fmtDate = (d: string) =>
  new Date(d.length <= 10 ? d + 'T00:00:00' : d.replace(' ', 'T')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
