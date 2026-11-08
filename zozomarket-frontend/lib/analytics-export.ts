/**
 * Analytics Export Engine
 * Provides direct PDF generation, executive print-to-PDF reports, and CSV data export.
 */

export interface ExportKpiItem {
  label: string
  value: string
  detail?: string | null
  trend?: number
  subtext?: string
}

export interface ExportPerformancePoint {
  week: string
  delivered: number
  opens: number
  clicks: number
}

export interface ExportCampaignItem {
  name: string
  audience: string
  delivery: number | null
  open: number | null
  click: number | null
}

export interface ExportSesBreakdownItem {
  campaign: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  openRate: number
}

export interface AnalyticsExportPayload {
  title: string
  subtitle: string
  range: string
  activeTab: 'Email Analytics' | 'AWS SES CloudWatch'
  generatedAt: string
  kpis: ExportKpiItem[]
  performance: ExportPerformancePoint[]
  campaigns: ExportCampaignItem[]
  sesBreakdown?: ExportSesBreakdownItem[]
}

/**
 * Triggers an immediate browser download of a text or binary file.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Escape strings for standard CSV format and neutralize spreadsheet formula injection.
 */
function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""'
  let str = String(val)
  if (['=', '+', '-', '@', '\t', '\r'].some((char) => str.startsWith(char))) {
    str = `'${str}`
  }
  return `"${str.replace(/"/g, '""')}"`
}

/**
 * Export analytics payload to CSV format.
 */
export function exportAnalyticsToCsv(payload: AnalyticsExportPayload): void {
  const lines: string[] = []

  // Document metadata
  lines.push('ZOZOMARKET EMAIL ANALYTICS REPORT')
  lines.push(`Report Title,${escapeCsv(payload.title)}`)
  lines.push(`Active View,${escapeCsv(payload.activeTab)}`)
  lines.push(`Timeframe / Date Range,${escapeCsv(payload.range)}`)
  lines.push(`Generated At,${escapeCsv(payload.generatedAt)}`)
  lines.push('')

  // Section 1: KPIs
  lines.push('--- KEY PERFORMANCE INDICATORS ---')
  lines.push('Metric,Value,Detail,Trend vs Previous')
  for (const kpi of payload.kpis) {
    lines.push([
      escapeCsv(kpi.label),
      escapeCsv(kpi.value),
      escapeCsv(kpi.detail || kpi.subtext || ''),
      escapeCsv(kpi.trend !== undefined ? `${kpi.trend > 0 ? '+' : ''}${kpi.trend}%` : ''),
    ].join(','))
  }
  lines.push('')

  // Section 2: Performance Trend
  if (payload.performance.length > 0) {
    lines.push('--- EMAIL PERFORMANCE TREND ---')
    lines.push('Period / Week,Delivered,Opens,Clicks,Open Rate %,Click Rate %')
    for (const p of payload.performance) {
      const openPct = p.delivered > 0 ? ((p.opens / p.delivered) * 100).toFixed(1) : '0.0'
      const clickPct = p.delivered > 0 ? ((p.clicks / p.delivered) * 100).toFixed(1) : '0.0'
      lines.push([
        escapeCsv(p.week),
        escapeCsv(p.delivered),
        escapeCsv(p.opens),
        escapeCsv(p.clicks),
        escapeCsv(`${openPct}%`),
        escapeCsv(`${clickPct}%`),
      ].join(','))
    }
    lines.push('')
  }

  // Section 3: Campaign Performance
  if (payload.campaigns.length > 0) {
    lines.push('--- TOP-PERFORMING EMAIL CAMPAIGNS ---')
    lines.push('Campaign Name,Audience,Delivery Rate %,Open Rate %,Click Rate %')
    for (const c of payload.campaigns) {
      lines.push([
        escapeCsv(c.name),
        escapeCsv(c.audience),
        escapeCsv(c.delivery !== null ? `${c.delivery}%` : '—'),
        escapeCsv(c.open !== null ? `${c.open}%` : '—'),
        escapeCsv(c.click !== null ? `${c.click}%` : '—'),
      ].join(','))
    }
    lines.push('')
  }

  // Section 4: AWS SES Breakdown (if available)
  if (payload.sesBreakdown && payload.sesBreakdown.length > 0) {
    lines.push('--- PER-CAMPAIGN SES CLOUDWATCH BREAKDOWN ---')
    lines.push('Campaign Tag,Sent,Delivered,Opened,Clicked,Bounced,Open Rate %')
    for (const row of payload.sesBreakdown) {
      lines.push([
        escapeCsv(row.campaign),
        escapeCsv(row.sent),
        escapeCsv(row.delivered),
        escapeCsv(row.opened),
        escapeCsv(row.clicked),
        escapeCsv(row.bounced),
        escapeCsv(`${row.openRate}%`),
      ].join(','))
    }
    lines.push('')
  }

  const csvContent = lines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const dateStr = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `ZozoMarket_Analytics_${dateStr}.csv`)
}

/**
 * Generate a beautifully formatted HTML report with corporate executive styling
 * and opens the native browser print / "Save as PDF" dialog.
 */
export function openPrintablePdfReport(payload: AnalyticsExportPayload, autoPrint = true): void {
  const isSesView = payload.activeTab === 'AWS SES CloudWatch'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ZozoMarket Email Analytics Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      padding: 0;
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* Floating control bar for preview mode */
    .action-bar {
      position: sticky;
      top: 0;
      z-index: 999;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .action-bar .brand-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
    }
    .action-bar .brand-badge span {
      background: #f59e0b;
      color: #0f172a;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 800;
    }
    .action-bar .btn-group {
      display: flex;
      gap: 10px;
    }
    .btn {
      cursor: pointer;
      border: none;
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #f59e0b;
      color: #0f172a;
    }
    .btn-primary:hover {
      background: #d97706;
      color: #ffffff;
    }
    .btn-outline {
      background: rgba(255,255,255,0.12);
      color: #ffffff;
    }
    .btn-outline:hover {
      background: rgba(255,255,255,0.22);
    }

    /* Printable Page Container */
    .page-container {
      max-width: 900px;
      margin: 24px auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 36px 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    /* Document Header */
    .doc-header {
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.03em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-dot {
      width: 10px;
      height: 10px;
      background: #f59e0b;
      border-radius: 50%;
      display: inline-block;
    }
    .doc-subtitle {
      color: #64748b;
      font-size: 13px;
      margin-top: 4px;
      max-width: 480px;
    }
    .meta-box {
      text-align: right;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 11px;
      color: #475569;
    }
    .meta-box strong {
      color: #0f172a;
    }
    .meta-line {
      margin-bottom: 3px;
    }
    .meta-line:last-child {
      margin-bottom: 0;
    }

    /* Section Styling */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #e2e8f0;
      margin-left: 8px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 32px;
    }
    .kpi-card {
      border: 1px solid #e2e8f0;
      background: #ffffff;
      border-radius: 10px;
      padding: 14px 16px;
      border-left: 4px solid #f59e0b;
    }
    .kpi-card.emerald { border-left-color: #10b981; }
    .kpi-card.blue { border-left-color: #3b82f6; }
    .kpi-card.indigo { border-left-color: #6366f1; }
    .kpi-card.amber { border-left-color: #f59e0b; }
    .kpi-card.rose { border-left-color: #f43f5e; }

    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 6px;
      text-transform: capitalize;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .kpi-detail {
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
    }
    .kpi-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
      padding: 1px 6px;
      border-radius: 4px;
      margin-right: 4px;
    }

    /* Data Tables */
    .table-container {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 28px;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background: #f8fafc;
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #e2e8f0;
    }
    td {
      padding: 11px 14px;
      font-size: 12px;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:nth-child(even) td {
      background: #fafafa;
    }
    .text-right { text-align: right; }
    .font-semibold { font-weight: 600; }
    .text-primary { color: #d97706; font-weight: 700; }
    .text-emerald { color: #059669; font-weight: 600; }

    /* Footer */
    .doc-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #94a3b8;
    }

    /* Print Specific Rules */
    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      .page-container {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
      @page {
        size: A4;
        margin: 14mm 16mm;
      }
      .table-container, .kpi-card {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <!-- Floating Sticky Action Bar (Hidden during Print) -->
  <div class="action-bar no-print">
    <div class="brand-badge">
      <span>ZOZOMARKET</span>
      <div>Analytics Report Preview</div>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="window.print()">
        📥 Save as PDF / Print
      </button>
      <button class="btn btn-outline" onclick="window.close()">
        ✖ Close Preview
      </button>
    </div>
  </div>

  <!-- Document Body -->
  <div class="page-container">
    <!-- Header -->
    <header class="doc-header">
      <div>
        <div class="brand-title">
          <span class="brand-dot"></span>
          ZozoMarket Email Analytics
        </div>
        <div class="doc-subtitle">
          ${payload.subtitle} • View: <strong>${payload.activeTab}</strong>
        </div>
      </div>
      <div class="meta-box">
        <div class="meta-line"><strong>Timeframe:</strong> ${payload.range}</div>
        <div class="meta-line"><strong>Generated:</strong> ${payload.generatedAt}</div>
        <div class="meta-line"><strong>Confidentiality:</strong> Internal / Marketing</div>
      </div>
    </header>

    <!-- Key Performance Indicators -->
    <div class="section-title">Executive Delivery & Engagement KPI Summary</div>
    <div class="kpi-grid">
      ${payload.kpis.map((kpi, idx) => {
        const colorClass = idx === 0 ? 'amber' : idx === 1 ? 'emerald' : idx === 2 ? 'indigo' : idx === 3 ? 'blue' : 'amber'
        return `
        <div class="kpi-card ${colorClass}">
          <div class="kpi-label">${kpi.label}</div>
          <div class="kpi-value">${kpi.value}</div>
          <div class="kpi-detail">
            ${kpi.trend !== undefined ? `<span class="kpi-badge">${kpi.trend > 0 ? '+' : ''}${kpi.trend}%</span>` : ''}
            ${kpi.detail || kpi.subtext || ''}
          </div>
        </div>
        `
      }).join('')}
    </div>

    <!-- Campaign Performance Section -->
    ${payload.campaigns.length > 0 ? `
    <div class="section-title">Top-Performing Email Campaigns</div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Campaign Name</th>
            <th>Audience</th>
            <th class="text-right">Delivery Rate</th>
            <th class="text-right">Open Rate</th>
            <th class="text-right">Click Rate</th>
          </tr>
        </thead>
        <tbody>
          ${payload.campaigns.map((c) => `
          <tr>
            <td class="font-semibold">${c.name}</td>
            <td>${c.audience}</td>
            <td class="text-right text-emerald">${c.delivery !== null ? `${c.delivery}%` : '—'}</td>
            <td class="text-right text-primary">${c.open !== null ? `${c.open}%` : '—'}</td>
            <td class="text-right">${c.click !== null ? `${c.click}%` : '—'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Performance Trend Section -->
    ${payload.performance.length > 0 ? `
    <div class="section-title">Email Performance Trend Breakdown</div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Period / Week</th>
            <th class="text-right">Delivered</th>
            <th class="text-right">Opens</th>
            <th class="text-right">Clicks</th>
            <th class="text-right">Open Rate %</th>
            <th class="text-right">Click Rate %</th>
          </tr>
        </thead>
        <tbody>
          ${payload.performance.map((p) => {
            const openRate = p.delivered > 0 ? ((p.opens / p.delivered) * 100).toFixed(1) : '0.0'
            const clickRate = p.delivered > 0 ? ((p.clicks / p.delivered) * 100).toFixed(1) : '0.0'
            return `
            <tr>
              <td class="font-semibold">${p.week}</td>
              <td class="text-right">${p.delivered.toLocaleString()}</td>
              <td class="text-right">${p.opens.toLocaleString()}</td>
              <td class="text-right">${p.clicks.toLocaleString()}</td>
              <td class="text-right text-primary">${openRate}%</td>
              <td class="text-right">${clickRate}%</td>
            </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Per-Campaign SES CloudWatch Breakdown (if available or in SES view) -->
    ${payload.sesBreakdown && payload.sesBreakdown.length > 0 ? `
    <div class="section-title">Per-Campaign SES CloudWatch Telemetry</div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Campaign Tag</th>
            <th class="text-right">Sent</th>
            <th class="text-right">Delivered</th>
            <th class="text-right">Opened</th>
            <th class="text-right">Clicked</th>
            <th class="text-right">Bounced</th>
            <th class="text-right">Open Rate %</th>
          </tr>
        </thead>
        <tbody>
          ${payload.sesBreakdown.map((row) => `
          <tr>
            <td class="font-semibold">${row.campaign}</td>
            <td class="text-right">${row.sent.toLocaleString()}</td>
            <td class="text-right">${row.delivered.toLocaleString()}</td>
            <td class="text-right">${row.opened.toLocaleString()}</td>
            <td class="text-right">${row.clicked.toLocaleString()}</td>
            <td class="text-right">${row.bounced.toLocaleString()}</td>
            <td class="text-right text-primary">${row.openRate}%</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Footer -->
    <footer class="doc-footer">
      <div>ZozoMarket AI Marketing Platform • Confidential & Proprietary</div>
      <div>Generated on ${payload.generatedAt} • Page 1 of 1</div>
    </footer>
  </div>

  ${autoPrint ? `
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      // Small timeout to allow styles and fonts to render crisply
      setTimeout(() => {
        window.print();
      }, 350);
    });
  </script>
  ` : ''}
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=1000,height=800')
  if (printWindow) {
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  } else {
    // Popup blocked: fallback to hidden iframe print
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
      setTimeout(() => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      }, 500)
    }
  }
}

/**
 * Direct PDF export action: launches the high-fidelity executive print-to-PDF engine.
 */
export function exportAnalyticsToPdf(payload: AnalyticsExportPayload): void {
  openPrintablePdfReport(payload, true)
}

