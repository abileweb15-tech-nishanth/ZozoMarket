'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthField, AuthLink, AuthScreen, describedBy, PasswordInput } from '@/components/app/auth-screen'
import { api } from '@/lib/api'
import { getAccessToken, saveSession } from '@/lib/session'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard')
  }, [router])

  return (
    <AuthScreen
      title="Sign in"
      description="Use the email and password from when you created the account."
      error={formError}
      footer={<>New here? <AuthLink href="/signup">Create an account</AuthLink></>}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const next = {
            email: !email.trim() || !email.includes('@') ? 'Enter the email from your account.' : undefined,
            password: password ? undefined : 'Enter your password.',
          }
          setErrors(next)
          setFormError('')
          if (next.email || next.password) return
          setPending(true)
          try {
            const session = await api.auth.login({ email: email.trim(), password })
            saveSession(session)
            router.replace('/dashboard')
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not sign in')
          } finally {
            setPending(false)
          }
        }}
      >
        <AuthField id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@studio.com"
            value={email}
            aria-invalid={!!errors.email || undefined}
            aria-describedby={describedBy('email', errors.email)}
            onChange={(event) => {
              setEmail(event.target.value)
              setErrors((current) => (current.email ? { ...current, email: undefined } : current))
            }}
          />
        </AuthField>
        <AuthField id="password" label="Password" error={errors.password}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            invalid={!!errors.password}
            describedById={describedBy('password', errors.password)}
            onChange={(value) => {
              setPassword(value)
              setErrors((current) => (current.password ? { ...current, password: undefined } : current))
            }}
          />
        </AuthField>
        <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </AuthScreen>
  )
}
