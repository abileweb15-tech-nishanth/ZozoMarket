'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Panel } from '@/components/app/shared'
import { api } from '@/lib/api'
import { clearSession, loadUser, saveSession, type SessionUser } from '@/lib/session'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const cached = loadUser()
    if (cached) {
      setUser(cached)
      setName(cached.name)
      setWorkspaceName(cached.workspaceName)
    }
    api.auth.me().then((fresh) => {
      setUser(fresh)
      setName(fresh.name)
      setWorkspaceName(fresh.workspaceName)
      const token = localStorage.getItem('zozo.accessToken')
      const refresh = localStorage.getItem('zozo.refreshToken')
      if (token && refresh) {
        saveSession({ accessToken: token, refreshToken: refresh, tokenType: 'bearer', expiresIn: 0, user: fresh })
      }
    }).catch((err) => toast.error(err instanceof Error ? err.message : 'Could not load your profile'))
  }, [])

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Profile" description="Your account and the workspace that owns this data." />
      <Panel>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setPending(true)
            try {
              const fresh = await api.auth.updateProfile({
                name,
                workspaceName,
                ...(newPassword ? { currentPassword, newPassword } : {}),
              })
              setUser(fresh)
              const token = localStorage.getItem('zozo.accessToken')
              const refresh = localStorage.getItem('zozo.refreshToken')
              if (token && refresh) {
                saveSession({ accessToken: token, refreshToken: refresh, tokenType: 'bearer', expiresIn: 0, user: fresh })
              }
              setCurrentPassword('')
              setNewPassword('')
              toast.success('Profile saved')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not save your profile')
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user?.email ?? ''} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-workspace">Workspace</Label>
            <Input id="profile-workspace" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <Button type="submit" disabled={pending} className="self-start">{pending ? 'Saving…' : 'Save profile'}</Button>
        </form>
      </Panel>

      <Panel title="Delete account" description="This removes your sign-in, this workspace, and the campaigns, contacts, templates, automations, forms, and media in it. That cannot be undone.">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setDeletePassword('')
            setDeleteError('')
            setDeleteOpen(true)
          }}
        >
          Delete account
        </Button>
      </Panel>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) { setDeleteOpen(open); if (!open) setDeleteError('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              {user?.email ? `“${user.email}” and the ${user.workspaceName} workspace will be removed.` : 'Your account and workspace will be removed.'} Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!deletePassword) {
                setDeleteError('Enter your password.')
                return
              }
              setDeleting(true)
              setDeleteError('')
              try {
                await api.auth.deleteAccount(deletePassword)
                clearSession()
                toast.success('Account deleted')
                router.replace('/login')
              } catch (err) {
                setDeleteError(err instanceof Error ? err.message : 'Could not delete the account')
              } finally {
                setDeleting(false)
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={deletePassword}
                aria-invalid={!!deleteError || undefined}
                aria-describedby={deleteError ? 'delete-password-error' : undefined}
                onChange={(event) => {
                  setDeletePassword(event.target.value)
                  if (deleteError) setDeleteError('')
                }}
              />
              {deleteError ? <p id="delete-password-error" className="text-xs text-destructive">{deleteError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={deleting}>{deleting ? 'Deleting…' : 'Delete account'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
