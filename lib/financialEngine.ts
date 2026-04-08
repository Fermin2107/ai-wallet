// ============================================================
// AI Wallet - Motor de Análisis Financiero
// ============================================================
// Todo lo que se puede resolver con lógica, se resuelve acá.
// La IA no toca estos cálculos.
// ============================================================

export interface RawTransaction {
  id: string
  amount: number
  type: 'gasto' | 'ingreso'
  category: string
  transaction_date: string
  description: string
}

export interface RawAccount {
  id: string
  type: 'liquid' | 'credit' | 'savings'
  balance: number
  is_default: boolean
}

export interface RawInstallment {
  account_id: string
  amount: number
  is_paid: boolean
}

export interface RawBudget {
  id: string
  category: string
  limit_amount: number
  month_period: string
}

export interface RawGoal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date?: string
  is_completed: boolean
  is_active: boolean
}

export interface OnboardingData {
  ingreso_mensual: number
  objetivo_ahorro: number
}

// ── Tipos de salida ──────────────────────────────────────────

export interface BudgetAnalysis {
  category: string
  limit: number
  spent: number
  remaining: number
  percentUsed: number
  status: 'verde' | 'amarillo' | 'rojo' | 'excedido'
  daysLeft: number
  projectedEndOfMonth: number      // cuánto va a gastar si sigue así
  willExceed: boolean
}

export interface GoalAnalysis {
  id: string
  name: string
  target: number
  current: number
  remaining: number
  percentComplete: number
  monthsToComplete: number | null  // null si no hay aporte estimado
  onTrack: boolean
  targetDate?: string
  daysToDeadline?: number
}

export interface SpendingPattern {
  category: string
  totalSpent: number
  transactionCount: number
  avgPerTransaction: number
  percentOfTotal: number
  trend: 'subiendo' | 'bajando' | 'estable'  // vs semana anterior
}

export interface FinancialContext {
  // — Estado general —
  estado: 'bien' | 'cuidado' | 'mal'
  score: number                    // 0-100

  // — Cuentas —
  liquidTotal: number              // suma de saldos de cuentas liquid/savings
  creditDebt: number               // suma de cuotas impagas en tarjetas de crédito
  realAvailable: number            // liquidTotal - creditDebt

  // — Plata disponible —
  ingresoMensual: number
  totalIngresado: number           // ingresos reales registrados este mes
  totalGastado: number
  objetivoAhorro: number
  dineroDisponible: number         // totalIngresado - totalGastado
  dineroLibre: number              // dineroDisponible - objetivoAhorro

  // — Proyección fin de mes —
  diasRestantes: number
  diaDelMes: number
  gastoDiarioPromedio: number      // promedio últimos 7 días
  gastoDiarioRecomendado: number   // dineroLibre / diasRestantes
  proyeccionGastoTotal: number     // totalGastado + (promedio * diasRestantes)
  vaALlegarAFinDeMes: boolean
  superavitProyectado: number      // positivo = bien, negativo = mal

  // — Análisis por categoría —
  budgets: BudgetAnalysis[]
  categoriasMasGastadas: SpendingPattern[]
  categoriasEnRiesgo: BudgetAnalysis[]  // > 80% del límite

  // — Metas —
  goals: GoalAnalysis[]
  aporteMensualSugerido: number    // para cumplir todas las metas

  // — Alertas (pre-calculadas, la IA solo las menciona) —
  alertas: string[]

  // — Resumen para el prompt (string compacto) —
  resumenParaIA: string
}

// ── Función principal ────────────────────────────────────────

export function buildFinancialContext(
  transactions: RawTransaction[],
  budgets: RawBudget[],
  goals: RawGoal[],
  onboarding: OnboardingData,
  selectedMonth: string,           // YYYY-MM
  accounts: RawAccount[] = [],
  installments: RawInstallment[] = []
): FinancialContext {

  // — Account calculations —
  const liquidTotal = accounts
    .filter(a => a.type === 'liquid' || a.type === 'savings')
    .reduce((s, a) => s + a.balance, 0)

  const creditDebt = installments
    .filter(i => !i.is_paid)
    .reduce((s, i) => s + i.amount, 0)

  const realAvailable = liquidTotal - creditDebt

  const hoy = new Date()
  const diaDelMes = hoy.getDate()
  const ultimoDiaDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const diasRestantes = Math.max(1, ultimoDiaDelMes - diaDelMes)
  const diasTranscurridos = Math.max(1, diaDelMes)

  // — Filtrar transacciones del mes seleccionado —
  const txMes = transactions.filter(t =>
    t.transaction_date.startsWith(selectedMonth)
  )

  const totalIngresado = txMes
    .filter(t => t.type === 'ingreso')
    .reduce((s, t) => s + t.amount, 0)

  const totalGastado = txMes
    .filter(t => t.type === 'gasto')
    .reduce((s, t) => s + t.amount, 0)

  const ingresoMensual = onboarding.ingreso_mensual || 0
  const objetivoAhorro = onboarding.objetivo_ahorro || 0

  // Usar ingreso registrado, con fallback al ingreso del onboarding
  const ingresoEfectivo = totalIngresado > 0 ? totalIngresado : ingresoMensual
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre = Math.max(0, dineroDisponible - objetivoAhorro)

  // — Gasto diario promedio (últimos 7 días) —
  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const tx7dias = transactions.filter(t => {
    const fecha = new Date(t.transaction_date)
    return t.type === 'gasto' && fecha >= hace7Dias
  })
  const gastoUltimos7dias = tx7dias.reduce((s, t) => s + t.amount, 0)
  const gastoDiarioPromedio = gastoUltimos7dias / 7

  const gastoDiarioRecomendado = diasRestantes > 0
    ? dineroLibre / diasRestantes
    : 0

  const proyeccionGastoTotal = totalGastado + (gastoDiarioPromedio * diasRestantes)
  const superavitProyectado = ingresoEfectivo - proyeccionGastoTotal - objetivoAhorro
  const vaALlegarAFinDeMes = superavitProyectado >= 0

  // — Análisis de budgets —
  const budgetAnalysis: BudgetAnalysis[] = budgets
    .filter(b => b.month_period === selectedMonth)
    .map(b => {
      const spent = txMes
        .filter(t => t.type === 'gasto' && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0)

      const percentUsed = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
      const remaining = b.limit_amount - spent

      // Gasto diario de esta categoría
      const spentPerDay = spent / Math.max(1, diasTranscurridos)
      const projectedEndOfMonth = spent + (spentPerDay * diasRestantes)
      const willExceed = projectedEndOfMonth > b.limit_amount

      const status: BudgetAnalysis['status'] =
        percentUsed >= 100 ? 'excedido' :
        percentUsed >= 85  ? 'rojo' :
        percentUsed >= 60  ? 'amarillo' : 'verde'

      return {
        category: b.category,
        limit: b.limit_amount,
        spent,
        remaining,
        percentUsed,
        status,
        daysLeft: diasRestantes,
        projectedEndOfMonth,
        willExceed
      }
    })

  const categoriasEnRiesgo = budgetAnalysis.filter(b => b.percentUsed >= 80)

  // — Patrones de gasto —
  const gastoTotal = totalGastado || 1
  const categoriesMap: Record<string, { total: number; count: number }> = {}

  txMes.filter(t => t.type === 'gasto').forEach(t => {
    if (!categoriesMap[t.category]) categoriesMap[t.category] = { total: 0, count: 0 }
    categoriesMap[t.category].total += t.amount
    categoriesMap[t.category].count += 1
  })

  // Tendencia: comparar con semana anterior
  const hace14Dias = new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000)
  const semanaAnterior: Record<string, number> = {}
  transactions
    .filter(t => {
      const f = new Date(t.transaction_date)
      return t.type === 'gasto' && f >= hace14Dias && f < hace7Dias
    })
    .forEach(t => {
      semanaAnterior[t.category] = (semanaAnterior[t.category] || 0) + t.amount
    })

  const categoriasMasGastadas: SpendingPattern[] = Object.entries(categoriesMap)
    .map(([category, { total, count }]) => {
      const prevWeek = semanaAnterior[category] || 0
      const thisWeek = tx7dias
        .filter(t => t.category === category)
        .reduce((s, t) => s + t.amount, 0)

      const trend: SpendingPattern['trend'] =
        thisWeek > prevWeek * 1.2 ? 'subiendo' :
        thisWeek < prevWeek * 0.8 ? 'bajando' : 'estable'

      return {
        category,
        totalSpent: total,
        transactionCount: count,
        avgPerTransaction: total / count,
        percentOfTotal: (total / gastoTotal) * 100,
        trend
      }
    })
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5)

  // — Análisis de metas —
  const metasActivas = goals.filter(g => g.is_active && !g.is_completed)
  const aporteMensualEstimado = metasActivas.length > 0
    ? Math.max(0, dineroLibre) / metasActivas.length
    : 0

  const goalAnalysis: GoalAnalysis[] = goals
    .filter(g => g.is_active)
    .map(g => {
      const remaining = Math.max(0, g.target_amount - g.current_amount)
      const percentComplete = g.target_amount > 0
        ? Math.min(100, (g.current_amount / g.target_amount) * 100)
        : 0

      const monthsToComplete = aporteMensualEstimado > 0
        ? Math.ceil(remaining / aporteMensualEstimado)
        : null

      let daysToDeadline: number | undefined
      let onTrack = true

      if (g.target_date) {
        const deadline = new Date(g.target_date)
        daysToDeadline = Math.ceil(
          (deadline.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
        )
        const monthsToDeadline = daysToDeadline / 30
        onTrack = monthsToComplete !== null
          ? monthsToComplete <= monthsToDeadline
          : true
      }

      return {
        id: g.id,
        name: g.name,
        target: g.target_amount,
        current: g.current_amount,
        remaining,
        percentComplete,
        monthsToComplete,
        onTrack,
        targetDate: g.target_date,
        daysToDeadline
      }
    })

  // — Score financiero (0-100) —
  let score = 70
  if (vaALlegarAFinDeMes) score += 15
  else score -= 20
  if (categoriasEnRiesgo.length === 0) score += 10
  else score -= categoriasEnRiesgo.length * 5
  if (dineroLibre > 0) score += 5
  score = Math.max(0, Math.min(100, score))

  const estado: FinancialContext['estado'] =
    score >= 70 ? 'bien' :
    score >= 45 ? 'cuidado' : 'mal'

  // — Alertas pre-calculadas —
  const alertas: string[] = []

  if (!vaALlegarAFinDeMes) {
    alertas.push(`⚠️ A este ritmo vas a gastar $${Math.abs(superavitProyectado).toLocaleString('es-AR')} más de lo que tenés`)
  }

  categoriasEnRiesgo.forEach(b => {
    if (b.status === 'excedido') {
      alertas.push(`🔴 Superaste el límite de ${b.category} en $${Math.abs(b.remaining).toLocaleString('es-AR')}`)
    } else {
      alertas.push(`🟡 ${b.category} está al ${Math.round(b.percentUsed)}% del límite`)
    }
  })

  goalAnalysis.filter(g => !g.onTrack).forEach(g => {
    alertas.push(`📅 No vas a llegar a "${g.name}" en tiempo si seguís a este ritmo`)
  })

  if (gastoDiarioPromedio > gastoDiarioRecomendado * 1.3) {
    alertas.push(`💸 Estás gastando $${Math.round(gastoDiarioPromedio).toLocaleString('es-AR')}/día pero deberías gastar $${Math.round(gastoDiarioRecomendado).toLocaleString('es-AR')}/día`)
  }

  // — Resumen compacto para el prompt de la IA —
  const resumenParaIA = buildPromptSummary({
    estado,
    score,
    ingresoEfectivo,
    totalGastado,
    dineroLibre,
    gastoDiarioRecomendado,
    gastoDiarioPromedio,
    vaALlegarAFinDeMes,
    superavitProyectado,
    diasRestantes,
    budgetAnalysis,
    goalAnalysis,
    categoriasMasGastadas,
    alertas,
    objetivoAhorro
  })

  return {
    estado,
    score,
    liquidTotal,
    creditDebt,
    realAvailable,
    ingresoMensual,
    totalIngresado,
    totalGastado,
    objetivoAhorro,
    dineroDisponible,
    dineroLibre,
    diasRestantes,
    diaDelMes,
    gastoDiarioPromedio,
    gastoDiarioRecomendado,
    proyeccionGastoTotal,
    vaALlegarAFinDeMes,
    superavitProyectado,
    budgets: budgetAnalysis,
    categoriasMasGastadas,
    categoriasEnRiesgo,
    goals: goalAnalysis,
    aporteMensualSugerido: aporteMensualEstimado,
    alertas,
    resumenParaIA
  }
}

// — Construye el string compacto que va al prompt —
function buildPromptSummary(data: {
  estado: string
  score: number
  ingresoEfectivo: number
  totalGastado: number
  dineroLibre: number
  gastoDiarioRecomendado: number
  gastoDiarioPromedio: number
  vaALlegarAFinDeMes: boolean
  superavitProyectado: number
  diasRestantes: number
  budgetAnalysis: BudgetAnalysis[]
  goalAnalysis: GoalAnalysis[]
  categoriasMasGastadas: SpendingPattern[]
  alertas: string[]
  objetivoAhorro: number
}): string {

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  const lines = [
    `ESTADO: ${data.estado.toUpperCase()} (score ${data.score}/100)`,
    `INGRESO EFECTIVO: ${fmt(data.ingresoEfectivo)} | GASTADO: ${fmt(data.totalGastado)} | LIBRE: ${fmt(data.dineroLibre)}`,
    `OBJETIVO AHORRO: ${fmt(data.objetivoAhorro)}`,
    `DÍAS RESTANTES: ${data.diasRestantes} | GASTO DIARIO HOY: ${fmt(data.gastoDiarioPromedio)}/día | RECOMENDADO: ${fmt(data.gastoDiarioRecomendado)}/día`,
    `PROYECCIÓN: ${data.vaALlegarAFinDeMes ? '✅ Llegás a fin de mes' : '❌ No llegás a fin de mes'} (${data.superavitProyectado >= 0 ? '+' : ''}${fmt(data.superavitProyectado)})`,
    '',
    'PRESUPUESTOS:',
    ...data.budgetAnalysis.map(b =>
      `  ${b.status === 'excedido' ? '🔴' : b.status === 'rojo' ? '🟠' : b.status === 'amarillo' ? '🟡' : '🟢'} ${b.category}: ${fmt(b.spent)} de ${fmt(b.limit)} (${Math.round(b.percentUsed)}%)${b.willExceed ? ' ⚠️ va a exceder' : ''}`
    ),
    '',
    'METAS:',
    ...data.goalAnalysis.map(g =>
      `  ${g.name}: ${fmt(g.current)} de ${fmt(g.target)} (${Math.round(g.percentComplete)}%)${g.monthsToComplete ? ` ~${g.monthsToComplete} meses` : ''}${!g.onTrack ? ' ⚠️ fuera de tiempo' : ''}`
    ),
    '',
    'TOP GASTOS:',
    ...data.categoriasMasGastadas.slice(0, 3).map(c =>
      `  ${c.category}: ${fmt(c.totalSpent)} (${Math.round(c.percentOfTotal)}% del total) [${c.trend}]`
    ),
  ]

  if (data.alertas.length > 0) {
    lines.push('', 'ALERTAS ACTIVAS:', ...data.alertas.map(a => `  ${a}`))
  }

  return lines.join('\n')
}

// — Detecta intención del mensaje antes de mandarlo a la IA —
export type MessageIntent =
  | 'registro_gasto'
  | 'registro_ingreso'
  | 'consulta_estado'
  | 'consulta_puede_gastar'
  | 'consulta_gasto_diario'
  | 'consulta_metas'
  | 'consulta_presupuestos'
  | 'crear_meta'
  | 'crear_presupuesto'
  | 'planificar'
  | 'otro'

export function detectIntent(message: string): MessageIntent {
  const msg = message.toLowerCase()

  // Registro (tiene número + verbo de gasto/ingreso)
  const tieneNumero = /\d/.test(msg)
  const verbosGasto = ['gasté', 'gaste', 'pagué', 'pague', 'compré', 'compre', 'salió', 'salio', 'costó', 'costo', 'me cobré', 'me coste']
  const verbosIngreso = ['cobré', 'cobre', 'me pagaron', 'entraron', 'ingresé', 'ingrese', 'me depositaron', 'recibí', 'recibi', 'gané', 'gane']

  if (tieneNumero && verbosGasto.some(v => msg.includes(v))) return 'registro_gasto'
  if (tieneNumero && verbosIngreso.some(v => msg.includes(v))) return 'registro_ingreso'

  // Planificación
  if (verbosIngreso.some(v => msg.includes(v)) && !tieneNumero) return 'planificar'
  if (msg.includes('organizame') || msg.includes('organizá') || msg.includes('planificame')) return 'planificar'

  // Consultas
  if (msg.includes('puedo gastar') || msg.includes('puedo comprar') || msg.includes('puedo pagar')) return 'consulta_puede_gastar'
  if (msg.includes('por día') || msg.includes('por dia') || msg.includes('diario') || msg.includes('cada día')) return 'consulta_gasto_diario'
  if (msg.includes('meta') || msg.includes('objetivo') || msg.includes('ahorro')) return 'consulta_metas'
  if (msg.includes('límite') || msg.includes('limite') || msg.includes('presupuesto') || msg.includes('categoría')) return 'consulta_presupuestos'
  if (msg.includes('cómo voy') || msg.includes('como voy') || msg.includes('resumen') || msg.includes('estado') || msg.includes('situación')) return 'consulta_estado'

  // Crear
  if ((msg.includes('crear') || msg.includes('agregar') || msg.includes('nueva')) && msg.includes('meta')) return 'crear_meta'
  if ((msg.includes('crear') || msg.includes('agregar') || msg.includes('nuevo')) && (msg.includes('límite') || msg.includes('presupuesto'))) return 'crear_presupuesto'

  return 'otro'
}

// — Respuestas automáticas para consultas simples (sin IA) —
export function buildAutoResponse(
  intent: MessageIntent,
  ctx: FinancialContext,
  message: string
): string | null {

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  switch (intent) {
    case 'consulta_gasto_diario': {
      const recomendado = ctx.gastoDiarioRecomendado
      const actual = ctx.gastoDiarioPromedio
      if (recomendado <= 0) {
        return `Ya no tenés margen para gastar este mes. Llegaste al límite 🔴`
      }
      const comparacion = actual > recomendado
        ? `Ahora vas a ${fmt(actual)}/día, así que tenés que bajar un poco.`
        : `Vas bien, estás dentro del rango.`
      return `Podés gastar ${fmt(recomendado)} por día para llegar a fin de mes. ${comparacion}`
    }

    case 'consulta_estado': {
      const estado = ctx.estado === 'bien' ? '🟢 Bien' : ctx.estado === 'cuidado' ? '🟡 Cuidado' : '🔴 Complicado'
      const proyeccion = ctx.vaALlegarAFinDeMes
        ? `Proyección: llegás con ${fmt(ctx.superavitProyectado)} de sobra.`
        : `Proyección: te faltan ${fmt(Math.abs(ctx.superavitProyectado))} para llegar.`
      const alertaTop = ctx.alertas[0] || ''
      return `${estado} — Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ${proyeccion}${alertaTop ? ` ${alertaTop}` : ''}`
    }

    case 'consulta_puede_gastar': {
      // Extraer monto del mensaje
      const match = message.match(/[\d.,]+/)
      const monto = match ? parseFloat(match[0].replace(',', '.')) : null
      if (!monto) return null // Dejar que la IA maneje

      const libre = ctx.dineroLibre
      if (monto > libre) {
        return `No te alcanza. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}. Te quedarías sin margen 🔴`
      } else if (monto > libre * 0.5) {
        return `Podés, pero te deja justo. Usarías ${Math.round((monto / libre) * 100)}% de lo que te queda libre. Pensalo 🟡`
      } else {
        return `Sí, andá tranquilo. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)} 🟢`
      }
    }

    default:
      return null // La IA maneja el resto
  }
}