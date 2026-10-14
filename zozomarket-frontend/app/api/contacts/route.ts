import { NextResponse } from 'next/server'
import marketingData from '@/data/marketing-data.json'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: marketingData.contacts,
    total: marketingData.contacts.length,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const newContact = {
      id: `u_${Date.now()}`,
      added: new Date().toISOString().slice(0, 10),
      source: 'API',
      status: 'Subscribed',
      tags: [],
      ...body,
    }
    return NextResponse.json({ success: true, data: newContact }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid request payload' }, { status: 400 })
  }
}
