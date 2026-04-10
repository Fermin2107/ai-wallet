// ============================================================
// AI Wallet — Supabase Edge Function: whatsapp-coach
// supabase/functions/whatsapp-coach/index.ts
//
// Se ejecuta cada hora via Supabase Scheduled Functions.
// Para cada usuario con WhatsApp activo:
//   1. Carga transacciones, budgets, streak del mes actual
//   2. Calcula snapshot financiero (misma lógica que buildFinancialContext)
//   3. Evalúa triggers respetando cooldowns
//   4. Si hay trigger → envía mensaje por Meta API
//   5. Guarda en whatsapp_messages_log
//
// Deploy: supabase functions deploy whatsapp-coach
// Schedule: en Supabase Dashboard → Edge Functions → Schedule
//           cron: "0 * * * *" (cada hora)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  evaluateTriggers,
  sendWhatsappMessage,
  type FinancialSnapshot,
} from '../../lib/whatsapp-engine.ts'

// ─── Cálculo financiero server-side ──────────────────────────────────────────
// Replica la lógica de buildFinancialContext del frontend.
// Regla de oro: un solo lugar donde viven los cálculos — pero
// la Edge Function no puede importar desde el frontend, así que
// esta es la versión standalone equivalente.

function calcularSnapshot(
  transactions: TransactionRow[],
  budgets:      BudgetRow[],
  streak:       StreakRow | null,
  onboarding:   OnboardingRow | null,
  nombre:       string,
  selectedMonth: string
): FinancialSnapshot {
  const hoy           = new Date()
  const diaDelMes     = hoy.getDate()
  const ultimoDia     = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const diasRestantes = Math.max(1, ultimoDia - diaDelMes)
  const diasTransc    = Math.max(1, diaDelMes)

  const txMes = transactions.filter((t) =>
    (t.transaction_date ?? '').startsWith(selectedMonth)
  )

  const totalIngresado = txMes
    .filter((t) => t.type === 'ingreso')
    .reduce((s, t) => s + Number(t.amount), 0)

  const totalGastado = txMes
    .filter((t) => t.type === 'gasto')
    .reduce((s, t) => s + Number(t.amount), 0)

  const ingresoMensual   = Number(onboarding?.ingreso_mensual ?? 0)
  const objetivoAhorro   = Number(onboarding?.objetivo_ahorro ?? 0)
  const ingresoEfectivo  = totalIngresado > 0 ? totalIngresado : ingresoMensual
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre      = Math.max(0, dineroDisponible - objetivoAhorro)

  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastoUltimos7 = transactions
    .filter((t) => t.type === 'gasto' && new Date(t.transaction_date) >= hace7Dias)
    .reduce((s, t) => s + Number(t.amount), 0)
  const gastoDiarioPromedio   = gastoUltimos7 / 7
  const gastoDiarioRecomendado = diasRestantes > 0 ? dineroLibre / diasRestantes : 0

  const proyeccion = totalGastado + gastoDiarioPromedio * diasRestantes
  const superavit  = ingresoEfectivo - proyeccion - objetivoAhorro
  const vaALlegar  = superavit >= 0

  const budgetsMes = budgets.filter((b) => b.month_period === selectedMonth)
  const budgetAnalysis = budgetsMes.map((b) => {
    const spent = txMes
      .filter((t) => t.type === 'gasto' && t.category === b.category)
      .reduce((s, t) => s + Number(t.amount), 0)
    const pct    = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
    const status = pct >= 100 ? 'excedido' : pct >= 85 ? 'rojo' : pct >= 60 ? 'amarillo' : 'verde'
    return { category: b.category, percentUsed: Math.round(pct), status }
  })

  return {
    totalGastado,
    totalIngresado,
    ingresoEfectivo,
    dineroLibre,
    gastoDiarioRecomendado,
    diasRestantes,
    vaALlegar,
    superavit,
    budgetAnalysis,
    currentStreak:    streak?.current_streak    ?? 0,
    lastActivityDate: streak?.last_activity_date ?? null,
    nombre,
  }
}

// ─── Tipos de base de datos ───────────────────────────────────────────────────

interface TransactionRow {
  type:             string
  amount:           number
  category:         string
  transaction_date: string
}

interface BudgetRow {
  category:     string
  limit_amount: number
  month_period: string
}

interface StreakRow {
  current_streak:    number
  last_activity_date: string | null
}

interface OnboardingRow {
  ingreso_mensual: number
  objetivo_ahorro: number
}

interface WhatsappConfigRow {
  user_id:        string
  phone_number:   string
  preferred_hour: number
  timezone:       string
  nombre:         string | null
}

interface LogRow {
  trigger_type: string
  sent_at:      string
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const metaToken       = Deno.env.get('META_WHATSAPP_TOKEN')!
    const phoneNumberId   = Deno.env.get('META_PHONE_NUMBER_ID')!

    if (!metaToken || !phoneNumberId) {
      return new Response(
        JSON.stringify({ error: 'META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID no configurados' }),
        { status: 500 }
      )
    }

    // Cliente con service_role para bypassear RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const horaUTC    = new Date().getUTCHours()
    const selectedMonth = new Date().toISOString().slice(0, 7)

    // Cargar todos los usuarios con WhatsApp activo
    const { data: configs, error: configsError } = await supabase
      .from('user_whatsapp_config')
      .select('user_id, phone_number, preferred_hour, timezone, nombre')
      .eq('is_active', true)

    if (configsError) {
      console.error('Error cargando configs:', configsError.message)
      return new Response(JSON.stringify({ error: configsError.message }), { status: 500 })
    }

    const results = []

    for (const config of (configs as WhatsappConfigRow[])) {
      try {
        // Verificar hora local del usuario
        // Aproximación: usar preferred_hour vs hora UTC
        // En producción usarías una librería de timezone
        const horaLocal = (horaUTC + getTimezoneOffset(config.timezone)) % 24
        if (Math.abs(horaLocal - config.preferred_hour) > 1) {
          // No es la hora preferida de este usuario, saltear
          continue
        }

        // Cargar datos del usuario en paralelo
        const [txRes, budgetsRes, streakRes, onboardingRes, logsRes] = await Promise.all([
          supabase
            .from('transactions')
            .select('type, amount, category, transaction_date')
            .eq('user_id', config.user_id),
          supabase
            .from('budgets')
            .select('category, limit_amount, month_period')
            .eq('user_id', config.user_id),
          supabase
            .from('user_streaks')
            .select('current_streak, last_activity_date')
            .eq('user_id', config.user_id)
            .single(),
          supabase
            .from('onboarding_profiles')
            .select('ingreso_mensual, objetivo_ahorro')
            .eq('user_id', config.user_id)
            .single(),
          supabase
            .from('whatsapp_messages_log')
            .select('trigger_type, sent_at')
            .eq('user_id', config.user_id)
            .order('sent_at', { ascending: false })
            .limit(20),
        ])

        // Construir mapa de último envío por trigger
        const lastMessagesByTrigger: Record<string, string | null> = {}
        for (const log of (logsRes.data ?? []) as LogRow[]) {
          if (!lastMessagesByTrigger[log.trigger_type]) {
            lastMessagesByTrigger[log.trigger_type] = log.sent_at
          }
        }

        // Calcular snapshot financiero
        const snapshot = calcularSnapshot(
          (txRes.data ?? []) as TransactionRow[],
          (budgetsRes.data ?? []) as BudgetRow[],
          streakRes.data as StreakRow | null,
          onboardingRes.data as OnboardingRow | null,
          config.nombre ?? 'amigo',
          selectedMonth
        )

        // Evaluar triggers
        const hoy      = new Date()
        const diaMes   = hoy.getUTCDate()
        const diaSemana = hoy.getUTCDay()

        const triggerResult = evaluateTriggers(
          snapshot,
          lastMessagesByTrigger,
          horaLocal,
          diaMes,
          diaSemana
        )

        if (!triggerResult) {
          results.push({ user_id: config.user_id, sent: false, reason: 'no_trigger' })
          continue
        }

        // Enviar mensaje por Meta API
        const sendResult = await sendWhatsappMessage(
          config.phone_number,
          triggerResult.message,
          metaToken,
          phoneNumberId
        )

        if (!sendResult.success) {
          console.error(`Error enviando a ${config.user_id}:`, sendResult.error)
          results.push({ user_id: config.user_id, sent: false, error: sendResult.error })
          continue
        }

        // Guardar en log
        await supabase.from('whatsapp_messages_log').insert({
          user_id:      config.user_id,
          trigger_type: triggerResult.trigger,
          message_sent: triggerResult.message,
        })

        results.push({
          user_id: config.user_id,
          sent:    true,
          trigger: triggerResult.trigger,
        })
      } catch (userErr) {
        console.error(`Error procesando usuario ${config.user_id}:`, userErr)
        results.push({ user_id: config.user_id, sent: false, error: String(userErr) })
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error crítico en whatsapp-coach:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    )
  }
})

// Offset UTC aproximado por timezone
function getTimezoneOffset(timezone: string): number {
  const offsets: Record<string, number> = {
    'America/Argentina/Buenos_Aires': -3,
    'America/Argentina/Cordoba':      -3,
    'America/Montevideo':             -3,
    'America/Santiago':               -4,
    'America/Bogota':                 -5,
    'America/Lima':                   -5,
    'America/Mexico_City':            -6,
  }
  return offsets[timezone] ?? -3
}