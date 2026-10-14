'use client'

import { useState } from 'react'
import { Download, Heart, MailCheck, MailOpen, MousePointerClick, Radio, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, KpiCard, Panel, NativeSelect, Segmented, TableWrap, th, td } from '@/components/app/shared'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import { emailCampaigns, emailPerformance, fmt, socialPerformance, socialPosts } from '@/lib/mock-data'

const channels = ['All Channels', 'Email', 'Social Media'] as const

export default function UnifiedAnalyticsPage() {
  const [range, setRange] = useState('Last 30 days')
  const [channel, setChannel] = useState<(typeof channels)[number]>('All Channels')
  const showEmail = channel !== 'Social Media'
  const showSocial = channel !== 'Email'
  const sent = emailCampaigns.filter((c) => c.open !== null)

  return (
    <div>
      <PageHeader title="Unified Analytics" description="Email and social results side by side — measured on their own terms."
        actions={<>
          <NativeSelect label="Date range" value={range} onChange={setRange} options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year']} />
          <Button variant="outline" onClick={() => toast.success('Report exported (sample CSV)')}><Download /> Export Report</Button>
        </>} />
      <div className="mb-6"><Segmented label="Channel" value={channel} onChange={setChannel} options={channels} /></div>

      {showEmail && (
        <section aria-labelledby="email-h" className="mb-10">
          <h2 id="email-h" className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Email delivery & engagement</h2>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Delivered" value="94,300" trend={12.4} icon={MailCheck} />
            <KpiCard label="Avg. open rate" value="39.8%" trend={2.1} icon={MailOpen} />
            <KpiCard label="Avg. click rate" value="6.1%" trend={0.8} icon={MousePointerClick} />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Email trend" description={range}>
              <TrendChart data={emailPerformance} x="week" kind="line" series={[{ key: 'delivered', label: 'Delivered', color: C.gray }, { key: 'opens', label: 'Opens', color: C.primary }, { key: 'clicks', label: 'Clicks', color: C.indigo }]} />
            </Panel>
            <Panel title="Campaign comparison" description="Open vs click rate (%)">
              <BarsChart data={sent.map((c) => ({ name: c.name.split(' ').slice(0, 2).join(' '), open: c.open, click: c.click }))} x="name" series={[{ key: 'open', label: 'Open %', color: C.primary }, { key: 'click', label: 'Click %', color: C.indigo }]} />
            </Panel>
          </div>
        </section>
      )}

      {showSocial && (
        <section aria-labelledby="social-h" className="mb-10">
          <h2 id="social-h" className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Social reach & engagement</h2>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Reach" value="306,000" trend={14.2} icon={Radio} />
            <KpiCard label="Engagements" value="27,000" trend={18.6} icon={Heart} />
            <KpiCard label="New followers" value="+1,770" trend={6.9} icon={UserPlus} />
          </div>
          <Panel title="Social trend" description={range}>
            <TrendChart data={socialPerformance} x="week" series={[{ key: 'engagement', label: 'Engagements', color: C.indigo }]} />
          </Panel>
        </section>
      )}

      <h2 className="mb-3 text-sm font-semibold">Top-performing content</h2>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted"><tr>{['Content', 'Channel', 'Key metric'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {showEmail && sent.sort((a, b) => (b.open ?? 0) - (a.open ?? 0)).slice(0, 3).map((c) => (
              <tr key={c.id}><td className={`${td} font-medium`}>{c.name}</td><td className={td}>Email</td><td className={td}>{c.open}% open · {c.click}% click</td></tr>
            ))}
            {showSocial && socialPosts.filter((p) => p.likes).map((p) => (
              <tr key={p.id}><td className={`${td} max-w-xs truncate font-medium`}>{p.caption}</td><td className={td}>Social</td><td className={td}>{fmt(p.likes!)} likes · {fmt(p.shares!)} shares</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}
