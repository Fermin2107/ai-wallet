import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
 
const EXTRACTOR_SYSTEM_PROMPT = `Sos un extractor de información financiera personal.
Analizá el mensaje y devolvé SOLO un objeto JSON con los campos que encontrés.
Si no encontrás información para un campo, no lo incluyas.
Respondé SOLO con JSON válido. Sin texto, sin markdown, sin explicaciones.
 
Campos posibles:
{
  "objetivo_principal": "texto corto del objetivo (ej: ahorrar para una moto)",
  "restriccion_conocida": "texto corto de la restricción (ej: no puedo recortar en salud)",
  "contexto_personal": "texto corto del contexto (ej: cobro en dólares, trabajo en negro)",
  "dia_de_cobro": numero_entero_entre_1_y_31
}
 
Reglas:
- Solo extraé información que el usuario declaró explícitamente.
- No inferras ni inventes.
- Si el mensaje no tiene información personal persistente, devolvé: {}
- Máximo 60 caracteres por campo de texto.`
 
export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json() as { message: string }
 
    if (!message || typeof message !== 'string') {
      return NextResponse.json({})
    }
 
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({})
    }
 
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
 
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 80,
      temperature: 0.1,   // baja temperatura para extracción factual
      messages: [
        { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    })
 
    const raw = response.choices[0].message.content ?? '{}'
 
    // Extraer JSON del response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({})
 
    const parsed = JSON.parse(jsonMatch[0])
 
    // Validar tipos — nunca confiar ciegamente en el LLM
    const safe: Record<string, string | number> = {}
    if (typeof parsed.objetivo_principal === 'string' && parsed.objetivo_principal.length <= 120)
      safe.objetivo_principal = parsed.objetivo_principal
    if (typeof parsed.restriccion_conocida === 'string' && parsed.restriccion_conocida.length <= 120)
      safe.restriccion_conocida = parsed.restriccion_conocida
    if (typeof parsed.contexto_personal === 'string' && parsed.contexto_personal.length <= 120)
      safe.contexto_personal = parsed.contexto_personal
    if (typeof parsed.dia_de_cobro === 'number' && parsed.dia_de_cobro >= 1 && parsed.dia_de_cobro <= 31)
      safe.dia_de_cobro = parsed.dia_de_cobro
 
    return NextResponse.json(safe)
  } catch {
    // Silenciar — esta route nunca debe romper la experiencia principal
    return NextResponse.json({})
  }
}