import { NextResponse } from 'next/server'
import { groqAnalyze } from '../../../src/lib/llm'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if(!body?.message || !body?.partnerGender){
      return NextResponse.json({ error:'bad_request' }, { status: 400 })
    }
    const resp = await groqAnalyze(body)
    return NextResponse.json(resp, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e:any) {
    return NextResponse.json({ error:'llm_failed', detail: e?.message }, { status: 500 })
  }
}
