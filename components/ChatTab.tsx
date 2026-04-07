'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { createBrowserClient } from '@supabase/ssr'
import { useWeeklySummary } from '../hooks/useWeeklySummary'

interface ChatTabProps {
  selectedMonth: string
  onDataChanged?: () => void
  onNavigateToBudgets?: () => void  // ← agregar
}

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  isAuto?: boolean
}

// ─── Motor financiero inline ────────────────────────────────
function buildFinancialContext(
  transactions: any[],
  budgets: any[],
  goals: any[],
  onboarding: { ingreso_mensual: number; objetivo_ahorro: number },
  selectedMonth: string
) {
  const hoy = new Date()
  const diaDelMes = hoy.getDate()
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const diasRestantes = Math.max(1, ultimoDia - diaDelMes)
  const diasTranscurridos = Math.max(1, diaDelMes)

  const txMes = transactions.filter(t =>
    (t.transaction_date || '').startsWith(selectedMonth)
  )

  const totalIngresado = txMes
    .filter(t => t.type === 'ingreso')
    .reduce((s, t) => s + Number(t.amount), 0)

  const totalGastado = txMes
    .filter(t => t.type === 'gasto')
    .reduce((s, t) => s + Number(t.amount), 0)

  const ingresoEfectivo = totalIngresado > 0
    ? totalIngresado
    : (onboarding.ingreso_mensual || 0)

  const objetivoAhorro = onboarding.objetivo_ahorro || 0
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre = Math.max(0, dineroDisponible - objetivoAhorro)

  // Gasto diario promedio últimos 7 días
  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastoUltimos7 = transactions
    .filter(t => t.type === 'gasto' && new Date(t.transaction_date) >= hace7Dias)
    .reduce((s, t) => s + Number(t.amount), 0)
  const gastoDiarioPromedio = gastoUltimos7 / 7
  const gastoDiarioRecomendado = diasRestantes > 0 ? dineroLibre / diasRestantes : 0

  const proyeccion = totalGastado + (gastoDiarioPromedio * diasRestantes)
  const superavit = ingresoEfectivo - proyeccion - objetivoAhorro
  const vaALlegar = superavit >= 0

  // Análisis budgets
  const budgetsMes = budgets.filter(b => b.month_period === selectedMonth)
  const budgetAnalysis = budgetsMes.map(b => {
    const spent = txMes
      .filter(t => t.type === 'gasto' && t.category === b.category)
      .reduce((s, t) => s + Number(t.amount), 0)
    const pct = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
    const spentPerDay = spent / diasTranscurridos
    const projected = spent + (spentPerDay * diasRestantes)
    const status = pct >= 100 ? 'excedido' : pct >= 85 ? 'rojo' : pct >= 60 ? 'amarillo' : 'verde'
    return {
      category: b.category,
      limit: b.limit_amount,
      spent,
      remaining: b.limit_amount - spent,
      percentUsed: Math.round(pct),
      status,
      projectedEndOfMonth: Math.round(projected),
      willExceed: projected > b.limit_amount
    }
  })

  // Top gastos por categoría
  const catMap: Record<string, number> = {}
  txMes.filter(t => t.type === 'gasto').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount)
  })
  const topGastos = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, total]) => ({ category: cat, total: Math.round(total) }))

  // Análisis metas
  const metasActivas = goals.filter(g => !g.is_completed)
  const aportePorMeta = metasActivas.length > 0 ? dineroLibre / metasActivas.length : 0
  const goalAnalysis = metasActivas.map(g => {
    const remaining = Math.max(0, g.target_amount - g.current_amount)
    const pct = g.target_amount > 0
      ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
      : 0
    const meses = aportePorMeta > 0 ? Math.ceil(remaining / aportePorMeta) : null
    return {
      name: g.name,
      target: g.target_amount,
      current: g.current_amount,
      remaining,
      percentComplete: pct,
      monthsToComplete: meses
    }
  })

  // Alertas
  const alertas: string[] = []
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  if (!vaALlegar) {
    alertas.push(`A este ritmo te van a faltar ${fmt(Math.abs(superavit))} para llegar a fin de mes`)
  }
  budgetAnalysis.filter(b => b.percentUsed >= 85).forEach(b => {
    if (b.status === 'excedido') {
      alertas.push(`Superaste el límite de ${b.category} en ${fmt(Math.abs(b.remaining))}`)
    } else {
      alertas.push(`${b.category} está al ${b.percentUsed}% del límite`)
    }
  })
  if (gastoDiarioPromedio > gastoDiarioRecomendado * 1.3 && gastoDiarioRecomendado > 0) {
    alertas.push(`Gastás ${fmt(gastoDiarioPromedio)}/día pero deberías gastar ${fmt(gastoDiarioRecomendado)}/día`)
  }

  const score = Math.max(0, Math.min(100,
    70 +
    (vaALlegar ? 15 : -20) +
    (budgetAnalysis.filter(b => b.percentUsed >= 80).length === 0 ? 10 : -5) +
    (dineroLibre > 0 ? 5 : 0)
  ))

  const estado = score >= 70 ? 'bien' : score >= 45 ? 'cuidado' : 'mal'

  // Resumen para la IA (string compacto con números reales)
  const resumen = [
    `ESTADO: ${estado.toUpperCase()} (score ${score}/100)`,
    `INGRESO: ${fmt(ingresoEfectivo)} | GASTADO: ${fmt(totalGastado)} | LIBRE: ${fmt(dineroLibre)} | AHORRO OBJETIVO: ${fmt(objetivoAhorro)}`,
    `DÍAS RESTANTES: ${diasRestantes} | GASTO DIARIO REAL: ${fmt(gastoDiarioPromedio)}/día | RECOMENDADO: ${fmt(gastoDiarioRecomendado)}/día`,
    `PROYECCIÓN FIN DE MES: ${vaALlegar ? 'LLEGA' : 'NO LLEGA'} (superávit proyectado: ${fmt(superavit)})`,
    '',
    'PRESUPUESTOS:',
    ...budgetAnalysis.map(b =>
      `  [${b.status.toUpperCase()}] ${b.category}: gastó ${fmt(b.spent)} de ${fmt(b.limit)} (${b.percentUsed}%)${b.willExceed ? ' — VA A EXCEDER' : ''}`
    ),
    budgetAnalysis.length === 0 ? '  Sin presupuestos configurados' : '',
    '',
    'METAS:',
    ...goalAnalysis.map(g =>
      `  ${g.name}: ${fmt(g.current)} de ${fmt(g.target)} (${g.percentComplete}%)${g.monthsToComplete ? ` — ~${g.monthsToComplete} meses` : ''}`
    ),
    goalAnalysis.length === 0 ? '  Sin metas activas' : '',
    '',
    'TOP GASTOS DEL MES:',
    ...topGastos.map(c => `  ${c.category}: ${fmt(c.total)}`),
    topGastos.length === 0 ? '  Sin gastos registrados' : '',
    alertas.length > 0 ? '\nALERTAS:\n' + alertas.map(a => `  ⚠️ ${a}`).join('\n') : ''
  ].filter(l => l !== undefined).join('\n')

  return {
    estado,
    score,
    ingresoEfectivo,
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
    resumen
  }
}

// ─── Detectar intención local ────────────────────────────────
type Intent = 'registro' | 'consulta_simple' | 'complejo'

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase()
  const tieneNumero = /\d/.test(m)
  const verbosGasto = ['gasté', 'gaste', 'pagué', 'pague', 'compré', 'compre', 'salió', 'salio', 'costó', 'costo']
  const verbosIngreso = ['cobré', 'cobre', 'me pagaron', 'entraron', 'ingresé', 'ingrese', 'recibí', 'recibi', 'gané']

  if (tieneNumero && (verbosGasto.some(v => m.includes(v)) || verbosIngreso.some(v => m.includes(v)))) {
    return 'registro'
  }
  if (
    m.includes('puedo gastar') || m.includes('puedo comprar') || m.includes('puedo pagar') ||
    m.includes('por día') || m.includes('por dia') || m.includes('cuánto puedo') ||
    m.includes('cómo voy') || m.includes('como voy') || m.includes('cuánto gasté') ||
    m.includes('cuanto gaste') || m.includes('resumen') || m.includes('estado')
  ) {
    return 'consulta_simple'
  }
  
  // ← AGREGAR: estas siempre van a Groq, no tienen respuesta automática
  if (
    m.includes('ahorrar más') || m.includes('ahorrar mas') ||
    m.includes('reducir') || m.includes('recortar') ||
    m.includes('margen') || m.includes('sobra') ||
    m.includes('distribuir') || m.includes('organizar') ||
    m.includes('fondo') || m.includes('emergencia') ||
    m.includes('vacaciones') || m.includes('jubilación') || m.includes('jubilacion') ||
    m.includes('planificar') || m.includes('próximos meses') || m.includes('proximos meses') ||
    m.includes('cobro') || m.includes('irregular')
  ) {
    return 'complejo'
  }
  return 'complejo'
}

// ─── Respuestas automáticas sin IA ───────────────────────────
function autoRespond(msg: string, ctx: ReturnType<typeof buildFinancialContext>): string | null {
  const m = msg.toLowerCase()
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  // ¿Cuánto puedo gastar por día?
  if (m.includes('por día') || m.includes('por dia') || m.includes('diario') || m.includes('cuánto puedo gastar')) {
    if (ctx.gastoDiarioRecomendado <= 0) {
      return `No te queda margen para gastar este mes. Ya usaste todo lo disponible.`
    }
    const comparacion = ctx.gastoDiarioPromedio > ctx.gastoDiarioRecomendado
      ? `Ahora vas a ${fmt(ctx.gastoDiarioPromedio)}/día, tenés que bajar.`
      : `Vas bien, estás dentro del rango.`
    return `Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día para llegar a fin de mes. ${comparacion}`
  }

  // ¿Cómo voy?
  if (m.includes('cómo voy') || m.includes('como voy') || m.includes('resumen') || m.includes('estado')) {
    const emoji = ctx.estado === 'bien' ? '🟢' : ctx.estado === 'cuidado' ? '🟡' : '🔴'
    const proyeccion = ctx.vaALlegar
      ? `Proyección: llegás con ${fmt(ctx.superavit)} de sobra.`
      : `Proyección: te faltan ${fmt(Math.abs(ctx.superavit))} para llegar.`
    const alerta = ctx.alertas[0] ? ` ${ctx.alertas[0]}.` : ''
    return `${emoji} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ${proyeccion}${alerta}`
  }

  // ¿Puedo comprar X?
  const matchPuedo = m.match(/(?:puedo|alcanza|tengo para)[^$\d]*\$?([\d.,]+)/)
  if (matchPuedo) {
    const monto = parseFloat(matchPuedo[1].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(monto)) {
      const libre = ctx.dineroLibre
      if (monto > libre) {
        return `No te alcanza. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}. Te quedarías en rojo.`
      } else if (monto > libre * 0.5) {
        return `Podés, pero te deja justo. Usarías el ${Math.round((monto / libre) * 100)}% de lo que te queda. Pensalo.`
      } else {
        return `Sí, andá tranquilo. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
      }
    }
  }

  return null
}

// ─── Chips dinámicos ─────────────────────────────────────────
function getChips(
  ctx: ReturnType<typeof buildFinancialContext> | null,
  esLunes: boolean
): string[] {
  if (!ctx || ctx.totalGastado === 0) {
    return ['¿Cómo voy este mes?', 'Registrar un gasto', 'Ver mis metas']
  }
  if (new Date().getDate() <= 5 || ctx.totalGastado === 0) {
    return ['Cobré el sueldo 💰', 'Organizame el mes', 'Planificar próximos meses 📅', '¿Cuánto puedo gastar por día?']
  }
  if (ctx.estado === 'mal') {
    return ['¿Cómo bajo mis gastos?', '¿Cuánto puedo gastar por día?', '¿Cómo voy este mes?']
  }
  if (ctx.budgetAnalysis.some(b => b.percentUsed >= 80)) {
    return ['¿En qué estoy gastando más?', '¿Cuánto puedo gastar por día?', '¿Cómo voy este mes?']
  }
  return ['¿Cómo voy este mes?', '¿Cuánto puedo gastar por día?', 'Registrar un gasto']
}

// ─── Mensaje de bienvenida ───────────────────────────────────
function getWelcome(ctx: ReturnType<typeof buildFinancialContext> | null): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  if (!ctx || ctx.totalGastado === 0) {
    return '¡Hola! Contame qué gastaste, preguntame cómo vas, o pedime que organice tu plata 💪'
  }
  if (ctx.estado === 'bien') {
    return `Todo bien por ahora 🟢 Gastaste ${fmt(ctx.totalGastado)} este mes. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿En qué te ayudo?`
  }
  if (ctx.estado === 'cuidado') {
    return `Ojo con los gastos 🟡 Ya gastaste ${fmt(ctx.totalGastado)} y te quedan ${fmt(ctx.dineroLibre)} libres. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día.`
  }
  return `Estás complicado este mes 🔴 Gastaste ${fmt(ctx.totalGastado)} y a este ritmo no llegás. ¿Querés ver en qué ajustar?`
}

// ─── Componente principal ────────────────────────────────────
const ACCIONES_QUE_MODIFICAN = ['INSERT_TRANSACTION', 'CREATE_GOAL', 'CREATE_BUDGET', 'UPDATE_GOAL_PROGRESS']

export default function ChatTab({ selectedMonth, onDataChanged, onNavigateToBudgets }: ChatTabProps) {
  const { transactions, budgets, goals, refresh } = useSimpleSupabase()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ctx, setCtx] = useState<ReturnType<typeof buildFinancialContext> | null>(null)
  const [conversationHistory, setConversationHistory] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
  // Estado para alerta de gasto inusual
const [gastoInusualAlert, setGastoInusualAlert] = useState<{
  categoria: string
  gastoActual: number
  promedioHistorico: number
} | null>(null)

  const weeklySummary = useWeeklySummary()
  const weeklySummaryInjected = useRef(false)

  // ─── Resumen semanal automático ─────────────────────────────
  useEffect(() => {
    // Esperar a que haya datos reales cargados
    if (!transactions || transactions.length === 0) return
    // Solo una vez por sesión, aunque el efecto se re-ejecute
    if (weeklySummaryInjected.current) return

    const onboarding = JSON.parse(localStorage.getItem('ai_wallet_onboarding') || '{}')
    const userId: string = onboarding?.userId || 'default'

    if (!weeklySummary.shouldShow(userId)) return

    const summaryData = weeklySummary.buildSummary(transactions, budgets, goals)
    if (!summaryData) return

    const mensaje = weeklySummary.formatSummaryMessage(summaryData)

    // Insertar al inicio — no reemplaza el historial existente
    setMessages(prev => [{
      id: `weekly-${Date.now()}`,
      text: mensaje,
      sender: 'ai' as const,
      timestamp: new Date(),
      isAuto: true
    }, ...prev])

    weeklySummaryInjected.current = true
    weeklySummary.markShown(userId)
  }, [transactions, budgets, goals])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Construir contexto financiero cada vez que cambian los datos
  useEffect(() => {
    if (!transactions || !budgets || !goals) return
    const onboarding = JSON.parse(localStorage.getItem('ai_wallet_onboarding') || '{}')
    const newCtx = buildFinancialContext(transactions, budgets, goals, onboarding, selectedMonth)
    setCtx(newCtx)
  }, [
    transactions?.length,
    budgets?.length,
    goals?.length,
    selectedMonth
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cargar historial guardado al montar — espera userId real de Supabase
  useEffect(() => {
    const loadHistory = async () => {
      // ← Obtener userId desde Supabase, no desde localStorage
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id || null

      if (!userId) {
        // Sin sesión — no cargar nada
        setMessages([])
        setConversationHistory([])
        return
      }

      const savedMessages = localStorage.getItem(`ai_wallet_chat_${userId}`)
      const savedHistory = localStorage.getItem(`ai_wallet_history_${userId}`)

      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages)
          const restored = parsed.map((m: Message) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
          setMessages(restored)
        } catch { /* JSON corrupto — ignorar */ }
      }

      if (savedHistory) {
        try {
          setConversationHistory(JSON.parse(savedHistory))
        } catch { /* JSON corrupto — ignorar */ }
      }
    }

    loadHistory()
  }, [])

  // Guardar cada vez que cambian mensajes o historial
  useEffect(() => {
    if (messages.length === 0) return

    const saveHistory = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id
      if (!userId) return

      try {
        localStorage.setItem(`ai_wallet_chat_${userId}`, JSON.stringify(messages))
        localStorage.setItem(
          `ai_wallet_history_${userId}`,
          JSON.stringify(conversationHistory)
        )
      } catch { /* localStorage lleno — ignorar */ }
    }

    saveHistory()
  }, [messages, conversationHistory])

  // Contexto para el backend — con todos los números ya calculados
  const buildBackendContext = useCallback(() => {
    if (!ctx) return {}

    const rawKey = localStorage.getItem('ai_wallet_onboarding') || '{}'
    const rawBase = JSON.parse(rawKey)
    const userId: string = rawBase.userId || 'default'
    const stored = localStorage.getItem(`ai_wallet_onboarding_${userId}`) || rawKey
    const onboarding: {
      ingreso_mensual?: number
      objetivo_ahorro?: number
      nombre?: string
      medio_pago_habitual?: string
    } = JSON.parse(stored)

    const hoy = new Date()
    const hace3Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1)
      .toISOString().split('T')[0].slice(0, 7)

    const txHistorico = transactions.filter(t => {
      const mes = (t.transaction_date || '').slice(0, 7)
      return mes >= hace3Meses && mes < selectedMonth && t.type === 'gasto'
    })

    const mesesConDatos = Array.from(new Set(
      txHistorico.map(t => (t.transaction_date || '').slice(0, 7))
    )).filter(Boolean)
    const cantMeses = Math.max(1, mesesConDatos.length)

    const promedioPorCategoria: Record<string, number> = {}
    txHistorico.forEach(t => {
      const cat = t.category || 'otros'
      promedioPorCategoria[cat] = (promedioPorCategoria[cat] || 0) + Number(t.amount)
    })
    Object.keys(promedioPorCategoria).forEach(cat => {
      promedioPorCategoria[cat] = Math.round(promedioPorCategoria[cat] / cantMeses)
    })

    const gastoMensualPromedio = Object.values(promedioPorCategoria).reduce((s, v) => s + v, 0)

    const categoriasEsenciales = [
      'alimentacion', 'comida', 'supermercado', 'alquiler', 'servicios',
      'luz', 'gas', 'agua', 'internet', 'telefono', 'salud', 'medicina',
      'farmacia', 'educacion', 'transporte', 'nafta', 'sube',
    ]
    const categoriasDiscrecionales = [
      'salidas', 'entretenimiento', 'ropa', 'caprichos', 'suscripciones',
      'hobbies', 'viajes', 'restaurante', 'bar', 'delivery',
    ]

    const categoriasClasificadas = Object.entries(promedioPorCategoria).map(([cat, promedio]) => {
      const esEsencial = categoriasEsenciales.some(e => cat.includes(e) || e.includes(cat))
      const esDiscrecional = categoriasDiscrecionales.some(d => cat.includes(d) || d.includes(cat))
      return {
        categoria: cat,
        promedio_mensual: promedio,
        tipo: esEsencial ? 'esencial' : esDiscrecional ? 'discrecional' : 'variable',
        gasto_este_mes:
          ctx.budgetAnalysis.find(b => b.category === cat)?.spent ||
          transactions
            .filter(
              t =>
                t.type === 'gasto' &&
                t.category === cat &&
                (t.transaction_date || '').startsWith(selectedMonth)
            )
            .reduce((s, t) => s + Number(t.amount), 0),
      }
    })

    const gastoMinimoMensual = categoriasClasificadas
      .filter(c => c.tipo === 'esencial')
      .reduce((s, c) => s + c.promedio_mensual, 0)

    return {
      // ── NUEVO ──
      nombre_usuario: onboarding.nombre || null,
      medio_pago_habitual: onboarding.medio_pago_habitual || null,

      resumen_financiero: ctx.resumen,
      fecha_hoy: new Date().toISOString().split('T')[0],
      mes_seleccionado: selectedMonth,
      ingreso_mensual: onboarding.ingreso_mensual || 0,
      objetivo_ahorro: ctx.objetivoAhorro,
      dinero_libre: Math.round(ctx.dineroLibre),
      gasto_diario_recomendado: Math.round(ctx.gastoDiarioRecomendado),
      dias_restantes: ctx.diasRestantes,
      estado_mes: ctx.estado,

      budgets: ctx.budgetAnalysis.map(b => ({
        categoria: b.category,
        limite: b.limit,
        gastado: b.spent,
        disponible: b.remaining,
        estado: b.status,
        porcentaje: b.percentUsed,
      })),

      goals: ctx.goalAnalysis.map(g => ({
        nombre: g.name,
        objetivo: g.target,
        actual: g.current,
        faltante: g.remaining,
        porcentaje: g.percentComplete,
        meses_estimados: g.monthsToComplete,
      })),

      alertas: ctx.alertas,

      historico: {
        meses_analizados: cantMeses,
        gasto_mensual_promedio: Math.round(gastoMensualPromedio),
        gasto_minimo_mensual: Math.round(gastoMinimoMensual),
        categorias: categoriasClasificadas,
      },
    }
  }, [ctx, selectedMonth, transactions])

  const addMessage = (text: string, sender: 'user' | 'ai', isAuto = false) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      text,
      sender,
      timestamp: new Date(),
      isAuto
    }])
  }

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return

    addMessage(message, 'user')
    setIsLoading(true)

    try {
      // Paso 1: detectar intención
      const intent = detectIntent(message)

      // Paso 2: responder sin IA si es consulta simple
      if (intent === 'consulta_simple' && ctx) {
        const auto = autoRespond(message, ctx)
        if (auto) {
          setTimeout(() => {
            addMessage(auto, 'ai', true)
            setIsLoading(false)
          }, 250)
          return
        }
      }

      // Paso 3: llamar al backend con contexto enriquecido
      const contexto = buildBackendContext()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ 
        message, 
        context: contexto,
        // ← NUEVO: últimos 6 intercambios (3 del usuario + 3 del coach)
        history: conversationHistory.slice(-6)
      })
      })

      if (!response.ok) throw new Error('Error en el servidor')
      const data = await response.json()

      addMessage(data.mensaje_respuesta || 'No pude procesar tu mensaje', 'ai')
      
      // ── Detección de gasto inusual ──
if (data.action === 'INSERT_TRANSACTION' && data.data?.type === 'gasto') {
  const categoria = data.data.category
  const montoGasto = data.data.amount
  
  // Buscar promedio histórico de esa categoría desde el contexto
  const contexto = buildBackendContext()
  const categoriaHistorica = contexto.historico?.categorias?.find(
    (c: any) => c.categoria === categoria
  )
  
  if (categoriaHistorica && categoriaHistorica.promedio_mensual > 0) {
    const ratio = montoGasto / categoriaHistorica.promedio_mensual
    // Mostrar alerta si el gasto único es >40% del promedio mensual de esa categoría
    // (o sea, si en un solo gasto casi iguala o supera lo que gasta en todo el mes)
    if (ratio > 0.4) {
      setGastoInusualAlert({
        categoria,
        gastoActual: montoGasto,
        promedioHistorico: categoriaHistorica.promedio_mensual
      })
    } else {
      setGastoInusualAlert(null)
    }
  }
}
      
      // ← NUEVO: agregar al historial
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: data.mensaje_respuesta || '' }
      ])

      if (ACCIONES_QUE_MODIFICAN.includes(data.action)) {
        // Refresh silencioso — NO resetea el chat
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

  const esLunes = new Date().getDay() === 1
  const chips = getChips(ctx, esLunes)
  const welcome = getWelcome(ctx)

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[500px] bg-[#0A0F0D]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#00C853]/20 rounded-full flex items-center justify-center text-lg">🤖</div>
          <div>
            <p className="text-white font-semibold text-sm">Tu Coach</p>
            <p className="text-white/40 text-xs">Financiero personal</p>
          </div>
        </div>

        {ctx && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              ctx.estado === 'bien'    ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              ctx.estado === 'cuidado' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                         'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {ctx.estado === 'bien' ? '🟢 Vas bien' : ctx.estado === 'cuidado' ? '🟡 Cuidado' : '🔴 Complicado'}
            </div>
            <button
              onClick={() => {
                setMessages([])
                setConversationHistory([])
                const onboarding = JSON.parse(localStorage.getItem('ai_wallet_onboarding') || '{}')
                const userId = onboarding?.userId || 'default'
                localStorage.removeItem(`ai_wallet_chat_${userId}`)
                localStorage.removeItem(`ai_wallet_history_${userId}`)
              }}
              className="text-white/20 hover:text-white/40 text-xs transition-colors"
              title="Limpiar chat"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Alerta activa si hay */}
      {ctx && ctx.alertas.length > 0 && messages.length === 0 && (
        <div className="mx-4 mt-3 flex-shrink-0">
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2">
            <p className="text-yellow-400/80 text-xs">⚠️ {ctx.alertas[0]}</p>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {messages.length === 0 && (
          <>
            <BotMessage text={welcome} />

            {/* Mini dashboard inline si hay datos */}
            {ctx && ctx.totalGastado > 0 && (
              <div className="ml-10 grid grid-cols-3 gap-2">
                <MiniCard label="Gastado" value={`$${Math.round(ctx.totalGastado).toLocaleString('es-AR')}`} />
                <MiniCard
                  label="Disponible"
                  value={`$${Math.round(ctx.dineroLibre).toLocaleString('es-AR')}`}
                  highlight={ctx.dineroLibre > 0 ? 'green' : 'red'}
                />
                <MiniCard label="Por día" value={`$${Math.round(ctx.gastoDiarioRecomendado).toLocaleString('es-AR')}`} />
              </div>
            )}
          </>
        )}

        {messages.map((msg, index) => (
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
                  <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                  <div className="max-w-[85%]">
                    <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
                      <p className="text-white text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    {msg.isAuto && (
                      <p className="text-white/20 text-[10px] mt-0.5 ml-1">respuesta instantánea</p>
                    )}
                  </div>
                </div>
                
                {/* ← Alerta de gasto inusual — solo en el último mensaje de la IA */}
                {index === messages.length - 1 && 
                 msg.sender === 'ai' && 
                 gastoInusualAlert && (
                  <GastoInusualAlert
                    categoria={gastoInusualAlert.categoria}
                    gastoActual={gastoInusualAlert.gastoActual}
                    promedioHistorico={gastoInusualAlert.promedioHistorico}
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
            <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
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

      {/* Chips */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-none">
        {chips.map(chip => (
          <button
            key={chip}
            onClick={() => handleSendMessage(chip)}
            disabled={isLoading}
            className="flex-shrink-0 text-xs bg-[#141A17] border border-white/10 rounded-full px-3 py-1.5 text-white/60 hover:border-[#00C853]/40 hover:text-white transition-colors disabled:opacity-30"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Contame qué gastaste..."
            className="flex-1 bg-[#141A17] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#00C853]/40 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || !inputValue.trim()}
            className="bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 text-black font-bold px-4 py-3 rounded-xl transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────
function BotMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
      <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
        <p className="text-white text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function MiniCard({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="bg-[#141A17] border border-white/5 rounded-xl p-2.5 text-center">
      <p className="text-white/40 text-[10px] mb-0.5">{label}</p>
      <p className={`text-xs font-semibold ${
        highlight === 'green' ? 'text-green-400' :
        highlight === 'red'   ? 'text-red-400' :
        'text-white'
      }`}>{value}</p>
    </div>
  )
}

// ─── Alerta de gasto inusual ─────────────────────────────────
interface GastoInusualAlertProps {
  categoria: string
  gastoActual: number
  promedioHistorico: number
  onVerDetalle: () => void
}

function GastoInusualAlert({ categoria, gastoActual, promedioHistorico, onVerDetalle }: GastoInusualAlertProps) {
  const veces = promedioHistorico > 0 
    ? (gastoActual / promedioHistorico).toFixed(1) 
    : '2+'
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}` 
  
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
              Este gasto es {veces}x tu promedio histórico 
              ({fmt(promedioHistorico)}/mes)
            </p>
          </div>
        </div>
        <button
          onClick={onVerDetalle}
          className="mt-2 w-full text-xs text-yellow-400/70 hover:text-yellow-400 
                     border border-yellow-500/20 hover:border-yellow-500/40 
                     rounded-lg py-1.5 transition-colors"
        >
          Ver presupuesto de {categoria} →
        </button>
      </div>
    </div>
  )
}