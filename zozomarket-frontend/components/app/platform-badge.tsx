import type { Platform } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const abbr: Record<Platform, string> = { Instagram: 'IG', Facebook: 'FB', LinkedIn: 'in', X: 'X', YouTube: 'YT', Pinterest: 'P', TikTok: 'TT' }

export function PlatformBadge({ platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'lg' }) {
  return (
    <span
      title={platform}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background font-semibold text-foreground',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-10 text-sm',
      )}
    >
      {abbr[platform]}
      <span className="sr-only">{platform}</span>
    </span>
  )
}
