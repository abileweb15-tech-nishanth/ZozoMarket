'use client'

import { useState } from 'react'
import { Eye, Heart, MessageCircle, MousePointerClick, Percent, Radio, Share2, UserPlus } from 'lucide-react'
import { PageHeader, KpiCard, Panel, NativeSelect, TableWrap, SimulatedNote, th, td } from '@/components/app/shared'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import { PlatformBadge } from '@/components/app/platform-badge'
import { fmt, platformBreakdown, platforms, socialPerformance, socialPosts } from '@/lib/mock-data'

export default function SocialAnalyticsPage() {
  const [range, setRange] = useState('Last 30 days')
  const [platform, setPlatform] = useState('All platforms')
  const top = socialPosts.filter((p) => p.likes && (platform === 'All platforms' || p.platforms.includes(platform as never)))

  return (
    <div>
      <PageHeader title="Social Media Analytics" description="Reach and engagement across your connected profiles."
        actions={<>
          <NativeSelect label="Date range" value={range} onChange={setRange} options={['Last 7 days', 'Last 30 days', 'Last 90 days']} />
          <NativeSelect label="Platform" value={platform} onChange={setPlatform} options={['All platforms', ...platforms]} />
        </>} />
      <div className="mb-6"><SimulatedNote>Sample data for demonstration — not pulled from real social accounts.</SimulatedNote></div>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Reach" value="306,000" trend={14.2} icon={Radio} />
        <KpiCard label="Impressions" value="466,800" trend={11.8} icon={Eye} />
        <KpiCard label="Engagement Rate" value="5.8%" trend={0.6} icon={Percent} />
        <KpiCard label="Likes" value="21,480" trend={9.1} icon={Heart} />
        <KpiCard label="Comments" value="1,932" trend={4.4} icon={MessageCircle} />
        <KpiCard label="Shares" value="2,876" trend={22.0} icon={Share2} />
        <KpiCard label="Clicks" value="4,215" trend={-3.2} icon={MousePointerClick} />
        <KpiCard label="Follower Growth" value="+1,770" trend={6.9} icon={UserPlus} />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Reach & impressions" description={range}>
          <TrendChart data={socialPerformance} x="week" kind="line" series={[{ key: 'reach', label: 'Reach', color: C.indigo }, { key: 'impressions', label: 'Impressions', color: C.primary }]} />
        </Panel>
        <Panel title="Engagement by platform" description={range}>
          <BarsChart data={platformBreakdown} x="platform" series={[{ key: 'engagement', label: 'Engagements', color: C.primary }]} />
        </Panel>
        <Panel title="Follower growth" description={range} className="xl:col-span-2">
          <TrendChart data={socialPerformance} x="week" series={[{ key: 'followers', label: 'Followers', color: C.green }]} height={200} />
        </Panel>
      </div>
      <h2 className="mb-3 text-sm font-semibold">Top-performing posts</h2>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted"><tr>{['Post', 'Platforms', 'Likes', 'Comments', 'Shares'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {top.map((p) => (
              <tr key={p.id}>
                <td className={`${td} max-w-xs truncate`}>{p.caption}</td>
                <td className={td}><div className="flex gap-1">{p.platforms.map((pl) => <PlatformBadge key={pl} platform={pl} />)}</div></td>
                <td className={`${td} tabular-nums`}>{fmt(p.likes!)}</td>
                <td className={`${td} tabular-nums`}>{fmt(p.comments!)}</td>
                <td className={`${td} tabular-nums`}>{fmt(p.shares!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}
