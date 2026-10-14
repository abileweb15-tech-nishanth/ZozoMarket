import {
  LayoutDashboard, CalendarDays, Mail, PenSquare, LayoutTemplate, Workflow,
  AtSign, Images, Send, BarChart3, Users, FileInput, Sparkles, FolderOpen,
  PieChart, Plug, Settings, CreditCard, type LucideIcon,
} from 'lucide-react'

export type NavItem = { label: string; href: string; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Unified Calendar', href: '/calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Email Marketing',
    items: [
      { label: 'Email Campaigns', href: '/email/campaigns', icon: Mail },
      { label: 'Email Builder', href: '/email/builder', icon: PenSquare },
      { label: 'Email Templates', href: '/email/templates', icon: LayoutTemplate },
      { label: 'Email Automations', href: '/email/automations', icon: Workflow },
    ],
  },
  {
    label: 'Social Media Marketing',
    items: [
      { label: 'Social Accounts', href: '/social/accounts', icon: AtSign },
      { label: 'Social Posts', href: '/social/posts', icon: Images },
      { label: 'Social Media Composer', href: '/social/composer', icon: Send },
      { label: 'Social Media Analytics', href: '/social/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Audience & Tools',
    items: [
      { label: 'Contacts & Audience', href: '/contacts', icon: Users },
      { label: 'Forms & Landing Pages', href: '/forms', icon: FileInput },
      { label: 'AI Marketing Assistant', href: '/ai-assistant', icon: Sparkles },
      { label: 'Media Library', href: '/media', icon: FolderOpen },
    ],
  },
  {
    label: 'Reports & Settings',
    items: [
      { label: 'Unified Analytics', href: '/analytics', icon: PieChart },
      { label: 'Integrations', href: '/integrations', icon: Plug },
      { label: 'Workspace Settings', href: '/settings', icon: Settings },
      { label: 'Billing & Plan', href: '/billing', icon: CreditCard },
    ],
  },
]

export function findNav(pathname: string) {
  for (const g of navGroups) {
    const item = g.items.find((i) => pathname.startsWith(i.href))
    if (item) return { group: g.label, item }
  }
  return null
}
