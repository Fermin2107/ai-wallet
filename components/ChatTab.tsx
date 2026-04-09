'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { History, X, Plus, CheckCircle2 } from 'lucide-react'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { createBrowserClient } from '@supabase/ssr'
import { useWeeklySummary } from '../hooks/useWeeklySummary'
import { useDailyCoachMessage } from '../hooks/UseDailyCoachMessage'
import { useCoachProfile } from '../hooks/useCoachProfile'
import { useStreak } from '../hooks/useStreak'
import WeeklySummaryCard from '../components/WeeklySummaryCard'
import ChatUICard from './ChatUICard'
import StreakBadge from './StreakBadge'

// ─── Tipos ───────────────────────────────────────────────────
interface ChatTabProps {
  selectedMonth: string
  onDataChanged?: () => void
  onNavigateToBudgets?: () => void
}

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  isAuto?: boolean
  type?: 'normal' | 'success' | 'alert' | 'insight'
  ui?: { type: string; data: Record<string, unknown> }
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface Account {
  id: string
  name: string
  type: 'liquid' | 'credit' | 'savings'
  balance: number
  is_default: boolean
  is_active: boolean
}

// ─── CoachState ───────────────────────────────────────────────
type CoachState =
  | 'sin_cuentas'
  | 'sin_transacciones'
  | 'inicio_mes'
  | 'mitad_mes_bien'
  | 'mitad_mes_mal'
  | 'fin_mes_bien'
  | 'fin_mes_mal'
  | 'presupuesto_critico'
  | 'normal'

function getCoachState(
  ctx: ReturnType<typeof buildFinancialContext> | null,
  accounts: Account[],
  hasBudgets: boolean
): CoachState {
  if (!accounts || accounts.length === 0) return 'sin_cuentas'
  if (!ctx || ctx.totalGastado === 0) return 'sin_transacciones'

  const dia = new Date().getDate()

  // presupuesto_critico tiene prioridad, pero solo si hay budgets
  if (hasBudgets && ctx.budgetAnalysis.some((b) => b.percentUsed >= 85)) {
    return 'presupuesto_critico'
  }

  if (dia <= 5) return 'inicio_mes'

  if (dia <= 20) {
    return ctx.estado === 'bien' || ctx.estado === 'cuidado'
      ? 'mitad_mes_bien'
      : 'mitad_mes_mal'
  }

  // día 21+
  return ctx.vaALlegar ? 'fin_mes_bien' : 'fin_mes_mal'
}

// ─── Motor financiero ─────────────────────────────────────────
function buildFinancialContext(
  transactions: ReturnType<typeof useSimpleSupabase>['transactions'],
  budgets: ReturnType<typeof useSimpleSupabase>['budgets'],
  goals: ReturnType<typeof useSimpleSupabase>['goals'],
  onboarding: { ingreso_mensual: number; objetivo_ahorro: number },
  selectedMonth: string
) {
  const hoy = new Date()
  const diaDelMes = hoy.getDate()
  const ultimoDia = new Date(
    hoy.getFullYear(),
    hoy.getMonth() + 1,
    0
  ).getDate()
  const diasRestantes = Math.max(1, ultimoDia - diaDelMes)
  const diasTranscurridos = Math.max(1, diaDelMes)

  const txMes = transactions.filter((t) =>
    (t.transaction_date || '').startsWith(selectedMonth)
  )
  const totalIngresado = txMes
    .filter((t) => t.type === 'ingreso')
    .reduce((s, t) => s + Number(t.amount), 0)
  const totalGastado = txMes
    .filter((t) => t.type === 'gasto')
    .reduce((s, t) => s + Number(t.amount), 0)
  const ingresoEfectivo =
    totalIngresado > 0
      ? totalIngresado
      : onboarding.ingreso_mensual || 0
  const objetivoAhorro = onboarding.objetivo_ahorro || 0
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre = Math.max(0, dineroDisponible - objetivoAhorro)

  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastoUltimos7 = transactions
    .filter(
      (t) =>
        t.type === 'gasto' && new Date(t.transaction_date) >= hace7Dias
    )
    .reduce((s, t) => s + Number(t.amount), 0)
  const gastoDiarioPromedio = gastoUltimos7 / 7
  // Solo calcular si hay ingreso
  const gastoDiarioRecomendado =
    ingresoEfectivo > 0 && diasRestantes > 0
      ? dineroLibre / diasRestantes
      : 0

  const proyeccion =
    totalGastado + gastoDiarioPromedio * diasRestantes
  const superavit =
    ingresoEfectivo - proyeccion - objetivoAhorro
  const vaALlegar = superavit >= 0

  const budgetsMes = budgets.filter(
    (b) => b.month_period === selectedMonth
  )
  const budgetAnalysis = budgetsMes.map((b) => {
    const spent = txMes
      .filter((t) => t.type === 'gasto' && t.category === b.category)
      .reduce((s, t) => s + Number(t.amount), 0)
    const pct = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
    const projected =
      spent + (spent / diasTranscurridos) * diasRestantes
    const status =
      pct >= 100
        ? 'excedido'
        : pct >= 85
        ? 'rojo'
        : pct >= 60
        ? 'amarillo'
        : 'verde'
    return {
      category: b.category,
      limit: b.limit_amount,
      spent,
      remaining: b.limit_amount - spent,
      percentUsed: Math.round(pct),
      status,
      projectedEndOfMonth: Math.round(projected),
      willExceed: projected > b.limit_amount,
    }
  })

  const catMap: Record<string, number> = {}
  txMes
    .filter((t) => t.type === 'gasto')
    .forEach((t) => {
      catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount)
    })
  const topGastos = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, total]) => ({ category: cat, total: Math.round(total) }))

  const metasActivas = goals.filter((g) => !g.is_completed)
  const aportePorMeta =
    metasActivas.length > 0 ? dineroLibre / metasActivas.length : 0
  const goalAnalysis = metasActivas.map((g) => {
    const remaining = Math.max(0, g.target_amount - g.current_amount)
    const pct =
      g.target_amount > 0
        ? Math.min(
            100,
            Math.round((g.current_amount / g.target_amount) * 100)
          )
        : 0
    return {
      name: g.name,
      target: g.target_amount,
      current: g.current_amount,
      remaining,
      percentComplete: pct,
      monthsToComplete:
        aportePorMeta > 0 ? Math.ceil(remaining / aportePorMeta) : null,
    }
  })

  const alertas: string[] = []
  const fmt = (n: number) =>
    `$${Math.round(n).toLocaleString('es-AR')}`
  if (!vaALlegar)
    alertas.push(
      `A este ritmo te van a faltar ${fmt(Math.abs(superavit))} para llegar a fin de mes`
    )
  budgetAnalysis
    .filter((b) => b.percentUsed >= 85)
    .forEach((b) => {
      alertas.push(
        b.status === 'excedido'
          ? `Superaste el límite de ${b.category} en ${fmt(Math.abs(b.remaining))}`
          : `${b.category} está al ${b.percentUsed}% del límite`
      )
    })
  if (
    gastoDiarioPromedio > gastoDiarioRecomendado * 1.3 &&
    gastoDiarioRecomendado > 0
  ) {
    alertas.push(
      `Gastás ${fmt(gastoDiarioPromedio)}/día pero deberías gastar ${fmt(gastoDiarioRecomendado)}/día`
    )
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      70 +
        (vaALlegar ? 15 : -20) +
        (budgetAnalysis.filter((b) => b.percentUsed >= 80).length === 0
          ? 10
          : -5) +
        (dineroLibre > 0 ? 5 : 0)
    )
  )
  const estado: 'bien' | 'cuidado' | 'mal' =
    score >= 70 ? 'bien' : score >= 45 ? 'cuidado' : 'mal'

  const resumen = [
    `ESTADO: ${estado.toUpperCase()} (score ${score}/100)`,
    `INGRESO: ${fmt(ingresoEfectivo)} | GASTADO: ${fmt(totalGastado)} | LIBRE: ${fmt(dineroLibre)} | AHORRO OBJETIVO: ${fmt(objetivoAhorro)}`,
    `DÍAS RESTANTES: ${diasRestantes} | GASTO DIARIO REAL: ${fmt(gastoDiarioPromedio)}/día | RECOMENDADO: ${fmt(gastoDiarioRecomendado)}/día`,
    `PROYECCIÓN FIN DE MES: ${vaALlegar ? 'LLEGA' : 'NO LLEGA'} (superávit proyectado: ${fmt(superavit)})`,
    '',
    'PRESUPUESTOS:',
    ...budgetAnalysis.map(
      (b) =>
        `  [${b.status.toUpperCase()}] ${b.category}: gastó ${fmt(b.spent)} de ${fmt(b.limit)} (${b.percentUsed}%)${b.willExceed ? ' — VA A EXCEDER' : ''}`
    ),
    budgetAnalysis.length === 0 ? '  Sin presupuestos configurados' : '',
    '',
    'METAS:',
    ...goalAnalysis.map(
      (g) =>
        `  ${g.name}: ${fmt(g.current)} de ${fmt(g.target)} (${g.percentComplete}%)${g.monthsToComplete ? ` — ~${g.monthsToComplete} meses` : ''}`
    ),
    goalAnalysis.length === 0 ? '  Sin metas activas' : '',
    '',
    'TOP GASTOS DEL MES:',
    ...topGastos.map((c) => `  ${c.category}: ${fmt(c.total)}`),
    topGastos.length === 0 ? '  Sin gastos registrados este mes' : '',
    alertas.length > 0
      ? '\nALERTAS:\n' + alertas.map((a) => `  ⚠️ ${a}`).join('\n')
      : '',
  ].join('\n')

  return {
    estado,
    score,
    ingresoEfectivo,
    totalIngresado,
    totalGastado,
    dineroDisponible,
    dineroLibre,
    objetivoAhorro,
    gastoDiarioPromedio,
    gastoDiarioRecomendado,
    diasRestantes,
    vaALlegar,
    superavit,
    budgetAnalysis,
    goalAnalysis,
    topGastos,
    alertas,
    resumen,
  }
}

// ─── enrichUIData ─────────────────────────────────────────────
// Solo mapea valores ya calculados en buildFinancialContext al
// formato que cada ChatUICard espera. No calcula nada nuevo.
function enrichUIData(
  type: string,
  ctx: ReturnType<typeof buildFinancialContext>,
  actionData?: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'progress_bar':
      return {
        gastado: ctx.totalGastado,
        ingreso: ctx.ingresoEfectivo,
        libre: ctx.dineroLibre,
        objetivo_ahorro: ctx.objetivoAhorro,
        dias_restantes: ctx.diasRestantes,
        va_a_llegar: ctx.vaALlegar,
        estado: ctx.estado,
      }
    case 'category_chips':
      return {
        categorias: ctx.topGastos,
        total: ctx.totalGastado,
      }
    case 'goal_card':
      return {
        metas: ctx.goalAnalysis,
      }
    case 'budget_alert':
      return {
        budgets: ctx.budgetAnalysis.filter((b) => b.percentUsed >= 60),
      }
    case 'daily_limit':
      return {
        recomendado: ctx.gastoDiarioRecomendado,
        real: ctx.gastoDiarioPromedio,
        dias_restantes: ctx.diasRestantes,
      }
    case 'plan_mensual':
      return {
        ...(actionData ?? {}),
        libre: ctx.dineroLibre,
        ingreso: ctx.ingresoEfectivo,
      }
    default:
      return {}
  }
}

// ─── Intent ──────────────────────────────────────────────────
type Intent = 'registro' | 'consulta_simple' | 'complejo'

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase()
  const tieneNumero = /\d/.test(m)
  const verbosGasto = [
    'gasté', 'gaste', 'pagué', 'pague', 'compré', 'compre',
    'salió', 'salio', 'costó', 'costo',
  ]
  const verbosIngreso = [
    'cobré', 'cobre', 'me pagaron', 'entraron', 'ingresé', 'ingrese',
    'recibí', 'recibi', 'gané',
  ]
  if (
    tieneNumero &&
    (verbosGasto.some((v) => m.includes(v)) ||
      verbosIngreso.some((v) => m.includes(v)))
  )
    return 'registro'
  if (
    m.includes('puedo gastar') ||
    m.includes('por día') ||
    m.includes('cómo voy') ||
    m.includes('como voy') ||
    m.includes('resumen') ||
    m.includes('estado')
  )
    return 'consulta_simple'
  return 'complejo'
}

// ─── fmt helper ───────────────────────────────────────────────
const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString('es-AR')}`

// ─── autoRespond ─────────────────────────────────────────────
// Agrega nombre quirúrgicamente: solo en estado mal, no llega, o budget crítico
function autoRespond(
  msg: string,
  ctx: ReturnType<typeof buildFinancialContext>,
  nombre?: string
): string | null {
  const m = msg.toLowerCase()

  // ¿Usar nombre? Solo en momentos de impacto
  const usarNombre =
    ctx.estado === 'mal' ||
    !ctx.vaALlegar ||
    ctx.budgetAnalysis.some((b) => b.percentUsed >= 85)
  const prefijo = usarNombre && nombre ? `${nombre}, ` : ''

  if (
    m.includes('por día') ||
    m.includes('por dia') ||
    m.includes('diario') ||
    m.includes('cuánto puedo gastar')
  ) {
    if (ctx.gastoDiarioRecomendado <= 0) {
      return `${prefijo}no te queda margen para gastar este mes.`
    }
    if (ctx.ingresoEfectivo <= 0) {
      return `Primero registrá tu ingreso del mes para calcular cuánto podés gastar por día.`
    }
    const comp =
      ctx.gastoDiarioPromedio > ctx.gastoDiarioRecomendado
        ? `Ahora vas a ${fmt(ctx.gastoDiarioPromedio)}/día, tenés que bajar.`
        : `Vas bien, estás dentro del rango.`
    return `${prefijo}podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día para llegar a fin de mes. ${comp}`
  }

  if (
    m.includes('cómo voy') ||
    m.includes('como voy') ||
    m.includes('resumen') ||
    m.includes('estado')
  ) {
    const emoji =
      ctx.estado === 'bien' ? '🟢' : ctx.estado === 'cuidado' ? '🟡' : '🔴'
    const proy = ctx.vaALlegar
      ? `Llegás con ${fmt(ctx.superavit)} de sobra.`
      : `${prefijo}te faltan ${fmt(Math.abs(ctx.superavit))} para llegar.`
    return `${emoji} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ${proy}${ctx.alertas[0] ? ' ' + ctx.alertas[0] + '.' : ''}`
  }

  const matchPuedo = m.match(
    /(?:puedo|alcanza|tengo para)[^$\d]*\$?([\d.,]+)/
  )
  if (matchPuedo) {
    const monto = parseFloat(
      matchPuedo[1].replace(/\./g, '').replace(',', '.')
    )
    if (!isNaN(monto)) {
      const libre = ctx.dineroLibre
      if (monto > libre)
        return `${prefijo}no te alcanza. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
      if (monto > libre * 0.5)
        return `Podés, pero te deja justo. Usarías el ${Math.round((monto / libre) * 100)}% de lo que te queda.`
      return `Sí, andá tranquilo. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
    }
  }

  return null
}

// ─── extractAndUpdateProfile ─────────────────────────────────
async function extractAndUpdateProfile(
  message: string,
  updateProfile: (extract: import('../hooks/useCoachProfile').ProfileExtract) => Promise<void>
): Promise<void> {
  try {
    const response = await fetch('/api/extract-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!response.ok) return
    const data = await response.json()
    if (data && typeof data === 'object') {
      await updateProfile(data)
    }
  } catch {
    // Silenciar — nunca rompe la experiencia principal
  }
}

// ─── getWelcome ───────────────────────────────────────────────
function getWelcome(
  ctx: ReturnType<typeof buildFinancialContext> | null,
  coachState: CoachState,
  accounts: Account[],
  nombre?: string,
  streak?: number
): string {
  const hora = new Date().getHours()
  const saludo =
    hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const n = nombre ? `, ${nombre}` : ''
  const streakMsg =
    streak && streak > 1 ? ` ${streak} días seguidos registrando 🔥` : ''

  switch (coachState) {
    case 'sin_cuentas':
      return `${saludo}${n} 👋 Para arrancar, contame cuánto tenés disponible ahora. Puede ser efectivo, Mercado Pago, banco... lo que uses más seguido.`

    case 'sin_transacciones': {
      if (!ctx || ctx.ingresoEfectivo <= 0) {
        return `${saludo}${n}! Todavía no registraste gastos este mes. ¿Cuánto fue lo último que pagaste?`
      }
      const saldoTotal = accounts
        .filter((a) => a.type === 'liquid' || a.type === 'savings')
        .reduce((s, a) => s + Number(a.balance), 0)
      if (saldoTotal > 0 && ctx.gastoDiarioRecomendado > 0) {
        return `${saludo}${n}! Tenés ${fmt(saldoTotal)} disponibles. Con tu objetivo de ahorro, podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿Qué gastaste hoy?`
      }
      return `${saludo}${n}! Todavía no registraste gastos este mes. ¿Cuánto fue lo último que pagaste?`
    }

    case 'inicio_mes': {
      if (!ctx) return `${saludo}${n}! ¿Qué registramos hoy?`
      return `${saludo}${n}! Arrancamos el mes con ${fmt(ctx.dineroLibre)} disponibles después del ahorro. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿Qué registramos?`
    }

    case 'presupuesto_critico': {
      if (!ctx) return `${saludo}${n}! ¿Qué registramos hoy?`
      const critico = ctx.budgetAnalysis.find((b) => b.percentUsed >= 85)
      if (critico) {
        return `Ojo${n} 🔴 ${critico.category} está al ${critico.percentUsed}% del límite y quedan ${ctx.diasRestantes} días. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día si querés llegar bien.`
      }
      return `${saludo}${n}! Tenés presupuestos en riesgo. ¿Revisamos?`
    }

    case 'mitad_mes_bien': {
      if (!ctx) return `${saludo}${n}! ¿Qué registramos hoy?`
      return `${saludo}${n}!${streakMsg} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ¿Qué registramos hoy?`
    }

    case 'mitad_mes_mal': {
      if (!ctx) return `${saludo}${n}! ¿Qué registramos hoy?`
      return `${saludo}${n}! Gastaste ${fmt(ctx.totalGastado)} y a este ritmo te faltan ${fmt(Math.abs(ctx.superavit))} para llegar. Gastá máx ${fmt(ctx.gastoDiarioRecomendado)}/día.`
    }

    case 'fin_mes_bien': {
      if (!ctx) return `${saludo}${n}! ¿Qué registramos hoy?`
      return `${saludo}${n}! Vas a cerrar el mes en verde con ${fmt(ctx.superavit)} de sobra 🟢 Podés gastar ${fmt(ctx.gastoDiarioRecomendado)} hoy.`
    }

    case 'fin_mes_mal': {
      if (!ctx) return `${saludo}${n}! ¿Armamos un plan?`
      return `${saludo}${n}! Gastaste ${fmt(ctx.totalGastado)} y a este ritmo no llegás a fin de mes. Te faltan ${fmt(Math.abs(ctx.superavit))}. ¿Armamos un plan?`
    }

    case 'normal':
    default: {
      if (!ctx || ctx.totalGastado === 0) {
        return `${saludo}${n}! ¿Qué fue lo último que pagaste?`
      }
      return `${saludo}${n}!${streakMsg} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ¿Qué registramos hoy?`
    }
  }
}

// ─── getQuickActions ──────────────────────────────────────────
interface QuickAction {
  id: string
  emoji: string
  label: string
  message: string
  color: string
}

function getQuickActions(
  ctx: ReturnType<typeof buildFinancialContext> | null,
  coachState: CoachState
): QuickAction[] {
  const hora = new Date().getHours()
  const esMañana = hora >= 6 && hora < 12
  const esMediadia = hora >= 12 && hora < 15
  const esNoche = hora >= 20

  switch (coachState) {
    case 'sin_cuentas':
      return [
        {
          id: 'efectivo',
          emoji: '💵',
          label: 'Tengo efectivo',
          message: 'Quiero registrar mi efectivo disponible',
          color: 'border-[#00C853]/25 bg-[#00C853]/8',
        },
        {
          id: 'mp',
          emoji: '📱',
          label: 'Tengo Mercado Pago',
          message: 'Quiero agregar mi cuenta de Mercado Pago',
          color: 'border-white/10 bg-white/4',
        },
        {
          id: 'banco',
          emoji: '🏦',
          label: 'Tengo cuenta bancaria',
          message: 'Quiero agregar mi cuenta bancaria',
          color: 'border-white/10 bg-white/4',
        },
      ]

    case 'sin_transacciones':
      if (esMañana) {
        return [
          {
            id: 'desayuno',
            emoji: '☕',
            label: 'Desayuno / café',
            message: 'Gasté en el desayuno hoy',
            color: 'border-[#FF6D00]/25 bg-[#FF6D00]/8',
          },
          {
            id: 'transporte',
            emoji: '🚌',
            label: 'Transporte',
            message: 'Gasté en transporte hoy',
            color: 'border-white/10 bg-white/4',
          },
          {
            id: 'otro-mañana',
            emoji: '➕',
            label: 'Otro gasto',
            message: 'Quiero registrar un gasto',
            color: 'border-white/10 bg-white/4',
          },
        ]
      }
      if (esMediadia) {
        return [
          {
            id: 'almuerzo',
            emoji: '🍔',
            label: 'Almuerzo',
            message: 'Gasté en el almuerzo hoy',
            color: 'border-[#FF6D00]/25 bg-[#FF6D00]/8',
          },
          {
            id: 'cafe-tarde',
            emoji: '☕',
            label: 'Café',
            message: 'Gasté en un café',
            color: 'border-white/10 bg-white/4',
          },
          {
            id: 'otro-tarde',
            emoji: '➕',
            label: 'Otro gasto',
            message: 'Quiero registrar un gasto',
            color: 'border-white/10 bg-white/4',
          },
        ]
      }
      return [
        {
          id: 'super',
          emoji: '🛒',
          label: 'Supermercado',
          message: 'Fui al super hoy',
          color: 'border-white/10 bg-white/4',
        },
        {
          id: 'delivery',
          emoji: '🛵',
          label: 'Delivery',
          message: 'Pedí delivery hoy',
          color: 'border-[#FF6D00]/25 bg-[#FF6D00]/8',
        },
        {
          id: 'otro-base',
          emoji: '➕',
          label: 'Otro gasto',
          message: 'Quiero registrar un gasto',
          color: 'border-white/10 bg-white/4',
        },
      ]

    case 'presupuesto_critico': {
      const critico =
        ctx?.budgetAnalysis.find((b) => b.percentUsed >= 85) ?? null
      return [
        {
          id: 'cuanto-queda',
          emoji: '⚠️',
          label: critico
            ? `${critico.category} al ${critico.percentUsed}%`
            : '¿Cuánto me queda?',
          message: critico
            ? `¿Cuánto me queda en ${critico.category}?`
            : '¿Cuánto me queda en cada categoría?',
          color: 'border-[#FFD740]/20 bg-[#FFD740]/8',
        },
        {
          id: 'como-bajar',
          emoji: '📉',
          label: 'Cómo bajo gastos',
          message: '¿Cómo puedo bajar mis gastos este mes?',
          color: 'border-white/10 bg-white/4',
        },
        {
          id: 'anotar-critico',
          emoji: '✏️',
          label: 'Anotar gasto',
          message: '¿Cómo voy hoy?',
          color: 'border-[#00C853]/25 bg-[#00C853]/8',
        },
      ]
    }

    case 'fin_mes_mal':
      return [
        {
          id: 'recortar',
          emoji: '✂️',
          label: '¿Qué puedo recortar?',
          message: '¿Qué gastos puedo recortar para llegar a fin de mes?',
          color: 'border-[#FF5252]/20 bg-[#FF5252]/8',
        },
        {
          id: 'cuanto-falta',
          emoji: '🎯',
          label: '¿Cuánto me falta?',
          message: '¿Cuánto me falta para llegar a fin de mes?',
          color: 'border-white/10 bg-white/4',
        },
        {
          id: 'plan-fin',
          emoji: '📋',
          label: 'Armá un plan',
          message: '¿Cómo puedo llegar a fin de mes?',
          color: 'border-white/10 bg-white/4',
        },
      ]

    case 'fin_mes_bien': {
      if (!ctx) return []
      return [
        {
          id: 'sobra-fin',
          emoji: '💰',
          label: `Me sobran ${fmt(ctx.dineroLibre)}`,
          message: '¿Qué hago con el dinero que me sobra?',
          color: 'border-[#00C853]/20 bg-[#00C853]/5',
        },
        {
          id: 'anotar-fin',
          emoji: '✏️',
          label: esNoche ? 'Cerrar el día' : 'Anotar gasto',
          message: '¿Cómo voy hoy?',
          color: 'border-[#00C853]/25 bg-[#00C853]/8',
        },
        {
          id: 'meta-fin',
          emoji: '🏆',
          label: ctx.goalAnalysis[0]
            ? ctx.goalAnalysis[0].name.slice(0, 14)
            : 'Mis metas',
          message: ctx.goalAnalysis[0]
            ? `¿Cómo voy con mi meta de ${ctx.goalAnalysis[0].name}?`
            : '¿Cómo van mis metas?',
          color: 'border-[#69F0AE]/15 bg-[#69F0AE]/5',
        },
      ]
    }

    case 'mitad_mes_mal': {
      if (!ctx) return []
      return [
        {
          id: 'plan-mitad',
          emoji: '🎯',
          label: 'Armá un plan',
          message: '¿Cómo puedo llegar a fin de mes?',
          color: 'border-[#FF5252]/20 bg-[#FF5252]/8',
        },
        {
          id: 'diario-mitad',
          emoji: '📅',
          label: `${fmt(ctx.gastoDiarioRecomendado)}/día`,
          message: '¿Cuánto puedo gastar por día?',
          color: 'border-white/10 bg-white/4',
        },
        {
          id: 'anotar-mitad',
          emoji: '✏️',
          label: 'Anotar gasto',
          message: '¿Cómo voy hoy?',
          color: 'border-[#00C853]/25 bg-[#00C853]/8',
        },
      ]
    }

    // inicio_mes, mitad_mes_bien, normal
    default: {
      if (!ctx) return []
      const hora2 = new Date().getHours()
      const labelAnotar =
        hora2 < 12
          ? 'Anotar gasto de hoy'
          : hora2 < 17
          ? 'Anotar almuerzo / salida'
          : 'Cerrar el día'

      const actions: QuickAction[] = [
        {
          id: 'anotar-default',
          emoji: '✏️',
          label: labelAnotar,
          message: '¿Cómo voy hoy?',
          color: 'border-[#00C853]/25 bg-[#00C853]/8',
        },
      ]

      if (ctx.dineroLibre > 0 && ctx.estado === 'bien') {
        actions.push({
          id: 'sobra-default',
          emoji: '💰',
          label: `${fmt(ctx.dineroLibre)} libres`,
          message: '¿Qué hago con el dinero que me sobra?',
          color: 'border-[#00C853]/20 bg-[#00C853]/5',
        })
      } else {
        actions.push({
          id: 'status-default',
          emoji: '📊',
          label: '¿Cómo voy?',
          message: '¿Cómo voy este mes?',
          color: 'border-white/10 bg-white/4',
        })
      }

      const enRiesgo = ctx.budgetAnalysis.find(
        (b) => b.status === 'rojo' && b.category !== 'otros'
      )
      const metaActiva = ctx.goalAnalysis[0]
      if (enRiesgo) {
        actions.push({
          id: 'riesgo-default',
          emoji: '⚠️',
          label: `${enRiesgo.category} al ${enRiesgo.percentUsed}%`,
          message: `¿Cuánto me queda en ${enRiesgo.category}?`,
          color: 'border-[#FFD740]/20 bg-[#FFD740]/8',
        })
      } else if (metaActiva) {
        actions.push({
          id: 'meta-default',
          emoji: '🏆',
          label: metaActiva.name.slice(0, 14),
          message: `¿Cómo voy con mi meta de ${metaActiva.name}?`,
          color: 'border-[#69F0AE]/15 bg-[#69F0AE]/5',
        })
      } else {
        actions.push({
          id: 'diario-default',
          emoji: '📅',
          label: `${fmt(ctx.gastoDiarioRecomendado)}/día`,
          message: '¿Cuánto puedo gastar por día?',
          color: 'border-white/10 bg-white/4',
        })
      }

      return actions
    }
  }
}

// ─── Mensaje proactivo (sin Groq) ─────────────────────────────
// Mantener para compatibilidad — el daily hook lo reemplaza
function getProactiveMessage(
  ctx: ReturnType<typeof buildFinancialContext>,
  _onboarding: { nombre?: string }
): string | null {
  const hora = new Date().getHours()
  const dia = new Date().getDate()
  const diaSemana = new Date().getDay()

  if (ctx.totalGastado === 0) return null
  if (diaSemana === 1) return null

  const excedido = ctx.budgetAnalysis.find(
    (b) => b.status === 'excedido' && b.category !== 'otros'
  )
  if (excedido)
    return `Superaste ${excedido.category} en ${fmt(Math.abs(excedido.remaining))}. ¿Querés ver en qué gastaste ahí?`

  if (!ctx.vaALlegar && ctx.diasRestantes > 5)
    return `A este ritmo te van a faltar ${fmt(Math.abs(ctx.superavit))} para llegar a fin de mes. ¿Armamos un plan?`

  const enRiesgo = ctx.budgetAnalysis.find(
    (b) => b.status === 'rojo' && b.category !== 'otros'
  )
  if (enRiesgo)
    return `${enRiesgo.category} está al ${enRiesgo.percentUsed}% del límite, quedan ${ctx.diasRestantes} días. ¿Revisamos?`

  if (dia <= 3 && ctx.totalIngresado === 0)
    return `¿Ya llegó el sueldo? Registralo para que el plan funcione bien.`

  if (ctx.estado === 'bien' && ctx.diasRestantes <= 7)
    return `Vas a cerrar el mes en verde con ${fmt(ctx.superavit)} de sobra 🟢`

  if (hora >= 20)
    return `¿Cómo terminó el día? Si gastaste algo, lo anoto.`
  if (hora >= 12 && hora <= 14 && ctx.gastoDiarioRecomendado > 0)
    return `Recordatorio de mediodía: podés gastar hasta ${fmt(ctx.gastoDiarioRecomendado)} hoy.`

  return null
}

// ─── Formato fecha sidebar ─────────────────────────────────────
function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round(
    (today.getTime() - day.getTime()) / 86400000
  )
  if (diff === 0)
    return d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  if (diff === 1) return 'Ayer'
  if (diff < 7)
    return d.toLocaleDateString('es-AR', { weekday: 'short' })
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
  })
}

const ACCIONES_QUE_MODIFICAN = [
  'INSERT_TRANSACTION',
  'CREATE_GOAL',
  'CREATE_BUDGET',
  'UPDATE_GOAL_PROGRESS',
]

// ─── Componente principal ─────────────────────────────────────
export default function ChatTab({
  selectedMonth,
  onDataChanged,
  onNavigateToBudgets,
}: ChatTabProps) {
  const { transactions, budgets, goals, refresh } = useSimpleSupabase()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [messages, setMessages] = useState<Message[]>([])
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    null
  )

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ctx, setCtx] = useState<ReturnType<
    typeof buildFinancialContext
  > | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [onboarding, setOnboarding] = useState<{
    nombre?: string
    ingreso_mensual?: number
    objetivo_ahorro?: number
  }>({})
  const [userId, setUserId] = useState<string | null>(null)
  const {
    streak: streakData,
    justReachedMilestone,
    clearMilestone,
    bumpStreak,
  } = useStreak()
  const streakCount = streakData.currentStreak
  const [showSuccessFlash, setShowSuccessFlash] = useState(false)
  const [gastoInusualAlert, setGastoInusualAlert] = useState<{
    categoria: string
    gastoActual: number
    promedioHistorico: number
  } | null>(null)
  const [pendingAccountMessage, setPendingAccountMessage] = useState<
    string | null
  >(null)
  const [accountPickerOptions, setAccountPickerOptions] = useState<
    { id: string; name: string; type: string }[]
  >([])
  const [proactiveShown, setProactiveShown] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  // WeeklySummary como card
  const [weeklySummaryData, setWeeklySummaryData] = useState<{
    totalGastado: number
    totalIngresado: number
    topCategoria: { nombre: string; total: number } | null
    cantidadTransacciones: number
    diasConGastos: number
  } | null>(null)
  const [showWeeklyCard, setShowWeeklyCard] = useState(false)

  const weeklySummary = useWeeklySummary()
  const weeklySummaryInjected = useRef(false)
  const { shouldShowDaily, buildDailyMessage, markDailyShown } =
    useDailyCoachMessage()
  const { updateProfile, buildProfileContext } = useCoachProfile()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── CoachState memoizado ──
  const hasBudgets = budgets.length > 0
  const coachState = useMemo<CoachState>(
    () => getCoachState(ctx, accounts, hasBudgets),
    [ctx, accounts, hasBudgets]
  )

  // ── Token helper ──
  const getToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [supabase])

  const authHeaders = useCallback(async (): Promise<
    Record<string, string>
  > => {
    const token = await getToken()
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [getToken])

  // ── Sesiones ──
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const h = await authHeaders()
      const res = await fetch('/api/chat-sessions', { headers: h })
      const json = await res.json()
      setSessions(json.sessions ?? [])
    } catch {
      /* silenciar */
    } finally {
      setLoadingSessions(false)
    }
  }, [authHeaders])

  const fetchMessages = useCallback(
    async (sessionId: string) => {
      setLoadingMessages(true)
      try {
        const h = await authHeaders()
        const res = await fetch(
          `/api/chat-sessions/${sessionId}/messages`,
          { headers: h }
        )
        const json = await res.json()
        const restored: Message[] = (json.messages ?? []).map(
          (m: {
            id: string
            content: string
            role: string
            created_at: string
            is_auto: boolean
          }) => ({
            id: m.id,
            text: m.content,
            sender: m.role === 'user' ? 'user' : 'ai',
            timestamp: new Date(m.created_at),
            isAuto: m.is_auto,
          })
        )
        const history: Array<{
          role: 'user' | 'assistant'
          content: string
        }> = []
        for (const m of json.messages ?? []) {
          if (!m.is_auto) history.push({ role: m.role, content: m.content })
        }
        setMessages(restored)
        setConversationHistory(history)
        setActiveSessionId(sessionId)
        setSidebarOpen(false)
      } catch {
        /* silenciar */
      } finally {
        setLoadingMessages(false)
      }
    },
    [authHeaders]
  )

  const createSession = useCallback(
    async (title: string): Promise<string | null> => {
      try {
        const h = await authHeaders()
        const res = await fetch('/api/chat-sessions', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ title }),
        })
        const json = await res.json()
        setSessions((prev) => [json.session, ...prev])
        return json.session.id
      } catch {
        return null
      }
    },
    [authHeaders]
  )

  const persistMessage = useCallback(
    async (
      sessionId: string,
      role: 'user' | 'assistant',
      content: string,
      isAuto = false
    ) => {
      try {
        const h = await authHeaders()
        await fetch(`/api/chat-sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ role, content, is_auto: isAuto }),
        })
        setSessions((prev) =>
          prev
            .map((s) =>
              s.id === sessionId
                ? { ...s, updated_at: new Date().toISOString() }
                : s
            )
            .sort(
              (a, b) =>
                new Date(b.updated_at).getTime() -
                new Date(a.updated_at).getTime()
            )
        )
      } catch {
        /* silenciar */
      }
    },
    [authHeaders]
  )

  const deleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const h = await authHeaders()
        await fetch('/api/chat-sessions', {
          method: 'DELETE',
          headers: h,
          body: JSON.stringify({ sessionId }),
        })
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        if (sessionId === activeSessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId)
          if (remaining.length > 0) fetchMessages(remaining[0].id)
          else startNewSession()
        }
      } catch {
        /* silenciar */
      }
    },
    [authHeaders, activeSessionId, sessions]
  )

  const startNewSession = useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
    setConversationHistory([])
    setGastoInusualAlert(null)
    setPendingAccountMessage(null)
    setAccountPickerOptions([])
    setProactiveShown(false)
    setSidebarOpen(false)
  }, [])

  useEffect(() => {
    if (sidebarOpen) fetchSessions()
  }, [sidebarOpen])

  // ── Cargar usuario, onboarding, streak y cuentas ──
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const uid = user?.id
      if (!uid) return
      setUserId(uid)
      const stored = localStorage.getItem(
        `ai_wallet_onboarding_${uid}`
      )
      if (stored) {
        try {
          setOnboarding(JSON.parse(stored))
        } catch {
          /* silenciar */
        }
      }

      // Cargar cuentas
      const { data: accsData } = await supabase
        .from('accounts')
        .select('id, name, type, balance, is_default, is_active')
        .eq('user_id', uid)
        .eq('is_active', true)
      if (accsData) setAccounts(accsData as Account[])
    }
    load()
  }, [])

  useEffect(() => {
    if (transactions !== undefined) setDataLoaded(true)
  }, [transactions])

  // ── Hito de streak alcanzado → celebración + análisis especial ──
  useEffect(() => {
    if (!justReachedMilestone) return
    const timer = setTimeout(() => {
      addMessage(justReachedMilestone.mensaje, 'ai', true, 'insight')
      clearMilestone()
      setTimeout(() => {
        handleSendMessage(justReachedMilestone.analisisIntent)
      }, 1500)
    }, 800)
    return () => clearTimeout(timer)
  }, [justReachedMilestone]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resumen semanal → ahora es card, no mensaje ──
  useEffect(() => {
    if (
      !transactions?.length ||
      weeklySummaryInjected.current ||
      !userId
    )
      return
    if (!weeklySummary.shouldShow(userId)) return
    const summaryData = weeklySummary.buildSummary(
      transactions,
      budgets,
      goals
    )
    if (!summaryData) return
    setWeeklySummaryData(summaryData)
    setShowWeeklyCard(true)
    weeklySummaryInjected.current = true
    weeklySummary.markShown(userId)
  }, [transactions, budgets, goals, userId])

  // ── Contexto financiero ──
  useEffect(() => {
    if (!transactions || !budgets || !goals) return
    const ob = {
      ingreso_mensual: onboarding.ingreso_mensual || 0,
      objetivo_ahorro: onboarding.objetivo_ahorro || 0,
    }
    setCtx(
      buildFinancialContext(
        transactions,
        budgets,
        goals,
        ob,
        selectedMonth
      )
    )
  }, [
    transactions.length,
    budgets.length,
    goals.length,
    selectedMonth,
    onboarding,
  ])

  // ── Mensaje diario proactivo ──
  useEffect(() => {
    if (!ctx || !dataLoaded || !userId || isLoading) return
    if (messages.length > 0 || proactiveShown) return
    if (coachState === 'sin_cuentas' || coachState === 'sin_transacciones')
      return

    if (!shouldShowDaily(userId)) return

    const dailyMsg = buildDailyMessage(ctx, onboarding.nombre, coachState)
    if (!dailyMsg) return

    const timer = setTimeout(() => {
      setMessages((prev) => {
        if (prev.length > 0) return prev
        return [
          {
            id: `daily-${Date.now()}`,
            text: dailyMsg,
            sender: 'ai',
            timestamp: new Date(),
            isAuto: true,
          },
        ]
      })
      markDailyShown(userId)
      setProactiveShown(true)
    }, 400)

    return () => clearTimeout(timer)
  }, [ctx, dataLoaded, userId, coachState])

  // ── Fallback: mensaje proactivo clásico (si no es la primera vez del día) ──
  useEffect(() => {
    if (!ctx || !dataLoaded || messages.length > 0 || proactiveShown)
      return
    if (coachState === 'sin_cuentas' || coachState === 'sin_transacciones')
      return
    if (new Date().getDay() === 1 && transactions.length > 0) return

    const proactivo = getProactiveMessage(ctx, onboarding)
    if (!proactivo) return

    const timer = setTimeout(() => {
      setMessages((prev) => {
        if (prev.length > 0) return prev
        return [
          {
            id: `proactive-${Date.now()}`,
            text: proactivo,
            sender: 'ai',
            timestamp: new Date(),
            isAuto: true,
          },
        ]
      })
      setProactiveShown(true)
    }, 400)

    return () => clearTimeout(timer)
  }, [ctx, dataLoaded, messages.length, proactiveShown, coachState])

  // ── Scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Contexto backend ──
  const buildBackendContext = useCallback(() => {
    if (!ctx) return {}
    const hoy = new Date()
    const hace3Meses = new Date(
      hoy.getFullYear(),
      hoy.getMonth() - 3,
      1
    )
      .toISOString()
      .slice(0, 7)
    const txHistorico = transactions.filter((t) => {
      const mes = (t.transaction_date || '').slice(0, 7)
      return (
        mes >= hace3Meses &&
        mes < selectedMonth &&
        t.type === 'gasto'
      )
    })
    const mesesConDatos = Array.from(
      new Set(
        txHistorico.map((t) => (t.transaction_date || '').slice(0, 7))
      )
    ).filter(Boolean)
    const cantMeses = Math.max(1, mesesConDatos.length)
    const promedioPorCategoria: Record<string, number> = {}
    txHistorico.forEach((t) => {
      const cat = t.category || 'otros'
      promedioPorCategoria[cat] =
        (promedioPorCategoria[cat] || 0) + Number(t.amount)
    })
    Object.keys(promedioPorCategoria).forEach((cat) => {
      promedioPorCategoria[cat] = Math.round(
        promedioPorCategoria[cat] / cantMeses
      )
    })
    const gastoMensualPromedio = Object.values(
      promedioPorCategoria
    ).reduce((s, v) => s + v, 0)
    const esenciales = [
      'alimentacion', 'comida', 'supermercado', 'alquiler',
      'servicios', 'luz', 'gas', 'agua', 'internet', 'telefono',
      'salud', 'medicina', 'farmacia', 'educacion', 'transporte',
      'nafta', 'sube',
    ]
    const discrecionales = [
      'salidas', 'entretenimiento', 'ropa', 'caprichos',
      'suscripciones', 'hobbies', 'viajes', 'restaurante', 'bar',
      'delivery',
    ]
    const categoriasClasificadas = Object.entries(
      promedioPorCategoria
    ).map(([cat, promedio]) => ({
      categoria: cat,
      promedio_mensual: promedio,
      tipo: esenciales.some((e) => cat.includes(e) || e.includes(cat))
        ? 'esencial'
        : discrecionales.some((d) => cat.includes(d) || d.includes(cat))
        ? 'discrecional'
        : 'variable',
      gasto_este_mes:
        ctx.budgetAnalysis.find((b) => b.category === cat)?.spent ||
        transactions
          .filter(
            (t) =>
              t.type === 'gasto' &&
              t.category === cat &&
              (t.transaction_date || '').startsWith(selectedMonth)
          )
          .reduce((s, t) => s + Number(t.amount), 0),
    }))
    const gastoMinimoMensual = categoriasClasificadas
      .filter((c) => c.tipo === 'esencial')
      .reduce((s, c) => s + c.promedio_mensual, 0)

    return {
      nombre_usuario: onboarding.nombre || null,
      medio_pago_habitual: null,
      resumen_financiero: ctx.resumen,
      usuario_nuevo: coachState === 'sin_cuentas' || coachState === 'sin_transacciones',
      fecha_hoy: new Date().toISOString().split('T')[0],
      mes_seleccionado: selectedMonth,
      ingreso_mensual: onboarding.ingreso_mensual || 0,
      objetivo_ahorro: ctx.objetivoAhorro,
      dinero_libre: Math.round(ctx.dineroLibre),
      gasto_diario_recomendado: Math.round(ctx.gastoDiarioRecomendado),
      dias_restantes: ctx.diasRestantes,
      estado_mes: ctx.estado,
      budgets: ctx.budgetAnalysis.map((b) => ({
        categoria: b.category,
        limite: b.limit,
        gastado: b.spent,
        disponible: b.remaining,
        estado: b.status,
        porcentaje: b.percentUsed,
      })),
      goals: ctx.goalAnalysis.map((g) => ({
        nombre: g.name,
        objetivo: g.target,
        actual: g.current,
        faltante: g.remaining,
        porcentaje: g.percentComplete,
        meses_estimados: g.monthsToComplete,
      })),
      alertas: ctx.alertas,
      historico:
        mesesConDatos.length > 0
          ? {
              meses_analizados: cantMeses,
              gasto_mensual_promedio: Math.round(gastoMensualPromedio),
              gasto_minimo_mensual: Math.round(gastoMinimoMensual),
              categorias: categoriasClasificadas,
            }
          : null,
      perfil_coach: buildProfileContext(),
    }
  }, [ctx, selectedMonth, transactions, onboarding, coachState, buildProfileContext])

  const addMessage = useCallback(
    (
      text: string,
      sender: 'user' | 'ai',
      isAuto = false,
      type: Message['type'] = 'normal'
    ): Message => {
      const msg: Message = {
        id: `${Date.now()}-${Math.random()}`,
        text,
        sender,
        timestamp: new Date(),
        isAuto,
        type,
      }
      setMessages((prev) => [...prev, msg])
      return msg
    },
    []
  )

  // ── Enviar mensaje ──
  const handleSendMessage = async (
    message: string,
    overrideAccountId?: string
  ) => {
    if (!message.trim() || isLoading) return

    addMessage(message, 'user')
    setIsLoading(true)
    setPendingAccountMessage(null)
    setAccountPickerOptions([])

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession(message.slice(0, 80))
      if (sessionId) setActiveSessionId(sessionId)
    }
    if (sessionId) await persistMessage(sessionId, 'user', message)

    try {
      const intent = detectIntent(message)

      if (
        intent === 'consulta_simple' &&
        ctx &&
        !overrideAccountId &&
        coachState !== 'sin_cuentas' &&
        coachState !== 'sin_transacciones'
      ) {
        const auto = autoRespond(message, ctx, onboarding.nombre)
        if (auto) {
          setTimeout(async () => {
            addMessage(auto, 'ai', true)
            if (sessionId)
              await persistMessage(sessionId, 'assistant', auto, true)
            setIsLoading(false)
          }, 200)
          return
        }
      }

      const contexto = buildBackendContext()
      if (overrideAccountId)
        (contexto as Record<string, unknown>).resolved_account_id =
          overrideAccountId

      const token = await getToken()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          message,
          context: contexto,
          history: conversationHistory.slice(-6),
        }),
      })

      if (!response.ok) throw new Error('Error en el servidor')
      const data = await response.json()

      if (data.action === 'NEEDS_ACCOUNT_SELECTION') {
        addMessage(data.mensaje_respuesta, 'ai')
        if (sessionId)
          await persistMessage(sessionId, 'assistant', data.mensaje_respuesta)
        setPendingAccountMessage(message)
        setAccountPickerOptions(data.data?.accounts || [])
        setIsLoading(false)
        return
      }

      const aiText =
        data.mensaje_respuesta || 'No pude procesar tu mensaje'
      const msgType: Message['type'] =
        data.action === 'INSERT_TRANSACTION' ? 'success' : 'normal'

      let uiCard: Message['ui'] | undefined
      if (data.ui?.type && ctx) {
        uiCard = {
          type: data.ui.type,
          data: enrichUIData(
            data.ui.type,
            ctx,
            data.data as Record<string, unknown> | undefined
          ),
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          text: aiText,
          sender: 'ai',
          timestamp: new Date(),
          isAuto: false,
          type: msgType,
          ui: uiCard,
        },
      ])
      if (sessionId) await persistMessage(sessionId, 'assistant', aiText)

      // Fire-and-forget: extrae info personal persistente si la hay
      if (/quiero|objetivo|meta|ahorrar para|cobro el|me pagan|trabajo|no puedo|restricci|siempre|nunca|cuotas fijas|en negro|dólares|dolares/i.test(message)) {
        extractAndUpdateProfile(message, updateProfile)
      }

      if (data.action === 'INSERT_TRANSACTION') {
        setShowSuccessFlash(true)
        setTimeout(() => setShowSuccessFlash(false), 1800)
        bumpStreak()
      }

      if (
        data.action === 'INSERT_TRANSACTION' &&
        data.data?.type === 'gasto'
      ) {
        const cat2 = data.data.category
        const monto2 = data.data.amount
        const ctx2 = buildBackendContext()
        const catHist = (
          ctx2.historico as {
            categorias: { categoria: string; promedio_mensual: number }[]
          } | null
        )?.categorias?.find((c) => c.categoria === cat2)
        if (
          catHist &&
          catHist.promedio_mensual > 0 &&
          monto2 / catHist.promedio_mensual > 0.4
        ) {
          setGastoInusualAlert({
            categoria: cat2,
            gastoActual: monto2,
            promedioHistorico: catHist.promedio_mensual,
          })
        } else {
          setGastoInusualAlert(null)
        }
      }

      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: aiText },
      ])

      if (ACCIONES_QUE_MODIFICAN.includes(data.action)) {
        refresh()
        onDataChanged?.()
      }
    } catch {
      addMessage('Ocurrió un error. Intentá de nuevo.', 'ai')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = () => {
    if (inputValue.trim()) {
      handleSendMessage(inputValue.trim())
      setInputValue('')
    }
  }

  const quickActions = useMemo(
    () => getQuickActions(ctx, coachState),
    [ctx, coachState]
  )
  const welcome = useMemo(
    () => getWelcome(ctx, coachState, accounts, onboarding.nombre, streakCount),
    [ctx, coachState, accounts, onboarding.nombre, streakCount]
  )
  const showQuickActions =
    messages.length === 0 ||
    (messages.length > 0 &&
      messages[messages.length - 1].sender === 'ai')

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[500px] bg-[#0A0F0D] relative">
      {/* ── Flash de registro exitoso ── */}
      {showSuccessFlash && (
        <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 bg-[#00C853] text-black text-sm font-bold px-5 py-2.5 rounded-full shadow-lg animate-bounce">
            <CheckCircle2 size={16} /> Guardado
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed top-0 left-0 z-50 h-full w-72 bg-[#0a120e] border-r border-white/8 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
              <div>
                <p className="text-white font-semibold text-sm">
                  Historial
                </p>
                <p className="text-white/30 text-xs">
                  {sessions.length} conversaciones
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-3 py-2.5 border-b border-white/5">
              <button
                onClick={startNewSession}
                className="w-full flex items-center justify-center gap-2 text-sm text-[#69F0AE] border border-[#00C853]/30 rounded-xl py-2 hover:bg-[#00C853]/10 transition-colors"
              >
                <Plus size={14} /> Nueva conversación
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {loadingSessions && (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" />
                </div>
              )}
              {!loadingSessions && sessions.length === 0 && (
                <p className="text-white/20 text-xs text-center py-8">
                  Sin conversaciones
                </p>
              )}
              {!loadingSessions &&
                sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => fetchMessages(session.id)}
                    className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                      session.id === activeSessionId
                        ? 'bg-[#00C853]/10 border border-[#00C853]/20'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug truncate ${
                          session.id === activeSessionId
                            ? 'text-[#69F0AE]'
                            : 'text-white/70'
                        }`}
                      >
                        {session.title}
                      </p>
                      <p className="text-[10px] text-white/25 mt-0.5">
                        {formatSessionDate(session.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-[#FF5252] transition-all"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/30 hover:text-white/60 transition-colors p-1"
          >
            <History size={18} />
          </button>
          <div className="w-9 h-9 bg-[#00C853]/20 rounded-full flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Tu Coach</p>
            <p className="text-white/40 text-xs">
              {coachState === 'sin_cuentas'
                ? 'Empecemos'
                : 'Financiero personal'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StreakBadge streak={streakData} />
          {ctx &&
            coachState !== 'sin_cuentas' &&
            coachState !== 'sin_transacciones' && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  ctx.estado === 'bien'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : ctx.estado === 'cuidado'
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}
              >
                {ctx.estado === 'bien'
                  ? '🟢'
                  : ctx.estado === 'cuidado'
                  ? '🟡'
                  : '🔴'}
                {ctx.estado === 'bien'
                  ? 'Bien'
                  : ctx.estado === 'cuidado'
                  ? 'Cuidado'
                  : 'Mal'}
              </div>
            )}
          <button
            onClick={startNewSession}
            className="text-white/20 hover:text-white/40 transition-colors p-1"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* ── WeeklySummaryCard — sobre los mensajes, bajo el header ── */}
      {showWeeklyCard && weeklySummaryData && (
        <WeeklySummaryCard
          data={weeklySummaryData}
          onClose={() => setShowWeeklyCard(false)}
          onVerDetalle={() => {
            setShowWeeklyCard(false)
            handleSendMessage('Dame el resumen detallado de la semana pasada')
          }}
        />
      )}

      {/* ── Mensajes ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" />
          </div>
        )}

        {!loadingMessages && messages.length === 0 && (
          <>
            <BotMessage text={welcome} />
            {ctx &&
              coachState !== 'sin_cuentas' &&
              coachState !== 'sin_transacciones' &&
              ctx.totalGastado > 0 && (
                <div className="ml-10 grid grid-cols-3 gap-2">
                  <MiniCard
                    label="Gastado"
                    value={fmt(ctx.totalGastado)}
                  />
                  <MiniCard
                    label="Libre"
                    value={fmt(ctx.dineroLibre)}
                    highlight={ctx.dineroLibre > 0 ? 'green' : 'red'}
                  />
                  <MiniCard
                    label="Por día"
                    value={
                      ctx.gastoDiarioRecomendado > 0
                        ? fmt(ctx.gastoDiarioRecomendado)
                        : '—'
                    }
                  />
                </div>
              )}
          </>
        )}

        {!loadingMessages &&
          messages.map((msg, index) => (
            <div key={msg.id}>
              {msg.sender === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-[#00C853]/15 border border-[#00C853]/25 rounded-2xl rounded-br-sm px-4 py-3 max-w-[80%]">
                    <p className="text-white text-sm">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 items-end">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                        msg.type === 'success'
                          ? 'bg-[#00C853]/30'
                          : 'bg-[#00C853]/20'
                      }`}
                    >
                      {msg.type === 'success' ? '✅' : '🤖'}
                    </div>
                    <div className="max-w-[85%]">
                      <div
                        className={`rounded-2xl rounded-bl-sm px-4 py-3 ${
                          msg.type === 'success'
                            ? 'bg-[#00C853]/10 border border-[#00C853]/25'
                            : 'bg-[#141A17] border border-white/5'
                        }`}
                      >
                        <p className="text-white text-sm leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                      {msg.ui && (
                        <ChatUICard type={msg.ui.type} data={msg.ui.data} />
                      )}
                      {msg.isAuto && (
                        <p className="text-white/20 text-[10px] mt-0.5 ml-1">
                          respuesta instantánea
                        </p>
                      )}
                    </div>
                  </div>
                  {index === messages.length - 1 &&
                    msg.sender === 'ai' &&
                    gastoInusualAlert && (
                      <GastoInusualAlert
                        categoria={gastoInusualAlert.categoria}
                        gastoActual={gastoInusualAlert.gastoActual}
                        promedioHistorico={
                          gastoInusualAlert.promedioHistorico
                        }
                        onVerDetalle={() => {
                          setGastoInusualAlert(null)
                          onNavigateToBudgets?.()
                        }}
                      />
                    )}
                </>
              )}
            </div>
          ))}

        {isLoading && (
          <div className="flex gap-2 items-end">
            <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
              🤖
            </div>
            <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Account picker */}
      {accountPickerOptions.length > 0 && (
        <div className="px-4 pb-1 flex-shrink-0">
          <p className="text-white/30 text-xs mb-1.5">Elegí la cuenta:</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {accountPickerOptions.map((acc) => (
              <button
                key={acc.id}
                onClick={() => {
                  const msg = pendingAccountMessage
                  setPendingAccountMessage(null)
                  setAccountPickerOptions([])
                  if (msg) handleSendMessage(msg, acc.id)
                }}
                disabled={isLoading}
                className="flex-shrink-0 text-xs bg-[#00C853]/10 border border-[#00C853]/30 rounded-full px-3 py-1.5 text-[#00C853] hover:bg-[#00C853]/20 transition-colors disabled:opacity-30"
              >
                {acc.type === 'credit' ? '💳' : '🏦'} {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      {accountPickerOptions.length === 0 &&
        showQuickActions &&
        quickActions.length > 0 && (
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleSendMessage(action.message)}
                  disabled={isLoading}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all active:scale-95 disabled:opacity-30 ${action.color}`}
                >
                  <span className="text-base leading-none">
                    {action.emoji}
                  </span>
                  <span className="text-white/70">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* ── Input ── */}
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            placeholder={
              coachState === 'sin_cuentas'
                ? '¿Cuánto tenés disponible ahora?'
                : coachState === 'sin_transacciones'
                ? '¿Cuál fue tu último gasto?'
                : 'Escribí un gasto o una pregunta...'
            }
            className="flex-1 bg-[#141A17] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#00C853]/40 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || !inputValue.trim()}
            className="bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 text-black font-bold px-4 py-3 rounded-xl transition-all active:scale-95"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────
function BotMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
        🤖
      </div>
      <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
        <p className="text-white text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function MiniCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: 'green' | 'red'
}) {
  return (
    <div className="bg-[#141A17] border border-white/5 rounded-xl p-2.5 text-center">
      <p className="text-white/40 text-[10px] mb-0.5">{label}</p>
      <p
        className={`text-xs font-semibold ${
          highlight === 'green'
            ? 'text-green-400'
            : highlight === 'red'
            ? 'text-red-400'
            : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function GastoInusualAlert({
  categoria,
  gastoActual,
  promedioHistorico,
  onVerDetalle,
}: {
  categoria: string
  gastoActual: number
  promedioHistorico: number
  onVerDetalle: () => void
}) {
  const veces =
    promedioHistorico > 0
      ? (gastoActual / promedioHistorico).toFixed(1)
      : '2+'
  return (
    <div className="ml-10 mt-1">
      <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-yellow-400 text-sm mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-yellow-400/90 text-xs font-medium">
              Gasto inusual en {categoria}
            </p>
            <p className="text-yellow-400/60 text-xs mt-0.5">
              Es {veces}x tu promedio ({fmt(promedioHistorico)}/mes)
            </p>
          </div>
        </div>
        <button
          onClick={onVerDetalle}
          className="mt-2 w-full text-xs text-yellow-400/70 hover:text-yellow-400 border border-yellow-500/20 hover:border-yellow-500/40 rounded-lg py-1.5 transition-colors"
        >
          Ver presupuesto de {categoria} →
        </button>
      </div>
    </div>
  )
}