'use client'

import { useRouter } from 'next/navigation'
import { Mail, Plus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function CreateNewMenu({ fullWidth, compact }: { fullWidth?: boolean; compact?: boolean }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size={compact ? 'icon' : 'default'}
            className={cn(compact ? 'size-9 mx-auto' : fullWidth && 'w-full h-10')}
            title="Create New"
            aria-label="Create New"
          />
        }
      >
        <Plus className="size-4" aria-hidden />
        {!compact && 'Create New'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'center' : 'start'} className="w-56">
        <DropdownMenuItem onClick={() => router.push('/email/builder')}>
          <Mail aria-hidden /> Create Campaign
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/contacts')}>
          <UserPlus aria-hidden /> Add Contact
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
