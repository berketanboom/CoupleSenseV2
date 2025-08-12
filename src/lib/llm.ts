// src/lib/llm.ts
type AnalyzeRequest = {
  partnerGender: 'male'|'female'
  feelings: string[]
  problems: string[]
  partnerStyle: 'neutral'|'funny'|'serious'|'emotional'|'logical'
  language: 'tr'|'en'
  message: string
  imageUrl?: string
  sessionId: string
}

type AnalyzeResponse = {
  translation: string
  explanation: string
  mediation_steps: string[]
  tone_scores: { romantic:number; logical:number; playful:number; dramatic:number; distant:number }
  safety_flags?: string[]
}

function buildSystem(p: AnalyzeRequest) {
  // Katı yönerge + açık şema
  return `
You are an AI relationship mediator. 
OUTPUT MUST BE STRICT JSON ONLY (no prose, no markdown). 
Use this JSON schema exactly:

{
  "translation": string,                // Rephrase/translate partner's intent for the user (language=${p.language})
  "explanation": string,                // Why you think this is the intent (neutral, no judgement)
  "mediation_steps": string[],          // 3-6 short actionable steps to reconcile
  "tone_scores": {                      // 0-100 integers
    "romantic": number,
    "logical": number,
    "playful": number,
    "dramatic": number,
    "distant": number
  },
  "safety_flags": string[]              // optional, empty if none (e.g., "verbal_abuse","stonewalling","gaslighting")
}

Constraints:
- Language of fields "translation" and "explanation" must be ${p.language}.
- Consider user's feelings/problems ONLY as context, do NOT scold either party.
- PartnerGender=${p.partnerGender}; adjust reading subtly, avoid stereotypes.
- Always fill tone_scores with integers 0..100.
- If uncertain, be conservative and explain uncertainty in "explanation".
`.trim()
}

function buildUser(p: AnalyzeRequest) {
  return JSON.stringify({
    partnerGender: p.partnerGender,
    partnerStyle: p.partnerStyle,
    language: p.language,
    userFeelings: p.feelings,
    userProblems: p.problems,
    message: p.message,
    sessionId: p.sessionId,
  })
}

function tryExtractJson(txt: string) {
  // 1) Düz JSON ise
  try { return JSON.parse(txt) } catch {}
  // 2) Kod bloğu/markdown geldiyse: ```json {...} ```
  const codeBlock = /```(?:json)?\s*([\s\S]*?)```/i.exec(txt)
  if (codeBlock && codeBlock[1]) {
    try { return JSON.parse(codeBlock[1]) } catch {}
  }
  // 3) İlk { ... } bloğunu yakala (basit ama iş görüyor)
  const firstBrace = txt.indexOf('{')
  const lastBrace  = txt.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = txt.slice(firstBrace, lastBrace + 1)
    try { return JSON.parse(candidate) } catch {}
  }
  return null
}

async function callGroq(p: AnalyzeRequest, retry = false): Promise<AnalyzeResponse> {
  const apiKey = process.env.GROQ_API_KEY || ''
  const model  = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'
  if (!apiKey) throw new Error('GROQ_API_KEY missing')

  const body = {
    model,
    temperature: 0.1,
    seed: 1,
    messages: [
      { role: 'system', content: buildSystem(p) },
      { role: 'user',   content: buildUser(p) }
    ],
    // Groq OpenAI uyumlu; json_object çoğu modelde çalışıyor
    response_format: { type: 'json_object' },
    max_tokens: 800
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Groq failed ${res.status}: ${t}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  let json = tryExtractJson(content)

  // Gerekirse tek “repair” denemesi
  if (!json && !retry) {
    const repair = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.0,
        seed: 1,
        messages: [
          { role: 'system', content: 'You fix malformed JSON into strictly valid JSON. Output JSON only, no prose.' },
          { role: 'user',   content: `Fix this into valid JSON that matches the schema I gave earlier:\n\n${content}` }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600
      })
    })
    if (repair.ok) {
      const rd = await repair.json()
      const rc = rd?.choices?.[0]?.message?.content || ''
      json = tryExtractJson(rc)
    }
  }

  if (!json) {
    // son çare: güvenli default oluştur (UI kırılmasın)
    json = {
      translation: p.language === 'tr' ? 'Mesajı daha net ifade edersek...' : 'In plain words...',
      explanation: p.language === 'tr'
        ? 'Model geçerli JSON üretemedi, güvenli varsayılan oluşturuldu.'
        : 'Model did not return valid JSON; produced a safe fallback.',
      mediation_steps: [],
      tone_scores: { romantic: 40, logical: 50, playful: 30, dramatic: 40, distant: 40 },
      safety_flags: []
    }
  }

  // Tip güvenliği ve eksik alanları tamamla
  const safe: AnalyzeResponse = {
    translation: String(json.translation ?? ''),
    explanation: String(json.explanation ?? ''),
    mediation_steps: Array.isArray(json.mediation_steps) ? json.mediation_steps.map(String) : [],
    tone_scores: {
      romantic: Number(json?.tone_scores?.romantic ?? 40),
      logical:  Number(json?.tone_scores?.logical  ?? 50),
      playful:  Number(json?.tone_scores?.playful  ?? 30),
      dramatic: Number(json?.tone_scores?.dramatic ?? 40),
      distant:  Number(json?.tone_scores?.distant  ?? 40),
    },
    safety_flags: Array.isArray(json?.safety_flags) ? json.safety_flags.map(String) : []
  }
  return safe
}

// Dışa açılan fonksiyon
export async function groqAnalyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return callGroq(payload)
}
