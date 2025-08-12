import { NextResponse } from 'next/server';
import { groqAnalyze } from '../../../src/lib/llm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    if (!payload.message || !payload.partnerGender) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }

    // Groq request
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are an empathetic relationship mediator...' },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        temperature: 0.1,
        max_tokens: 512
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Groq error: ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
