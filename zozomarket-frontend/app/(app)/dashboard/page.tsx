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
import { PageHeader, KpiCard, Panel, StatusBadge, TableWrap, th, td } from '@/components/app/shared'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import {
  api,
  type EmailCampaign,
  type CalendarEvent,
  type EmailPerformancePoint,
  type DashboardKPIs,
} from '@/lib/api'

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [calendar, setCalendar] = useState<CalendarEvent[]>([])
  const [emailPerf, setEmailPerf] = useState<EmailPerformancePoint[]>([])

  useEffect(() => {
    const fail = (err: Error) => toast.error(err.message)
    api.dashboard.getKPIs().then(setKpis).catch(fail)
    api.campaigns.list().then(setCampaigns).catch(fail)
    api.calendar.list().then(setCalendar).catch(fail)
    api.analytics.getEmailPerformance().then(setEmailPerf).catch(fail)
  }, [])

  const sentCampaigns = campaigns.filter((c) => c.status === 'Sent')
  const upcomingEvents = calendar.filter((e) => e.status === 'Scheduled').slice(0, 5)
  const counts = {
    Draft: campaigns.filter((c) => c.status === 'Draft').length,
    Scheduled: campaigns.filter((c) => c.status === 'Scheduled').length,
    Sent: sentCampaigns.length,
  }

  return (
    <div>
      <PageHeader
        title="Email Marketing Dashboard"
        description="Campaigns, delivery, and scheduled mail for this workspace."
        actions={
          <div className="flex items-center gap-2">
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
            <p className="text-2xl font-semibold tabular-nums">{counts[label]}</p>
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      {kpis && (
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
      )}

      {/* Performance charts */}
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Email trend"
          description="Delivered, opens, and clicks for mail already sent"
        >
          <TrendChart
            data={emailPerf}
            x="week"
            kind="line"
            series={[
              { key: 'delivered', label: 'Delivered', color: C.gray },
              { key: 'opens', label: 'Opens', color: C.primary },
              { key: 'clicks', label: 'Clicks', color: C.indigo },
            ]}
          />
        </Panel>

        <Panel
          title="Campaign comparison"
          description="Open vs click rate (%)"
        >
          <BarsChart
            data={campaigns.slice(0, 6).map((c) => ({
              name: c.name.split(' ').slice(0, 2).join(' '),
              open: c.open ?? 0,
              click: c.click ?? 0,
            }))}
            x="name"
            series={[
              { key: 'open', label: 'Open %', color: C.primary },
              { key: 'click', label: 'Click %', color: C.indigo },
            ]}
          />
        </Panel>
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
          </TableWrap>
        </Panel>
      </div>
    </div>
  )
}
