import { AppSidebar } from '@/components/app/app-sidebar'
import { AppHeader } from '@/components/app/app-header'
import { AuthGate } from '@/components/app/auth-gate'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 border-r border-sidebar-border lg:block">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 bg-muted/60 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
    </AuthGate>
  )
}
