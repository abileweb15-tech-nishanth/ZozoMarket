import { NextResponse } from 'next/server'
import marketingData from '@/data/marketing-data.json'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: marketingData.emailCampaigns,
    total: marketingData.emailCampaigns.length,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const newCampaign = {
      id: `c_${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      status: 'Draft',
      delivery: null,
      open: null,
      click: null,
      ...body,
    }
    return NextResponse.json({ success: true, data: newCampaign }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
  }
}
