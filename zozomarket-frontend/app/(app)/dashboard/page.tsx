'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  Heart,
  MailCheck,
  MailOpen,
  MousePointerClick,
  Radio,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, KpiCard, Panel, StatusBadge, TableWrap, th, td } from '@/components/app/shared'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import {
  api,
  type EmailCampaign,
  type SocialPost,
  type CalendarEvent,
  type EmailPerformancePoint,
  type SocialPerformancePoint,
  type DashboardKPIs,
} from '@/lib/api'

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [calendar, setCalendar] = useState<CalendarEvent[]>([])
  const [emailPerf, setEmailPerf] = useState<EmailPerformancePoint[]>([])
  const [socialPerf, setSocialPerf] = useState<SocialPerformancePoint[]>([])

  useEffect(() => {
    api.dashboard.getKPIs().then(setKpis)
    api.campaigns.list().then(setCampaigns)
    api.socialPosts.list().then(setPosts)
    api.calendar.list().then(setCalendar)
    api.analytics.getEmailPerformance().then(setEmailPerf)
    api.analytics.getSocialPerformance().then(setSocialPerf)
  }, [])

  const sentCampaigns = campaigns.filter((c) => c.open !== null)
  const upcomingEvents = calendar
    .filter((e) => new Date(`${e.date}T${e.time}`) >= new Date())
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
    .slice(0, 5)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your marketing command center — everything at a glance."
        actions={
          <Link href="/ai-assistant">
            <Button>
              <Sparkles /> AI Assistant
            </Button>
          </Link>
        }
      />

      {/* KPI cards */}
      {kpis && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Emails delivered" value={kpis.emailsDelivered.value} trend={kpis.emailsDelivered.trend} icon={MailCheck} />
          <KpiCard label="Avg. open rate" value={kpis.emailOpenRate.value} trend={kpis.emailOpenRate.trend} icon={MailOpen} />
          <KpiCard label="Social engagement" value={kpis.socialEngagement.value} trend={kpis.socialEngagement.trend} icon={Heart} />
          <KpiCard label="Total reach" value={kpis.totalReach.value} trend={kpis.totalReach.trend} icon={Radio} />
          <KpiCard label="Avg. click rate" value={kpis.avgClickRate.value} trend={kpis.avgClickRate.trend} icon={MousePointerClick} />
          <KpiCard label="New followers" value={kpis.newFollowers.value} trend={kpis.newFollowers.trend} icon={UserPlus} />
          <KpiCard label="Scheduled campaigns" value={kpis.scheduledCampaigns.value} trend={kpis.scheduledCampaigns.trend} icon={CalendarDays} />
        </div>
      )}

      {/* Performance charts */}
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Email performance trend" description="Delivered, opens & clicks over 6 weeks">
          <TrendChart
            data={emailPerf}
            x="week"
            series={[
              { key: 'delivered', label: 'Delivered', color: C.gray },
              { key: 'opens', label: 'Opens', color: C.primary },
              { key: 'clicks', label: 'Clicks', color: C.indigo },
            ]}
          />
        </Panel>
        <Panel title="Social performance trend" description="Engagement over 6 weeks">
          <TrendChart
            data={socialPerf}
            x="week"
            series={[{ key: 'engagement', label: 'Engagements', color: C.indigo }]}
          />
        </Panel>
      </div>

      {/* Campaign comparison */}
      {sentCampaigns.length > 0 && (
        <div className="mb-8">
          <Panel title="Campaign comparison" description="Open vs click rate (%)">
            <BarsChart
              data={sentCampaigns.map((c) => ({
                name: c.name.split(' ').slice(0, 2).join(' '),
                open: c.open,
                click: c.click,
              }))}
              x="name"
              series={[
                { key: 'open', label: 'Open %', color: C.primary },
                { key: 'click', label: 'Click %', color: C.indigo },
              ]}
            />
          </Panel>
        </div>
      )}

      {/* Recent campaigns + Upcoming events */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Recent campaigns"
          actions={
            <Link href="/email/campaigns">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border bg-muted">
                <tr>
                  {['Name', 'Status', 'Recipients'].map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.slice(0, 5).map((c) => (
                  <tr key={c.id}>
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={td}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className={td}>{c.recipients.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>

        <Panel
          title="Upcoming events"
          actions={
            <Link href="/calendar">
              <Button variant="ghost" size="sm">
                View calendar <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border bg-muted">
                <tr>
                  {['Event', 'Date', 'Channel', 'Status'].map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {upcomingEvents.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} max-w-xs truncate font-medium`}>{e.title}</td>
                    <td className={td}>
                      {new Date(`${e.date}T${e.time}`).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className={td}>{e.channel}</td>
                    <td className={td}>
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      </div>

      {/* Recent social posts */}
      <div className="mt-8">
        <Panel
          title="Recent social posts"
          actions={
            <Link href="/social/posts">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border bg-muted">
                <tr>
                  {['Caption', 'Platforms', 'Status', 'Engagement'].map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {posts.slice(0, 5).map((p) => (
                  <tr key={p.id}>
                    <td className={`${td} max-w-xs truncate font-medium`}>{p.caption}</td>
                    <td className={td}>{p.platforms.join(', ')}</td>
                    <td className={td}>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className={td}>
                      {p.likes ? `${p.likes.toLocaleString('en-US')} likes` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      </div>
    </div>
  )
}
