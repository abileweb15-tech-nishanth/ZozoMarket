'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, Panel, StatusBadge, NativeSelect, Segmented, EmptyState } from '@/components/app/shared'
import { api, type CalendarEvent } from '@/lib/api'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const typeFilters = ['All Types', 'Newsletter', 'Promotional', 'Automated', 'Announcement'] as const

type View = 'Month' | 'List'

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(9) // October = 9 (0-indexed)
  const [view, setView] = useState<View>('Month')
  const [typeFilter, setTypeFilter] = useState<(typeof typeFilters)[number]>('All Types')

  useEffect(() => {
    api.calendar.list().then(setEvents)
  }, [])

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== 'All Types' && e.type !== typeFilter) return false
      return true
    })
  }, [events, typeFilter])

  const monthEvents = useMemo(() => {
    return filtered.filter((e) => {
      const d = new Date(e.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [filtered, year, month])

  // Calendar grid calculation
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: (number | null)[][] = []
  let currentWeek: (number | null)[] = Array(firstDay).fill(null)

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null)
    weeks.push(currentWeek)
  }

  const eventsForDay = (day: number) =>
    monthEvents.filter((e) => new Date(e.date).getDate() === day)

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  return (
    <div>
      <PageHeader
        title="Campaign Calendar"
        description="Schedule and track all upcoming email newsletters, promotional blasts, and automated triggers."
        actions={
          <>
            <NativeSelect
              label="Campaign Type"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as (typeof typeFilters)[number])}
              options={[...typeFilters]}
            />
            <Segmented label="View" value={view} onChange={setView} options={['Month', 'List'] as const} />
          </>
        }
      />

      {/* Month nav */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[160px] text-center text-sm font-semibold">
          {MONTHS[month]} {year}
        </span>
        <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {view === 'Month' ? (
        <Panel bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  {DAYS.map((d) => (
                    <th key={d} className="border-b border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((day, di) => {
                      const dayEvents = day ? eventsForDay(day) : []
                      const isToday =
                        day !== null &&
                        new Date().getFullYear() === year &&
                        new Date().getMonth() === month &&
                        new Date().getDate() === day
                      return (
                        <td
                          key={di}
                          className={cn(
                            'h-24 border border-border align-top p-1.5 text-xs',
                            day === null && 'bg-muted/40',
                          )}
                        >
                          {day !== null && (
                            <>
                              <span
                                className={cn(
                                  'mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium',
                                  isToday && 'bg-primary text-primary-foreground',
                                )}
                              >
                                {day}
                              </span>
                              <div className="flex flex-col gap-0.5">
                                {dayEvents.slice(0, 2).map((e) => (
                                  <span
                                    key={e.id}
                                    className="flex items-center gap-1 truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary"
                                    title={`${e.title} (${e.time})`}
                                  >
                                    <Mail className="size-2.5 shrink-0" />
                                    <span className="truncate">{e.title}</span>
                                  </span>
                                ))}
                                {dayEvents.length > 2 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{dayEvents.length - 2} more
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel bodyClassName="p-0">
          {monthEvents.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No email campaigns scheduled"
              description="There are no broadcasts or automations scheduled for this period."
            />
          ) : (
            <div className="divide-y divide-border">
              {monthEvents
                .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {new Date(e.date).getDate()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.time} · {e.type}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
