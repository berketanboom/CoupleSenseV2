// app/api/analyze/route.js
import { NextResponse } from "next/server";

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      message,
      language = 'en',
      partnerGender = 'unknown',
      feelings = [],
      problems = [],
      partnerStyle = 'neutral',
      image_text = '',
      history = []   // [{role:'user'|'assistant', content:string}, ...]
    } = body || {};

    if (!message) {
      return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });
    }

    // Sistem + bağlam
    const system = 
`You are a respectful relationship mediator.
ALWAYS reply strictly in "${language}" ONLY.
Return STRICT JSON with keys:
{
  "translation": string,
  "explanation": string,
  "mediation_steps": string[],
  "tone_scores": { "romantic": number, "logical": number, "playful": number, "dramatic": number, "distant": number },
  "safety_flags": string[]
}
No markdown, no extra keys, no prose outside JSON.
Use "image_text" only if provided (OCR). Avoid stereotypes. 
PartnerGender=${partnerGender}. PartnerStyle=${partnerStyle}.`;

    // Kullanıcı yükü (UI bağlamı + mevcut mesaj + OCR)
    const userPayload = {
      message,
      image_text,
      language,
      partnerGender,
      partnerStyle,
      feelings,
      problems
    };

    // Geçmişi Groq formatına dönüştür
    const historyMsgs = Array.isArray(history) ? history
      .filter(m => m && (m.role==='user' || m.role==='assistant') && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content })) : [];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...historyMsgs,
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!groqRes.ok) {
      const txt = await groqRes.text().catch(()=> '');
      return NextResponse.json({ error: `Groq error: ${txt}` }, { status: groqRes.status });
    }

    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        translation: content,
        explanation: "",
        mediation_steps: [],
        tone_scores: { romantic:0, logical:0, playful:0, dramatic:0, distant:0 },
        safety_flags: ["non_json_fallback"]
      };
    }
    return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
