'use client'

import { useEffect, useState } from 'react'
import { Download, MailCheck, MailOpen, MousePointerClick } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, KpiCard, Panel, NativeSelect, TableWrap, th, td } from '@/components/app/shared'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import { api, type DashboardKPIs, type EmailCampaign, type EmailPerformancePoint } from '@/lib/api'

export default function EmailAnalyticsPage() {
  const [range, setRange] = useState('Last 30 days')
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [emailPerformance, setEmailPerformance] = useState<EmailPerformancePoint[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])

  useEffect(() => {
    api.dashboard.getKPIs().then(setKpis).catch((err: Error) => toast.error(err.message))
    api.analytics.getEmailPerformance().then(setEmailPerformance).catch((err: Error) => toast.error(err.message))
    api.campaigns.list().then(setCampaigns).catch((err: Error) => toast.error(err.message))
  }, [])

  const sent = campaigns.filter((c) => c.open !== null)

  return (
    <div>
      <PageHeader
        title="Email Analytics"
        description="Delivery, open rates, and click engagement across your campaigns."
        actions={
          <>
            <NativeSelect
              label="Date range"
              value={range}
              onChange={setRange}
              options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year']}
            />
            <Button variant="outline" onClick={() => toast.success('Report exported (sample CSV)')}>
              <Download /> Export Report
            </Button>
          </>
        }
      />

      {/* KPI Cards */}
      <section aria-labelledby="kpi-heading" className="mb-8">
        <h2 id="kpi-heading" className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Key Delivery & Engagement Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Delivered emails" value={kpis?.emailsDelivered.value ?? '—'} trend={kpis?.emailsDelivered.trend ?? 0} icon={MailCheck} />
          <KpiCard label="Avg. open rate" value={kpis?.emailOpenRate.value ?? '—'} detail={kpis?.emailOpenRate.detail} trend={kpis?.emailOpenRate.trend ?? 0} icon={MailOpen} />
          <KpiCard label="Avg. click rate" value={kpis?.avgClickRate.value ?? '—'} detail={kpis?.avgClickRate.detail} trend={kpis?.avgClickRate.trend ?? 0} icon={MousePointerClick} />
        </div>
      </section>

      {/* Performance Charts */}
      <div className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Email performance trend" description={range}>
          <TrendChart
            data={emailPerformance}
            x="week"
            kind="line"
            series={[
              { key: 'delivered', label: 'Delivered', color: C.gray },
              { key: 'opens', label: 'Opens', color: C.primary },
              { key: 'clicks', label: 'Clicks', color: C.indigo },
            ]}
          />
        </Panel>

        <Panel title="Campaign comparison" description="Open vs click rate (%)">
          <BarsChart
            data={sent.map((c) => ({
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

      {/* Top Performing Campaigns Table */}
      <section aria-labelledby="top-campaigns-heading">
        <h2 id="top-campaigns-heading" className="mb-3 text-sm font-semibold">
          Top-performing email campaigns
        </h2>
        <TableWrap>
          <table className="w-full">
            <thead className="border-b border-border bg-muted">
              <tr>
                {['Campaign Name', 'Audience', 'Delivery Rate', 'Open Rate', 'Click Rate'].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sent
                .sort((a, b) => (b.open ?? 0) - (a.open ?? 0))
                .map((c) => (
                  <tr key={c.id}>
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={td}>{c.audience}</td>
                    <td className={td}>{c.delivery}%</td>
                    <td className={td}>
                      <span className="font-semibold text-primary">{c.open}%</span>
                    </td>
                    <td className={td}>{c.click}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  )
}
