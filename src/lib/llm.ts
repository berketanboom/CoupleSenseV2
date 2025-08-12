export async function groqAnalyze(payload){
  const apiKey = process.env.GROQ_API_KEY || ''
  const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'
  if(!apiKey) throw new Error('GROQ_API_KEY missing')

  const system = `You are an AI mediator that explains partner messages without judgement.
Return ONLY valid JSON with keys: translation, explanation, mediation_steps, tone_scores, safety_flags.
Language=${payload.language}. PartnerGender=${payload.partnerGender}. Consider feelings/problems only as context.`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role:'system', content: system },
        { role:'user', content: JSON.stringify(payload) }
      ],
      response_format: { type: 'json_object' }
    })
  })
  if(!res.ok){
    const t = await res.text()
    throw new Error(`Groq failed ${res.status}: ${t}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if(!content) throw new Error('Empty LLM response')
  return JSON.parse(content)
}
