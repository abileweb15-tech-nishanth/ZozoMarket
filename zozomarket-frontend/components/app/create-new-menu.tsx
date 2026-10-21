'use client'

import { useRouter } from 'next/navigation'
import { Mail, Plus, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function CreateNewMenu({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className={cn(fullWidth && 'w-full h-10')} />}>
        <Plus aria-hidden /> Create New
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
