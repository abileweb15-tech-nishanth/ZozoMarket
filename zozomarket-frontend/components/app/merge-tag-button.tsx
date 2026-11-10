'use client'

import { MERGE_TAGS } from '@/lib/email-design'

interface MergeTagButtonProps {
  /** Called with the chosen tag string, e.g. `{{first_name}}`. */
  onInsert: (tag: string) => void
  disabled?: boolean
  /** Label shown on the select trigger. Defaults to "+ Insert tag". */
  label?: string
}

/**
 * A compact dropdown that lets authors pick a personalization merge tag.
 * Used in both the Campaign Builder sidebar and the Automation Email Step.
 */
export function MergeTagButton({ onInsert, disabled, label = '+ Insert tag' }: MergeTagButtonProps) {
  return (
    <select
      aria-label="Insert merge tag"
      className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground hover:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      value=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onInsert(e.target.value)
        // Reset so the same tag can be re-inserted
        e.target.value = ''
      }}
    >
      <option value="">{label}</option>
      {MERGE_TAGS.map((tag) => (
        <option key={tag.value} value={tag.value}>{tag.label}</option>
      ))}
    </select>
  )
}

