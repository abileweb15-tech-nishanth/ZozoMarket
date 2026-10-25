'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader, StatusBadge, TableWrap, td, th } from '@/components/app/shared'
import { api, type AutomationEnrollment, type AutomationStep, type FlowNode } from '@/lib/api'
import { fmtDate } from '@/lib/format'

const ENROLLMENT_STATUS: Record<string, string> = {
  active: 'In progress',
  completed: 'Completed',
  exited: 'Exited',
  failed: 'Failed',
}

const ACTIONS: Record<string, string> = {
  started: 'Started',
  email: 'Email sent',
  delayed: 'Waiting',
  condition: 'Checked condition',
  add_tag: 'Added tag',
  remove_tag: 'Removed tag',
  goal: 'Goal reached',
  completed: 'Finished',
  exited: 'Left the automation',
  failed: 'Failed',
}

const fmtTime = (value: string) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function stepResult(step: AutomationStep) {
  if (step.action === 'condition') return step.result === 'true' ? 'Yes' : 'No'
  if (step.action === 'delayed') return step.result.replace(/^Wait until (.+)$/, (_, at: string) => `Until ${fmtTime(at)}`)
  return step.result
}

export default function AutomationActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [name, setName] = useState('Automation')
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [enrollments, setEnrollments] = useState<AutomationEnrollment[]>([])
  const [steps, setSteps] = useState<AutomationStep[]>([])

  useEffect(() => {
    let active = true
    Promise.all([
      api.automations.get(id),
      api.automations.stats(id),
      api.automations.enrollments(id),
      api.automations.steps(id),
    ]).then(([automation, counts, people, log]) => {
      if (!active) return
      setName(automation.name)
      setNodes(automation.nodes ?? [])
      setStats(counts)
      setEnrollments(people)
      setSteps(log)
    }).catch((err: Error) => toast.error(err.message))
    return () => { active = false }
  }, [id])

  const enrolled = (stats.active ?? 0) + (stats.completed ?? 0) + (stats.exited ?? 0) + (stats.failed ?? 0)
  const counts = [
    ['Enrolled', enrolled],
    ['Active', stats.active ?? 0],
    ['Completed', stats.completed ?? 0],
    ['Exited', stats.exited ?? 0],
  ] as const

  const stepName = (nodeId: string | null) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return nodeId ? 'Removed step' : '—'
    return node.label || node.kind
  }
  const contactOf = (enrollmentId: string) => {
    const row = enrollments.find((item) => item.id === enrollmentId)
    return row ? row.contactName || row.contactEmail : 'Contact'
  }

  return (
    <div>
      <PageHeader
        title={name}
        description="People in this funnel and the steps they have taken."
        actions={<Button variant="outline" nativeButton={false} render={<Link href={`/email/automations/${id}`} />}>Edit funnel</Button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-2 text-sm font-semibold">Enrollments</h2>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['Contact', 'Status', 'Current step', 'Next run', 'Started'].map((heading) => <th key={heading} scope="col" className={th}>{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {enrollments.map((row) => (
              <tr key={row.id}>
                <td className={td}><span className="font-medium">{row.contactName || 'Contact'}</span><span className="block text-muted-foreground">{row.contactEmail}</span></td>
                <td className={td}><StatusBadge status={ENROLLMENT_STATUS[row.status] ?? row.status} /></td>
                <td className={`${td} text-muted-foreground`}>{row.status === 'active' ? stepName(row.currentNodeId) : '—'}</td>
                <td className={`${td} text-muted-foreground`}>{row.status === 'active' && row.nextRunAt ? fmtTime(row.nextRunAt) : '—'}</td>
                <td className={`${td} text-muted-foreground`}>{fmtDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {enrollments.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody has entered this funnel yet.</p>}
      </TableWrap>
      <h2 className="mt-8 mb-2 text-sm font-semibold">Step log</h2>
      <TableWrap>
        <table className="w-full">
          <thead className="border-b border-border bg-muted">
            <tr>
              {['When', 'Contact', 'Step', 'Action', 'Result'].map((heading) => <th key={heading} scope="col" className={th}>{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {steps.map((step) => (
              <tr key={step.id}>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{fmtTime(step.createdAt)}</td>
                <td className={td}>{contactOf(step.enrollmentId)}</td>
                <td className={td}>{stepName(step.nodeId)}</td>
                <td className={td}>{ACTIONS[step.action] ?? step.action}</td>
                <td className={`${td} text-muted-foreground`}>{stepResult(step)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {steps.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Steps appear here as contacts move through the funnel.</p>}
      </TableWrap>
    </div>
  )
}
