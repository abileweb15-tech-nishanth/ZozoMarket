import { NextResponse } from 'next/server'
import marketingData from '@/data/marketing-data.json'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      kpis: marketingData.dashboardKpis,
      recentCampaigns: marketingData.emailCampaigns.slice(0, 5),
      upcomingEvents: marketingData.calendarEvents.slice(0, 5),
    },
  })
}
