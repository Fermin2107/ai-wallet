import { useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────
interface BudgetAnalysisItem {
  category: string
  percentUsed: number
  status: string
  remaining: number
  limit: number
  spent: number
}

interface GoalAnalysisItem {
  name: string
  target: number
  current: number
  remaining: number
  percentComplete: number
  monthsToComplete?: number | null
}

interface FinancialCtx {
  estado: 'bien' | 'cuidado' | 'mal'
  totalGastado: number
  dineroLibre: number
  gastoDiarioRecomendado: number
  gastoDiarioPromedio: number
  diasRestantes: number
  vaALlegar: boolean
  superavit: number
  ingresoEfectivo: number
  budgetAnalysis: BudgetAnalysisItem[]
  goalAnalysis: GoalAnalysisItem[]
  topGastos?: Array<{ category: string; total: number }>
}

// ─── Helpers ──────────────────────────────────────────────────
function getTodayKey(userId: string): string {
  const fecha = new Date().toISOString().split('T')[0]
  return `ai_wallet_daily_${userId}_${fecha}`
}

function getMorningKey(userId: string): string {
  const fecha = new Date().toISOString().split('T')[0]
  return `ai_wallet_morning_${userId}_${fecha}`
}

function getNoonKey(userId: string): string {
  const fecha = new Date().toISOString().split('T')[0]
  return `ai_wallet_noon_${userId}_${fecha}`
}

function getNightKey(userId: string): string {
  const fecha = new Date().toISOString().split('T')[0]
  return `ai_wallet_night_${userId}_${fecha}`
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function getHour(): number {
  return new Date().getHours()
}

function getDayOfWeek(): number {
  return new Date().getDay() // 0=dom, 1=lun ... 6=sáb
}

function getDayOfMonth(): number {
  return new Date().getDate()
}

// Elige un item al azar de un array de manera determinista por fecha
// (mismo mensaje todo el día, distinto cada día)
function pickByDate<T>(arr: T[]): T {
  const seed = parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''))
  return arr[seed % arr.length]
}

// ─── Mensajes por slot horario ─────────────────────────────────

function buildMorningMessage(
  ctx: FinancialCtx,
  nombre: string | undefined,
  coachState: string
): string | null {
  const n = nombre ? `, ${nombre}` : ''
  const dia = getDayOfWeek()
  const diaNum = getDayOfMonth()

  // Sin datos útiles → no mostrar
  if (ctx.ingresoEfectivo <= 0) return null
  if (coachState === 'sin_cuentas') return null
  if (coachState === 'post_onboarding') return null

  // Fin de mes malo → urgencia
  if (coachState === 'fin_mes_mal') {
    return `Quedan ${ctx.diasRestantes} días${n}. Si gastás máximo ${fmt(ctx.gastoDiarioRecomendado)} hoy, podés recuperar terreno. ¿Arrancamos?`
  }

  // Presupuesto crítico → alerta específica
  if (coachState === 'presupuesto_critico') {
    const critico = ctx.budgetAnalysis.find(b => b.percentUsed >= 85)
    if (critico) {
      const queda = fmt(Math.max(0, critico.remaining))
      return `${critico.category} está al ${critico.percentUsed}%${n}. Te quedan ${queda} ahí. Hoy gastá máx ${fmt(ctx.gastoDiarioRecomendado)} en total.`
    }
  }

  // Lunes → arranque de semana
  if (dia === 1) {
    const msgs = [
      `Arranca la semana${n}. Llevás ${fmt(ctx.totalGastado)} gastados este mes, te quedan ${fmt(ctx.dineroLibre)} libres. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día.`,
      `Semana nueva${n}. Tu ritmo actual es ${fmt(ctx.gastoDiarioPromedio)}/día — el recomendado es ${fmt(ctx.gastoDiarioRecomendado)}. ${ctx.gastoDiarioPromedio <= ctx.gastoDiarioRecomendado ? '¿Seguimos así?' : '¿Bajamos un poco esta semana?'}`,
    ]
    return pickByDate(msgs)
  }

  // Viernes → advertencia del fin de semana (históricamente más gasto)
  if (dia === 5) {
    return `Viernes${n}. El fin de semana suele ser donde más se gasta. Hoy tenés margen de ${fmt(ctx.gastoDiarioRecomendado)} — después del finde ajustamos si hace falta.`
  }

  // Día 1-3 del mes → inicio
  if (diaNum <= 3 && ctx.totalGastado === 0) {
    return `Arrancó el mes${n}. Con tu ingreso de ${fmt(ctx.ingresoEfectivo)}, podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día y llegar bien. Cada gasto que registrés mejora el plan.`
  }

  // Día de cobro habitual (entre 1 y 10)
  if (diaNum <= 10 && ctx.totalGastado > 0 && ctx.estado === 'bien') {
    const msgs = [
      `Buenos días${n}. Hoy podés gastar ${fmt(ctx.gastoDiarioRecomendado)} y seguir en verde. ¿Algo pendiente de registrar?`,
      `Buen arranque de mes${n}. Llevás ${fmt(ctx.totalGastado)} gastados y vas bien. Límite de hoy: ${fmt(ctx.gastoDiarioRecomendado)}.`,
    ]
    return pickByDate(msgs)
  }

  // Estado bien → mensaje motivador con dato concreto
  if (ctx.estado === 'bien') {
    const msgs = [
      `Buen día${n}. Vas bien este mes — ${fmt(ctx.dineroLibre)} libres con ${ctx.diasRestantes} días por delante. Hoy: máx ${fmt(ctx.gastoDiarioRecomendado)}.`,
      `Todo en orden${n}. Tu ritmo es ${fmt(ctx.gastoDiarioPromedio)}/día vs ${fmt(ctx.gastoDiarioRecomendado)} recomendado. Seguí así.`,
      `Proyección: llegás a fin de mes con ${fmt(ctx.superavit)} de sobra${n}. Hoy podés gastar ${fmt(ctx.gastoDiarioRecomendado)}.`,
    ]
    return pickByDate(msgs)
  }

  // Estado cuidado → advertencia suave
  if (ctx.estado === 'cuidado') {
    const msgs = [
      `Ojo hoy${n}. Llevás ${fmt(ctx.totalGastado)} este mes y el margen se achica. Gastá máx ${fmt(ctx.gastoDiarioRecomendado)} hoy.`,
      `Buenos días${n}. El mes está ajustado — ${fmt(ctx.dineroLibre)} libres para ${ctx.diasRestantes} días. Si hoy gastás ${fmt(ctx.gastoDiarioRecomendado)}, llegás.`,
    ]
    return pickByDate(msgs)
  }

  // Estado mal → directo
  return `Buenos días${n}. El mes está complicado — vas a ${fmt(ctx.gastoDiarioPromedio)}/día y deberías ir a ${fmt(ctx.gastoDiarioRecomendado)}. Cada peso cuenta hoy.`
}

function buildNoonMessage(
  ctx: FinancialCtx,
  nombre: string | undefined,
  _coachState: string
): string | null {
  // Solo mostrar si el usuario tiene datos y no registró nada hoy (lo detecta el caller)
  if (ctx.ingresoEfectivo <= 0) return null

  const n = nombre ? `, ${nombre}` : ''

  // Presupuesto crítico de una categoría típica del mediodía
  const alimentacion = ctx.budgetAnalysis.find(
    b => b.category === 'alimentacion' && b.percentUsed >= 70
  )
  if (alimentacion) {
    return `Mediodía${n}. Alimentación está al ${alimentacion.percentUsed}% del límite — acordate de registrar el almuerzo para no perder el hilo.`
  }

  // Recordatorio neutro con dato útil
  const msgs = [
    `Son las ${new Date().getHours()}hs${n}. Si almorzaste afuera, anotalo ahora que tenés fresco el ticket. Límite del día: ${fmt(ctx.gastoDiarioRecomendado)}.`,
    `Recordatorio de mediodía${n}: llevás ${fmt(ctx.totalGastado)} este mes. ¿Registraste el almuerzo?`,
    `A mitad del día${n}: ¿algo para anotar? El hábito funciona cuando se registra en el momento.`,
  ]
  return pickByDate(msgs)
}

function buildNightMessage(
  ctx: FinancialCtx,
  nombre: string | undefined,
  coachState: string
): string | null {
  if (ctx.ingresoEfectivo <= 0) return null

  const n = nombre ? `, ${nombre}` : ''
  const dia = getDayOfWeek()

  // Fin de semana → resumen
  if (dia === 0 || dia === 6) {
    const msgs = [
      `Cerrando el ${dia === 6 ? 'sábado' : 'domingo'}${n}. ¿Registraste todo lo del fin de semana? Es el momento ideal antes de que se te olvide.`,
      `Fin de semana${n}: ¿algo para anotar de hoy? Salidas, delivery, transporte... lo que sea.`,
    ]
    return pickByDate(msgs)
  }

  // Meta cerca de completarse → empujar
  const metaCerca = ctx.goalAnalysis?.find(g => g.percentComplete >= 75 && g.percentComplete < 100)
  if (metaCerca) {
    return `Buenas noches${n}. Tu meta "${metaCerca.name}" está al ${metaCerca.percentComplete}% — le falta ${fmt(metaCerca.remaining)}. ¿Hacemos un aporte hoy?`
  }

  // Estado mal → cierre con foco
  if (coachState === 'fin_mes_mal' || ctx.estado === 'mal') {
    return `Cerrando el día${n}. ¿Registraste todo de hoy? Con los datos completos puedo decirte exactamente cómo recuperar el mes.`
  }

  // Presupuesto bien → celebración + próximo paso
  if (ctx.estado === 'bien' && ctx.vaALlegar) {
    const msgs = [
      `Buenas noches${n}. Vas a cerrar el mes con ${fmt(ctx.superavit)} de sobra si seguís así. ¿Cerramos el día con algo para registrar?`,
      `Buen día${n}. ¿Algún gasto de hoy para anotar antes de cerrar?`,
      `Noche${n}. Con ${fmt(ctx.dineroLibre)} libres y ${ctx.diasRestantes} días, estás cómodo. ¿Registramos algo de hoy?`,
    ]
    return pickByDate(msgs)
  }

  // Default nocturno
  const msgs = [
    `Cerrando el día${n}. ¿Tuviste gastos de hoy sin registrar? Cuanto más completo esté el historial, mejor el análisis.`,
    `Antes de dormir${n}: ¿algo para registrar de hoy? Llevás ${fmt(ctx.totalGastado)} este mes.`,
  ]
  return pickByDate(msgs)
}

// ─── Mensajes especiales por evento ───────────────────────────

function buildPatternInsightMessage(
  ctx: FinancialCtx,
  nombre: string | undefined
): string | null {
  const n = nombre ? `, ${nombre}` : ''

  // Solo si hay top gastos
  if (!ctx.topGastos || ctx.topGastos.length === 0) return null

  const top = ctx.topGastos[0]
  const pct = ctx.totalGastado > 0
    ? Math.round((top.total / ctx.totalGastado) * 100)
    : 0

  if (pct >= 35) {
    return `${top.category} es el ${pct}% de todo lo que gastaste este mes${n} — ${fmt(top.total)} de ${fmt(ctx.totalGastado)}. ¿Querés ver si hay margen para ajustar?`
  }

  return null
}

// ─── Hook ─────────────────────────────────────────────────────
export function useDailyCoachMessage(): {
  shouldShowDaily: (userId: string) => boolean
  shouldShowNoon: (userId: string) => boolean
  shouldShowNight: (userId: string) => boolean
  buildDailyMessage: (
    ctx: FinancialCtx,
    nombre: string | undefined,
    coachState: string
  ) => string | null
  buildNoonMessage: (
    ctx: FinancialCtx,
    nombre: string | undefined,
    coachState: string
  ) => string | null
  buildNightMessage: (
    ctx: FinancialCtx,
    nombre: string | undefined,
    coachState: string
  ) => string | null
  buildPatternInsight: (
    ctx: FinancialCtx,
    nombre: string | undefined
  ) => string | null
  markDailyShown: (userId: string) => void
  markNoonShown: (userId: string) => void
  markNightShown: (userId: string) => void
} {
  const shouldShowDaily = useCallback((userId: string): boolean => {
    try {
      const hora = getHour()
      // Mañana: 7-11hs
      if (hora < 7 || hora >= 12) return false
      return !localStorage.getItem(getMorningKey(userId))
    } catch {
      return false
    }
  }, [])

  const shouldShowNoon = useCallback((userId: string): boolean => {
    try {
      const hora = getHour()
      // Mediodía: 12-15hs
      if (hora < 12 || hora >= 16) return false
      return !localStorage.getItem(getNoonKey(userId))
    } catch {
      return false
    }
  }, [])

  const shouldShowNight = useCallback((userId: string): boolean => {
    try {
      const hora = getHour()
      // Noche: 20-23hs
      if (hora < 20) return false
      return !localStorage.getItem(getNightKey(userId))
    } catch {
      return false
    }
  }, [])

  const markDailyShown = useCallback((userId: string): void => {
    try {
      localStorage.setItem(getMorningKey(userId), '1')
      localStorage.setItem(getTodayKey(userId), '1') // compatibilidad
    } catch { /* silenciar */ }
  }, [])

  const markNoonShown = useCallback((userId: string): void => {
    try {
      localStorage.setItem(getNoonKey(userId), '1')
    } catch { /* silenciar */ }
  }, [])

  const markNightShown = useCallback((userId: string): void => {
    try {
      localStorage.setItem(getNightKey(userId), '1')
    } catch { /* silenciar */ }
  }, [])

  const buildDailyMessageCb = useCallback(
    (ctx: FinancialCtx, nombre: string | undefined, coachState: string): string | null => {
      return buildMorningMessage(ctx, nombre, coachState)
    },
    []
  )

  const buildNoonMessageCb = useCallback(
    (ctx: FinancialCtx, nombre: string | undefined, coachState: string): string | null => {
      return buildNoonMessage(ctx, nombre, coachState)
    },
    []
  )

  const buildNightMessageCb = useCallback(
    (ctx: FinancialCtx, nombre: string | undefined, coachState: string): string | null => {
      return buildNightMessage(ctx, nombre, coachState)
    },
    []
  )

  const buildPatternInsight = useCallback(
    (ctx: FinancialCtx, nombre: string | undefined): string | null => {
      return buildPatternInsightMessage(ctx, nombre)
    },
    []
  )

  return {
    shouldShowDaily,
    shouldShowNoon,
    shouldShowNight,
    buildDailyMessage: buildDailyMessageCb,
    buildNoonMessage: buildNoonMessageCb,
    buildNightMessage: buildNightMessageCb,
    buildPatternInsight,
    markDailyShown,
    markNoonShown,
    markNightShown,
  }
}