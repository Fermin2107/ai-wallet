import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ChatResponse } from '../../../lib/types';
import {
  createSupabaseServerClient,
  createSupabaseServerClientWithToken,
  TransactionInsert,
  handleSupabaseError,
} from '../../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN BUDGET TABLE
// ─────────────────────────────────────────────────────────────────────────────
//
// INTENT           | INPUT tokens | OUTPUT tokens
// -----------------|--------------|--------------
// registro         |   ~450 tok   |   ~120 tok
// consulta_simple  |   ~800 tok   |   ~200 tok
// gestion_cuentas  |   ~550 tok   |   ~150 tok
// complejo         |  ~3200 tok   |   ~700 tok

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type BackendIntent =
  | 'registro'
  | 'consulta_simple'
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
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `Sos el coach financiero personal del usuario en AI Wallet.

━━━ PERSONALIDAD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sos un amigo que sabe de plata. No un bot, no un contador, no un asesor formal.
Hablás en español rioplatense, directo, sin vueltas.

TONO:
- Máximo 3 oraciones por respuesta general. Para planes o análisis, podés extenderte.
- Máximo 1 emoji por respuesta. Usalo con criterio, no como decoración.
- Nunca empezás con "Claro", "Por supuesto", "Entendido", "¡Perfecto!" ni similares.
- Nunca hablás de vos mismo ni explicás lo que vas a hacer. Lo hacés y ya.
- Nunca usás jerga financiera sin explicarla.
- Arrancás siempre con la información, no con saludos.

NOMBRE DEL USUARIO:
- Usalo quirúrgicamente. No en cada mensaje.
- Usalo en: resúmenes semanales, alertas serias, celebraciones reales.
- NO lo uses en: registros rápidos, consultas cotidianas.

━━━ REGLAS IRROMPIBLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Nunca uses "$X" o "$Y" — siempre los números reales del contexto.
2. Nunca digas "no tengo información" si tenés el resumen_financiero.
3. Nunca inventes datos que no estén en el contexto.
4. Nunca dejes una respuesta sin un paso concreto al final.
5. Nunca hagas más de una pregunta por respuesta.
6. Nunca menciones "otros" como categoría principal en análisis.

━━━ REGLA DEL PRÓXIMO PASO (OBLIGATORIA) ━━━━━━━━━━━━━━━━━━━━

Toda respuesta termina con UNA acción concreta. Que fluya natural.

━━━ FORMATO DE RESPUESTA — REGLA ABSOLUTA ━━━━━━━━━━━━━━━━━━━

SIEMPRE devolvé un objeto JSON válido y parseable. Nunca texto libre fuera del JSON.
Empezá con { y terminá con }. Sin markdown. Sin backticks. Sin texto antes ni después.

Estructura obligatoria:
{"action":"string","mensaje_respuesta":"string","data":{}}

Si no tenés data, usá "data": null. Nunca omitas las tres claves.`;

// ─── PROMPT REGISTRO ────────────────────────────────────────────────────────
// El mensaje de confirmación DEBE:
//   1. Mencionar la cuenta donde se guardó (nombre real, no "tu cuenta")
//   2. Mencionar la categoría
//   3. Dar un dato útil de contexto (cuánto queda en esa categoría, cuánto lleva gastado, etc)
//   4. Terminar con UNA micro-acción concreta pero natural (no siempre pregunta)
//   5. Variar el tono: a veces celebrar, a veces advertir, a veces solo confirmar
//   6. Nunca ser genérico ni repetitivo

const SYSTEM_PROMPT_REGISTRO = `
━━━ ROL: REGISTRAR GASTOS E INGRESOS ━━━━━━━━━━━━━━━━━━━━━━━━

FLUJO:
- Con monto → registrar de inmediato, sin preguntar nada más.
- Sin monto → una sola pregunta: "¿Cuánto fue?"
- Fecha: usar FECHA del contexto salvo que el usuario diga otra.
- Categoría: usar EXACTAMENTE los nombres de CATEGORÍAS DISPONIBLES del contexto.
- amount: SIEMPRE positivo. NUNCA negativo.

REINTEGROS, DEVOLUCIONES Y CASHBACK — REGLA CRÍTICA:
Un reintegro NO es un ingreso. Es una reducción del gasto original.
"Gasté X y me reintegraron Y" → registrar UN SOLO gasto de (X - Y), NO dos transacciones.
"Me devolvieron X de algo que compré" → registrar UN SOLO gasto de (precio_original - X).
"Me hicieron cashback de X" → registrar el gasto neto (precio - cashback).

INGRESOS REALES (estos SÍ van como type "ingreso" separado):
sueldo, salario, honorarios, freelance, venta de algo, alquiler cobrado, bono, aguinaldo.

GASTOS INUSUALES (>2x promedio de la categoría): mencionarlo en la confirmación.

CUOTAS (tarjeta de crédito):
- installment_count = número de cuotas (1 si es pago único).
- first_due_month = próximo mes de vencimiento en formato YYYY-MM.
- Si el usuario paga con tarjeta y no mencionó cuotas: preguntar "¿En cuántas cuotas?"

CUENTA:
- Si hay CUENTA RESUELTA en el contexto → usarla SIEMPRE como account_id.
- Si no hay cuentas → omitir account_id (es nullable).

━━━ CONFIRMACIÓN DE REGISTRO — REGLAS DE ORO ━━━━━━━━━━━━━━━━

El mensaje_respuesta de un INSERT_TRANSACTION DEBE tener esta estructura:
  [confirmación del monto y qué fue] en [nombre exacto de la cuenta].
  [dato útil de contexto: cuánto queda en la categoría, o cuánto lleva gastado en ella, o si está cerca del límite]
  [micro-acción o dato forward-looking: qué debería gastar por día, si va bien, o si debe cuidar algo]

VARIACIONES OBLIGATORIAS (no repetir el mismo patrón dos veces seguidas):
- Si la categoría está al +80%: tono de advertencia suave
- Si la categoría está bien: tono neutro/positivo con dato
- Si es ingreso: celebración breve + dato de cuánto tiene disponible ahora
- Si es gasto inusual (>2x promedio): mencionarlo una vez, sin drama

EJEMPLOS DE CONFIRMACIONES BUENAS:
  Gasto: "Listo, $1.500 de delivery en Mercado Pago. Llevás $4.200 en delivery este mes — al 70% del límite. Hoy te quedan $850 para gastar."
  Ingreso: "Sueldo de $180.000 guardado en Galicia. Ahora tenés $162.000 libres después del ahorro. ¿Actualizamos las metas?"
  Tarjeta + cuotas: "$45.000 en 3 cuotas anotado en Visa. Cada cuota: $15.000/mes. Esto sube tu deuda de tarjeta a $82.000."
  Budget crítico: "$3.200 en salidas. Atención: estás al 92% del límite en salidas — te quedan solo $800 hasta fin de mes."
  Reintegro: "Gasté $10.000 en el super y te reintegraron $5.000 — registré el neto: $5.000 en supermercado en Mercado Pago."

━━━ TRANSACCIONES MÚLTIPLES (CRÍTICO) ━━━━━━━━━━━━━━━━━━━━━━

Si el usuario menciona 2 o más gastos/ingresos en un solo mensaje,
usá INSERT_TRANSACTIONS_BATCH con un array "transactions".

REGLAS BATCH:
- Cada item del array tiene la misma estructura que un INSERT_TRANSACTION individual.
- El mensaje_respuesta resume TODAS las transacciones en 2 líneas máximo.
- Formato: total guardado + desglose rápido + dato de contexto.
- Siempre usar la CUENTA RESUELTA del contexto para todas las transacciones del batch.

EJEMPLOS que deben disparar BATCH:
  "gasté 500 en el super, 200 en café y 1500 de nafta"
  "hoy gasté en almuerzo 800, transporte 200 y después cine 1200"
  "pagué 3000 de servicios y 1500 de suscripciones"
  "compré ropa por 4000 y gasté 600 en lunch"

FORMATO BATCH:
{"action":"INSERT_TRANSACTIONS_BATCH","mensaje_respuesta":"3 gastos guardados por $2.200 total. Super $500, café $200, nafta $1.500. Te quedan $X para gastar hoy.","data":{"transactions":[{"description":"super","amount":500,"type":"gasto","category":"alimentacion","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":null,"account_id":"uuid-o-null"},{"description":"café","amount":200,"type":"gasto","category":"alimentacion","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":null,"account_id":"uuid-o-null"},{"description":"nafta","amount":1500,"type":"gasto","category":"transporte","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":null,"account_id":"uuid-o-null"}]}}

FORMATOS JSON INDIVIDUAL:
Gasto:   {"action":"INSERT_TRANSACTION","mensaje_respuesta":"confirmación según reglas","data":{"description":"texto","amount":numero,"type":"gasto","category":"categoria","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":"YYYY-MM","account_id":"uuid-o-null"}}
Ingreso: {"action":"INSERT_TRANSACTION","mensaje_respuesta":"confirmación según reglas","data":{"description":"texto","amount":numero,"type":"ingreso","category":"ingreso","transaction_date":"YYYY-MM-DD","confirmed":true,"installment_count":1,"first_due_month":null,"account_id":"uuid-o-null"}}`;

const SYSTEM_PROMPT_CONSULTA = `
━━━ ROL: CONSULTAS CON NÚMEROS REALES ━━━━━━━━━━━━━━━━━━━━━━━

Usar EXACTAMENTE los números del ESTADO del contexto. Nunca inventar.
Si el usuario es nuevo (sin transacciones), aplicá heurísticas:
  Comida: 28-32%, Supermercado: 18-22%, Transporte: 12-16%
  Salidas: 10-14%, Servicios: 8-11%, Suscripciones: 4-6%, Salud: 6-9%
Calculá sobre disponible = ingreso - ahorro.

━━━ UI HINTS (opcional — solo cuando agrega valor real) ━━━━━━

Agregá "ui":{"type":"TIPO","data":{}} al JSON cuando aplique:
- Pregunta sobre estado del mes / cómo voy / resumen → "progress_bar"
- Pregunta sobre categorías / en qué gasté / top gastos → "category_chips"
- Pregunta sobre gasto diario / cuánto puedo gastar → "daily_limit"
data siempre va vacío {}. El frontend lo completa con datos reales.
No agregues ui si la pregunta no es sobre alguno de esos temas.

FORMATO sin ui:
{"action":"RESPUESTA_CONSULTA","mensaje_respuesta":"respuesta con números reales","data":null}

FORMATO con ui (ejemplo):
{"action":"RESPUESTA_CONSULTA","mensaje_respuesta":"Gastaste $X este mes...","data":null,"ui":{"type":"progress_bar","data":{}}}`;

const SYSTEM_PROMPT_GESTION_CUENTAS = `
━━━ ROL: GESTIÓN DE CUENTAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DETECTAR qué quiere el usuario:
a) Informando saldo ("en MP tengo $50.000") → UPDATE_ACCOUNT_BALANCE
b) Queriendo crear cuenta ("quiero agregar mi cuenta del banco") → CREATE_ACCOUNT
c) Preguntando por su disponible ("¿cuánto tengo?") → RESPUESTA_CONSULTA usando RESUMEN del contexto

SEMÁNTICA DE BALANCE:
- liquid/savings: balance = plata disponible (positivo).
- credit: balance = DEUDA actual (positivo = debe esa cantidad).
  Disponible tarjeta = credit_limit - balance.

Para tarjetas de crédito, type = "credit".
Si el usuario no mencionó cierre/vencimiento, SIEMPRE preguntar: "¿Cuál es el día de cierre y el de vencimiento?"

FORMATOS:
Crear cuenta:    {"action":"CREATE_ACCOUNT","mensaje_respuesta":"Listo, agregué [nombre]. ¿Cuánto tenés ahí ahora?","data":{"name":"nombre","type":"liquid","balance":0,"icon":"emoji","color":"text-blue-400","set_as_default":false}}
Actualizar saldo:{"action":"UPDATE_ACCOUNT_BALANCE","mensaje_respuesta":"Actualizado. Ahora tenés $X en [cuenta]. ¿Registramos algún movimiento?","data":{"account_name":"nombre","new_balance":numero}}`;

const SYSTEM_PROMPT_COMPLEJO = `
━━━ ROL: OPTIMIZACIÓN DE GASTOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ESENCIALES: alimentacion, alquiler, servicios, salud, transporte, educacion
DISCRECIONALES: salidas, entretenimiento, delivery, suscripciones, ropa, hobbies

━━━ ROL: DISTRIBUCIÓN DEL DINERO SOBRANTE ━━━━━━━━━━━━━━━━━━━

Distribución recomendada:
  - Ahorro/emergencia: 15-20% del ingreso
  - Metas activas: distribuir según urgencia
  - Libre: siempre dejar ~10%

━━━ ROL: CONSULTAS COMPLEJAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para metas:
{"action":"CREATE_GOAL","mensaje_respuesta":"confirmacion","data":{"name":"nombre","target_amount":numero,"current_amount":0,"target_date":null,"icon":"emoji","color":"text-emerald-500"}}

Para presupuestos:
{"action":"CREATE_BUDGET","mensaje_respuesta":"confirmacion","data":{"category":"nombre","limit_amount":numero,"month_period":"YYYY-MM"}}

Para actualizar meta:
{"action":"UPDATE_GOAL_PROGRESS","mensaje_respuesta":"confirmacion","data":{"goal_name":"nombre","amount":numero,"create_if_missing":true}}

━━━ ROL: PLANIFICACIÓN MULTI-MES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALGORITMO:
1. Gasto base mensual: historico.gasto_minimo_mensual + promedios
2. Ahorro objetivo: 15%, bajar a 10% si no cierra
3. Distribuir por mes: esenciales → discrecionales ajustados → ahorro → libre

FORMATO:
{"action":"PLAN_MENSUAL","mensaje_respuesta":"Plan...","data":{"ingreso_detectado":numero,"meses":numero,"distribucion":{"ahorro":numero,"categorias":{"nombre":numero},"libre":numero}}}

━━━ USUARIO SIN TRANSACCIONES — VALUE FIRST ━━━━━━━━━━━━━━━━━

PROHIBIDO: "no tenés datos", "no puedo calcular".
OBLIGATORIO: estimá con las heurísticas y dá el número concreto.

━━━ UI HINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agregá "ui":{"type":"TIPO","data":{}} cuando aplique:
- Análisis del mes / resumen / proyección → "progress_bar"
- Análisis de categorías / top gastos → "category_chips"
- Respuesta sobre una meta específica → "goal_card"
- Alerta de presupuesto / categoría en riesgo → "budget_alert"
- Gasto diario / cuánto puedo gastar por día → "daily_limit"
- Plan mensual generado → "plan_mensual"
data siempre va vacío {}. Solo un ui por respuesta.`;

const SYSTEM_PROMPT_PATRONES = `
━━━ PATRONES DETECTADOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si el contexto incluye "patrones", usá esos datos para:
- Mencionar el día de la semana donde más gasta (solo si factor_pico > 1.5)
- Comentar si los gastos están subiendo o bajando vs el mes anterior (tendencia_mes)
- Nombrar suscripciones/recurrentes detectadas si el usuario no las mencionó
- Alertar sobre gastos hormiga solo si hormiga_significativo = true y hormiga_pct > 15

REGLAS:
- Usar MÁXIMO 1 patrón por respuesta. El más relevante para la pregunta.
- Convertí los datos en una observación concreta y accionable.
- Nunca enumeres patrones sin contexto.`;

// ─────────────────────────────────────────────────────────────────────────────
// INTENT CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────
//
// Orden de prioridad estricto:
//   1. 'registro'         (número + verbo financiero → SIEMPRE gana)
//   2. 'gestion_cuentas'
//   3. 'consulta_simple'
//   4. 'complejo'         (fallback seguro)

function classifyIntent(message: string): BackendIntent {
  const msg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // ── 1. REGISTRO ──────────────────────────────────────────────────────────
  const hasNumber = /\b\d[\d.,]*k?\b/.test(msg);

  // Verbos de gasto ampliados
  const verbosGasto = /\b(gaste|pague|compre|salio|costo|puse|cargue|transferi|saque|abone|abono|abone|desembolse|gaste|pago|liquide|cancele|cancelo|mande|mando|debi|debit|cargo|cargaron|cobro|cobraron|pagan|pago|salieron|me costaron|me cobro|me cobraron|me debito|me cargo|me descontaron)\b/.test(msg);

  // Verbos de ingreso ampliados
  const verbosIngreso = /\b(cobre|me pagaron|entraron|ingrese|recibi|deposite|acredita|acreditaron|cayo|me entro|me entraron|me deposito|me depositaron|me transfirieron|cobro|cobré el|cobré mi|me pagan|me depositan|llego|llego el|llego la)\b/.test(msg);

  // Frases compuestas de registro sin verbo explícito
  const frasesRegistroDirecto = /\b(\d[\d.,]*k?\s*(pesos|peso|$|ars|de ahorro|en ahorro|de sueldo|de honorarios|de freelance|al super|en el super|de alquiler|de expensas|de servicios))\b/.test(msg);

  // Múltiples montos en un mensaje → siempre registro (batch)
  const multipleNumbers = (msg.match(/\d[\d.,]*k?/g) ?? []).length >= 2;
  const hasComaSeparator = /\d[\d.,]*k?.*[,y].*\d[\d.,]*k?/.test(msg);

  if (hasNumber && (verbosGasto || verbosIngreso || frasesRegistroDirecto)) {
    return 'registro';
  }

  // Mensaje con múltiples montos pero sin verbo explícito al inicio
  // ej: "super 500, café 200, nafta 1500"
  if (multipleNumbers && hasComaSeparator) {
    return 'registro';
  }

  // ── 2. GESTION_CUENTAS ────────────────────────────────────────────────────
  const patronesCuentas =
    /\b(en mp|en mercado pago|en ual[aá]|en prex|en el banco|mi cuenta|mis cuentas|agregar cuenta|nueva cuenta|saldo|disponible|actualizar cuenta)\b/.test(msg) ||
    /\d[\d.,]*k?\s+(en|en el|en la)\s+(mp|mercado pago|ual[aá]|prex|banco|bbva|galicia|naranja|visa|mastercard|amex|brubank|uala|lemon|belo)\b/.test(msg) ||
    (/\b(cuanto tengo|cuanto hay|cuanta plata|cuanto me queda en)\b/.test(msg) && !hasNumber);

  if (patronesCuentas) {
    return 'gestion_cuentas';
  }

  // ── 3. CONSULTA_SIMPLE ────────────────────────────────────────────────────
  const patronesConsulta = /\b(como voy|cuanto puedo|puedo comprar|puedo gastar|me alcanza para|cuanto gaste|resumen|estado del mes|en que gaste|donde gaste|cuanto llevo|cuanto me sobra|cuanto me falta|como estoy|como anda)\b/.test(msg);
  const patronesComplejo = /\b(plan|planificar|proximos meses|ahorrar mas|reducir|distribuir|organizar|vacaciones|jubilacion|fondo de emergencia|emergencia|cobro irregular|invertir|inversion|como puedo mejorar|optimizar|recortar)\b/.test(msg);

  if (patronesConsulta && !patronesComplejo) {
    return 'consulta_simple';
  }

  // ── 4. COMPLEJO ───────────────────────────────────────────────────────────
  return 'complejo';
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDynamicContext — mínimo por intent
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

  // ── REGISTRO ─────────────────────────────────────────────────────────────
  if (intent === 'registro') {
    const categorias = context.budgets
      ?.map((b) => `- "${b.categoria}" (gastado: $${b.gastado.toLocaleString('es-AR')} de $${b.limite.toLocaleString('es-AR')}, estado: ${b.estado})`)
      .join('\n') ?? 'Sin categorías configuradas';

    // Cuenta resuelta con nombre visible para el mensaje de confirmación
    const cuentaResuelta = serverResolvedAccountId
      ? (() => {
          const acc = accountsData.find(a => a.id === serverResolvedAccountId);
          return acc
            ? `CUENTA RESUELTA: "${acc.name}" (tipo: ${acc.type}, id: ${serverResolvedAccountId})`
            : `CUENTA RESUELTA: id ${serverResolvedAccountId}`;
        })()
      : 'CUENTA RESUELTA: ninguna — account_id = null, NO menciones cuenta en la confirmación';

    // Histórico de categorías para detectar gastos inusuales
    const historicoCats = context.historico?.categorias
      ?.map(c => `- "${c.categoria}": promedio $${c.promedio_mensual.toLocaleString('es-AR')}/mes`)
      .join('\n') ?? '';

    return [
      `FECHA: ${fecha}`,
      `USUARIO: ${usuario}`,
      `MEDIO DE PAGO HABITUAL: ${context.medio_pago_habitual ?? 'no disponible'}`,
      ``,
      `CATEGORÍAS DISPONIBLES (con estado actual del mes):`,
      categorias,
      ``,
      cuentaResuelta,
      historicoCats ? `\nHISTÓRICO POR CATEGORÍA (para detectar gastos inusuales):\n${historicoCats}` : '',
    ].filter(s => s !== undefined).join('\n');
  }

  // ── GESTION_CUENTAS ────────────────────────────────────────────────────────
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

  // ── CONSULTA_SIMPLE ────────────────────────────────────────────────────────
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
      `ESTADO: ${context.estado_mes ?? 'sin datos'} | libre: $${(context.dinero_libre ?? 0).toLocaleString('es-AR')} | por día: $${(context.gasto_diario_recomendado ?? 0).toLocaleString('es-AR')} | días restantes: ${context.dias_restantes ?? 0}`,
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

  // ── COMPLEJO ───────────────────────────────────────────────────────────────
  const listaCuentasCompleta = accountsData.length === 0
    ? 'Sin cuentas — omitir account_id en transacciones.'
    : accountsData.map((a) => {
        const tag = a.is_default ? ' ← DEFAULT' : '';
        const isCredit = a.type === 'credit';
        const extra = isCredit
          ? ` | deuda: $${Number(a.balance).toLocaleString('es-AR')} | límite: $${Number(a.credit_limit ?? 0).toLocaleString('es-AR')} | disponible: $${Math.max(0, Number(a.credit_limit ?? 0) - Number(a.balance)).toLocaleString('es-AR')}`
          : ` | saldo: $${Number(a.balance).toLocaleString('es-AR')}`;
        const days = isCredit && (a.closing_day || a.due_day)
          ? ` | cierre: día ${a.closing_day ?? '?'}, vence: día ${a.due_day ?? '?'}`
          : '';
        return `- "${a.name}" | tipo: ${a.type}${extra}${days} | id: ${a.id}${tag}`;
      }).join('\n');

  return [
    `FECHA: ${fecha}`,
    `USUARIO: ${usuario}`,
    `MEDIO DE PAGO HABITUAL: ${context.medio_pago_habitual ?? 'no disponible'}`,
    ``,
    `SITUACIÓN FINANCIERA ACTUAL:`,
    context.resumen_financiero ?? 'Sin datos disponibles',
    ``,
    `ESTADO: ${context.estado_mes ?? 'sin datos'} | libre: $${(context.dinero_libre ?? 0).toLocaleString('es-AR')} | por día: $${(context.gasto_diario_recomendado ?? 0).toLocaleString('es-AR')} | días restantes: ${context.dias_restantes ?? 0}`,
    ``,
    `CATEGORÍAS EXACTAS (usar sin variaciones):`,
    context.budgets?.map((b) => `- "${b.categoria}": $${b.gastado.toLocaleString('es-AR')}/$${b.limite.toLocaleString('es-AR')} (${b.estado})`).join('\n') ?? 'Sin categorías',
    ``,
    `METAS:`,
    context.goals?.map((g) =>
      `- ${g.nombre}: $${g.actual.toLocaleString('es-AR')} de $${g.objetivo.toLocaleString('es-AR')} (falta $${g.faltante.toLocaleString('es-AR')})`
    ).join('\n') ?? 'Sin metas',
    ``,
    `CUENTAS DEL USUARIO:`,
    listaCuentasCompleta,
    ``,
    `CUENTA RESUELTA: ${serverResolvedAccountId ? `id ${serverResolvedAccountId}` : 'ninguna — account_id = null'}`,
    ``,
    context.perfil_coach ?? '',
    ``,
    `RESUMEN DE CUENTAS:`,
    `  total_liquid: $${liquidBalance.toLocaleString('es-AR')}`,
    `  total_savings: $${savingsBalance.toLocaleString('es-AR')}`,
    `  deuda tarjetas: $${creditDebt.toLocaleString('es-AR')}`,
    `  límite tarjetas: $${creditLimit.toLocaleString('es-AR')}`,
    `  real_disponible: $${realDisponible.toLocaleString('es-AR')} (liquid − deuda)`,
    `  cuotas_impagas: $${unpaidInstallmentsTotal.toLocaleString('es-AR')}`,
    ``,
    `ESTADO USUARIO: ${context.usuario_nuevo
      ? `NUEVO — aplicar heurísticas. Disponible estimado: $${Math.round((context.ingreso_mensual ?? 0) - (context.objetivo_ahorro ?? 0)).toLocaleString('es-AR')}/mes`
      : 'ACTIVO — usar datos reales'}`,
    ``,
    `ALERTAS:`,
    context.alertas?.map((a) => `- ${a}`).join('\n') ?? 'Sin alertas',
    ``,
    `HISTÓRICO:`,
    `Gasto promedio mensual: $${context.historico?.gasto_mensual_promedio?.toLocaleString('es-AR') ?? 'sin datos'}`,
    `Gasto mínimo mensual: $${context.historico?.gasto_minimo_mensual?.toLocaleString('es-AR') ?? 'sin datos'}`,
    ``,
    `CATEGORÍAS ANALIZADAS:`,
    context.historico?.categorias?.map((c) =>
      `- ${c.categoria} [${c.tipo.toUpperCase()}]: prom $${c.promedio_mensual?.toLocaleString('es-AR')}/mes | este mes: $${c.gasto_este_mes?.toLocaleString('es-AR') ?? '0'}`
    ).join('\n') ?? 'Sin historial',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt — capas por intent
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(intent: BackendIntent): string {
  switch (intent) {
    case 'registro':
      return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_REGISTRO;
    case 'consulta_simple':
      return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_CONSULTA;
    case 'gestion_cuentas':
      return SYSTEM_PROMPT_BASE + SYSTEM_PROMPT_GESTION_CUENTAS;
    case 'complejo':
      return (
        SYSTEM_PROMPT_BASE +
        SYSTEM_PROMPT_REGISTRO +
        SYSTEM_PROMPT_CONSULTA +
        SYSTEM_PROMPT_GESTION_CUENTAS +
        SYSTEM_PROMPT_COMPLEJO +
        SYSTEM_PROMPT_PATRONES
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Historial y max_tokens dinámicos
// ─────────────────────────────────────────────────────────────────────────────

function getHistorySlice(
  intent: BackendIntent,
  history: Array<{ role: string; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const limits: Record<BackendIntent, number> = {
    registro: 2,          // 1 turno de contexto para ediciones
    gestion_cuentas: 2,
    consulta_simple: 2,
    complejo: 4,
  };
  const limit = limits[intent];
  return history
    .slice(-limit)
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
}

function getMaxTokens(intent: BackendIntent): number {
  const limits: Record<BackendIntent, number> = {
    registro: 400,   // batch de hasta 5 transacciones necesita más tokens
    gestion_cuentas: 200,
    consulta_simple: 320,
    complejo: 800,
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
}

interface InstallmentRow {
  amount: number;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimación de tokens
// ─────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// cleanAndParseAIResponse
// ─────────────────────────────────────────────────────────────────────────────

function cleanAndParseAIResponse(raw: string): ChatResponse {
  // 1. Quitar markdown fences si las hay
  const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = mdMatch ? mdMatch[1].trim() : raw.trim();

  // 2. Intentar parsear el JSON completo
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ChatResponse> & {
        ui?: { type: string; data: Record<string, unknown> };
      };
      // Validar que tiene las claves mínimas
      if (parsed.action && parsed.mensaje_respuesta !== undefined) {
        return {
          action: parsed.action ?? 'RESPUESTA_CONSULTA',
          mensaje_respuesta: parsed.mensaje_respuesta ?? 'Procesé tu solicitud.',
          data: parsed.data ?? {},
          ...(parsed.ui ? { ui: parsed.ui } : {}),
        } as ChatResponse;
      }
    } catch {
      // Parse falló — intentar extracción quirúrgica
    }
  }

  // 3. Fallback quirúrgico: extraer action y mensaje_respuesta con regex
  // Útil cuando el JSON es largo (batch) y tiene caracteres que rompen el parser
  const actionMatch = cleaned.match(/"action"\s*:\s*"([^"]+)"/);
  const mensajeMatch = cleaned.match(/"mensaje_respuesta"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (actionMatch && mensajeMatch) {
    const action = actionMatch[1];
    const mensaje = mensajeMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    // Para batch: intentar extraer el array de transactions del data
    let data: Record<string, unknown> = {};
    if (action === 'INSERT_TRANSACTIONS_BATCH') {
      try {
        // Buscar el array de transactions dentro del JSON roto
        const txMatch = cleaned.match(/"transactions"\s*:\s*(\[[\s\S]*?\](?=\s*\}))/);
        if (txMatch) {
          data = { transactions: JSON.parse(txMatch[1]) };
        }
      } catch {
        // Si no se puede extraer, data queda vacío — las tx no se guardan
        // pero al menos el mensaje se muestra correctamente
      }
    }

    return {
      action: action as ChatResponse['action'],
      mensaje_respuesta: mensaje,
      data,
    } as ChatResponse;
  }

  // 4. Último fallback: mostrar mensaje genérico, nunca el JSON crudo
  return {
    action: 'RESPUESTA_CONSULTA',
    mensaje_respuesta: 'Procesé tu solicitud.',
    data: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveTransactionsToSupabase
// ─────────────────────────────────────────────────────────────────────────────

async function saveTransactionsToSupabase(
  transacciones: TransactionPayload[],
  originalMessage: string,
  userId: string | null,
  budgetsData: BudgetRow[],
  goalsData: GoalRow[],
  userToken: string | null | undefined,
  context: RequestContext & { server_resolved_account_id?: string | null }
): Promise<void> {
  const supabase = userToken
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();

  try {
    const transactionsToInsert: TransactionInsert[] = transacciones.map((tx) => {
      const txCategory = tx.category ?? tx.categoria ?? '';

      const budgetMatch = budgetsData.find((b) => {
        if (b.category === txCategory) return true;
        if (txCategory.includes(b.category) || b.category.includes(txCategory)) return true;
        const aliases: Record<string, string[]> = {
          alimentacion: ['super', 'supermercado', 'mercado', 'comida', 'almacen', 'verduleria'],
          transporte: ['nafta', 'colectivo', 'subte', 'uber', 'taxi', 'remis', 'sube'],
          salidas: ['bar', 'restaurant', 'cine', 'teatro', 'entretenimiento'],
          salud: ['farmacia', 'medico', 'dentista', 'clinica'],
          servicios: ['luz', 'gas', 'agua', 'internet', 'telefono'],
        };
        return aliases[b.category]?.includes(txCategory) ?? false;
      });

      const goalMatch =
        txCategory === 'ahorro'
          ? goalsData.find((g) => g.is_active && !g.is_completed)
          : undefined;

      return {
        description: tx.description ?? tx.descripcion ?? 'Sin descripción',
        amount: Math.abs(Number(tx.amount ?? tx.monto) || 0),  // constraint: amount > 0
        category: txCategory,
        type: (tx.type ?? tx.tipo ?? 'gasto') as 'gasto' | 'ingreso',
        transaction_date:
          tx.transaction_date ?? tx.fecha ?? new Date().toISOString().split('T')[0],
        confirmed: tx.confirmed ?? false,
        source: 'voice' as const,
        original_message: originalMessage,
        ai_confidence: 0.95,
        user_id: userId ?? undefined,
        budget_id: budgetMatch?.id ?? undefined,
        goal_id: goalMatch?.id ?? undefined,
        account_id:
          tx.account_id
          ?? context.server_resolved_account_id
          ?? context.resolved_account_id
          ?? null,
        installment_count: tx.installment_count ?? 1,
        first_due_month: tx.first_due_month ?? undefined,
      };
    });

    const { data, error } = await supabase
      .from('transactions')
      .insert(
        transactionsToInsert.map(
          ({ installment_count: _ic, first_due_month: _fd, ...rest }) => rest
        )
      )
      .select();

    if (error) {
      throw handleSupabaseError(error);
    }

    if (data && data.length > 0 && userId) {
      for (let idx = 0; idx < data.length; idx++) {
        const saved = data[idx] as { id: string; account_id: string | null; amount: number };
        const txExtra = transactionsToInsert[idx];
        if (!saved.account_id) continue;

        const { data: accData } = await supabase
          .from('accounts')
          .select('type')
          .eq('id', saved.account_id)
          .single();

        if ((accData as { type?: string } | null)?.type !== 'credit') continue;

        const installCount = (txExtra as TransactionInsert & { installment_count?: number }).installment_count ?? 1;
        const firstDueMonth =
          (txExtra as TransactionInsert & { first_due_month?: string }).first_due_month ??
          new Date().toISOString().slice(0, 7);

        await generateInstallments(
          saved.id,
          saved.account_id,
          userId,
          saved.amount,
          installCount,
          firstDueMonth,
          supabase
        );
      }
    }
  } catch (error) {
    throw error;
  }
}

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
  userId: string | null,
  userToken: string | null | undefined
): Promise<void> {
  if (!userId) throw new Error('userId requerido para crear meta');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const goalNameWithEmoji = ensureGoalEmoji(
    String(goalData.name ?? goalData.title ?? 'Meta sin nombre')
  );

  const { error } = await supabase.from('goals').insert({
    name: goalNameWithEmoji,
    target_amount: goalData.target_amount,
    current_amount: goalData.current_amount ?? 0,
    target_date: goalData.target_date ?? null,
    description: goalData.description ?? '',
    icon: goalData.icon ?? '🎯',
    color: goalData.color ?? 'text-emerald-500',
    user_id: userId,
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
  supabaseClient: ReturnType<typeof createSupabaseServerClient>,
  userId: string
): Promise<Record<string, unknown>> {
  if (data.set_as_default) {
    await supabaseClient
      .from('accounts')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('type', data.type)
      .eq('is_default', true);
  }

  const { data: account, error } = await supabaseClient
    .from('accounts')
    .insert({
      user_id: userId,
      name: data.name,
      type: data.type.toLowerCase(),
      balance: data.balance ?? 0,
      credit_limit: data.credit_limit ?? null,
      closing_day: data.closing_day ?? null,
      due_day: data.due_day ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      is_default: data.set_as_default ?? false,
      is_active: true,
      currency: 'ARS',
    })
    .select()
    .single();

  if (error) throw error;
  return account as Record<string, unknown>;
}

async function updateAccountBalanceInSupabase(
  data: { account_name: string; new_balance: number },
  supabaseClient: ReturnType<typeof createSupabaseServerClient>,
  userId: string
): Promise<{ updated: boolean; accountName: string; suggestion?: string }> {
  const { data: accounts, error } = await supabaseClient
    .from('accounts')
    .select('id, name, type, balance')
    .eq('user_id', userId)
    .eq('is_active', true)
    .ilike('name', `%${data.account_name}%`);

  if (error) throw handleSupabaseError(error);

  if (!accounts || accounts.length === 0) {
    return {
      updated: false,
      accountName: data.account_name,
      suggestion: `No encontré ninguna cuenta con ese nombre. ¿Querés crearla?`,
    };
  }

  const target = accounts[0] as { id: string; name: string };

  const { error: updateErr } = await supabaseClient
    .from('accounts')
    .update({ balance: data.new_balance })
    .eq('id', target.id);

  if (updateErr) throw handleSupabaseError(updateErr);

  return { updated: true, accountName: target.name };
}

async function createBudgetInSupabase(
  budgetData: Record<string, unknown>,
  userId: string | null,
  userToken: string | null | undefined
): Promise<void> {
  if (!userId) throw new Error('userId requerido para crear budget');

  const supabase = userToken
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();

  const { error } = await supabase.from('budgets').insert({
    category: String(budgetData.category ?? '').toLowerCase().trim(),
    limit_amount: budgetData.limit_amount,
    month_period:
      String(budgetData.month_period ?? '') || new Date().toISOString().slice(0, 7),
    user_id: userId,
  });

  if (error) throw handleSupabaseError(error);
}

async function updateGoalProgressInSupabase(
  goalName: string,
  amount: number,
  userId: string | null,
  userToken: string | null | undefined,
  createIfMissing: boolean = true
): Promise<void> {
  if (!userId) throw new Error('userId requerido');

  const supabase = userToken
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();

  const { data: existingGoals, error: searchError } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${goalName}%`)
    .eq('is_active', true);

  if (searchError) throw handleSupabaseError(searchError);

  const targetGoal = (existingGoals as Array<{
    id: string;
    current_amount: number;
    target_amount: number;
  }> | null)?.[0];

  if (!targetGoal && createIfMissing) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 6);

    const { error: createError } = await supabase.from('goals').insert({
      user_id: userId,
      name: ensureGoalEmoji(goalName),
      target_amount: amount * 10,
      current_amount: amount,
      target_date: targetDate.toISOString().split('T')[0],
      description: `Meta creada automáticamente para "${goalName}"`,
      icon: '🎯',
      color: 'text-emerald-500',
    });

    if (createError) throw handleSupabaseError(createError);
    return;
  }

  if (!targetGoal) throw new Error(`No se encontró meta "${goalName}"`);

  const newAmount = targetGoal.current_amount + amount;
  const isCompleted = newAmount >= targetGoal.target_amount;

  const { error } = await supabase
    .from('goals')
    .update({ current_amount: newAmount, is_completed: isCompleted })
    .eq('id', targetGoal.id);

  if (error) throw handleSupabaseError(error);
}

async function resolveAccount(
  userId: string,
  message: string,
  context: RequestContext,
  supabaseClient: ReturnType<typeof createSupabaseServerClient>
): Promise<{ account_id: string | null; error: string | null }> {
  const { data: accounts, error } = await supabaseClient
    .from('accounts')
    .select('id, name, type, is_default')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error || !accounts || accounts.length === 0) {
    return { account_id: null, error: null };
  }

  const typedAccounts = accounts as Array<{
    id: string;
    name: string;
    type: string;
    is_default: boolean;
  }>;

  const msgLower = message.toLowerCase();
  for (const acc of typedAccounts) {
    if (msgLower.includes(acc.name.toLowerCase())) {
      return { account_id: acc.id, error: null };
    }
  }

  if (context.resolved_account_id) {
    return { account_id: context.resolved_account_id, error: null };
  }

  const defaultLiquid = typedAccounts.find((a) => a.is_default && a.type === 'liquid');
  if (defaultLiquid) return { account_id: defaultLiquid.id, error: null };

  const liquidAccounts = typedAccounts.filter((a) => a.type === 'liquid');
  if (liquidAccounts.length === 1) return { account_id: liquidAccounts[0].id, error: null };

  const anyDefault = typedAccounts.find((a) => a.is_default);
  if (anyDefault) return { account_id: anyDefault.id, error: null };

  const names = typedAccounts.map((a) => `"${a.name}"`).join(', ');
  return {
    account_id: null,
    error: `Tenés varias cuentas (${names}). ¿En cuál querés registrar esto?`,
  };
}

async function generateInstallments(
  transactionId: string,
  accountId: string,
  userId: string,
  totalAmount: number,
  installmentCount: number,
  firstDueMonth: string,
  supabaseClient: ReturnType<typeof createSupabaseServerClient>
): Promise<void> {
  const [yearStr, monthStr] = firstDueMonth.split('-');
  const baseYear = parseInt(yearStr, 10);
  const baseMonth = parseInt(monthStr, 10) - 1;
  const installmentAmount = Math.round((totalAmount / installmentCount) * 100) / 100;

  const records = Array.from({ length: installmentCount }, (_, i) => {
    const d = new Date(baseYear, baseMonth + i, 1);
    const due_month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      transaction_id: transactionId,
      account_id: accountId,
      user_id: userId,
      installment_number: i + 1,
      total_installments: installmentCount,
      due_month,
      amount: installmentAmount,
      is_paid: false,
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

async function executeAction(
  action: string,
  data: Record<string, unknown> | null,
  originalMessage: string,
  userId: string | null,
  budgetsData: BudgetRow[],
  goalsData: GoalRow[],
  userToken: string | null | undefined,
  context: RequestContext & { server_resolved_account_id?: string | null }
): Promise<ActionResult> {
  switch (action) {
    case 'INSERT_TRANSACTION': {
      await saveTransactionsToSupabase(
        [data as TransactionPayload],
        originalMessage,
        userId,
        budgetsData,
        goalsData,
        userToken,
        context
      );
      return { success: true, message: 'Transacción guardada' };
    }

    case 'INSERT_TRANSACTIONS_BATCH': {
      // Groq devuelve { transactions: [...] }
      const txArray = (data?.transactions ?? []) as TransactionPayload[];
      if (!Array.isArray(txArray) || txArray.length === 0) {
        throw new Error('Batch vacío o inválido');
      }
      await saveTransactionsToSupabase(
        txArray,
        originalMessage,
        userId,
        budgetsData,
        goalsData,
        userToken,
        context
      );
      return { success: true, message: `${txArray.length} transacciones guardadas` };
    }

    case 'CREATE_GOAL':
      await createGoalInSupabase(data as Record<string, unknown>, userId, userToken);
      return { success: true, message: 'Meta creada' };

    case 'CREATE_BUDGET':
      await createBudgetInSupabase(data as Record<string, unknown>, userId, userToken);
      return { success: true, message: 'Presupuesto creado' };

    case 'CREATE_ACCOUNT': {
      if (!userId) throw new Error('userId requerido para crear cuenta');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${userToken}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const account = await createAccountInSupabase(
        data as Parameters<typeof createAccountInSupabase>[0],
        supabase,
        userId
      );
      return {
        success: true,
        mensaje_respuesta: 'Cuenta creada exitosamente',
        action: 'CREATE_ACCOUNT',
        data: account,
      };
    }

    case 'UPDATE_ACCOUNT_BALANCE': {
      if (!userId) throw new Error('userId requerido para actualizar cuenta');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${userToken}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const result = await updateAccountBalanceInSupabase(
        data as { account_name: string; new_balance: number },
        supabase,
        userId
      );
      if (!result.updated && result.suggestion) {
        return { success: false, suggestion: result.suggestion, message: result.suggestion };
      }
      return { success: true, message: `Balance actualizado en ${result.accountName}` };
    }

    case 'UPDATE_GOAL_PROGRESS':
      await updateGoalProgressInSupabase(
        String(data?.goal_name ?? ''),
        Number(data?.amount ?? 0),
        userId,
        userToken,
        Boolean(data?.create_if_missing ?? true)
      );
      return { success: true, message: 'Progreso actualizado' };

    case 'QUERY_BUDGET':
    case 'QUERY_GOALS':
    case 'QUERY_TRANSACTIONS':
    case 'RESPUESTA_CONSULTA':
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
    const body = await request.json() as {
      message: string;
      context: RequestContext;
      history: Array<{ role: string; content: string }>;
    };
    const { message, context, history = [] } = body;

    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    let supabaseServer = createSupabaseServerClient();

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseWithToken = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const { data: { user } } = await supabaseWithToken.auth.getUser();
      userId = user?.id ?? null;
      supabaseServer = supabaseWithToken;
    }

    // ── Fetch datos del usuario ────────────────────────────────────────────
    let budgetsData: BudgetRow[] = [];
    let goalsData: GoalRow[] = [];
    let accountsData: AccountRow[] = [];
    let unpaidInstallmentsTotal = 0;

    if (userId) {
      try {
        const [budgetsRes, goalsRes, accountsRes, installmentsRes] = await Promise.all([
          supabaseServer.from('budgets').select('id, category').eq('user_id', userId),
          supabaseServer
            .from('goals')
            .select('id, name, is_active, is_completed')
            .eq('user_id', userId)
            .eq('is_active', true),
          supabaseServer
            .from('accounts')
            .select('id, name, type, balance, credit_limit, closing_day, due_day, is_default')
            .eq('user_id', userId)
            .eq('is_active', true),
          supabaseServer
            .from('installments')
            .select('amount')
            .eq('user_id', userId)
            .eq('is_paid', false),
        ]);

        budgetsData = (budgetsRes.data ?? []) as BudgetRow[];
        goalsData = (goalsRes.data ?? []) as GoalRow[];
        accountsData = (accountsRes.data ?? []) as AccountRow[];
        unpaidInstallmentsTotal = ((installmentsRes.data ?? []) as InstallmentRow[])
          .reduce((s, i) => s + Number(i.amount), 0);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    }

    // ── Resolver cuenta server-side ────────────────────────────────────────
    let serverResolvedAccountId: string | null = null;
    if (userId) {
      const { account_id, error: accError } = await resolveAccount(
        userId,
        message,
        context,
        supabaseServer
      );
      if (accError) {
        const { data: accsForPicker } = await supabaseServer
          .from('accounts')
          .select('id, name, type')
          .eq('user_id', userId)
          .eq('is_active', true);
        return NextResponse.json({
          action: 'NEEDS_ACCOUNT_SELECTION',
          mensaje_respuesta: accError,
          data: { accounts: accsForPicker ?? [], pending_message: message },
        });
      }
      serverResolvedAccountId = account_id;
    }

    // ── Calcular resúmenes de cuentas ──────────────────────────────────────
    const liquidBalance = accountsData
      .filter((a) => a.type === 'liquid')
      .reduce((s, a) => s + Number(a.balance), 0);
    const savingsBalance = accountsData
      .filter((a) => a.type === 'savings')
      .reduce((s, a) => s + Number(a.balance), 0);
    const creditDebt = accountsData
      .filter((a) => a.type === 'credit')
      .reduce((s, a) => s + Number(a.balance), 0);
    const creditLimit = accountsData
      .filter((a) => a.type === 'credit')
      .reduce((s, a) => s + Number(a.credit_limit ?? 0), 0);
    const realDisponible = liquidBalance - creditDebt;

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Groq API key no configurada' }, { status: 500 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // ── Pipeline principal ─────────────────────────────────────────────────

    const intent: BackendIntent = classifyIntent(message);

    const dynamicContext = buildDynamicContext(
      intent,
      context,
      accountsData,
      serverResolvedAccountId,
      liquidBalance,
      savingsBalance,
      creditDebt,
      creditLimit,
      realDisponible,
      unpaidInstallmentsTotal
    );

    const systemPrompt = buildSystemPrompt(intent);
    const historySlice = getHistorySlice(intent, history);
    const maxTokens = getMaxTokens(intent);

    const estimatedInputTokens =
      estimateTokens(systemPrompt) +
      estimateTokens(dynamicContext) +
      historySlice.reduce((s, m) => s + estimateTokens(m.content), 0) +
      estimateTokens(message);

    console.log('📊 TOKENS:', {
      intent,
      estimated_input: estimatedInputTokens,
      max_output: maxTokens,
    });

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
        const enrichedContext = {
          ...context,
          server_resolved_account_id: serverResolvedAccountId ?? undefined,
        };

        const actionResult = await executeAction(
          aiResponse.action,
          aiResponse.data as Record<string, unknown> | null,
          message,
          userId,
          budgetsData,
          goalsData,
          authHeader?.replace('Bearer ', '') ?? null,
          enrichedContext
        );

        if (!actionResult.success && actionResult.suggestion) {
          aiResponse.mensaje_respuesta = actionResult.suggestion;
        }

        if (actionResult.data) {
          aiResponse.data = {
            ...(aiResponse.data as Record<string, unknown> ?? {}),
            query_result: actionResult.data,
          };
        }

        // Enriquecer respuesta con nombre de cuenta para el frontend
        if ((aiResponse.action === 'INSERT_TRANSACTION' || (aiResponse.action as string) === 'INSERT_TRANSACTIONS_BATCH') && serverResolvedAccountId) {
          const resolvedAcc = accountsData.find(a => a.id === serverResolvedAccountId);
          if (resolvedAcc) {
            const enriched: Record<string, unknown> = {
              ...(aiResponse.data as Record<string, unknown> ?? {}),
              _account_name: resolvedAcc.name,
              _account_type: resolvedAcc.type,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            aiResponse.data = enriched as any;
          }
        }

      } catch (actionError) {
        console.error('Error ejecutando acción:', actionError);
        return NextResponse.json(
          {
            action: 'ERROR',
            error: 'Error ejecutando la acción',
            mensaje_respuesta: `No pude ejecutar tu solicitud: ${actionError instanceof Error ? actionError.message : 'Error desconocido'}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(aiResponse);
    } catch (error) {
      console.error('Error en Groq:', error);
      return NextResponse.json(
        {
          action: 'ERROR',
          error: 'Error procesando la solicitud',
          mensaje_respuesta: 'Tuve problemas para entender tu mensaje. ¿Podés reformularlo?',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error en API de chat:', error);
    return NextResponse.json(
      {
        error: 'Error procesando la solicitud',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}