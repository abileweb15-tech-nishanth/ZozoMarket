'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AuthField,
  AuthLink,
  AuthScreen,
  AuthSteps,
  describedBy,
  PasswordInput,
  PasswordStrength,
} from '@/components/app/auth-screen'
import { api } from '@/lib/api'
import { getAccessToken, saveSession } from '@/lib/session'

const timezones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London'] as const
const steps = ['Account', 'Workspace', 'Sending'] as const

function initialTimezone() {
  const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (timezones as readonly string[]).includes(guessed) ? guessed : 'UTC'
}

type Fields = {
  name?: string
  email?: string
  password?: string
  confirm?: string
  workspace?: string
  mailingAddress?: string
  fromName?: string
  fromEmail?: string
  replyTo?: string
}

const copy = [
  {
    title: 'Create your account',
    description: 'This email and password are what you use to sign in.',
  },
  {
    title: 'Set up your workspace',
    description: 'The name, time zone, and physical address that go on every marketing email.',
  },
  {
    title: 'Sending identity',
    description: 'The from name and address people see when you send a campaign.',
  },
] as const

const signupEnabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === 'true'

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [website, setWebsite] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [mailingAddress, setMailingAddress] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [errors, setErrors] = useState<Fields>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!signupEnabled) {
      router.replace('/login')
      return
    }
    if (getAccessToken()) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    setTimezone(initialTimezone())
  }, [])

  const clearError = (key: keyof Fields) => {
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
  }

  const fillFromAccount = () => {
    const person = name.trim()
    const signIn = email.trim()
    if (!workspace.trim() && person) setWorkspace(person)
    if (!fromName.trim() && person) setFromName(person)
    if (!fromEmail.trim() && signIn) setFromEmail(signIn)
  }

  const validateStep = (current: number) => {
    const next: Fields = {}
    if (current === 0) {
      if (!name.trim()) next.name = 'Enter your name.'
      if (!email.trim() || !email.includes('@')) next.email = 'Enter a valid email. This is what you will use to sign in.'
      if (password.length < 8) next.password = 'Use at least 8 characters.'
      if (password !== confirm) next.confirm = 'Enter the same password again.'
    }
    if (current === 1) {
      if (!workspace.trim()) next.workspace = 'Enter a workspace name.'
      if (!mailingAddress.trim()) next.mailingAddress = 'Enter the physical address that goes on every marketing email.'
    }
    if (current === 2) {
      if (!fromName.trim()) next.fromName = 'Enter the name people see as the sender.'
      if (!fromEmail.trim() || !fromEmail.includes('@')) next.fromEmail = 'Enter the email address campaigns are sent from.'
      if (replyTo.trim() && !replyTo.includes('@')) next.replyTo = 'Enter a valid reply-to email, or leave it blank.'
    }
    setErrors(next)
    setFormError('')
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    setPending(true)
    try {
      const session = await api.auth.signup({
        name: name.trim(),
        email: email.trim(),
        password,
        workspaceName: workspace.trim(),
        website: website.trim() || undefined,
        timezone,
        mailingAddress: mailingAddress.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyTo: replyTo.trim() || undefined,
      })
      saveSession(session)
      router.replace('/dashboard')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the account')
    } finally {
      setPending(false)
    }
  }

  if (!signupEnabled) return null

  return (
    <AuthScreen
      wide
      title={copy[step].title}
      description={copy[step].description}
      error={formError}
      footer={<>Already have an account? <AuthLink href="/login">Sign in</AuthLink></>}
    >
      <AuthSteps steps={[...steps]} current={step} />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!validateStep(step)) return
          if (step < 2) {
            fillFromAccount()
            setStep((current) => current + 1)
            return
          }
          void submit()
        }}
      >
        {step === 0 && (
          <>
            <AuthField id="name" label="Your name" error={errors.name}>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                autoFocus
                placeholder="Alex Morgan"
                value={name}
                aria-invalid={!!errors.name || undefined}
                aria-describedby={describedBy('name', errors.name)}
                onChange={(event) => { setName(event.target.value); clearError('name') }}
              />
            </AuthField>
            <AuthField id="email" label="Email" hint="You sign in with this email." error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@studio.com"
                value={email}
                aria-invalid={!!errors.email || undefined}
                aria-describedby={describedBy('email', errors.email, 'You sign in with this email.')}
                onChange={(event) => { setEmail(event.target.value); clearError('email') }}
              />
            </AuthField>
            <AuthField id="password" label="Password" hint="At least 8 characters." error={errors.password}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                value={password}
                invalid={!!errors.password}
                describedById={describedBy('password', errors.password, 'At least 8 characters.')}
                onChange={(value) => { setPassword(value); clearError('password') }}
              />
              <PasswordStrength value={password} />
            </AuthField>
            <AuthField id="confirm" label="Confirm password" error={errors.confirm}>
              <PasswordInput
                id="confirm"
                name="confirm"
                autoComplete="new-password"
                value={confirm}
                invalid={!!errors.confirm}
                describedById={describedBy('confirm', errors.confirm)}
                onChange={(value) => { setConfirm(value); clearError('confirm') }}
              />
            </AuthField>
          </>
        )}

        {step === 1 && (
          <>
            <AuthField id="workspace" label="Workspace name" hint="Usually your studio or company name." error={errors.workspace}>
              <Input
                id="workspace"
                name="workspace"
                autoComplete="organization"
                autoFocus
                placeholder="North Studio"
                value={workspace}
                aria-invalid={!!errors.workspace || undefined}
                aria-describedby={describedBy('workspace', errors.workspace, 'Usually your studio or company name.')}
                onChange={(event) => { setWorkspace(event.target.value); clearError('workspace') }}
              />
            </AuthField>
            <AuthField id="website" label="Website" hint="Optional. Used in email footers.">
              <Input
                id="website"
                name="website"
                type="url"
                autoComplete="url"
                placeholder="https://studio.com"
                value={website}
                aria-describedby={describedBy('website', undefined, 'Optional. Used in email footers.')}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </AuthField>
            <AuthField id="timezone" label="Time zone" hint="Used for scheduled campaigns.">
              <select
                id="timezone"
                name="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </AuthField>
            <AuthField id="mailing-address" label="Physical mailing address" hint="Required on every marketing email." error={errors.mailingAddress}>
              <Textarea
                id="mailing-address"
                name="mailingAddress"
                autoComplete="street-address"
                placeholder="123 Market Street, Chennai, India"
                value={mailingAddress}
                aria-invalid={!!errors.mailingAddress || undefined}
                aria-describedby={describedBy('mailing-address', errors.mailingAddress, 'Required on every marketing email.')}
                onChange={(event) => { setMailingAddress(event.target.value); clearError('mailingAddress') }}
              />
            </AuthField>
          </>
        )}

        {step === 2 && (
          <>
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              You will sign in with <span className="font-medium text-foreground">{email.trim()}</span>.
            </p>
            <AuthField id="from-name" label="From name" hint="The name people see on your emails." error={errors.fromName}>
              <Input
                id="from-name"
                name="fromName"
                autoFocus
                value={fromName}
                aria-invalid={!!errors.fromName || undefined}
                aria-describedby={describedBy('from-name', errors.fromName, 'The name people see on your emails.')}
                onChange={(event) => { setFromName(event.target.value); clearError('fromName') }}
              />
            </AuthField>
            <AuthField id="from-email" label="From email" hint="The address campaigns are sent from." error={errors.fromEmail}>
              <Input
                id="from-email"
                name="fromEmail"
                type="email"
                autoComplete="email"
                value={fromEmail}
                aria-invalid={!!errors.fromEmail || undefined}
                aria-describedby={describedBy('from-email', errors.fromEmail, 'The address campaigns are sent from.')}
                onChange={(event) => { setFromEmail(event.target.value); clearError('fromEmail') }}
              />
            </AuthField>
            <AuthField id="reply-to" label="Reply-to" hint="Optional. Replies go here instead of the from address." error={errors.replyTo}>
              <Input
                id="reply-to"
                name="replyTo"
                type="email"
                value={replyTo}
                aria-invalid={!!errors.replyTo || undefined}
                aria-describedby={describedBy('reply-to', errors.replyTo, 'Optional. Replies go here instead of the from address.')}
                onChange={(event) => { setReplyTo(event.target.value); clearError('replyTo') }}
              />
            </AuthField>
          </>
        )}

        <div className="mt-2 flex gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setFormError(''); setErrors({}); setStep((current) => current - 1) }}>
              Back
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={pending}>
            {step < 2 ? 'Continue' : pending ? 'Creating…' : 'Create account'}
          </Button>
        </div>
      </form>
    </AuthScreen>
  )
}
