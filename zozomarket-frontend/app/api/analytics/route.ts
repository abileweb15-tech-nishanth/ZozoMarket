import { NextResponse } from 'next/server'
import marketingData from '@/data/marketing-data.json'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      emailPerformance: marketingData.emailPerformance,
    },
  })
}
