// ============================================================
// AI Wallet — Motor de WhatsApp
// lib/whatsapp-engine.ts
//
// Lógica pura: triggers, templates, cooldowns.
// Sin dependencias de runtime — importable tanto desde
// la Edge Function como desde las API routes de Next.js.
//
// Regla de oro mantenida: los números vienen pre-calculados.
// Este módulo NO hace cálculos financieros — los recibe.
// ============================================================

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type WhatsappTrigger =
  | 'daily_morning'         // cada mañana a la hora preferida del usuario
  | 'budget_critical'       // presupuesto supera 85%
  | 'streak_at_risk'        // 2 días sin registrar con racha activa
  | 'no_income_registered'  // día 3 del mes sin ingreso registrado
  | 'end_of_month_alert'    // 5 días antes de fin de mes con proyección negativa
  | 'weekly_monday'         // lunes con resumen de la semana anterior

export interface TriggerCooldown {
  trigger: WhatsappTrigger
  minHoursBetween: number   // mínimo de horas entre envíos del mismo trigger
}

export const TRIGGER_COOLDOWNS: TriggerCooldown[] = [
  { trigger: 'daily_morning',        minHoursBetween: 20  },
  { trigger: 'budget_critical',      minHoursBetween: 48  },
  { trigger: 'streak_at_risk',       minHoursBetween: 24  },
  { trigger: 'no_income_registered', minHoursBetween: 48  },
  { trigger: 'end_of_month_alert',   minHoursBetween: 36  },
  { trigger: 'weekly_monday',        minHoursBetween: 144 }, // 6 días
]

// ─── Templates ────────────────────────────────────────────────────────────────
// Tono: rioplatense, directo, corto. Máximo 3 oraciones.
// Terminan siempre con una pregunta o acción concreta.

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export const WHATSAPP_TEMPLATES = {
  daily_morning: (nombre: string, libre: number, porDia: number): string =>
    `Buenos días ${nombre} 👋 Tenés ${fmt(libre)} disponibles este mes. Podés gastar ${fmt(porDia)} hoy. ¿Qué fue lo primero que pagaste?`,

  budget_critical: (nombre: string, categoria: string, pct: number, diasRestantes: number): string =>
    `${nombre}, ${categoria} llegó al ${pct}% del límite y quedan ${diasRestantes} días. ¿Revisamos qué recortar?`,

  streak_at_risk: (nombre: string, diasRacha: number): string =>
    `${nombre}, llevás ${diasRacha} días de racha 🔥 y hace 2 días que no registrás nada. ¿Querés que lo anoto ahora?`,

  no_income_registered: (nombre: string): string =>
    `${nombre}, ¿ya te depositaron el sueldo? Registralo para que el plan del mes funcione bien 💰`,

  end_of_month_alert: (nombre: string, faltante: number, diasRestantes: number): string =>
    `${nombre}, a este ritmo te van a faltar ${fmt(faltante)} para llegar a fin de mes. Quedan ${diasRestantes} días. ¿Armamos un plan?`,

  weekly_monday: (nombre: string, totalGastado: number, topCategoria: string): string =>
    `Resumen de la semana ${nombre}: gastaste ${fmt(totalGastado)}. Lo que más pesó fue ${topCategoria}. ¿Querés ver el detalle?`,
}

// ─── Evaluación de triggers ───────────────────────────────────────────────────

export interface FinancialSnapshot {
  // Calculado server-side con la misma lógica que buildFinancialContext
  totalGastado:            number
  totalIngresado:          number
  ingresoEfectivo:         number
  dineroLibre:             number
  gastoDiarioRecomendado:  number
  diasRestantes:           number
  vaALlegar:               boolean
  superavit:               number
  budgetAnalysis: Array<{
    category:    string
    percentUsed: number
    status:      string
  }>
  currentStreak:           number
  lastActivityDate:        string | null  // YYYY-MM-DD
  nombre:                  string
}

export interface TriggerResult {
  shouldSend:  boolean
  trigger:     WhatsappTrigger
  message:     string
}

export function evaluateTriggers(
  snapshot: FinancialSnapshot,
  lastMessagesByTrigger: Record<string, string | null>, // trigger → ISO timestamp del último envío
  hora: number,    // hora local del usuario (0-23)
  diaMes: number,  // día del mes (1-31)
  diaSemana: number // 0=domingo, 1=lunes
): TriggerResult | null {

  const hoy  = new Date().toISOString().split('T')[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Helper: ¿está en cooldown este trigger?
  const inCooldown = (trigger: WhatsappTrigger): boolean => {
    const lastSent = lastMessagesByTrigger[trigger]
    if (!lastSent) return false
    const cooldown = TRIGGER_COOLDOWNS.find((c) => c.trigger === trigger)
    if (!cooldown) return false
    const hoursSince = (Date.now() - new Date(lastSent).getTime()) / 3600000
    return hoursSince < cooldown.minHoursBetween
  }

  // ── 1. weekly_monday — lunes con resumen ──────────────────────────────────
  if (diaSemana === 1 && !inCooldown('weekly_monday')) {
    const topCat = snapshot.budgetAnalysis
      .sort((a, b) => b.percentUsed - a.percentUsed)[0]?.category ?? 'gastos varios'
    return {
      shouldSend: true,
      trigger:    'weekly_monday',
      message:    WHATSAPP_TEMPLATES.weekly_monday(
        snapshot.nombre,
        snapshot.totalGastado,
        topCat
      ),
    }
  }

  // ── 2. budget_critical — presupuesto >= 85% ───────────────────────────────
  const presupuestoCritico = snapshot.budgetAnalysis.find(
    (b) => b.percentUsed >= 85 && b.status !== 'excedido'
  )
  if (presupuestoCritico && !inCooldown('budget_critical')) {
    return {
      shouldSend: true,
      trigger:    'budget_critical',
      message:    WHATSAPP_TEMPLATES.budget_critical(
        snapshot.nombre,
        presupuestoCritico.category,
        presupuestoCritico.percentUsed,
        snapshot.diasRestantes
      ),
    }
  }

  // ── 3. streak_at_risk — racha activa + 2 días sin registrar ──────────────
  const lastActivity = snapshot.lastActivityDate
  const sinRegistrar =
    lastActivity !== hoy && lastActivity !== ayer
  if (
    snapshot.currentStreak >= 3 &&
    sinRegistrar &&
    !inCooldown('streak_at_risk')
  ) {
    return {
      shouldSend: true,
      trigger:    'streak_at_risk',
      message:    WHATSAPP_TEMPLATES.streak_at_risk(
        snapshot.nombre,
        snapshot.currentStreak
      ),
    }
  }

  // ── 4. no_income_registered — día 3+ sin ingreso ──────────────────────────
  if (
    diaMes >= 3 &&
    snapshot.totalIngresado === 0 &&
    !inCooldown('no_income_registered')
  ) {
    return {
      shouldSend: true,
      trigger:    'no_income_registered',
      message:    WHATSAPP_TEMPLATES.no_income_registered(snapshot.nombre),
    }
  }

  // ── 5. end_of_month_alert — últimos 5 días + proyección negativa ──────────
  if (
    snapshot.diasRestantes <= 5 &&
    !snapshot.vaALlegar &&
    !inCooldown('end_of_month_alert')
  ) {
    return {
      shouldSend: true,
      trigger:    'end_of_month_alert',
      message:    WHATSAPP_TEMPLATES.end_of_month_alert(
        snapshot.nombre,
        Math.abs(snapshot.superavit),
        snapshot.diasRestantes
      ),
    }
  }

  // ── 6. daily_morning — mensaje matutino (último en prioridad) ─────────────
  if (
    snapshot.ingresoEfectivo > 0 &&
    snapshot.totalGastado > 0 &&
    !inCooldown('daily_morning')
  ) {
    return {
      shouldSend: true,
      trigger:    'daily_morning',
      message:    WHATSAPP_TEMPLATES.daily_morning(
        snapshot.nombre,
        snapshot.dineroLibre,
        snapshot.gastoDiarioRecomendado
      ),
    }
  }

  return null
}

// ─── Helpers para Meta API ────────────────────────────────────────────────────

export interface MetaMessagePayload {
  messaging_product: 'whatsapp'
  to:                string
  type:              'text'
  text:              { body: string }
}

export function buildMetaPayload(
  phoneNumber: string,
  message:     string
): MetaMessagePayload {
  return {
    messaging_product: 'whatsapp',
    to:                phoneNumber,
    type:              'text',
    text:              { body: message },
  }
}

export async function sendWhatsappMessage(
  phoneNumber: string,
  message:     string,
  metaToken:   string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = buildMetaPayload(phoneNumber, message)

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : 'Error desconocido',
    }
  }
}