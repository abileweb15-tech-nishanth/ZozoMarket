import { Megaphone } from 'lucide-react'

export function Logo() {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
      <Megaphone className="size-4" />
    </span>
  )
}
