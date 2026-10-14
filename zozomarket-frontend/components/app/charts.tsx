'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Series = { key: string; label: string; color: string }
const axis = { stroke: 'var(--muted-foreground)', fontSize: 12, tickLine: false, axisLine: false }
const tooltipStyle = { borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }

export function TrendChart({ data, x, series, kind = 'area', height = 240 }: { data: Record<string, unknown>[]; x: string; series: Series[]; kind?: 'area' | 'line'; height?: number }) {
  const Chart = kind === 'area' ? AreaChart : LineChart
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ left: -12, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) =>
            kind === 'area' ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarsChart({ data, x, series, height = 240 }: { data: Record<string, unknown>[]; x: string; series: Series[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} width={48} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const C = { primary: 'var(--chart-1)', indigo: 'var(--chart-2)', green: 'var(--chart-3)', gray: 'var(--chart-4)' }
