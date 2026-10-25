'use client'

import { Search, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ title, description, actions, children, className, bodyClassName }: {
  title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn('p-6', bodyClassName)}>{children}</div>
    </section>
  )
}

export function KpiCard({ label, value, trend, icon: Icon }: { label: string; value: string; trend?: number; icon?: LucideIcon }) {
  const up = (trend ?? 0) >= 0
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {trend !== undefined && (
        <span className={cn('flex items-center gap-1 text-xs font-medium', up ? 'text-success' : 'text-destructive')}>
          {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          {up ? '+' : ''}{trend}% <span className="font-normal text-muted-foreground">vs last period</span>
        </span>
      )}
    </div>
  )
}

const tone: Record<string, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-destructive/10 text-destructive',
  info: 'bg-accent text-accent-foreground',
  neutral: 'bg-muted text-muted-foreground border border-border',
}
const statusTone: Record<string, keyof typeof tone> = {
  Sent: 'success', Published: 'success', Active: 'success', Connected: 'success', Subscribed: 'success', Paid: 'success', Live: 'success', Verified: 'success',
  Completed: 'success', 'In progress': 'info', Exited: 'neutral', Archived: 'neutral',
  Scheduled: 'info', Sending: 'warning', Paused: 'warning', 'Needs attention': 'warning', Pending: 'warning', 'Sandbox': 'warning',
  Failed: 'error', Unsubscribed: 'error', Disconnected: 'neutral', Draft: 'neutral', 'Not connected': 'neutral',
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', tone[statusTone[status] ?? 'neutral'])}>
      {status}
    </span>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-background pl-9" />
    </div>
  )
}

export function NativeSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: string[]; className?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', className)}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly T[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn('h-8 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', value === o ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Delete', onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel?: string; onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false) }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SimulatedNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-xs text-muted-foreground">{children}</p>
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">{children}</div>
}

export const th = 'px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap'
export const td = 'px-4 py-3 text-sm whitespace-nowrap'
