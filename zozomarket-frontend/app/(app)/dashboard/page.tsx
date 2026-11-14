'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Mail,
  MailCheck,
  MailOpen,
  MousePointerClick,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  PageHeader,
  KpiCard,
  KpiCardSkeleton,
  NativeSelect,
  Panel,
  PanelChartSkeleton,
  StatusBadge,
  TableSkeleton,
  TableWrap,
  th,
  td,
} from '@/components/app/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import {
  api,
  type EmailCampaign,
  type CalendarEvent,
  type EmailPerformancePoint,
  type DashboardKPIs,
  type SesCampaignBreakdown,
} from '@/lib/api'

function computeDashboardRange(label: string): {
  start: string
  end: string
  interval: 'day' | 'week' | 'month'
  windowDays: number
} {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const startDate = new Date(now)
  let interval: 'day' | 'week' | 'month' = 'day'
  let windowDays = 30

  if (label === 'Last 7 days') {
    startDate.setDate(startDate.getDate() - 6)
    interval = 'day'
    windowDays = 7
  } else if (label === 'Last 90 days') {
    startDate.setDate(startDate.getDate() - 89)
    interval = 'week'
    windowDays = 90
  } else if (label === 'This year') {
    startDate.setMonth(0, 1)
    interval = 'month'
    windowDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / 86400000) + 1)
  } else {
    startDate.setDate(startDate.getDate() - 29)
    interval = 'day'
    windowDays = 30
  }

  return { start: startDate.toISOString().slice(0, 10), end, interval, windowDays }
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [analyticsCampaigns, setAnalyticsCampaigns] = useState<EmailCampaign[]>([])
  const [sesBreakdown, setSesBreakdown] = useState<SesCampaignBreakdown[]>([])
  const [calendar, setCalendar] = useState<CalendarEvent[]>([])
  const [emailPerf, setEmailPerf] = useState<EmailPerformancePoint[]>([])
  const [loading, setLoading] = useState(true)

  // Graph & Bar Chart Filters
  const [dateRange, setDateRange] = useState('Last 30 days')
  const [trendInterval, setTrendInterval] = useState<'day' | 'week' | 'month'>('day')
  const [trendCampaignId, setTrendCampaignId] = useState('all')
  const [trendMetric, setTrendMetric] = useState('All Metrics')
  const [barCampaignId, setBarCampaignId] = useState('all')
  const [barTypeFilter, setBarTypeFilter] = useState('All Types')
  const [barMetricFilter, setBarMetricFilter] = useState('Open & Click %')

  useEffect(() => {
    let active = true
    setLoading(true)
    const fail = (err: Error) => toast.error(err.message)
    const { start, end, windowDays } = computeDashboardRange(dateRange)
    Promise.allSettled([
      api.dashboard.getKPIs(windowDays).then((d) => { if (active) setKpis(d) }).catch(fail),
      api.campaigns.list().then((d) => { if (active) setCampaigns(d) }).catch(fail),
      api.analytics.getCampaigns().then((d) => { if (active) setAnalyticsCampaigns(d) }).catch(fail),
      api.analytics.getSesMetrics('all', '30d').then((d) => { if (active) setSesBreakdown(d.breakdown ?? []) }).catch(() => {}),
      api.calendar.list().then((d) => { if (active) setCalendar(d) }).catch(fail),
      api.analytics.getEmailPerformance(trendInterval, start, end, trendCampaignId).then((d) => { if (active) setEmailPerf(d) }).catch(fail),
    ]).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [dateRange, trendInterval, trendCampaignId])

  const sentCampaigns = campaigns.filter((c) => c.status === 'Sent')
  const upcomingEvents = calendar.filter((e) => e.status === 'Scheduled').slice(0, 5)
  const counts = {
    Draft: campaigns.filter((c) => c.status === 'Draft').length,
    Scheduled: campaigns.filter((c) => c.status === 'Scheduled').length,
    Sent: sentCampaigns.length,
  }

  const trendSeries = [
    ...(trendMetric === 'All Metrics' || trendMetric === 'Delivered'
      ? [{ key: 'delivered', label: 'Delivered', color: C.gray }]
      : []),
    ...(trendMetric === 'All Metrics' || trendMetric === 'Opens'
      ? [{ key: 'opens', label: 'Opens', color: C.primary }]
      : []),
    ...(trendMetric === 'All Metrics' || trendMetric === 'Clicks'
      ? [{ key: 'clicks', label: 'Clicks', color: C.indigo }]
      : []),
  ]

  const comparisonSource: EmailCampaign[] =
    analyticsCampaigns.length > 0
      ? analyticsCampaigns
      : sesBreakdown
          .filter((b) => b.sent > 0 || b.delivered > 0)
          .map((b) => ({
            id: b.campaign,
            name: b.campaign.replace(/_/g, ' '),
            type: 'Newsletter' as const,
            status: 'Sent' as const,
            audience: `${b.sent.toLocaleString()} sent`,
            subject: '',
            date: '',
            recipients: b.sent,
            delivery: b.sent > 0 ? Math.round((b.delivered / b.sent) * 1000) / 10 : 0,
            open: b.openRate,
            click: b.delivered > 0 ? Math.round((b.clicked / b.delivered) * 1000) / 10 : 0,
          }))

  const filteredBarCampaigns = comparisonSource
    .filter(
      (c) =>
        (barCampaignId === 'all' || c.id === barCampaignId) &&
        (barTypeFilter === 'All Types' || c.type === barTypeFilter),
    )
    .slice(0, 6)

  const barSeries = [
    ...(barMetricFilter === 'Open & Click %' || barMetricFilter === 'Open %'
      ? [{ key: 'open', label: 'Open %', color: C.primary }]
      : []),
    ...(barMetricFilter === 'Open & Click %' || barMetricFilter === 'Click %'
      ? [{ key: 'click', label: 'Click %', color: C.indigo }]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Email Marketing Dashboard"
        description="Campaigns, delivery, and scheduled mail for this workspace."
        actions={
          <div className="flex items-center gap-2">
            <NativeSelect
              label="Dashboard date range"
              value={dateRange}
              onChange={setDateRange}
              options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year']}
            />
            <Link href="/email/builder">
              <Button>
                <Mail /> Create Campaign
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        {(['Draft', 'Scheduled', 'Sent'] as const).map((label) => (
          <Link key={label} href="/email/campaigns" className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-1 h-8 w-12" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{counts[label]}</p>
            )}
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      {loading && !kpis ? (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <KpiCardSkeleton key={idx} withDetail={idx >= 1 && idx <= 3} />
          ))}
        </div>
      ) : kpis ? (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Emails delivered"
            value={kpis.emailsDelivered.value}
            trend={kpis.emailsDelivered.trend}
            icon={MailCheck}
          />
          <KpiCard
            label="Avg. open rate"
            value={kpis.emailOpenRate.value}
            detail={kpis.emailOpenRate.detail}
            trend={kpis.emailOpenRate.trend}
            icon={MailOpen}
          />
          <KpiCard
            label="Avg. click rate"
            value={kpis.avgClickRate.value}
            detail={kpis.avgClickRate.detail}
            trend={kpis.avgClickRate.trend}
            icon={MousePointerClick}
          />
          <KpiCard
            label="Delivery rate"
            value={kpis.deliveryRate.value}
            detail={kpis.deliveryRate.detail}
            trend={kpis.deliveryRate.trend}
            icon={CheckCircle2}
          />
          <KpiCard
            label="Total subscribers"
            value={kpis.totalSubscribers.value}
            trend={kpis.totalSubscribers.trend}
            icon={Users}
          />
          <KpiCard
            label="Scheduled campaigns"
            value={kpis.scheduledCampaigns.value}
            trend={kpis.scheduledCampaigns.trend}
            icon={CalendarDays}
          />
        </div>
      ) : null}

      {/* Performance charts */}
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {loading ? (
          <>
            <PanelChartSkeleton
              title="Email trend"
              description="Delivered, opens, and clicks for mail already sent"
            />
            <PanelChartSkeleton
              title="Campaign comparison"
              description="Open vs click rate (%)"
            />
          </>
        ) : (
          <>
            <Panel
              title="Email trend"
              description={`${dateRange} · ${trendMetric}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    label="Filter email trend interval"
                    value={trendInterval}
                    onChange={(v) => setTrendInterval(v as 'day' | 'week' | 'month')}
                    options={[
                      { label: 'Daily', value: 'day' },
                      { label: 'Weekly', value: 'week' },
                      { label: 'Monthly', value: 'month' },
                    ]}
                  />
                  <NativeSelect
                    label="Filter email trend campaign"
                    value={trendCampaignId}
                    onChange={setTrendCampaignId}
                    options={[
                      { label: 'All campaigns', value: 'all' },
                      ...comparisonSource.map((c) => ({ label: c.name, value: c.id })),
                    ]}
                  />
                  <NativeSelect
                    label="Filter email trend metric"
                    value={trendMetric}
                    onChange={setTrendMetric}
                    options={['All Metrics', 'Delivered', 'Opens', 'Clicks']}
                  />
                </div>
              }
            >
              <TrendChart
                data={emailPerf}
                x="week"
                kind="line"
                series={trendSeries}
              />
            </Panel>

            <Panel
              title="Campaign comparison"
              description="Open vs click rate (%)"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    label="Filter bar chart campaign"
                    value={barCampaignId}
                    onChange={setBarCampaignId}
                    options={[
                      { label: 'All campaigns', value: 'all' },
                      ...comparisonSource.map((c) => ({ label: c.name, value: c.id })),
                    ]}
                  />
                  <NativeSelect
                    label="Filter campaign type"
                    value={barTypeFilter}
                    onChange={setBarTypeFilter}
                    options={['All Types', 'Newsletter', 'Promotional', 'Automated', 'Announcement']}
                  />
                  <NativeSelect
                    label="Filter campaign metric"
                    value={barMetricFilter}
                    onChange={setBarMetricFilter}
                    options={['Open & Click %', 'Open %', 'Click %']}
                  />
                </div>
              }
            >
              <BarsChart
                data={filteredBarCampaigns.map((c) => ({
                  name: c.name.split(' ').slice(0, 2).join(' '),
                  open: c.open ?? 0,
                  click: c.click ?? 0,
                }))}
                x="name"
                series={barSeries}
              />
            </Panel>
          </>
        )}
      </div>

      {/* Recent campaigns + Upcoming scheduled emails */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Recent campaigns"
          description="Latest broadcasts and newsletters"
          actions={
            <Link href="/email/campaigns">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          {loading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border bg-muted">
                  <tr>
                    {['Campaign', 'Subject', 'Status', 'Open Rate', 'Click Rate'].map((h) => (
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
                      <td className={td}>{c.subject || '—'}</td>
                      <td className={td}>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className={td}>{c.open !== null ? `${c.open}%` : '—'}</td>
                      <td className={td}>{c.click !== null ? `${c.click}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {campaigns.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No campaigns in this workspace yet.</p>}
            </TableWrap>
          )}
        </Panel>

        <Panel
          title="Upcoming scheduled emails"
          description="Scheduled broadcasts & automated sequences"
          actions={
            <Link href="/calendar">
              <Button variant="ghost" size="sm">
                View calendar <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          {loading ? (
            <TableSkeleton columns={4} rows={4} />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border bg-muted">
                  <tr>
                    {['Campaign', 'Send Date', 'Type', 'Status'].map((h) => (
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
                        })}{' '}
                        at {e.time}
                      </td>
                      <td className={td}>
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {e.type}
                        </span>
                      </td>
                      <td className={td}>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {upcomingEvents.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No upcoming scheduled emails.</p>}
            </TableWrap>
          )}
        </Panel>
      </div>
    </div>
  )
}
