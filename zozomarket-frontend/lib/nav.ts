import {
  LayoutDashboard, CalendarDays, Mail, LayoutTemplate, Workflow,
  Users, FileInput, FolderOpen, UserRound,
  PieChart, Settings, type LucideIcon,
} from 'lucide-react'

export type NavItem = { label: string; href: string; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Campaign Calendar', href: '/calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Email Marketing',
    items: [
      { label: 'Email Campaigns', href: '/email/campaigns', icon: Mail },
      { label: 'Email Templates', href: '/email/templates', icon: LayoutTemplate },
      { label: 'Email Automation', href: '/email/automations', icon: Workflow },
    ],
  },
  {
    label: 'Audience & Tools',
    items: [
      { label: 'Contacts & Audience', href: '/contacts', icon: Users },
      { label: 'Forms & Landing Pages', href: '/forms', icon: FileInput },
      { label: 'Media Library', href: '/media', icon: FolderOpen },
    ],
  },
  {
    label: 'Reports & Settings',
    items: [
      { label: 'Email Analytics', href: '/analytics', icon: PieChart },
      { label: 'Workspace Settings', href: '/settings', icon: Settings },
    ],
  },
]

export function findNav(pathname: string) {
  if (pathname.startsWith('/email/builder')) {
    return { group: 'Email Marketing', item: { label: 'Email Builder', href: '/email/builder', icon: Mail } }
  }
  if (pathname.startsWith('/profile')) {
    return { group: 'Reports & Settings', item: { label: 'Profile', href: '/profile', icon: UserRound } }
  }
  for (const g of navGroups) {
    const item = g.items.find((i) => pathname.startsWith(i.href))
    if (item) return { group: g.label, item }
  }
  return null
}
