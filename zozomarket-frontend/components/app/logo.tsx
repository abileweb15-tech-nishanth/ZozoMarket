import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({
  className = 'size-8',
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center overflow-hidden', className)} aria-hidden>
      <Image
        src="/logo-icon.png"
        alt="ZozoMarket logo mark"
        width={40}
        height={40}
        priority={priority}
        className="size-full object-contain"
      />
    </span>
  )
}

export function LogoWithText({
  className,
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logo className="size-8.5" priority={priority} />
      <div className="flex flex-col select-none">
        <div className="flex items-center text-base font-bold tracking-tight leading-none">
          <span className="text-[#0D5C4D] dark:text-[#2dd4bf]">zozo</span>
          <span className="text-[#EA580C] dark:text-[#f97316]">Market</span>
        </div>
        <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase mt-0.5">
          Email Marketing Platform
        </span>
      </div>
    </div>
  )
}

export function LogoBanner({
  className = 'h-8 w-auto',
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <Image
        src="/logo-full.png"
        alt="ZozoMarket — Email Marketing Platform"
        width={240}
        height={60}
        priority={priority}
        className="h-full w-auto object-contain"
      />
    </div>
  )
}
