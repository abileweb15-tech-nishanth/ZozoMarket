'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getAccessToken } from '@/lib/session'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [router])

  if (!ready) return null
  return children
}
