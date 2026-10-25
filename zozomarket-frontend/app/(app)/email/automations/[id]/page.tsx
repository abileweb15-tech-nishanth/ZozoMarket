'use client'

import dynamic from 'next/dynamic'
import { use } from 'react'

const Builder = dynamic(() => import('@/components/automations/builder'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading builder…</p>,
})

export default function AutomationBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <Builder id={id} />
}
