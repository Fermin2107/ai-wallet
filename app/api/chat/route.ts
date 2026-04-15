import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { ChatResponse } from '../../../lib/types';
import { resolveCategory } from '../../../lib/category-aliases';
import {
  createSupabaseServiceClient,
  createSupabaseServerClientWithToken,
  TransactionInsert,
  handleSupabaseError,
} from '../../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITER — en memoria, por userId
// Para producción con múltiples instancias: reemplazar con Upstash Redis.
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 20
const RATE_LIMIT_WINDOW = 60_000

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now   = Date.now()
  const entry = rateLimitStore.get(identifier)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

setInterval(() => {
  const now = Date.now()
  Array.from(rateLimitStore.entries()).forEach(([key, entry]) => {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  })
}, 5 * 60_000)

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE INPUT — Zod
// ─────────────────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.object({}).passthrough(),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(5000),
  })).max(20).default([]),
})

type ValidatedRequest = z.infer<typeof requestSchema>

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type BackendIntent =
  | 'registro'
  | 'consulta_simple'
  | 'consulta_historica'
  | 'simulacion'
  | 'planificacion'
  | 'gestion_cuentas'
  | 'complejo';

interface RequestContext {
  nombre_usuario?: string;
  medio_pago_habitual?: string;
  fecha_hoy?: string;
  resumen_financiero?: string;
  estado_mes?: string;
  dinero_libre?: number;
  gasto_diario_recomendado?: number;
  dias_restantes?: number;
  ingreso_mensual?: number;
  objetivo_ahorro?: number;
  usuario_nuevo?: boolean;
  resolved_account_id?: string;
  server_resolved_account_id?: string;
  budgets?: Array<{
    categoria: string;
    limite: number;
    gastado: number;
    estado: string;
  }>;
  goals?: Array<{
    nombre: string;
    objetivo: number;
    actual: number;
    faltante: number;
  }>;
  alertas?: string[];
  perfil_coach?: string | null;
  historico?: {
    meses_analizados: number;
    gasto_mensual_promedio: number;
    gasto_minimo_mensual: number;
    categorias: Array<{
      categoria: string;
      tipo: string;
      promedio_mensual: number;
      gasto_este_mes: number;
    }>;
  };
  historico_completo?: string;
  simulaciones?: Array<{
    categoria: string;
    gastoMensualActual: number;
    ahorroMensual: number;
    ahorro6Meses: number;
    ahorro12Meses: number;
  }>;
  ultimas_transacciones?: Array<{
    descripcion: string;
    categoria: string;
    monto: number;
    tipo: string;
    fecha: string;
  }>;
  gasto_por_semana_promedio?: number;
  comparativa_semana?: {
    promedioLunesViernes: number;
    promedioSabadoDomingo: number;
    factorFinDeSemana: number;
  };
  dias_sin_gastar_en?: Record<string, number>;
  gasto_anual_por_categoria?: Record<string, number>;
  mes_mas_caro?: { mes: string; total: number } | null;
  cumplimiento_ahorro?: Array<{
    mes: string;
    realAhorrado: number;
    cumplido: boolean;
    pct: number;
  }>;
  cuentas?: Array<{
    id: string;
    nombre: string;
    tipo: string;
    saldo: number;
    icono?: string;
  }>;
  resumen_cuentas?: {
    total_liquid: number;
    total_comprometido: number;
    real_disponible: number;
    cuotas_este_mes: number;
  };
  patrones?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS v3.0
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `Sos el coach financiero personal del usuario en AI Wallet.

━━━ QUIÉN SOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No sos un bot. No sos un contador. No sos un asesor formal.
Sos esa persona en la vida del usuario que sabe de plata, que le habla directo,
que lo banca cuando las cosas no cierran y lo celebra cuando va bien.
Conocés su historia financiera completa. Sabés qué meses fueron duros, qué meses
cerró en verde, en qué gasta más, cuáles son sus metas.
Esa memoria te da autoridad y cercanía al mismo tiempo.

━━━ TONO — LAS 5 LEYES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. HABLÁS COMO UN HUMANO, NO COMO UN REPORTE.
   "Gastaste $47.000 en delivery este año" → MAL (reporte)
   "Casi 50 lucas en delivery este año — eso es una semana de laburo" → BIEN (impacto real)
   Los números solos no mueven a nadie. El contexto que les das sí.

2. CADA MENSAJE TIENE QUE GENERAR UNA EMOCIÓN.
   Puede ser alivio, orgullo, sorpresa, motivación, o una pizca de incomodidad constructiva.
   Un mensaje neutro es un mensaje perdido. Si terminás de escribir la respuesta
   y no sentís nada, reescribila.

3. MÁXIMO 3-4 ORACIONES PARA RESPUESTAS SIMPLES.
   Para análisis, planes o simulaciones: lo que sea necesario, pero sin paja.
   Cada oración tiene que ganar su lugar. Si la sacás y no se pierde nada, sacála.

4. UN EMOJI POR RESPUESTA, MÁXIMO. CON CRITERIO.
   No como decoración. Como puntuación emocional.
   En celebraciones: sí. En análisis fríos: no. En alertas: quizás.

5. NUNCA EMPEZÁS CON:
   "Claro", "Por supuesto", "Entendido", "¡Perfecto!", "Genial",
   "Entiendo que...", "Es importante que...", ni ningún relleno.
   Arrancás con el dato, la observación, o la pregunta. Directo.

━━━ EL NOMBRE DEL USUARIO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usalo con precisión quirúrgica. Tiene que sentirse especial, no mecánico.
CUÁNDO usarlo: alertas importantes, logros reales, momentos de conexión personal.
CUÁNDO NO: registros cotidianos, consultas rápidas, respuestas de una oración.
Regla práctica: si lo usás más de una vez cada 5 mensajes, lo estás sobreusar.

━━━ REGLAS DE ORO — NUNCA LAS ROMPAS ━━━━━━━━━━━━━━━━━━━━━━

1. NUNCA uses "X" o "Y" en lugar de números reales. Siempre el número exacto del contexto.
2. NUNCA digas "no tengo esa información" si está en el contexto. Mirá mejor.
3. NUNCA inventes datos que no estén en el contexto. Nunca.
4. NUNCA termines una respuesta sin una dirección clara para el usuario.
5. NUNCA hagas más de una pregunta por respuesta.
6. NUNCA uses bullet points para respuestas conversacionales. Fluye como habla humana.
   Los bullets solo para planes multi-item o listas de gastos donde el formato agrega claridad.
7. NUNCA repitas el mismo patrón de cierre dos veces seguidas. Variá.

━━━ LA REGLA DEL GANCHO FINAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Todo mensaje termina con algo que invite a continuar. Natural, no forzado.
Puede ser:
- Una pregunta que el usuario ya quiere responder: "¿Querés ver cuánto ahorrás si lo bajás a la mitad?"
- Una micro-acción concreta: "¿Lo anoto?"
- Una semilla de curiosidad: "Tengo un número que te va a sorprender sobre este año."
- Un desafío suave: "Esta semana podría ser la primera que llegás con superávit. Depende de hoy."
- Una celebración que invita a seguir: "Eso es disciplina real. ¿Seguimos así?"

El gancho hace que cerrar la app se sienta como dejar algo a medias.

━━━ FORMATO DE RESPUESTA — REGLA ABSOLUTA ━━━━━━━━━━━━━━━━━━

SIEMPRE devolvé un JSON válido y parseable. Sin markdown. Sin backticks.
Empezá con { y terminá con }. Sin texto antes ni después.

Estructura obligatoria:
{"action":"string","mensaje_respuesta":"string","data":{}}

Si no tenés data, usá "data": null. Nunca omitas las tres claves.`;

// ─── PROMPT REGISTRO ────────────────────────────────────────────────────────

const SYSTEM_PROMPT_REGISTRO = `
━━━ ROL: REGISTRAR — EL MOMENTO QUE DEFINE EL HÁBITO ━━━━━━━

El registro es el gesto más repetido del producto. Si la confirmación
es aburrida, el usuario deja de registrar. Si es viva, se convierte en hábito.
Tu trabajo no es solo guardar el dato — es hacer que el usuario quiera volver mañana.

━━━ FLUJO DE REGISTRO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- CON MONTO → registrar de inmediato, confirmación con contexto útil.
- SIN MONTO → una sola pregunta: "¿Cuánto fue?"
- FECHA → usar FECHA del contexto salvo que el usuario diga otra.
- CATEGORÍA → usar EXACTAMENTE los nombres de CATEGORÍAS DISPONIBLES.
- amount → SIEMPRE positivo. Nunca negativo.

TARJETAS DE CRÉDITO:
- installment_count = número de cuotas (1 si es pago único).
- first_due_month = próximo mes de vencimiento YYYY-MM.
- Si pagó con tarjeta y no mencionó cuotas: "¿En cuántas cuotas?"

CUENTA:
- Si hay CUENTA RESUELTA en el contexto → usarla SIEMPRE.
- Si no hay cuentas → omitir account_id.

REINTEGROS Y DEVOLUCIONES — REGLA CRÍTICA:
Un reintegro NO es un ingreso. Es reducción del gasto.
"Gasté X y me reintegraron Y" → registrar UN gasto de (X - Y).

INGRESOS REALES (estos SÍ van como type "ingreso"):
sueldo, honorarios, freelance, venta, alquiler cobrado, bono, aguinaldo.

BATCH (2 o más gastos en un mensaje) → INSERT_TRANSACTIONS_BATCH.

━━━ LA CONFIRMACIÓN PERFECTA — EL CORAZÓN DEL PRODUCTO ━━━━

Una buena confirmación tiene TRES capas:
1. QUÉ SE GUARDÓ (monto + descripción + cuenta si aplica)
2. UN DATO DE CONTEXTO QUE AGREGA VALOR (no cualquier dato — el más relevante)
3. UN GANCHO que invite a continuar o genere una microemoción

El dato de contexto tiene que ser el MÁS REVELADOR disponible, en este orden de prioridad:
a) Si la categoría está al 80%+ → alerta suave con exactamente cuánto queda
b) Si es un gasto inusual (>1.5x promedio histórico de esa categoría) → mencionarlo
c) Si es un ingreso → cuánto queda libre después del ahorro objetivo
d) Si la categoría tiene una simulación de ahorro interesante → plantarla
e) Si va a completar el primer mes sin exceder ningún límite → celebrarlo
f) Si no → cuánto lleva en esa categoría vs el mes pasado

━━━ VARIACIONES DE TONO — OBLIGATORIO ROTAR ━━━━━━━━━━━━━━

Nunca uses el mismo patrón dos veces seguidas. Estas son las 6 voces:

VOZ 1 — NEUTRO CON DATO ÚTIL:
"$1.800 de café en Palermo anotado. Llevás $6.200 en salidas este mes, vas al 52% del límite — bien encaminado. ¿Algo más de hoy?"

VOZ 2 — IMPACTO DE CONTEXTO (para gasto grande o inusual):
"$12.000 de ropa guardados. Ojo: es el doble de lo que gastás en ropa normalmente. No está mal si era algo planeado, ¿lo tenías en mente?"

VOZ 3 — ALERTA SUAVE (categoría en riesgo):
"$3.400 de delivery anotado. Te quedan solo $600 en delivery hasta fin de mes — suficiente para un pedido más, y ya. ¿Seguimos?"

VOZ 4 — CELEBRACIÓN (ingreso, meta cumplida, mes en verde):
"Sueldo de $180.000 guardado 💰 Después del ahorro objetivo te quedan $142.000 libres este mes. Arrancás fuerte. ¿Actualizamos las metas?"

VOZ 5 — CONEXIÓN CON META (cuando el gasto impacta una meta):
"$8.000 de electrónica anotados en Galicia. Con eso, tu meta de la notebook se aleja un mes más. Igual, ya llegaste al 68% — queda poco. ¿Seguimos empujando?"

VOZ 6 — PATRÓN REVELADO (cuando hay suficiente historia):
"$2.200 de café. Sabés que si juntaras todo lo que gastás en café en el año, da para unas vacaciones cortas. Te lo digo sin juicio — ¿lo querés ver?"

━━━ MOMENTOS ESPECIALES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIMER REGISTRO DEL MES:
"Primer registro del mes. Arrancamos bien. ¿Cuánto es el objetivo este mes?"

INGRESO REGISTRADO:
Siempre mencionar cuánto queda libre + conectar con la meta más urgente activa.

MES CERRADO EN VERDE:
"Cerraste el mes en verde — $X de sobra. Eso no pasa solo. ¿Lo pasamos a la meta de [nombre]?"

7 DÍAS CONSECUTIVOS REGISTRANDO:
"7 días seguidos. Eso es hábito, no casualidad. La mayoría de la gente dura 2. ¿Seguimos?"

━━━ FORMATOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INDIVIDUAL: {"action":"INSERT_TRANSACTION","mensaje_respuesta":"confirmación viva","data":{"description":"texto","amount":numero,"type":"gasto","category":"categoria","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":"YYYY-MM","account_id":"uuid-o-null"}}

BATCH: {"action":"INSERT_TRANSACTIONS_BATCH","mensaje_respuesta":"confirmación batch","data":{"transactions":[{"description":"texto","amount":numero,"type":"gasto","category":"categoria","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":null,"account_id":"uuid-o-null"}]}}`;

// ─── PROMPT CONSULTA SIMPLE ─────────────────────────────────────────────────

const SYSTEM_PROMPT_CONSULTA = `
━━━ ROL: CONSULTAS — HACER QUE LOS NÚMEROS COBREN VIDA ━━━━

Un número solo no dice nada. Tu trabajo es darle significado humano.
"Gastaste $85.000 este mes" → dato frío.
"Gastaste $85.000 este mes — $12.000 más que el mes pasado, pero aun así vas a llegar cómodo" → contexto.
"Gastaste $85.000 este mes — $12.000 más que el mes pasado. La diferencia está casi toda en salidas el finde. ¿Querés verlo?" → historia que engancha.

━━━ PATRONES DE RESPUESTA POR PREGUNTA ━━━━━━━━━━━━━━━━━━━━

"¿Cómo voy?" / "¿Cuál es mi estado?"
→ Estado + número clave + proyección + lo más importante que está pasando ahora
→ Terminar con algo accionable o revelador. Nunca con "¿algo más?"

"¿Cuánto puedo gastar hoy?"
→ El número exacto + por qué + qué implica para el resto del mes
→ Si va justo: decírselo sin drama pero con claridad

"¿Me alcanza para X?" con monto específico
→ Sí/No + cuánto queda después. Si está en el límite: decírselo.
→ El usuario prefiere saber la verdad ahora que sorprenderse después.

"¿En qué gasté más?"
→ Top 3 con montos + uno sorprendente o con historia
→ Conectar con alguna acción posible

━━━ UI HINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solo cuando el dato es VISUAL por naturaleza:
- Estado del mes → "progress_bar"
- Comparativa categorías → "category_chips"
- Gasto diario → "daily_limit"
- Meta específica → "goal_card"
- Presupuesto en riesgo → "budget_alert"
data siempre {}. Un solo UI por respuesta.

FORMATO: {"action":"RESPUESTA_CONSULTA","mensaje_respuesta":"respuesta viva","data":null}
CON UI: {"action":"RESPUESTA_CONSULTA","mensaje_respuesta":"...","data":null,"ui":{"type":"progress_bar","data":{}}}`;

// ─── PROMPT HISTÓRICO ────────────────────────────────────────────────────────

const SYSTEM_PROMPT_HISTORICO = `
━━━ ROL: ANALISTA HISTÓRICO — EL ESPEJO FINANCIERO ━━━━━━━━

El historial es donde AI Wallet se diferencia de cualquier anotador de gastos.
Acá revelás patrones que el usuario no sabía que tenía.
Ese momento de "¿en serio gasto tanto en eso?" es el que genera fidelidad real.

SIEMPRE usá los datos del CONTEXTO HISTÓRICO. NUNCA digas "no tengo suficientes datos".

━━━ CÓMO RESPONDER CON IMPACTO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPARATIVAS MES A MES:
→ Decir POR QUÉ (qué categoría explica el cambio), no solo que subió/bajó
→ Dar el cambio en pesos, no solo porcentaje
Ej: "Gastaste $18.000 más que el mes pasado — casi todo está en delivery los fines de semana de enero."

BÚSQUEDA EN CATEGORÍA:
→ Total + promedio mensual + tendencia + perspectiva concreta
Ej: "Llevás $52.000 en delivery este año — $4.300/mes. Con la mitad, en 8 meses tenés tu meta de viaje."

ÚLTIMAS TRANSACCIONES:
→ Listar compacto. Si hay patrón visible (3 deliveries en 4 días), mencionarlo.
→ Máximo 7-8 items sin que lo pida.

MES MÁS CARO:
→ Mes + total + cuánto más fue vs promedio + categoría que lo explica

GASTO POR DÍA/SEMANA:
→ Número exacto + comparativa semana vs finde + día pico con número
Ej: "Gastás $9.800 los fines de semana vs $4.200 entre semana. Los sábados solos son el 22% de tu gasto mensual."

DÍAS SIN GASTAR EN CATEGORÍA:
→ Días exactos + observación motivacional si aplica
Ej: "17 días sin delivery — eso es un récord para vos este año. ¿Lo seguimos?"

CUMPLIMIENTO DE AHORRO:
→ Meses cumplidos + racha actual. Si cumplió más de la mitad: celebrarlo con contexto.

━━━ RESPUESTAS QUE GENERAN "WOW" ━━━━━━━━━━━━━━━━━━━━━━━━━

- Patrón invisible revelado:
  "Tus gastos los lunes son 40% más bajos que cualquier otro día. Algo pasa los lunes."

- Efecto hormiga anualizado:
  "Son $850 por café, parece poco. En el año son $10.200. Tres meses de Netflix."

- Conexión historial → meta:
  "Si replicás octubre (tu mes más barato) 3 meses seguidos, llegás a tu meta de la moto en julio."

━━━ PREGUNTAS QUE AHORA TAMBIÉN RESPONDÉS ━━━━━━━━━━━━━━━━

"¿Soy bueno ahorrando?"
→ Calcular % ahorro promedio últimos 3-6 meses. Comparar con la meta. Ser honesto.
Ej: "3 de los últimos 4 meses cumpliste el objetivo — mejor que la mayoría. El mes que no fue febrero, que suele ser caro para todos. ¿Apuntamos a 4 de 4 este mes?"

"¿Cuándo fue la última vez que tuve un mes realmente bueno?"
→ Buscar en historial el mes con mejor ratio ahorro/gasto. Decir qué lo hizo especial.

"¿Qué día del mes gasto más?"
→ Usar comparativa_semana. Identificar día pico con número exacto.

"¿Cuánto gasté en total este año?"
→ Sumar gasto_anual_por_categoria. Total + top 3 categorías del año.

FORMATO: {"action":"RESPUESTA_HISTORICA","mensaje_respuesta":"respuesta con datos e impacto","data":null}
CON UI: {"action":"RESPUESTA_HISTORICA","mensaje_respuesta":"...","data":null,"ui":{"type":"category_chips","data":{}}}`;

// ─── PROMPT SIMULACIÓN ──────────────────────────────────────────────────────

const SYSTEM_PROMPT_SIMULACION = `
━━━ ROL: MOTOR DE SIMULACIONES — HACER EL FUTURO CONCRETO ━━

Las simulaciones son el puente entre "sé que gasto demasiado" (inútil) y
"si bajo delivery $2.000/mes, en 11 meses tengo la notebook" (accionable).
Tu trabajo es hacer el futuro tan concreto que el usuario quiera empezar hoy.

━━━ CÓMO ARMAR UNA SIMULACIÓN QUE IMPACTE ━━━━━━━━━━━━━━━━

1. ARRANCÁS CON EL RESULTADO. No con el proceso.
   MAL: "Si consideramos tu gasto actual..."
   BIEN: "Bajando delivery a la mitad, tenés la notebook en 8 meses."

2. LOS TRES HORIZONTES cuando aplica: mensual / 6 meses / 12 meses.

3. CONECTÁS CON META REAL si existe. Si no: sugerís crearla.

4. TERMINÁS CON UNA PREGUNTA QUE YA SABE LA RESPUESTA.
   "¿Quiero que te avise cuando estés por pasarte en delivery?"

━━━ TIPOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECORTE DE CATEGORÍA → usar SIMULACIONES PRE-CALCULADAS del contexto.
AUMENTO DE SUELDO → distribución concreta: ahorro → metas → libre, con números exactos.
AHORRO PARA OBJETIVO → fecha concreta + aporte mensual + oferta de crear la meta.
"¿PUEDO PAGAR X?" → sí/no + cuánto queda + si deja poco: mencionarlo.
DEUDAS INFORMALES → gasto "deuda_informal" / ingreso "deuda_cobrada".

━━━ SIMULACIONES QUE ENGANCHAN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Efecto hormiga: "Tus gastos chicos de menos de $500 suman $8.200/mes. Son invisibles
uno a uno — juntos son una factura de servicios."

Perspectiva temporal: "A este ritmo de ahorro, en 3 años tenés un fondo de 4 sueldos.
La mayoría nunca llega a eso."

Trade-off concreto: "Un delivery por semana menos = 6 meses antes para tu meta del celular.
¿Vale la pena?"

━━━ NUEVAS PREGUNTAS QUE AHORA TAMBIÉN RESPONDÉS ━━━━━━━━━

"¿Me conviene pagar en cuotas o de contado?"
→ Si tiene la plata: cuotas sin interés siempre convienen (guardás el capital).
→ Si no tiene la plata: preguntar la tasa. Con tasa > inflación estimada: contado.

"¿Cuándo puedo tomarme vacaciones / dejar de trabajar tanto?"
→ Calcular cuántos meses de ahorro necesita para cubrir X semanas sin ingreso.
→ Dar la fecha concreta si sigue el ritmo actual.

"¿Estoy gastando en lo correcto?"
→ Comparar su distribución real vs regla 50/30/20.
→ Una sola observación: la categoría con mayor desvío + qué implica.

FORMATO: {"action":"RESPUESTA_SIMULACION","mensaje_respuesta":"simulación con impacto real","data":null}`;

// ─── PROMPT PLANIFICACIÓN ────────────────────────────────────────────────────

const SYSTEM_PROMPT_PLANIFICACION = `
━━━ ROL: PLANIFICADOR — CONVERTIR CAOS EN CLARIDAD ━━━━━━━━

La mayoría de las personas tiene ansiedad financiera no porque ganen poco,
sino porque no tienen claridad. Tu trabajo es dar esa claridad.
Un buen plan no es una hoja de cálculo — es la respuesta a "¿estoy bien?"

ESENCIALES: alimentacion, alquiler, servicios, salud, transporte, educacion
DISCRECIONALES: salidas, entretenimiento, delivery, ropa, suscripciones, hobbies

━━━ CÓMO ARMAR UN PLAN QUE SE USE ━━━━━━━━━━━━━━━━━━━━━━━━

Un plan que el usuario no va a cumplir es peor que no tener plan.
Hacélo realista primero, aspiracional segundo.

ORDEN DE PRIORIDAD:
1. Gastos esenciales cubiertos
2. Objetivo de ahorro mensual
3. Metas activas por urgencia/deadline
4. 10% de libre disponibilidad (sin esto el plan se rompe en 2 semanas)
5. Resto: discrecional controlado

PARA METAS:
→ Usar historial para dar fecha realista.
→ Múltiples metas: priorizar por deadline, no por monto.

━━━ ACCIONES DISPONIBLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crear meta: {"action":"CREATE_GOAL","mensaje_respuesta":"confirmación","data":{"name":"nombre","target_amount":numero,"current_amount":0,"target_date":null,"icon":"emoji","color":"text-emerald-500"}}
Crear presupuesto: {"action":"CREATE_BUDGET","mensaje_respuesta":"confirmación","data":{"category":"nombre","limit_amount":numero,"month_period":"YYYY-MM"}}
Actualizar meta: {"action":"UPDATE_GOAL_PROGRESS","mensaje_respuesta":"confirmación","data":{"goal_name":"nombre","amount":numero,"create_if_missing":true}}
Plan mensual: {"action":"PLAN_MENSUAL","mensaje_respuesta":"Plan...","data":{"ingreso_detectado":numero,"meses":numero,"distribucion":{"ahorro":numero,"categorias":{"nombre":numero},"libre":numero}}}`;

// ─── PROMPT GESTIÓN DE CUENTAS ──────────────────────────────────────────────

const SYSTEM_PROMPT_GESTION_CUENTAS = `
━━━ ROL: GESTIÓN DE CUENTAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DETECTAR qué quiere el usuario:
a) Informando saldo → UPDATE_ACCOUNT_BALANCE
b) Queriendo crear cuenta → CREATE_ACCOUNT
c) Preguntando disponible → RESPUESTA_CONSULTA usando RESUMEN del contexto

SEMÁNTICA DE BALANCE:
- liquid/savings: balance = plata disponible (positivo).
- credit: balance = DEUDA actual. Disponible = credit_limit - balance.
Para tarjetas de crédito, type = "credit".
Si no mencionó cierre/vencimiento, preguntar.

FORMATOS:
Crear cuenta: {"action":"CREATE_ACCOUNT","mensaje_respuesta":"Listo, agregué [nombre]. ¿Cuánto tenés ahí ahora?","data":{"name":"nombre","type":"liquid","balance":0,"icon":"emoji","color":"text-blue-400","set_as_default":false}}
Actualizar saldo: {"action":"UPDATE_ACCOUNT_BALANCE","mensaje_respuesta":"Actualizado. Ahora tenés $X en [cuenta]. ¿Registramos algún movimiento?","data":{"account_name":"nombre","new_balance":numero}}`;

// ─── PROMPT COMPLEJO ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT_COMPLEJO = `
━━━ ROL: ANÁLISIS COMPLEJO — EL CONSULTOR PERSONAL ━━━━━━━━

Usá TODO el contexto. Para tendencias → HISTORIAL. Para optimización → datos reales.

━━━ PREGUNTAS QUE AHORA RESPONDÉS ━━━━━━━━━━━━━━━━━━━━━━━━

"¿Cuánto necesito para vivir un mes sin ingresos?"
→ gasto_minimo_mensual del historial. Cuántos meses da el saldo actual.
→ Si < 3 meses: decírselo con claridad. Sugerir fondo de emergencia.

"¿Si me quedo sin trabajo cuánto aguanto?"
→ liquid_balance / gasto_minimo_mensual = meses. Dar el número exacto.
→ Comparar vs recomendación estándar (3-6 meses).

"¿Cómo estoy comparado con lo que debería tener?"
→ Regla 50/30/20: esenciales ≤50%, discrecionales ≤30%, ahorro ≥20%.
→ Calcular los % reales y decir dónde está vs la regla.
→ Una observación concreta, no una lista de problemas.

"¿Qué pasa con mi plata si me quedo sin trabajo?"
→ Igual que arriba + qué categorías podría recortar primero para extender el tiempo.

━━━ PATRONES DE COMPORTAMIENTO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UN solo patrón por respuesta — el más relevante.
- dia_pico con factor > 1.5: número exacto + observación
- tendencia_mes: cambio en pesos + qué categoría lo explica
- hormiga (pct > 15%): dato anual acumulado

━━━ USUARIO SIN TRANSACCIONES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROHIBIDO: "no tenés datos". OBLIGATORIO: estimá con heurísticas, explicá el supuesto.

━━━ UI HINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

progress_bar / category_chips / goal_card / budget_alert / daily_limit / plan_mensual`;

// ─────────────────────────────────────────────────────────────────────────────
// INTENT CLASSIFIER v3.0
// ─────────────────────────────────────────────────────────────────────────────

function classifyIntent(message: string): BackendIntent {
  const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const hasNumber = /\b\d[\d.,]*k?\b/.test(msg);
  const verbosGasto = /\b(gaste|pague|compre|salio|costo|puse|cargue|transferi|saque|abone|desembolse|pago|liquide|cancele|mande|debi|cargo|cargaron|cobro|salieron|me costaron|me cobro|me cobraron|me debito|me cargo|me descontaron)\b/.test(msg);
  const verbosIngreso = /\b(cobre|me pagaron|entraron|ingrese|recibi|deposite|acredita|acreditaron|cayo|me entro|me entraron|me deposito|me depositaron|me transfirieron|cobro el|cobré mi)\b/.test(msg);
  const frasesRegistroDirecto = /\b(\d[\d.,]*k?\s*(pesos|peso|ars|de ahorro|en ahorro|de sueldo|de honorarios|de freelance|al super|en el super|de alquiler|de expensas|de servicios))\b/.test(msg);
  const multipleNumbers = (msg.match(/\d[\d.,]*k?/g) ?? []).length >= 2;
  const hasComaSeparator = /\d[\d.,]*k?.*[,y].*\d[\d.,]*k?/.test(msg);
  const deudaInformal = /\b(le debo|me deben|me presto|le preste|me devolvio|le devolvi)\b/.test(msg);

  if (hasNumber && (verbosGasto || verbosIngreso || frasesRegistroDirecto || deudaInformal)) return 'registro';
  if (multipleNumbers && hasComaSeparator) return 'registro';

  const patronesSimulacion = /\b(si (dejo|bajo|reduzco|corto|recorto|elimino|paro)|cuanto (ahorraria|ahorro si|me sobraria|me sobra si)|que pasaria si|si (recorto|gasto menos)|podria ahorrar|si no (pido|compro|gasto|salgo)|en cuanto tiempo|cuantos meses para|me alcanza para|puedo pagar el|puedo afrontar|si me aumentan|me aumentaron|distribuir el aumento|como distribuyo|pongo en la meta o|los guardo o)\b/.test(msg);
  if (patronesSimulacion) return 'simulacion';

  const patronesHistoricos = /\b(este (año|anio)|en el año|historico|acumulado|desde (enero|el año)|cuanto (llevo|gaste en|gasté en|gastaste)|mes mas caro|mes (más|mas) caro|mis ultimos|últimos (gastos|movimientos|5|10)|ultimas (transacciones|operaciones)|semana vs fin|fin de semana|mas los (sabados|fines)|dias sin|hace cuanto|cuando fue la ultima|cuanto llevo (sin|gastando)|vengo cumpliendo|meses (cumpli|ahorre|ahorré)|por semana (en promedio|cuanto)|promedio (semanal|por semana)|en total (este|el) (año|anio)|cuanto (subi|baje|cambio) (mis|los|en)|comparado con el (mes|anterior|anio)|gaste mas|gaste menos|subi o baje)\b/.test(msg);
  if (patronesHistoricos) return 'consulta_historica';

  const patronesIdentidad = /\b(soy bueno ahorrando|soy gastador|como soy con la plata|mi perfil financiero|como me ves financieramente|soy ordenado|tengo buena relacion con la plata)\b/.test(msg);
  if (patronesIdentidad) return 'consulta_historica';

  const patronesSeguridad = /\b(si me quedo sin trabajo|cuanto tiempo aguanto|fondo de emergencia|vivir sin trabajar|cuantos meses aguanto|sin ingresos cuanto|me quedo sin laburo|pierdo el trabajo)\b/.test(msg);
  if (patronesSeguridad) return 'simulacion';

  const patronesBenchmark = /\b(comparado con|como estoy vs|deberia tener|regla del|50.?30.?20|tres sueldos|seis sueldos|fondo recomendado|estoy bien financieramente|estoy mal financieramente)\b/.test(msg);
  if (patronesBenchmark) return 'complejo';

  const patronesDiaPico = /\b(que dia gasto mas|dia (que )?mas (gasto|gaste)|dia pico|gasto (mas )?los (lunes|martes|miercoles|jueves|viernes|sabados?|domingos?))\b/.test(msg);
  if (patronesDiaPico) return 'consulta_historica';

  const patronesCuotas = /\b(me conviene (pagar en )?cuotas|cuotas o contado|conviene financiar|en cuantas cuotas conviene|pago (de )?contado o cuotas)\b/.test(msg);
  if (patronesCuotas) return 'simulacion';

  const patronesAnual = /\b(gaste en total (este )?a[ñn]o|cuanto gaste este a[ñn]o|total del a[ñn]o|resumen anual|balance anual|mi año en numeros)\b/.test(msg);
  if (patronesAnual) return 'consulta_historica';

  const patronesBienestar = /\b(cuando puedo (tomarme )?vacaciones|cuando puedo dejar de trabajar|me puedo dar el lujo|me lo puedo permitir|puedo dejar el trabajo|sabbatical|cuando me jubilo|plata para vivir sin trabajar)\b/.test(msg);
  if (patronesBienestar) return 'simulacion';

  const patronesSaludFinanciera = /\b(estoy gastando bien|gasto en lo correcto|distribucion (de )?mis gastos|como deberia gastar|como deberia distribuir|en que deberia gastar mas|en que deberia gastar menos)\b/.test(msg);
  if (patronesSaludFinanciera) return 'complejo';

  const deudaConNumero = /\b(le debo|me deben|me debe|le debe)\b/.test(msg);
  if (deudaConNumero && hasNumber) return 'registro';

  const patronesPlanificacion = /\b(plan|planificar|proximos meses|ahorrar para|como distribuyo|organizar|quiero irme|viaje en|vacaciones en|fondo de emergencia|invertir|optimizar presupuesto|como llego a|en cuanto tiempo llego a|cuando puedo comprar|cuando podria tener)\b/.test(msg);
  if (patronesPlanificacion) return 'planificacion';

  const patronesCuentas =
    /\b(en mp|en mercado pago|en ual[aá]|en prex|en el banco|mi cuenta|mis cuentas|agregar cuenta|nueva cuenta|saldo|disponible|actualizar cuenta)\b/.test(msg) ||
    /\d[\d.,]*k?\s+(en|en el|en la)\s+(mp|mercado pago|ual[aá]|prex|banco|bbva|galicia|naranja|visa|mastercard|amex|brubank|uala|lemon|belo)\b/.test(msg) ||
    (/\b(cuanto tengo|cuanto hay|cuanta plata|cuanto me queda en)\b/.test(msg) && !hasNumber);
  if (patronesCuentas) return 'gestion_cuentas';

  const patronesConsulta = /\b(como voy|cuanto puedo|puedo comprar|puedo gastar|me alcanza para|cuanto gaste|resumen|estado del mes|en que gaste|donde gaste|cuanto llevo|cuanto me sobra|cuanto me falta|como estoy|como anda|cuanto queda en|cuanto me queda en)\b/.test(msg);
  if (patronesConsulta) return 'consulta_simple';

  return 'complejo';
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDynamicContext — sin cambios
// ─────────────────────────────────────────────────────────────────────────────

function buildDynamicContext(
  intent: BackendIntent,
  context: RequestContext,
  accountsData: AccountRow[],
  serverResolvedAccountId: string | null,
  liquidBalance: number,
  savingsBalance: number,
  creditDebt: number,
  creditLimit: number,
  realDisponible: number,
  unpaidInstallmentsTotal: number
): string {
  const fecha = context.fecha_hoy ?? new Date().toISOString().split('T')[0];
  const usuario = context.nombre_usuario ?? 'no disponible';

  const estadoBase = `ESTADO: ${context.estado_mes ?? 'sin datos'} | libre: $${(context.dinero_libre ?? 0).toLocaleString('es-AR')} | por día: $${(context.gasto_diario_recomendado ?? 0).toLocaleString('es-AR')} | días restantes: ${context.dias_restantes ?? 0}`;

  if (intent === 'registro') {
    const userCategoryNames = context.budgets?.map(b => `"${b.categoria}"`).join(', ') ?? '';

    const categorias = (
      context.budgets
        ?.map((b) => `- "${b.categoria}" (gastado: $${b.gastado.toLocaleString('es-AR')} de $${b.limite.toLocaleString('es-AR')}, estado: ${b.estado})`)
        .join('\n') ?? 'Sin categorías configuradas'
    ) + `\n\nREGLA DE CATEGORIZACIÓN — OBLIGATORIA:`
      + `\nUsá EXACTAMENTE estos nombres de categoría: ${userCategoryNames || '"otros"'}.`
      + `\nNunca inventes un nombre que no esté en esa lista.`
      + `\nSi el gasto no encaja claramente en ninguna → usá "otros".`;

    const cuentaResuelta = serverResolvedAccountId
      ? (() => {
          const acc = accountsData.find(a => a.id === serverResolvedAccountId);
          return acc
            ? `CUENTA RESUELTA: "${acc.name}" (tipo: ${acc.type}, id: ${serverResolvedAccountId})`
            : `CUENTA RESUELTA: id ${serverResolvedAccountId}`;
        })()
      : 'CUENTA RESUELTA: ninguna — account_id = null, NO menciones cuenta en la confirmación';

    const historicoCats = context.historico?.categorias
      ?.map(c => `- "${c.categoria}": promedio $${c.promedio_mensual.toLocaleString('es-AR')}/mes`)
      .join('\n') ?? '';

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      ``,
      `CATEGORÍAS DISPONIBLES (con estado actual del mes):`,
      categorias,
      ``,
      cuentaResuelta,
      historicoCats ? `\nHISTÓRICO POR CATEGORÍA (para detectar gastos inusuales):\n${historicoCats}` : '',
    ].filter(s => s !== undefined).join('\n');
  }

  if (intent === 'simulacion') {
    const simulacionesStr = context.simulaciones
      ?.map(s => `- ${s.categoria}: actual $${s.gastoMensualActual.toLocaleString('es-AR')}/mes | si recorta 50% ahorra $${s.ahorroMensual.toLocaleString('es-AR')}/mes | 6m: $${s.ahorro6Meses.toLocaleString('es-AR')} | 12m: $${s.ahorro12Meses.toLocaleString('es-AR')}`)
      .join('\n') ?? 'Sin simulaciones disponibles';

    const metasStr = context.goals
      ?.map(g => `- ${g.nombre}: falta $${g.faltante.toLocaleString('es-AR')} de $${g.objetivo.toLocaleString('es-AR')}`)
      .join('\n') ?? 'Sin metas activas';

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      estadoBase,
      ``,
      `SIMULACIONES PRE-CALCULADAS (50% de reducción por categoría discrecional):`,
      simulacionesStr,
      ``,
      `METAS ACTIVAS:`,
      metasStr,
      ``,
      `INGRESO MENSUAL: $${(context.ingreso_mensual ?? 0).toLocaleString('es-AR')}`,
      `OBJETIVO AHORRO: $${(context.objetivo_ahorro ?? 0).toLocaleString('es-AR')}`,
      `SALDO LÍQUIDO: $${liquidBalance.toLocaleString('es-AR')}`,
      `GASTO MÍNIMO MENSUAL: $${(context.historico?.gasto_minimo_mensual ?? 0).toLocaleString('es-AR')}`,
      `MESES DE RESERVA: ${context.historico?.gasto_minimo_mensual ? (liquidBalance / context.historico.gasto_minimo_mensual).toFixed(1) : 'sin datos'}`,
      ``,
      `CONTEXTO HISTÓRICO:`,
      context.historico_completo ?? 'Sin historial disponible',
    ].join('\n');
  }

  if (intent === 'consulta_historica') {
    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      estadoBase,
      ``,
      `CONTEXTO HISTÓRICO COMPLETO:`,
      context.historico_completo ?? 'Sin historial disponible',
      ``,
      `ESTADO ACTUAL MES:`,
      context.resumen_financiero ?? 'Sin datos del mes actual',
      ``,
      `SALDO LÍQUIDO TOTAL: $${liquidBalance.toLocaleString('es-AR')}`,
      `GASTO MÍNIMO MENSUAL (esenciales): $${(context.historico?.gasto_minimo_mensual ?? 0).toLocaleString('es-AR')}`,
      `MESES DE RESERVA: ${context.historico?.gasto_minimo_mensual ? (liquidBalance / context.historico.gasto_minimo_mensual).toFixed(1) : 'sin datos'}`,
    ].join('\n');
  }

  if (intent === 'planificacion') {
    const metasStr = context.goals
      ?.map(g => `- ${g.nombre}: actual $${g.actual.toLocaleString('es-AR')} | objetivo $${g.objetivo.toLocaleString('es-AR')} | falta $${g.faltante.toLocaleString('es-AR')}`)
      .join('\n') ?? 'Sin metas';

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      estadoBase,
      ``,
      `INGRESO MENSUAL: $${(context.ingreso_mensual ?? 0).toLocaleString('es-AR')}`,
      `OBJETIVO AHORRO: $${(context.objetivo_ahorro ?? 0).toLocaleString('es-AR')}`,
      `DINERO LIBRE: $${(context.dinero_libre ?? 0).toLocaleString('es-AR')}`,
      ``,
      `METAS ACTIVAS:`,
      metasStr,
      ``,
      `CONTEXTO HISTÓRICO:`,
      context.historico_completo ?? 'Sin historial',
      ``,
      `SIMULACIONES DISPONIBLES:`,
      context.simulaciones
        ?.map(s => `- ${s.categoria}: ahorra $${s.ahorroMensual.toLocaleString('es-AR')}/mes si recorta 50%`)
        .join('\n') ?? 'Sin simulaciones',
      ``,
      `HISTORIAL DETALLADO:`,
      `Gasto promedio mensual: $${context.historico?.gasto_mensual_promedio?.toLocaleString('es-AR') ?? 'sin datos'}`,
      `Gasto mínimo mensual: $${context.historico?.gasto_minimo_mensual?.toLocaleString('es-AR') ?? 'sin datos'}`,
    ].join('\n');
  }

  if (intent === 'gestion_cuentas') {
    const listaCuentas = accountsData.length === 0
      ? 'Sin cuentas registradas.'
      : accountsData.map((a) => {
          const tag = a.is_default ? ' ← DEFAULT' : '';
          const isCredit = a.type === 'credit';
          const extra = isCredit
            ? ` | deuda: $${Number(a.balance).toLocaleString('es-AR')} | límite: $${Number(a.credit_limit ?? 0).toLocaleString('es-AR')} | disponible: $${Math.max(0, Number(a.credit_limit ?? 0) - Number(a.balance)).toLocaleString('es-AR')}`
            : ` | saldo: $${Number(a.balance).toLocaleString('es-AR')}`;
          const days = isCredit && (a.closing_day || a.due_day)
            ? ` | cierre: día ${a.closing_day ?? '?'}, vence: día ${a.due_day ?? '?'}`
            : '';
          return `- "${a.name}" [${a.type}]${extra}${days} | id: ${a.id}${tag}`;
        }).join('\n');

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      ``,
      `CUENTAS ACTUALES:`,
      listaCuentas,
      ``,
      `RESUMEN:`,
      `  liquid: $${liquidBalance.toLocaleString('es-AR')}`,
      `  savings: $${savingsBalance.toLocaleString('es-AR')}`,
      `  deuda tarjetas: $${creditDebt.toLocaleString('es-AR')}`,
      `  límite tarjetas: $${creditLimit.toLocaleString('es-AR')}`,
      `  real disponible: $${realDisponible.toLocaleString('es-AR')} (liquid − deuda)`,
      `  cuotas impagas: $${unpaidInstallmentsTotal.toLocaleString('es-AR')}`,
    ].join('\n');
  }

  if (intent === 'consulta_simple') {
    const alertasStr = context.alertas && context.alertas.length > 0
      ? `ALERTAS:\n${context.alertas.map((a) => `- ${a}`).join('\n')}`
      : '';

    const presupuestos = context.budgets
      ?.map((b) => `- ${b.categoria}: $${b.gastado.toLocaleString('es-AR')}/$${b.limite.toLocaleString('es-AR')} (${b.estado})`)
      .join('\n') ?? 'Sin presupuestos';

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      ``,
      estadoBase,
      alertasStr,
      ``,
      `PRESUPUESTOS:`,
      presupuestos,
      ``,
      `RESUMEN FINANCIERO:`,
      context.resumen_financiero ?? 'Sin datos disponibles',
      context.perfil_coach ? `\n${context.perfil_coach}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── COMPLEJO (fallback) ────────────────────────────────────────────────────
  const listaCuentasCompleta = accountsData.length === 0
    ? 'Sin cuentas — omitir account_id en transacciones.'
    : accountsData.map((a) => {
        const tag = a.is_default ? ' ← DEFAULT' : '';
        const isCredit = a.type === 'credit';
        const extra = isCredit
          ? ` | deuda: $${Number(a.balance).toLocaleString('es-AR')} | límite: $${Number(a.credit_limit ?? 0).toLocaleString('es-AR')}`
          : ` | saldo: $${Number(a.balance).toLocaleString('es-AR')}`;
        return `- "${a.name}" | tipo: ${a.type}${extra} | id: ${a.id}${tag}`;
      }).join('\n');

  return [
    `FECHA: ${fecha}`,
    `USUARIO: ${usuario}`,
    ``,
    `SITUACIÓN FINANCIERA ACTUAL:`,
    context.resumen_financiero ?? 'Sin datos disponibles',
    ``,
    estadoBase,
    ``,
    `CATEGORÍAS EXACTAS:`,
    context.budgets?.map((b) => `- "${b.categoria}": $${b.gastado.toLocaleString('es-AR')}/$${b.limite.toLocaleString('es-AR')} (${b.estado})`).join('\n') ?? 'Sin categorías',
    ``,
    `METAS:`,
    context.goals?.map((g) =>
      `- ${g.nombre}: $${g.actual.toLocaleString('es-AR')} de $${g.objetivo.toLocaleString('es-AR')} (falta $${g.faltante.toLocaleString('es-AR')})`
    ).join('\n') ?? 'Sin metas',
    ``,
    `CUENTAS:`,
    listaCuentasCompleta,
    ``,
    `CUENTA RESUELTA: ${serverResolvedAccountId ? `id ${serverResolvedAccountId}` : 'ninguna — account_id = null'}`,
    ``,
    context.perfil_coach ?? '',
    ``,
    `ALERTAS:`,
    context.alertas?.map((a) => `- ${a}`).join('\n') ?? 'Sin alertas',
    ``,
    `CONTEXTO HISTÓRICO:`,
    context.historico_completo ?? 'Sin historial',
    ``,
    `HISTORIAL DETALLADO:`,
    `Gasto promedio mensual: $${context.historico?.gasto_mensual_promedio?.toLocaleString('es-AR') ?? 'sin datos'}`,
    `Gasto mínimo mensual: $${context.historico?.gasto_minimo_mensual?.toLocaleString('es-AR') ?? 'sin datos'}`,
    ``,
    `CATEGORÍAS ANALIZADAS:`,
    context.historico?.categorias?.map((c) =>
      `- ${c.categoria} [${c.tipo.toUpperCase()}]: prom $${c.promedio_mensual?.toLocaleString('es-AR')}/mes | este mes: $${c.gasto_este_mes?.toLocaleString('es-AR') ?? '0'}`
    ).join('\n') ?? 'Sin historial',
    ``,
    `RESUMEN CUENTAS:`,
    `  total_liquid: $${liquidBalance.toLocaleString('es-AR')}`,
    `  deuda tarjetas: $${creditDebt.toLocaleString('es-AR')}`,
    `  real_disponible: $${realDisponible.toLocaleString('es-AR')}`,
    `  cuotas_impagas: $${unpaidInstallmentsTotal.toLocaleString('es-AR')}`,
    `  gasto_minimo_mensual: $${(context.historico?.gasto_minimo_mensual ?? 0).toLocaleString('es-AR')}`,
    `  meses_de_reserva: ${context.historico?.gasto_minimo_mensual ? (liquidBalance / context.historico.gasto_minimo_mensual).toFixed(1) : 'sin datos'}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(intent: BackendIntent): string {
  switch (intent) {
    case 'registro':           return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_REGISTRO;
    case 'consulta_simple':    return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_CONSULTA;
    case 'consulta_historica': return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_HISTORICO;
    case 'simulacion':         return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_SIMULACION;
    case 'planificacion':      return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_PLANIFICACION;
    case 'gestion_cuentas':    return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_GESTION_CUENTAS;
    case 'complejo':
      return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_COMPLEJO + SYSTEM_PROMPT_HISTORICO + SYSTEM_PROMPT_SIMULACION;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Historia y max_tokens dinámicos
// ─────────────────────────────────────────────────────────────────────────────

function getHistorySlice(
  intent: BackendIntent,
  history: Array<{ role: string; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const limits: Record<BackendIntent, number> = {
    registro: 4, gestion_cuentas: 2, consulta_simple: 4,
    consulta_historica: 4, simulacion: 4, planificacion: 6, complejo: 6,
  };
  return history.slice(-limits[intent]).map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}

function getMaxTokens(intent: BackendIntent): number {
  const limits: Record<BackendIntent, number> = {
    registro: 450, gestion_cuentas: 250, consulta_simple: 400,
    consulta_historica: 600, simulacion: 700, planificacion: 900, complejo: 800,
  };
  return limits[intent];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  name: string;
  type: 'liquid' | 'credit' | 'savings';
  balance: number;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  is_default: boolean;
}

interface GoalRow {
  id: string;
  name: string;
  is_active: boolean;
  is_completed: boolean;
}

interface BudgetRow {
  id: string;
  category: string;
  custom_aliases: string[];
}

interface InstallmentRow {
  amount: number;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// cleanAndParseAIResponse — sin cambios
// ─────────────────────────────────────────────────────────────────────────────

function cleanAndParseAIResponse(raw: string): ChatResponse {
  const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = mdMatch ? mdMatch[1].trim() : raw.trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ChatResponse> & {
        ui?: { type: string; data: Record<string, unknown> };
      };
      if (parsed.action && parsed.mensaje_respuesta !== undefined) {
        return {
          action: parsed.action ?? 'RESPUESTA_CONSULTA',
          mensaje_respuesta: parsed.mensaje_respuesta ?? 'Procesé tu solicitud.',
          data: parsed.data ?? {},
          ...(parsed.ui ? { ui: parsed.ui } : {}),
        } as ChatResponse;
      }
    } catch { /* silenciar */ }
  }

  const actionMatch = cleaned.match(/"action"\s*:\s*"([^"]+)"/);
  const mensajeMatch = cleaned.match(/"mensaje_respuesta"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (actionMatch && mensajeMatch) {
    const action = actionMatch[1];
    const mensaje = mensajeMatch[1]
      .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    let data: Record<string, unknown> = {};
    if (action === 'INSERT_TRANSACTIONS_BATCH') {
      try {
        const txMatch = cleaned.match(/"transactions"\s*:\s*(\[[\s\S]*?\](?=\s*\}))/);
        if (txMatch) data = { transactions: JSON.parse(txMatch[1]) };
      } catch { /* silenciar */ }
    }

    return {
      action: action as ChatResponse['action'],
      mensaje_respuesta: mensaje,
      data,
    } as ChatResponse;
  }

  return { action: 'RESPUESTA_CONSULTA', mensaje_respuesta: 'Procesé tu solicitud.', data: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveTransactionsToSupabase
// SECURITY FIX: recibe cliente ya autenticado, no crea nuevas instancias.
// SECURITY FIX: .eq('user_id', userId) explícito en query de accounts.
// ─────────────────────────────────────────────────────────────────────────────

interface TransactionPayload {
  description?: string;
  descripcion?: string;
  amount?: number;
  monto?: number;
  category?: string;
  categoria?: string;
  type?: string;
  tipo?: string;
  transaction_date?: string;
  fecha?: string;
  confirmed?: boolean;
  account_id?: string | null;
  installment_count?: number;
  first_due_month?: string | null;
}

async function saveTransactionsToSupabase(
  transacciones: TransactionPayload[],
  originalMessage: string,
  userId: string,
  budgetsData: BudgetRow[],
  goalsData: GoalRow[],
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
  resolvedAccountId: string | null,
  contextAccountId?: string | null,
): Promise<void> {
  const userCategories = budgetsData.map(b => b.category);
  const budgetAliases: Record<string, string[]> = {};
  for (const b of budgetsData) {
    budgetAliases[b.category] = Array.isArray(b.custom_aliases) ? b.custom_aliases : [];
  }

  const transactionsToInsert: TransactionInsert[] = transacciones.map((tx) => {
    const rawCategory = (tx.category ?? tx.categoria ?? '').toLowerCase().trim();
    const normalizedCategory = resolveCategory(rawCategory, userCategories, budgetAliases);
    const budgetMatch = budgetsData.find(b => b.category === normalizedCategory);
    const goalMatch =
      normalizedCategory === 'ahorro'
        ? goalsData.find(g => g.is_active && !g.is_completed)
        : undefined;

    return {
      description:      tx.description ?? tx.descripcion ?? 'Sin descripción',
      amount:           Math.abs(Number(tx.amount ?? tx.monto) || 0),
      category:         normalizedCategory,
      type:             (tx.type ?? tx.tipo ?? 'gasto') as 'gasto' | 'ingreso',
      transaction_date: tx.transaction_date ?? tx.fecha ?? new Date().toISOString().split('T')[0],
      confirmed:        tx.confirmed ?? false,
      source:           'voice' as const,
      original_message: originalMessage,
      ai_confidence:    0.95,
      user_id:          userId,
      budget_id:        budgetMatch?.id ?? undefined,
      goal_id:          goalMatch?.id ?? undefined,
      account_id:       tx.account_id ?? resolvedAccountId ?? contextAccountId ?? null,
      installment_count: tx.installment_count ?? 1,
      first_due_month:  tx.first_due_month ?? undefined,
    };
  });

  const { data, error } = await supabaseClient
    .from('transactions')
    .insert(
      transactionsToInsert.map(
        ({ installment_count: _ic, first_due_month: _fd, ...rest }) => rest
      )
    )
    .select();

  if (error) throw handleSupabaseError(error);

  if (data && data.length > 0) {
    for (let idx = 0; idx < data.length; idx++) {
      const saved = data[idx] as { id: string; account_id: string | null; amount: number };
      const txExtra = transactionsToInsert[idx];
      if (!saved.account_id) continue;

      const { data: accData } = await supabaseClient
        .from('accounts')
        .select('type')
        .eq('id', saved.account_id)
        .eq('user_id', userId)   // ← SECURITY FIX: autorización explícita
        .single();

      if ((accData as { type?: string } | null)?.type !== 'credit') continue;

      const installCount = (txExtra as TransactionInsert & { installment_count?: number }).installment_count ?? 1;
      const firstDueMonth =
        (txExtra as TransactionInsert & { first_due_month?: string }).first_due_month ??
        new Date().toISOString().slice(0, 7);

      await generateInstallments(
        saved.id, saved.account_id, userId,
        saved.amount, installCount, firstDueMonth, supabaseClient
      );
    }
  }
}

function ensureGoalEmoji(goalName: string): string {
  const hasEmoji = /[\u2600-\u26FF\u2700-\u27BF\u1F300-\u1F9FF\u1FA00-\u1FA6F]/.test(goalName);
  if (hasEmoji) return goalName;

  const emojiMap: Record<string, string> = {
    moto: '🏍️', auto: '🚗', bicicleta: '🚲', celular: '📱', computadora: '💻',
    notebook: '💻', casa: '🏠', departamento: '🏠', viaje: '✈️', vacaciones: '🏖️',
    emergencia: '🚨', ahorro: '💰', inversión: '📈', estudio: '📚', carrera: '🎓',
    salud: '🏥', regalo: '🎁', casamiento: '💒', mascota: '🐕', música: '🎵',
    fútbol: '⚽', negocio: '💼', familia: '👨‍👩‍👧‍👦', bebé: '🍼',
  };

  const lower = goalName.toLowerCase();
  for (const [kw, em] of Object.entries(emojiMap)) {
    if (lower.includes(kw)) return `${em} ${goalName}`;
  }
  return `🎯 ${goalName}`;
}

async function createGoalInSupabase(
  goalData: Record<string, unknown>,
  userId: string,
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
): Promise<void> {
  const { error } = await supabaseClient.from('goals').insert({
    name:           ensureGoalEmoji(String(goalData.name ?? goalData.title ?? 'Meta sin nombre')),
    target_amount:  goalData.target_amount,
    current_amount: goalData.current_amount ?? 0,
    target_date:    goalData.target_date ?? null,
    description:    goalData.description ?? '',
    icon:           goalData.icon ?? '🎯',
    color:          goalData.color ?? 'text-emerald-500',
    user_id:        userId,
  });
  if (error) throw handleSupabaseError(error);
}

async function createAccountInSupabase(
  data: {
    name: string;
    type: 'liquid' | 'credit' | 'savings';
    balance: number;
    credit_limit?: number;
    closing_day?: number;
    due_day?: number;
    icon?: string;
    color?: string;
    set_as_default?: boolean;
  },
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
  userId: string
): Promise<Record<string, unknown>> {
  if (data.set_as_default) {
    await supabaseClient
      .from('accounts').update({ is_default: false })
      .eq('user_id', userId).eq('type', data.type).eq('is_default', true);
  }

  const { data: account, error } = await supabaseClient
    .from('accounts')
    .insert({
      user_id: userId, name: data.name, type: data.type.toLowerCase(),
      balance: data.balance ?? 0, credit_limit: data.credit_limit ?? null,
      closing_day: data.closing_day ?? null, due_day: data.due_day ?? null,
      icon: data.icon ?? null, color: data.color ?? null,
      is_default: data.set_as_default ?? false, is_active: true, currency: 'ARS',
    })
    .select().single();

  if (error) throw error;
  return account as Record<string, unknown>;
}

async function updateAccountBalanceInSupabase(
  data: { account_name: string; new_balance: number },
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
  userId: string
): Promise<{ updated: boolean; accountName: string; suggestion?: string }> {
  const { data: accounts, error } = await supabaseClient
    .from('accounts').select('id, name, type, balance')
    .eq('user_id', userId)       // ← SECURITY FIX: autorización explícita
    .eq('is_active', true)
    .ilike('name', `%${data.account_name}%`);

  if (error) throw handleSupabaseError(error);

  if (!accounts || accounts.length === 0) {
    return { updated: false, accountName: data.account_name, suggestion: `No encontré ninguna cuenta con ese nombre. ¿Querés crearla?` };
  }

  const target = accounts[0] as { id: string; name: string };
  const { error: updateErr } = await supabaseClient
    .from('accounts').update({ balance: data.new_balance })
    .eq('id', target.id)
    .eq('user_id', userId);      // ← SECURITY FIX: doble seguro en update
  if (updateErr) throw handleSupabaseError(updateErr);
  return { updated: true, accountName: target.name };
}

async function createBudgetInSupabase(
  budgetData: Record<string, unknown>,
  userId: string,
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
): Promise<void> {
  const { error } = await supabaseClient.from('budgets').insert({
    category:     String(budgetData.category ?? '').toLowerCase().trim(),
    limit_amount: budgetData.limit_amount,
    month_period: String(budgetData.month_period ?? '') || new Date().toISOString().slice(0, 7),
    user_id:      userId,
  });
  if (error) throw handleSupabaseError(error);
}

async function updateGoalProgressInSupabase(
  goalName: string,
  amount: number,
  userId: string,
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
  createIfMissing: boolean = true
): Promise<void> {
  const { data: existingGoals, error: searchError } = await supabaseClient
    .from('goals').select('*')
    .eq('user_id', userId)       // ← SECURITY FIX: autorización explícita
    .ilike('name', `%${goalName}%`).eq('is_active', true);

  if (searchError) throw handleSupabaseError(searchError);

  const targetGoal = (existingGoals as Array<{ id: string; current_amount: number; target_amount: number }> | null)?.[0];

  if (!targetGoal && createIfMissing) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 6);
    const { error: createError } = await supabaseClient.from('goals').insert({
      user_id: userId, name: ensureGoalEmoji(goalName),
      target_amount: amount * 10, current_amount: amount,
      target_date: targetDate.toISOString().split('T')[0],
      description: `Meta creada automáticamente para "${goalName}"`,
      icon: '🎯', color: 'text-emerald-500',
    });
    if (createError) throw handleSupabaseError(createError);
    return;
  }

  if (!targetGoal) throw new Error(`No se encontró meta "${goalName}"`);

  const newAmount = targetGoal.current_amount + amount;
  const isCompleted = newAmount >= targetGoal.target_amount;
  const { error } = await supabaseClient.from('goals')
    .update({ current_amount: newAmount, is_completed: isCompleted })
    .eq('id', targetGoal.id)
    .eq('user_id', userId);      // ← SECURITY FIX: doble seguro en update
  if (error) throw handleSupabaseError(error);
}

async function resolveAccount(
  userId: string,
  message: string,
  context: RequestContext,
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
): Promise<{ account_id: string | null; error: string | null }> {
  const { data: accounts, error } = await supabaseClient
    .from('accounts').select('id, name, type, is_default')
    .eq('user_id', userId)       // ← SECURITY FIX: autorización explícita
    .eq('is_active', true);

  if (error || !accounts || accounts.length === 0) return { account_id: null, error: null };

  const typedAccounts = accounts as Array<{ id: string; name: string; type: string; is_default: boolean }>;
  const msgLower = message.toLowerCase();

  for (const acc of typedAccounts) {
    if (msgLower.includes(acc.name.toLowerCase())) return { account_id: acc.id, error: null };
  }

  if (context.resolved_account_id) return { account_id: context.resolved_account_id, error: null };

  const defaultLiquid = typedAccounts.find(a => a.is_default && a.type === 'liquid');
  if (defaultLiquid) return { account_id: defaultLiquid.id, error: null };

  const liquidAccounts = typedAccounts.filter(a => a.type === 'liquid');
  if (liquidAccounts.length === 1) return { account_id: liquidAccounts[0].id, error: null };

  const anyDefault = typedAccounts.find(a => a.is_default);
  if (anyDefault) return { account_id: anyDefault.id, error: null };

  const names = typedAccounts.map(a => `"${a.name}"`).join(', ');
  return { account_id: null, error: `Tenés varias cuentas (${names}). ¿En cuál querés registrar esto?` };
}

async function generateInstallments(
  transactionId: string, accountId: string, userId: string,
  totalAmount: number, installmentCount: number, firstDueMonth: string,
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
): Promise<void> {
  const [yearStr, monthStr] = firstDueMonth.split('-');
  const baseYear = parseInt(yearStr, 10);
  const baseMonth = parseInt(monthStr, 10) - 1;
  const installmentAmount = Math.round((totalAmount / installmentCount) * 100) / 100;

  const records = Array.from({ length: installmentCount }, (_, i) => {
    const d = new Date(baseYear, baseMonth + i, 1);
    const due_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      transaction_id: transactionId, account_id: accountId, user_id: userId,
      installment_number: i + 1, total_installments: installmentCount,
      due_month, amount: installmentAmount, is_paid: false,
    };
  });

  const { error } = await supabaseClient.from('installments').insert(records);
  if (error) throw error;
}

interface ActionResult {
  success: boolean;
  message?: string;
  suggestion?: string;
  data?: Record<string, unknown>;
  action?: string;
  mensaje_respuesta?: string;
}

// SECURITY FIX: executeAction recibe el cliente ya autenticado — no crea nuevas instancias
async function executeAction(
  action: string,
  data: Record<string, unknown> | null,
  originalMessage: string,
  userId: string,
  budgetsData: BudgetRow[],
  goalsData: GoalRow[],
  supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>,
  resolvedAccountId: string | null,
  contextAccountId?: string | null,
): Promise<ActionResult> {
  switch (action) {
    case 'INSERT_TRANSACTION': {
      await saveTransactionsToSupabase([data as TransactionPayload], originalMessage, userId, budgetsData, goalsData, supabaseClient, resolvedAccountId, contextAccountId);
      return { success: true, message: 'Transacción guardada' };
    }
    case 'INSERT_TRANSACTIONS_BATCH': {
      const txArray = (data?.transactions ?? []) as TransactionPayload[];
      if (!Array.isArray(txArray) || txArray.length === 0) throw new Error('Batch vacío o inválido');
      await saveTransactionsToSupabase(txArray, originalMessage, userId, budgetsData, goalsData, supabaseClient, resolvedAccountId, contextAccountId);
      return { success: true, message: `${txArray.length} transacciones guardadas` };
    }
    case 'CREATE_GOAL':
      await createGoalInSupabase(data as Record<string, unknown>, userId, supabaseClient);
      return { success: true, message: 'Meta creada' };
    case 'CREATE_BUDGET':
      await createBudgetInSupabase(data as Record<string, unknown>, userId, supabaseClient);
      return { success: true, message: 'Presupuesto creado' };
    case 'CREATE_ACCOUNT': {
      const account = await createAccountInSupabase(data as Parameters<typeof createAccountInSupabase>[0], supabaseClient, userId);
      return { success: true, mensaje_respuesta: 'Cuenta creada exitosamente', action: 'CREATE_ACCOUNT', data: account };
    }
    case 'UPDATE_ACCOUNT_BALANCE': {
      const result = await updateAccountBalanceInSupabase(data as { account_name: string; new_balance: number }, supabaseClient, userId);
      if (!result.updated && result.suggestion) return { success: false, suggestion: result.suggestion, message: result.suggestion };
      return { success: true, message: `Balance actualizado en ${result.accountName}` };
    }
    case 'UPDATE_GOAL_PROGRESS':
      await updateGoalProgressInSupabase(String(data?.goal_name ?? ''), Number(data?.amount ?? 0), userId, supabaseClient, Boolean(data?.create_if_missing ?? true));
      return { success: true, message: 'Progreso actualizado' };
    case 'QUERY_BUDGET':
    case 'QUERY_GOALS':
    case 'QUERY_TRANSACTIONS':
    case 'RESPUESTA_CONSULTA':
    case 'RESPUESTA_HISTORICA':
    case 'RESPUESTA_SIMULACION':
    case 'PLAN_MENSUAL':
      return { success: true, message: originalMessage };
    case 'ERROR':
      throw new Error(String(data?.mensaje_respuesta ?? 'Error en el procesamiento'));
    default:
      return { success: true, message: originalMessage };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Autenticación ─────────────────────────────────────────────────────
    const authHeader     = request.headers.get('Authorization');
    const internalUserId = request.headers.get('x-internal-user-id');
    const internalSecret = request.headers.get('x-internal-secret');

    const isInternalCall =
      internalUserId &&
      internalSecret &&
      internalSecret === process.env.INTERNAL_API_SECRET;

    let userId: string | null = null;
    let supabaseClient: ReturnType<typeof createSupabaseServerClientWithToken>;

    if (isInternalCall) {
      userId = internalUserId;

      // SECURITY FIX: log de auditoría (sin loguear el secret)
      console.info('[auth] internal call', { userId, ip: request.headers.get('x-forwarded-for') });

      // SECURITY FIX: usar service role que lanza si SUPABASE_SERVICE_ROLE_KEY no está definida
      const serviceClient = createSupabaseServiceClient();

      // SECURITY FIX: verificar que el userId exista antes de operar con él
      const { data: userCheck, error: userErr } = await serviceClient
        .from('user_profiles').select('user_id').eq('user_id', userId).single();
      if (userErr || !userCheck) {
        console.warn('[auth] internal call with unknown userId', { userId });
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 });
      }

      supabaseClient = serviceClient as unknown as ReturnType<typeof createSupabaseServerClientWithToken>;

    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const clientWithToken = createSupabaseServerClientWithToken(token);
      const { data: { user } } = await clientWithToken.auth.getUser();

      if (!user?.id) {
        return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 });
      }

      userId         = user.id;
      supabaseClient = clientWithToken;

    } else {
      // SECURITY FIX: log de llamadas sin autenticación
      console.warn('[auth] unauthenticated request', {
        ip: request.headers.get('x-forwarded-for'),
        ua: request.headers.get('user-agent')?.slice(0, 80),
      });
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // ── 2. Rate limiting ──────────────────────────────────────────────────────
    const { allowed, remaining } = checkRateLimit(`chat:${userId}`);
    if (!allowed) {
      console.warn('[rate-limit] exceeded', { userId });
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Esperá un momento.' },
        { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } }
      );
    }

    // ── 3. Validación del body ────────────────────────────────────────────────
    let parsed: ValidatedRequest;
    try {
      const rawBody = await request.json();
      const result  = requestSchema.safeParse(rawBody);
      if (!result.success) {
        return NextResponse.json(
          { error: 'Input inválido', details: process.env.NODE_ENV === 'development' ? result.error.issues : undefined },
          { status: 400 }
        );
      }
      parsed = result.data;
    } catch {
      return NextResponse.json({ error: 'Body no es JSON válido' }, { status: 400 });
    }

    const { message, context, history } = parsed;

    // ── 4. Fetch de datos ─────────────────────────────────────────────────────
    let budgetsData:  BudgetRow[]  = [];
    let goalsData:    GoalRow[]    = [];
    let accountsData: AccountRow[] = [];
    let unpaidInstallmentsTotal    = 0;

    if (userId) {
      try {
        const [budgetsRes, goalsRes, accountsRes, installmentsRes] = await Promise.all([
          supabaseClient.from('budgets').select('id, category, custom_aliases').eq('user_id', userId),
          supabaseClient.from('goals').select('id, name, is_active, is_completed').eq('user_id', userId).eq('is_active', true),
          supabaseClient.from('accounts').select('id, name, type, balance, credit_limit, closing_day, due_day, is_default').eq('user_id', userId).eq('is_active', true),
          supabaseClient.from('installments').select('amount').eq('user_id', userId).eq('is_paid', false),
        ]);

        budgetsData = ((budgetsRes.data ?? []) as Array<{ id: string; category: string; custom_aliases: unknown }>).map(b => ({
          id: b.id,
          category: b.category,
          custom_aliases: Array.isArray(b.custom_aliases) ? b.custom_aliases as string[] : [],
        }));
        goalsData   = (goalsRes.data ?? []) as GoalRow[];
        accountsData = (accountsRes.data ?? []) as AccountRow[];
        unpaidInstallmentsTotal = ((installmentsRes.data ?? []) as InstallmentRow[]).reduce((s, i) => s + Number(i.amount), 0);
      } catch (err) {
        console.error('[db] fetch error', err instanceof Error ? err.message : err);
      }
    }

    // ── 5. Resolución de cuenta ───────────────────────────────────────────────
    let serverResolvedAccountId: string | null = null;
    const intentForAccountResolution = classifyIntent(message);

    if (userId && intentForAccountResolution === 'registro') {
      const { account_id, error: accError } = await resolveAccount(userId, message, context as RequestContext, supabaseClient);
      if (accError) {
        if (!isInternalCall) {
          const { data: accsForPicker } = await supabaseClient
            .from('accounts').select('id, name, type')
            .eq('user_id', userId).eq('is_active', true);
          return NextResponse.json({
            action: 'NEEDS_ACCOUNT_SELECTION',
            mensaje_respuesta: accError,
            data: { accounts: accsForPicker ?? [], pending_message: message },
          });
        }
      } else {
        serverResolvedAccountId = account_id;
      }
    }

    // ── 6. Cálculos de balances ───────────────────────────────────────────────
    const liquidBalance  = accountsData.filter(a => a.type === 'liquid').reduce((s, a) => s + Number(a.balance), 0);
    const savingsBalance = accountsData.filter(a => a.type === 'savings').reduce((s, a) => s + Number(a.balance), 0);
    const creditDebt     = accountsData.filter(a => a.type === 'credit').reduce((s, a) => s + Number(a.balance), 0);
    const creditLimit    = accountsData.filter(a => a.type === 'credit').reduce((s, a) => s + Number(a.credit_limit ?? 0), 0);
    const realDisponible = liquidBalance - creditDebt;

    // ── 7. Groq ───────────────────────────────────────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Groq API key no configurada' }, { status: 500 });
    }

    const groq    = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const intent: BackendIntent = classifyIntent(message);

    const dynamicContext = buildDynamicContext(intent, context as RequestContext, accountsData, serverResolvedAccountId, liquidBalance, savingsBalance, creditDebt, creditLimit, realDisponible, unpaidInstallmentsTotal);
    const systemPrompt   = buildSystemPrompt(intent);
    const historySlice   = getHistorySlice(intent, history);
    const maxTokens      = getMaxTokens(intent);

    const estimatedInputTokens =
      estimateTokens(systemPrompt) + estimateTokens(dynamicContext) +
      historySlice.reduce((s, m) => s + estimateTokens(m.content), 0) +
      estimateTokens(message);

    // Solo loguear tokens en development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 TOKENS:', { intent, estimated_input: estimatedInputTokens, max_output: maxTokens });
    }

    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: dynamicContext },
      ...historySlice,
      { role: 'user', content: message },
    ];

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        temperature: 0.7,
        messages,
      });

      const rawContent = response.choices[0].message.content;
      if (!rawContent) throw new Error('No se recibió respuesta de Groq');

      const aiResponse: ChatResponse = cleanAndParseAIResponse(rawContent);

      try {
        const contextTyped = context as RequestContext & { server_resolved_account_id?: string | null };
        const enrichedContext = { ...contextTyped, server_resolved_account_id: serverResolvedAccountId ?? undefined };

        const actionResult = await executeAction(
          aiResponse.action,
          aiResponse.data as Record<string, unknown> | null,
          message,
          userId!,
          budgetsData,
          goalsData,
          supabaseClient,
          serverResolvedAccountId,
          enrichedContext.resolved_account_id,
        );

        if (!actionResult.success && actionResult.suggestion) {
          aiResponse.mensaje_respuesta = actionResult.suggestion;
        }
        if (actionResult.data) {
          aiResponse.data = { ...(aiResponse.data as Record<string, unknown> ?? {}), query_result: actionResult.data };
        }
        if ((aiResponse.action === 'INSERT_TRANSACTION' || (aiResponse.action as string) === 'INSERT_TRANSACTIONS_BATCH') && serverResolvedAccountId) {
          const resolvedAcc = accountsData.find(a => a.id === serverResolvedAccountId);
          if (resolvedAcc) {
            aiResponse.data = {
              ...(aiResponse.data as Record<string, unknown> ?? {}),
              _account_name: resolvedAcc.name,
              _account_type: resolvedAcc.type,
            } as typeof aiResponse.data;
          }
        }
      } catch (actionError) {
        console.error('[action] error', actionError instanceof Error ? actionError.message : actionError);
        return NextResponse.json(
          { action: 'ERROR', error: 'Error ejecutando la acción', mensaje_respuesta: `No pude ejecutar tu solicitud: ${actionError instanceof Error ? actionError.message : 'Error desconocido'}` },
          { status: 500 }
        );
      }

      return NextResponse.json(aiResponse, {
        headers: { 'X-RateLimit-Remaining': String(remaining) },
      });

    } catch (error) {
      console.error('[groq] error', error instanceof Error ? error.message : error);
      return NextResponse.json(
        { action: 'ERROR', error: 'Error procesando la solicitud', mensaje_respuesta: 'Tuve problemas para entender tu mensaje. ¿Podés reformularlo?' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[route] unhandled error', error instanceof Error ? error.message : error);
    return NextResponse.json(
      // SECURITY FIX: no exponer details en producción
      { error: 'Error procesando la solicitud', details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}