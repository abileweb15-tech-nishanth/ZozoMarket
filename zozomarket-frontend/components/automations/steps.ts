import { Clock, Eraser, Flag, GitBranch, Mail, Square, Tag, Zap, type LucideIcon } from 'lucide-react'
import type { FlowNode, LeadForm, Template } from '@/lib/api'
import type { StepKind } from '@/lib/automation-tree'

export const TRIGGERS = [
  { type: 'contact_subscribed', label: 'Contact subscribes', needs: null },
  { type: 'tag_added', label: 'Tag is added', needs: 'tag' },
  { type: 'form_submitted', label: 'Form is submitted', needs: 'form' },
  { type: 'manual', label: 'Added by hand', needs: null },
] as const

export const LATER_TRIGGERS = ['Order completed', 'Cart abandoned', 'Purchase made', 'Website visit']

export const PICKER: { group: string; kinds: StepKind[] }[] = [
  { group: 'Messages', kinds: ['Email'] },
  { group: 'Timing', kinds: ['Delay'] },
  { group: 'Conditions', kinds: ['Condition'] },
  { group: 'Contact actions', kinds: ['Add tag', 'Remove tag', 'Goal'] },
  { group: 'Exit', kinds: ['End'] },
]

export const STEP_META: Record<string, { icon: LucideIcon; title: string; hint: string; tone: string }> = {
  Trigger: { icon: Zap, title: 'Trigger', hint: 'Starts the automation', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  Email: { icon: Mail, title: 'Send email', hint: 'Send one email', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  Delay: { icon: Clock, title: 'Wait', hint: 'Pause before the next step', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  Condition: { icon: GitBranch, title: 'If / else', hint: 'Split into Yes and No', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  'Add tag': { icon: Tag, title: 'Add tag', hint: 'Tag the contact', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  'Remove tag': { icon: Eraser, title: 'Remove tag', hint: 'Take a tag off', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  Goal: { icon: Flag, title: 'Goal', hint: 'Record a milestone', tone: 'bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300' },
  End: { icon: Square, title: 'End', hint: 'Exit the automation', tone: 'bg-muted text-muted-foreground' },
}

const CONDITIONS: Record<string, string> = {
  has_tag: 'Has tag',
  opened_previous: 'Opened the previous email',
  clicked_previous: 'Clicked the previous email',
}
export const CONDITION_OPTIONS = Object.entries(CONDITIONS).map(([value, label]) => ({ value, label }))

const plural = (amount: number, unit: string) => {
  const base = unit.replace(/s$/, '')
  return `${amount} ${amount === 1 ? base : `${base}s`}`
}

export function summary(
  node: FlowNode,
  ctx: { triggerType: string; triggerConfig: Record<string, string>; templates: Template[]; forms: LeadForm[] },
): string {
  const config = node.config as Record<string, string | number | undefined>
  switch (node.kind) {
    case 'Trigger': {
      const trigger = TRIGGERS.find((item) => item.type === ctx.triggerType)
      if (ctx.triggerType === 'tag_added') return `Tag is added: ${ctx.triggerConfig.tag || 'any tag'}`
      if (ctx.triggerType === 'form_submitted') {
        const form = ctx.forms.find((item) => item.id === ctx.triggerConfig.formId)
        return `Form is submitted: ${form?.name ?? 'any form'}`
      }
      return trigger?.label ?? 'Pick a trigger'
    }
    case 'Email': {
      const template = ctx.templates.find((item) => item.id === config.templateId)
      const subject = String(config.subject || template?.subject || '') || 'No subject yet'
      const source = template ? template.name : config.html ? 'Custom HTML' : 'No content yet'
      return `${subject} · ${source}`
    }
    case 'Delay':
      return `Wait ${plural(Number(config.amount) || 0, String(config.unit || 'days'))}`
    case 'Condition': {
      const type = String(config.type || 'opened_previous')
      return type === 'has_tag' ? `Has tag: ${config.tag || '—'}` : CONDITIONS[type]
    }
    case 'Add tag':
    case 'Remove tag':
      return String(config.tag || 'No tag yet')
    case 'Goal':
      return node.label || 'Goal reached'
    default:
      return 'Exit the automation'
  }
}
