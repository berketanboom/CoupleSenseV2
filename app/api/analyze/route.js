// app/api/analyze/route.js
import { NextResponse } from "next/server";

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json();
    const { message, partnerGender = 'unknown', language = 'en' } = payload || {};

    if (!message) {
      return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });
    }

    // Groq çağrısı — stabil, hızlı model
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
`You are an empathetic relationship mediator. 
Return STRICT JSON ONLY (no prose, no markdown) with this schema:
{
  "translation": string,
  "explanation": string,
  "mediation_steps": string[],
  "tone_scores": { "romantic": number, "logical": number, "playful": number, "dramatic": number, "distant": number },
  "safety_flags": string[]
}
Language=${language}. PartnerGender=${partnerGender}. Consider user feelings only as context. Avoid stereotypes.`
          },
          { role: "user", content: JSON.stringify(payload || {}) }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!groqRes.ok) {
      const txt = await groqRes.text().catch(()=> '');
      return NextResponse.json({ error: `Groq error: ${txt}` }, { status: groqRes.status });
    }

    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || "";
    // UI tarafı esnek olsun diye JSON’u olduğu gibi döndürüyoruz
    return NextResponse.json(JSON.parse(content));
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
