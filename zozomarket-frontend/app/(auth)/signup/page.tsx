'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { saveSession } from '@/lib/session'

export default function SignupPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/60 px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-background p-6"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          setPending(true)
          try {
            const session = await api.auth.signup({
              name: String(form.get('name') ?? ''),
              email: String(form.get('email') ?? ''),
              password: String(form.get('password') ?? ''),
              workspaceName: String(form.get('workspace') ?? '') || undefined,
            })
            saveSession(session)
            router.replace('/dashboard')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not create the account')
          } finally {
            setPending(false)
          }
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground">This creates one empty workspace for your campaigns and contacts.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspace">Workspace name</Label>
          <Input id="workspace" name="workspace" placeholder="Acme Coffee" autoComplete="organization" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</Button>
        <p className="text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="font-medium text-primary underline">Sign in</Link>
        </p>
      </form>
    </main>
  )
}
