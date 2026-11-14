'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MailCheck,
  MailOpen,
  MousePointerClick,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PageHeader,
  KpiCard,
  KpiCardSkeleton,
  Panel,
  PanelChartSkeleton,
  NativeSelect,
  Segmented,
  TableSkeleton,
  TableWrap,
  th,
  td,
  EmptyState,
} from '@/components/app/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendChart, BarsChart, C } from '@/components/app/charts'
import {
  exportAnalyticsToCsv,
  exportAnalyticsToPdf,
  openPrintablePdfReport,
  type AnalyticsExportPayload,
  type ExportKpiItem,
} from '@/lib/analytics-export'
import {
  api,
  type AnalyticsOverview,
  type EmailCampaign,
  type EmailPerformancePoint,
  type SesAnalyticsResponse,
} from '@/lib/api'

const TABS = ['Email Analytics', 'AWS SES CloudWatch'] as const

const TIMEFRAME_OPTIONS = [
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
]

function computeDateRange(label: string): { start: string; end: string; interval: 'day' | 'week' | 'month' } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const startDate = new Date(now)
  let interval: 'day' | 'week' | 'month' = 'week'

  if (label === 'Last 7 days') {
    startDate.setDate(startDate.getDate() - 6)
    interval = 'day'
  } else if (label === 'Last 30 days') {
    startDate.setDate(startDate.getDate() - 29)
    interval = 'day'
  } else if (label === 'Last 90 days') {
    startDate.setDate(startDate.getDate() - 89)
    interval = 'week'
  } else if (label === 'This year') {
    startDate.setMonth(0, 1)
    interval = 'month'
  } else {
    startDate.setDate(startDate.getDate() - 29)
    interval = 'week'
  }

  return { start: startDate.toISOString().slice(0, 10), end, interval }
}

export default function EmailAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Email Analytics')
  const [range, setRange] = useState('Last 30 days')
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [emailPerformance, setEmailPerformance] = useState<EmailPerformancePoint[]>([])
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(true)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all')
  const [trendInterval, setTrendInterval] = useState<'day' | 'week' | 'month'>('day')
  const [trendMetric, setTrendMetric] = useState<string>('All Metrics')
  const [barCampaignId, setBarCampaignId] = useState<string>('all')
  const [barTypeFilter, setBarTypeFilter] = useState<string>('All Types')
  const [barMetricFilter, setBarMetricFilter] = useState<string>('Open & Click %')

  // AWS SES CloudWatch State
  const [timeframe, setTimeframe] = useState<string>('30d')
  const [campaign, setCampaign] = useState<string>('all')
  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([])
  const [sesData, setSesData] = useState<SesAnalyticsResponse | null>(null)
  const [loadingSes, setLoadingSes] = useState<boolean>(true)

  // Fetch CloudWatch SES Metrics
  const loadSesMetrics = useCallback(async (camp: string, tf: string) => {
    setLoadingSes(true)
    try {
      const data = await api.analytics.getSesMetrics(camp, tf)
      setSesData(data)
      if (data.availableCampaigns && data.availableCampaigns.length > 0) {
        setAvailableCampaigns(data.availableCampaigns)
      }
    } catch {
      // Keep previous state or empty state on failure
    } finally {
      setLoadingSes(false)
    }
  }, [])

  // Initial and reactive CloudWatch loading
  useEffect(() => {
    loadSesMetrics(campaign, timeframe)
  }, [campaign, timeframe, loadSesMetrics])

  // Reactive Email Analytics loading when date range, interval, or campaign filter changes
  useEffect(() => {
    let active = true
    setLoadingAnalytics(true)
    const { start, end } = computeDateRange(range)
    Promise.allSettled([
      api.analytics.getOverview(start, end).then((d) => { if (active) setOverview(d) }),
      api.analytics.getEmailPerformance(trendInterval, start, end, selectedCampaignId).then((d) => { if (active) setEmailPerformance(d) }),
      api.analytics.getCampaigns().then((d) => { if (active) setCampaigns(d) }),
    ]).finally(() => {
      if (active) setLoadingAnalytics(false)
    })
    return () => {
      active = false
    }
  }, [range, trendInterval, selectedCampaignId])

  useEffect(() => {
    api.analytics
      .getSesCampaigns()
      .then((camps) => {
        if (camps && camps.length > 0) {
          setAvailableCampaigns(camps)
        }
      })
      .catch(() => {})
  }, [])

  const allComparisonCampaigns = useMemo(() => {
    const local = campaigns.filter((c) => c.status === 'Sent' || c.open !== null)
    if (local.length > 0) return local
    const breakdown = sesData?.breakdown ?? []
    if (breakdown.length > 0) {
      return breakdown
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
    }
    if (sesData?.mode === 'single' && sesData.campaign && (sesData.metrics.send > 0 || sesData.metrics.delivery > 0)) {
      const m = sesData.metrics
      return [
        {
          id: sesData.campaign,
          name: sesData.campaign.replace(/_/g, ' '),
          type: 'Newsletter' as const,
          status: 'Sent' as const,
          audience: `${m.send.toLocaleString()} sent`,
          subject: '',
          date: '',
          recipients: m.send,
          delivery: sesData.rates.deliveryRate,
          open: sesData.rates.openRate,
          click: m.delivery > 0 ? Math.round((m.click / m.delivery) * 1000) / 10 : 0,
        },
      ]
    }
    return []
  }, [campaigns, sesData])

  const displayCampaigns = useMemo(
    () =>
      allComparisonCampaigns.filter(
        (c) =>
          (barCampaignId === 'all' || c.id === barCampaignId) &&
          (barTypeFilter === 'All Types' || c.type === barTypeFilter),
      ),
    [allComparisonCampaigns, barCampaignId, barTypeFilter],
  )

  const trendSeries = useMemo(
    () => [
      ...(trendMetric === 'All Metrics' || trendMetric === 'Delivered'
        ? [{ key: 'delivered', label: 'Delivered', color: C.gray }]
        : []),
      ...(trendMetric === 'All Metrics' || trendMetric === 'Opens'
        ? [{ key: 'opens', label: 'Opens', color: C.primary }]
        : []),
      ...(trendMetric === 'All Metrics' || trendMetric === 'Clicks'
        ? [{ key: 'clicks', label: 'Clicks', color: C.indigo }]
        : []),
    ],
    [trendMetric],
  )

  const barSeries = useMemo(
    () => [
      ...(barMetricFilter === 'Open & Click %' || barMetricFilter === 'Open %'
        ? [{ key: 'open', label: 'Open %', color: C.primary }]
        : []),
      ...(barMetricFilter === 'Open & Click %' || barMetricFilter === 'Click %'
        ? [{ key: 'click', label: 'Click %', color: C.indigo }]
        : []),
    ],
    [barMetricFilter],
  )

  const displayBreakdown = useMemo(
    () => sesData?.breakdown ?? [],
    [sesData],
  )

  const displayMetrics = useMemo(() => ({
    metrics: sesData?.metrics ?? {
      send: 0,
      delivery: 0,
      open: 0,
      click: 0,
      bounce: 0,
      complaint: 0,
      reject: 0,
    },
    rates: sesData?.rates ?? {
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      complaintRate: 0,
    },
  }), [sesData])

  const selectedTfLabel = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.label || timeframe
  const isOverall = campaign === 'all' || !campaign

  // Build comprehensive export payload from active view and data
  const getExportPayload = (): AnalyticsExportPayload => {
    const isSes = activeTab === 'AWS SES CloudWatch'
    const generatedAt = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const kpiItems: ExportKpiItem[] = isSes
      ? [
          { label: 'Total Sent', value: displayMetrics.metrics.send.toLocaleString(), subtext: 'Delivered SES mails' },
          { label: 'Delivered', value: displayMetrics.metrics.delivery.toLocaleString(), detail: `${displayMetrics.rates.deliveryRate}% Delivery rate` },
          { label: 'Opened', value: displayMetrics.metrics.open.toLocaleString(), detail: `${displayMetrics.rates.openRate}% Open rate` },
          { label: 'Clicked', value: displayMetrics.metrics.click.toLocaleString(), detail: `${displayMetrics.rates.clickRate}% Click rate (CTR)` },
          { label: 'Bounced', value: displayMetrics.metrics.bounce.toLocaleString(), detail: `${displayMetrics.rates.bounceRate}% Bounce rate` },
          { label: 'Complaints', value: displayMetrics.metrics.complaint.toLocaleString(), detail: `${displayMetrics.rates.complaintRate}% Spam rate` },
        ]
      : [
          {
            label: 'Delivered emails',
            value: (overview?.delivered ?? 0).toLocaleString(),
            detail: `${overview?.deliveryRate ?? 0}% delivery rate`,
          },
          {
            label: 'Avg. open rate',
            value: `${(overview?.openRate ?? 0).toFixed(1)}%`,
            detail: `${(overview?.opens ?? 0).toLocaleString()} opened`,
          },
          {
            label: 'Avg. click rate',
            value: `${(overview?.clickRate ?? 0).toFixed(1)}%`,
            detail: `${(overview?.clicks ?? 0).toLocaleString()} clicked`,
          },
        ]

    return {
      title: isSes ? 'AWS SES Campaign Tracking & Analytics' : 'Email Analytics',
      subtitle: isSes
        ? 'Real-time Amazon SES CloudWatch metrics, dynamic campaign tags, deliverability, and engagement rates.'
        : 'Delivery, open rates, and click engagement across your campaigns.',
      range: isSes ? selectedTfLabel : range,
      activeTab,
      generatedAt,
      kpis: kpiItems,
      performance: emailPerformance,
      campaigns: displayCampaigns.map((c) => ({
        name: c.name,
        audience: c.audience,
        delivery: c.delivery,
        open: c.open,
        click: c.click,
      })),
      sesBreakdown: displayBreakdown,
    }
  }

  const handleExportPdf = () => {
    try {
      const payload = getExportPayload()
      exportAnalyticsToPdf(payload)
      toast.success('Opening PDF print preview…')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  const handlePrintPreview = () => {
    try {
      const payload = getExportPayload()
      openPrintablePdfReport(payload, false)
      toast.info('Opening printable report preview…')
    } catch {
      toast.error('Failed to open preview')
    }
  }

  const handleExportCsv = () => {
    try {
      const payload = getExportPayload()
      exportAnalyticsToCsv(payload)
      toast.success('CSV spreadsheet exported successfully!')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  const renderExportMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer"
      >
        <Download className="size-3.5" />
        Export Report
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 bg-popover text-popover-foreground shadow-lg border border-border p-1.5">
        <DropdownMenuItem
          onClick={handleExportPdf}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent transition-colors"
        >
          <FileText className="size-4 text-amber-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-foreground">Save as PDF Report</span>
            <span className="text-[10px] text-muted-foreground">Executive printable document</span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handlePrintPreview}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent transition-colors"
        >
          <Printer className="size-4 text-blue-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-foreground">Print / PDF Preview</span>
            <span className="text-[10px] text-muted-foreground">Preview before saving</span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleExportCsv}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent transition-colors"
        >
          <FileSpreadsheet className="size-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-foreground">Download CSV Data</span>
            <span className="text-[10px] text-muted-foreground">Spreadsheet format (.csv)</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar: View Mode Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Segmented
            label="Analytics View"
            value={activeTab}
            onChange={setActiveTab}
            options={TABS}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {activeTab === 'Email Analytics'
            ? 'Standard Campaign & Delivery Analytics'
            : 'Real-time AWS SES & CloudWatch Telemetry'}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EMAIL ANALYTICS (Production View - Image 3)                         */}
      {/* ========================================================================= */}
      {activeTab === 'Email Analytics' && (
        <div className="space-y-8">
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
                {renderExportMenu()}
              </>
            }
          />

          {/* Key Delivery & Engagement Metrics */}
          <section aria-labelledby="kpi-heading" className="mb-8">
            <h2 id="kpi-heading" className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Key Delivery & Engagement Metrics
            </h2>
            {loadingAnalytics ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCardSkeleton withDetail />
                <KpiCardSkeleton withDetail />
                <KpiCardSkeleton withDetail />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Delivered emails"
                  value={(overview?.delivered ?? 0).toLocaleString()}
                  detail={`${overview?.sent ?? 0} sent · ${overview?.deliveryRate ?? 0}% delivery`}
                  icon={MailCheck}
                />
                <KpiCard
                  label="Avg. open rate"
                  value={`${(overview?.openRate ?? 0).toFixed(1)}%`}
                  detail={`${(overview?.opens ?? 0).toLocaleString()} opened`}
                  icon={MailOpen}
                />
                <KpiCard
                  label="Avg. click rate"
                  value={`${(overview?.clickRate ?? 0).toFixed(1)}%`}
                  detail={`${(overview?.clicks ?? 0).toLocaleString()} clicked`}
                  icon={MousePointerClick}
                />
              </div>
            )}
          </section>

          {/* Performance Trend & Campaign Comparison Charts */}
          <div className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
            {loadingAnalytics ? (
              <>
                <PanelChartSkeleton title="Email performance trend" description={range} />
                <PanelChartSkeleton title="Campaign comparison" description="Open vs click rate (%)" />
              </>
            ) : (
              <>
                <Panel
                  title="Email performance trend"
                  description={`${range} · ${trendMetric}`}
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        label="Filter trend interval"
                        value={trendInterval}
                        onChange={(v) => setTrendInterval(v as 'day' | 'week' | 'month')}
                        options={[
                          { label: 'Daily', value: 'day' },
                          { label: 'Weekly', value: 'week' },
                          { label: 'Monthly', value: 'month' },
                        ]}
                      />
                      <NativeSelect
                        label="Filter trend by campaign"
                        value={selectedCampaignId}
                        onChange={setSelectedCampaignId}
                        options={[
                          { label: 'All campaigns', value: 'all' },
                          ...allComparisonCampaigns.map((c) => ({ label: c.name, value: c.id })),
                        ]}
                      />
                      <NativeSelect
                        label="Filter trend metric"
                        value={trendMetric}
                        onChange={setTrendMetric}
                        options={['All Metrics', 'Delivered', 'Opens', 'Clicks']}
                      />
                    </div>
                  }
                >
                  <TrendChart
                    data={emailPerformance}
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
                        label="Filter comparison campaign"
                        value={barCampaignId}
                        onChange={setBarCampaignId}
                        options={[
                          { label: 'All campaigns', value: 'all' },
                          ...allComparisonCampaigns.map((c) => ({ label: c.name, value: c.id })),
                        ]}
                      />
                      <NativeSelect
                        label="Filter campaign type"
                        value={barTypeFilter}
                        onChange={setBarTypeFilter}
                        options={['All Types', 'Newsletter', 'Promotional', 'Automated', 'Announcement']}
                      />
                      <NativeSelect
                        label="Filter comparison metric"
                        value={barMetricFilter}
                        onChange={setBarMetricFilter}
                        options={['Open & Click %', 'Open %', 'Click %']}
                      />
                    </div>
                  }
                >
                  <BarsChart
                    data={displayCampaigns.map((c) => ({
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

          {/* Top-performing email campaigns table */}
          <section aria-labelledby="top-campaigns-heading">
            <h2 id="top-campaigns-heading" className="mb-3 text-sm font-semibold">
              Top-performing email campaigns
            </h2>
            {loadingAnalytics ? (
              <TableSkeleton columns={5} rows={4} />
            ) : displayCampaigns.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={MailCheck}
                  title="No sent campaigns yet"
                  description="Send your first campaign to see per-campaign delivery, open, and click rates here."
                />
              </Panel>
            ) : (
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
                    {displayCampaigns.map((c) => (
                      <tr key={c.id}>
                        <td className={`${td} font-medium`}>{c.name}</td>
                        <td className={td}>{c.audience}</td>
                        <td className={td}>{c.delivery !== null ? `${c.delivery}%` : '—'}</td>
                        <td className={td}>
                          <span className="font-semibold text-primary">
                            {c.open !== null ? `${c.open}%` : '—'}
                          </span>
                        </td>
                        <td className={td}>{c.click !== null ? `${c.click}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: AWS SES CLOUDWATCH (Advanced View - Image 4)                       */}
      {/* ========================================================================= */}
      {activeTab === 'AWS SES CloudWatch' && (
        <div className="space-y-8">
          <PageHeader
            title="AWS SES Campaign Tracking & Analytics"
            description="Real-time Amazon SES CloudWatch metrics, dynamic campaign tags, deliverability, and engagement rates."
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    loadSesMetrics(campaign, timeframe)
                    toast.success('Refreshing CloudWatch metrics…')
                  }}
                  disabled={loadingSes}
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${loadingSes ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                {renderExportMenu()}
              </>
            }
          />

          {/* Controls Bar: Timeframe & Campaign Selectors */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Timeframe:
                </span>
                <select
                  aria-label="Timeframe"
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TIMEFRAME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Campaign:
                </span>
                <select
                  aria-label="Campaign"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Overall (All Campaigns Combined)</option>
                  {availableCampaigns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Mode: <strong>{isOverall ? 'Aggregate (All)' : 'Single Campaign'}</strong>
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span>Window: <strong>Last {selectedTfLabel}</strong></span>
            </div>
          </div>

          {/* CloudWatch SES Key Performance Indicators */}
          <section aria-labelledby="ses-kpis-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="ses-kpis-heading" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                CloudWatch SES Key Performance Indicators
              </h2>
              {loadingSes && <span className="text-xs text-muted-foreground">Updating metrics…</span>}
            </div>

            {loadingSes ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="size-4 rounded" />
                    </div>
                    <Skeleton className="h-8 w-14" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {/* Card 1: Total Sent */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Total Sent</span>
                  <Send className="size-4 text-primary" />
                </div>
                <span className="text-2xl font-bold tracking-tight">
                  {loadingSes ? '…' : displayMetrics.metrics.send.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">Delivered SES mails</span>
              </div>

              {/* Card 2: Delivered */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Delivered</span>
                  <MailCheck className="size-4 text-emerald-500" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {loadingSes ? '…' : displayMetrics.metrics.delivery.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {displayMetrics.rates.deliveryRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">Delivery rate</span>
                </div>
              </div>

              {/* Card 3: Opened */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Opened</span>
                  <MailOpen className="size-4 text-blue-500" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                  {loadingSes ? '…' : displayMetrics.metrics.open.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {displayMetrics.rates.openRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">Open rate</span>
                </div>
              </div>

              {/* Card 4: Clicked */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Clicked</span>
                  <MousePointerClick className="size-4 text-indigo-500" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                  {loadingSes ? '…' : displayMetrics.metrics.click.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {displayMetrics.rates.clickRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">Click rate (CTR)</span>
                </div>
              </div>

              {/* Card 5: Bounced */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Bounced</span>
                  <AlertTriangle className="size-4 text-amber-500" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                  {loadingSes ? '…' : displayMetrics.metrics.bounce.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {displayMetrics.rates.bounceRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">Bounce rate</span>
                </div>
              </div>

              {/* Card 6: Complaints / Spam */}
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Complaints</span>
                  <ShieldAlert className="size-4 text-rose-500" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                  {displayMetrics.metrics.complaint.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-rose-500/10 px-1.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {displayMetrics.rates.complaintRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">Spam rate</span>
                </div>
              </div>
            </div>
            )}
          </section>

          {/* Per-Campaign SES CloudWatch Breakdown Table */}
          {isOverall && (
            <section aria-labelledby="breakdown-heading">
              <Panel
                title="Per-Campaign SES CloudWatch Breakdown"
                description={`Aggregated across individual campaign tags over ${selectedTfLabel}.`}
                actions={
                  <span className="text-xs text-muted-foreground">
                    {displayBreakdown.length} active tag(s)
                  </span>
                }
              >
                {loadingSes ? (
                  <TableSkeleton columns={8} rows={4} />
                ) : displayBreakdown.length === 0 ? (
                  <EmptyState
                    icon={Layers}
                    title="No Campaign Breakdown Available"
                    description="CloudWatch has not recorded datapoints for individual campaign tags in this timeframe yet."
                  />
                ) : (
                  <TableWrap>
                    <table className="w-full">
                      <thead className="border-b border-border bg-muted/60">
                        <tr>
                          <th scope="col" className={th}>Campaign Name</th>
                          <th scope="col" className={th}>Sent</th>
                          <th scope="col" className={th}>Delivered</th>
                          <th scope="col" className={th}>Opened</th>
                          <th scope="col" className={th}>Clicked</th>
                          <th scope="col" className={th}>Bounced</th>
                          <th scope="col" className={th}>Open Rate %</th>
                          <th scope="col" className={`${th} text-right`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {displayBreakdown.map((row) => (
                          <tr key={row.campaign} className="hover:bg-muted/40 transition-colors">
                            <td className={`${td} font-medium`}>
                              <div className="flex items-center gap-2">
                                <span className="inline-block size-2 rounded-full bg-primary" />
                                <span>{row.campaign}</span>
                              </div>
                            </td>
                            <td className={td}>{row.sent.toLocaleString()}</td>
                            <td className={td}>{row.delivered.toLocaleString()}</td>
                            <td className={td}>{row.opened.toLocaleString()}</td>
                            <td className={td}>{row.clicked.toLocaleString()}</td>
                            <td className={td}>{row.bounced.toLocaleString()}</td>
                            <td className={td}>
                              <span className="font-semibold text-primary">{row.openRate}%</span>
                            </td>
                            <td className={`${td} text-right`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                onClick={() => {
                                  setCampaign(row.campaign)
                                  toast.info(`Filtered down to campaign "${row.campaign}"`)
                                }}
                              >
                                <Filter className="size-3" />
                                Filter
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </Panel>
            </section>
          )}

          {/* Filtered View Banner (when viewing a single campaign) */}
          {!isOverall && (
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-primary" />
                <span>
                  Currently viewing isolated metrics for campaign: <strong>{campaign}</strong>
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCampaign('all')}
                className="text-xs"
              >
                Show All Campaigns <ArrowRight className="size-3 ml-1" />
              </Button>
            </div>
          )}

          {/* Performance Charts below */}
          {loadingAnalytics ? (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <PanelChartSkeleton />
              <PanelChartSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel
                title="Email performance trend"
                description={`${range} · ${trendMetric}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      label="Filter trend interval"
                      value={trendInterval}
                      onChange={(v) => setTrendInterval(v as 'day' | 'week' | 'month')}
                      options={[
                        { label: 'Daily', value: 'day' },
                        { label: 'Weekly', value: 'week' },
                        { label: 'Monthly', value: 'month' },
                      ]}
                    />
                    <NativeSelect
                      label="Filter trend by campaign"
                      value={selectedCampaignId}
                      onChange={setSelectedCampaignId}
                      options={[
                        { label: 'All campaigns', value: 'all' },
                        ...allComparisonCampaigns.map((c) => ({ label: c.name, value: c.id })),
                      ]}
                    />
                    <NativeSelect
                      label="Filter trend metric"
                      value={trendMetric}
                      onChange={setTrendMetric}
                      options={['All Metrics', 'Delivered', 'Opens', 'Clicks']}
                    />
                  </div>
                }
              >
                <TrendChart
                  data={emailPerformance}
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
                      label="Filter comparison campaign"
                      value={barCampaignId}
                      onChange={setBarCampaignId}
                      options={[
                        { label: 'All campaigns', value: 'all' },
                        ...allComparisonCampaigns.map((c) => ({ label: c.name, value: c.id })),
                      ]}
                    />
                    <NativeSelect
                      label="Filter campaign type"
                      value={barTypeFilter}
                      onChange={setBarTypeFilter}
                      options={['All Types', 'Newsletter', 'Promotional', 'Automated', 'Announcement']}
                    />
                    <NativeSelect
                      label="Filter comparison metric"
                      value={barMetricFilter}
                      onChange={setBarMetricFilter}
                      options={['Open & Click %', 'Open %', 'Click %']}
                    />
                  </div>
                }
              >
                <BarsChart
                  data={displayCampaigns.map((c) => ({
                    name: c.name.split(' ').slice(0, 2).join(' '),
                    open: c.open ?? 0,
                    click: c.click ?? 0,
                  }))}
                  x="name"
                  series={barSeries}
                />
              </Panel>
            </div>
          )}

          {/* Top Performing Campaigns Table below */}
          <section aria-labelledby="top-campaigns-heading-ses">
            <h2 id="top-campaigns-heading-ses" className="mb-3 text-sm font-semibold">
              Top-performing email campaigns
            </h2>
            {loadingAnalytics ? (
              <TableSkeleton columns={5} rows={4} />
            ) : (
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
                    {displayCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No sent campaigns recorded yet.
                        </td>
                      </tr>
                    ) : (
                      displayCampaigns.map((c) => (
                        <tr key={c.id}>
                          <td className={`${td} font-medium`}>{c.name}</td>
                          <td className={td}>{c.audience}</td>
                          <td className={td}>{c.delivery ?? '—'}%</td>
                          <td className={td}>
                            <span className="font-semibold text-primary">{c.open ?? '—'}%</span>
                          </td>
                          <td className={td}>{c.click ?? '—'}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
