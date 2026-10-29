'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Eye, EyeOff, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const points = [
  'Send campaigns from one workspace',
  'Keep subscribers, tags, and forms together',
  'Run an automation from a trigger through to the last email',
]

export function AuthScreen({
  title,
  description,
  error,
  children,
  footer,
  wide,
}: {
  title: string
  description: string
  error?: string
  children: React.ReactNode
  footer: React.ReactNode
  wide?: boolean
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(26rem,36rem)]">
      <section className="hidden flex-col justify-between bg-primary px-12 py-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground text-primary" aria-hidden>
            <Megaphone className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">ZozoMarket</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Your email marketing workspace.</h2>
          <p className="mt-3 text-sm text-primary-foreground/80">Set up once. Campaigns, automations, and forms all use the same sender and mailing address.</p>
          <ul className="mt-6 flex flex-col gap-3 text-sm">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/80">One account owns one workspace.</p>
      </section>
      <section className="flex items-start justify-center overflow-y-auto bg-muted/60 px-4 py-10 lg:items-center">
        <div className={wide ? 'w-full max-w-lg' : 'w-full max-w-md'}>
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
              <Megaphone className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">ZozoMarket</span>
          </div>
          <div className="rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </section>
    </main>
  )
}

export function AuthField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export function PasswordInput({
  id,
  name,
  autoComplete,
  value,
  onChange,
  invalid,
  describedById,
  autoFocus,
}: {
  id: string
  name: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  describedById?: string
  autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedById}
        onChange={(event) => onChange(event.target.value)}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1 right-1"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

export function passwordStrength(value: string) {
  if (!value) return null
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  if (value.length < 8) return { level: 1, label: 'Too short' }
  if (score <= 2) return { level: 2, label: 'Weak' }
  if (score <= 3) return { level: 3, label: 'Good' }
  return { level: 4, label: 'Strong' }
}

export function PasswordStrength({ value }: { value: string }) {
  const strength = passwordStrength(value)
  if (!strength) return null
  const tone = strength.level <= 1 ? 'bg-destructive' : strength.level === 2 ? 'bg-warning' : 'bg-success'
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`h-1 rounded-full ${step <= strength.level ? tone : 'bg-muted'}`} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">{strength.label}</span>
    </div>
  )
}

export function AuthSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs" aria-label="Sign-up steps">
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={step} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
              done ? 'border-primary bg-primary text-primary-foreground' : active ? 'border-primary text-primary' : 'border-border text-muted-foreground'
            }`}>
              {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={`hidden sm:inline ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{step}</span>
            {index < steps.length - 1 && <span aria-hidden className="h-px flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-medium text-primary underline underline-offset-4">{children}</Link>
}
