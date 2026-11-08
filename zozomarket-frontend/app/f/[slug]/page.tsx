'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type PublicForm } from '@/lib/api'

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [form, setForm] = useState<PublicForm | null>(null)
  const [closed, setClosed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    api.forms.public(slug).then((loaded) => {
      setForm(loaded)
      void api.forms.view(slug).catch(() => undefined)
    }).catch(() => setClosed(true))
  }, [slug])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    const email = String(data.get('email') || '').trim()
    if (!name) return setError('Please enter your name.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email.')
    if (!data.get('consent')) return setError('Please agree to receive emails.')
    const fields: Record<string, string> = {}
    ;(form.fields ?? []).forEach((field) => {
      if (field.type === 'checkbox') {
        fields[field.name] = data.get(field.name) ? 'true' : 'false'
      } else {
        fields[field.name] = String(data.get(field.name) || '').trim()
      }
    })
    for (const field of form.fields ?? []) {
      if (field.required) {
        const val = fields[field.name]
        if (!val || (field.type === 'checkbox' && val !== 'true')) {
          return setError(`Please fill in "${field.label}".`)
        }
      }
    }
    setError('')
    api.forms.submit(slug, { name, email, consent: true, fields }).then((result) => {
      setMessage(result.message)
    }).catch((err: Error) => setError(err.message))
  }

  if (closed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-muted-foreground">This form is not collecting signups yet.</p>
      </main>
    )
  }

  if (!form) {
    return <main className="flex min-h-screen items-center justify-center px-4"><p className="text-sm text-muted-foreground">Loading form…</p></main>
  }

  const landing = form.kind === 'Landing Pages'
  const card = (
    <div className={landing ? 'mx-auto w-full max-w-xl' : `w-full max-w-md bg-card p-6 ${form.kind === 'Embedded Forms' ? 'rounded-xl border border-dashed border-border' : 'rounded-xl border border-border shadow-lg'}`}>
      {message ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <p className="text-sm">{message}</p>
        </div>
      ) : (
        <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
          <h1 className={landing ? 'text-3xl font-semibold text-balance' : 'text-lg font-semibold text-balance'}>{form.title || 'Subscribe'}</h1>
          {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
          <div className="flex flex-col gap-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
          {(form.fields ?? []).map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>
              {field.type === 'textarea' ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  rows={3}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    required={field.required}
                    className="size-4 rounded border-input accent-[var(--primary)]"
                  />
                  <span>{field.label}</span>
                </label>
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type === 'email' || field.type === 'tel' || field.type === 'number' ? field.type : 'text'}
                  required={field.required}
                />
              )}
            </div>
          ))}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--primary)]" /> I agree to receive marketing emails. Unsubscribe anytime.</label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-10">Subscribe</Button>
        </form>
      )}
    </div>
  )

  if (landing) return <main className="min-h-screen bg-muted/40 px-4 py-16">{card}</main>
  if (form.kind === 'Popup Forms') return <main className="flex min-h-screen items-center justify-center bg-foreground/50 px-4">{card}</main>
  return <main className="flex min-h-screen items-center justify-center bg-background px-4">{card}</main>
}
