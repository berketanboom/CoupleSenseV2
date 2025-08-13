// app/api/analyze/route.js
import { NextResponse } from "next/server";

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json();
    const {
      message,
      language = 'en',
      partnerGender = 'unknown',
      feelings = [],
      problems = [],
      partnerStyle = 'neutral',
      image_text = '' // OCR'dan gelen metin
    } = payload || {};

    if (!message) {
      return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 500 });
    }

    const userJSON = JSON.stringify({
      message,
      image_text,
      language,
      partnerGender,
      partnerStyle,
      feelings,
      problems
    });

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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
`You are a respectful relationship mediator. 
ALWAYS reply in the requested language: "${language}" ONLY.
Return STRICT JSON with keys:
{
  "translation": string,
  "explanation": string,
  "mediation_steps": string[],
  "tone_scores": { "romantic": number, "logical": number, "playful": number, "dramatic": number, "distant": number },
  "safety_flags": string[]
}
Use "image_text" only if provided (OCR). No markdown, no extra keys. Avoid stereotypes; be neutral yet empathetic. PartnerGender=${partnerGender}. PartnerStyle=${partnerStyle}.`
          },
          { role: "user", content: userJSON }
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
      // Model JSON dışı dönerse minimum güvenli fallback
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
