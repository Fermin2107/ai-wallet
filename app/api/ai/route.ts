import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const prompt = `
Actúa como un experto en finanzas personales especializado en lenguaje argentino/rioplatense. Analiza el siguiente mensaje del usuario y extrae información de transacciones financieras.

Mensaje del usuario: "${text}"

INSTRUCCIONES CRÍTICAS:

1️⃣ DETECCIÓN POR CONTEXTO (NO por palabras clave):
- NO requieres palabras como "gasté", "gané", "pagué"
- Detecta transacciones por contexto situacional
- Ejemplos que DEBES detectar como gastos:
  * "fui al super y me salió 500" → gasto 500 en supermercado
  * "almorcé por 800" → gasto 800 en alimentación
  * "tomé un café 200" → gasto 200 en alimentación
  * "cargé nafta 5000" → gasto 5000 en transporte
  * "pagué el sube 300" → gasto 300 en transporte
- Ejemplos que DEBES detectar como ingresos:
  * "me depositaron el sueldo" → ingreso sueldo
  * "me cayeron los mangos del laburo" → ingreso trabajo
  * "me pagaron el freelance" → ingreso freelance

2️⃣ CONVERSIÓN DE MONTOS EN PALABRAS:
- "quinientos" → 500, "dos mil" → 2000, "trescientos" → 300
- "un palo" → 1.000.000, "dos palos" → 2.000.000
- "un luca" → 1.000, "cinco lucas" → 5.000
- "un mango" → 1.000, "diez mangos" → 10.000
- "mil quinientos" → 1.500, "dos mil trescientos" → 2.300

3️⃣ LENGUAJE INFORMAL RIOPLATENSE:
- "me patinaste 200" → pérdida 200
- "tiré 500 en ropa" → gasto 500 en ropa
- "me cayó la guita del laburo" → ingreso trabajo
- "junté para el alquiler" → ahorro/gasto alquiler
- "me bancaste el cine" → gasto 500 en cine (si no dice monto, estimar)
- "chori con papas 150" → gasto 150 en alimentación
- "hice un asado 3000" → gasto 3000 en alimentación

4️⃣ CATEGORÍAS AUTOMÁTICAS:
- super, mercado, almacen, kiosco → alimentación
- colectivo, subte, tren, nafta, taxi, uber → transporte
- ropa, zapatillas, compras → otros
- cine, teatro, boliche, salida → ocio
- luz, gas, agua, internet, teléfono → servicios
- farmacia, médico, hospital → salud

5️⃣ EXTRAPOLACIÓN INTELIGENTE:
Si el usuario menciona un lugar o actividad pero no el monto, NO inventes valores. En su lugar, describe la transacción sin monto y marca como estimación.

Responde en este formato JSON exacto:
{
  "transactions": [
    {
      "type": "expense|income|loss",
      "amount": 150.50,
      "description": "comida en restaurante",
      "category": "alimentación",
      "essential": true,
      "context_detected": true,
      "confidence": 0.95
    }
  ],
  "summary": "Resumen breve en español argentino para el usuario",
  "analysis": "Análisis del contexto detectado"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en finanzas personales que ayuda a organizar gastos e ingresos.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return NextResponse.json({ error: 'OpenAI API error', details: data }, { status: 500 });
    }

    const aiResponse = JSON.parse(data.choices[0].message.content);

    return NextResponse.json({ 
      success: true, 
      data: aiResponse 
    });

  } catch (error) {
    console.error('AI processing error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: 'No pude procesar con la IA. Usando procesamiento básico.'
    }, { status: 500 });
  }
}
