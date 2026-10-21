'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { getAccessToken, saveSession } from '@/lib/session'

export default function LoginPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (getAccessToken()) router.replace('/dashboard')
  }, [router])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/60 px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-background p-6"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          setPending(true)
          try {
            const session = await api.auth.login({
              email: String(form.get('email') ?? ''),
              password: String(form.get('password') ?? ''),
            })
            saveSession(session)
            router.replace('/dashboard')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not sign in')
          } finally {
            setPending(false)
          }
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-muted-foreground">Use the email and password for your workspace.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
        <p className="text-sm text-muted-foreground">
          New here? <Link href="/signup" className="font-medium text-primary underline">Create an account</Link>
        </p>
      </form>
    </main>
  )
}
