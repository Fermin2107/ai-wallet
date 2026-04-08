'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { History, X, Plus, Flame, CheckCircle2, TrendingDown, Zap, Target } from 'lucide-react'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { createBrowserClient } from '@supabase/ssr'
import { useWeeklySummary } from '../hooks/useWeeklySummary'

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
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
}

// ─── Streak helper ───────────────────────────────────────────
function getStreak(userId: string): number {
  try {
    const raw = localStorage.getItem(`ai_wallet_streak_${userId}`)
    if (!raw) return 0
    const { lastDate, count } = JSON.parse(raw)
    const hoy = new Date().toISOString().split('T')[0]
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    if (lastDate === hoy) return count
    if (lastDate === ayer) return count // sigue vigente hoy
    return 0 // se cortó
  } catch { return 0 }
}

function bumpStreak(userId: string): number {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    const raw = localStorage.getItem(`ai_wallet_streak_${userId}`)
    let count = 1
    if (raw) {
      const { lastDate, count: prev } = JSON.parse(raw)
      const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      if (lastDate === hoy) return prev // ya se registró hoy
      if (lastDate === ayer) count = prev + 1
    }
    localStorage.setItem(`ai_wallet_streak_${userId}`, JSON.stringify({ lastDate: hoy, count }))
    return count
  } catch { return 1 }
}

// ─── Motor financiero (sin cambios) ─────────────────────────
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

  const txMes = transactions.filter(t => (t.transaction_date || '').startsWith(selectedMonth))
  const totalIngresado = txMes.filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0)
  const totalGastado   = txMes.filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0)
  const ingresoEfectivo = totalIngresado > 0 ? totalIngresado : (onboarding.ingreso_mensual || 0)
  const objetivoAhorro  = onboarding.objetivo_ahorro || 0
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre      = Math.max(0, dineroDisponible - objetivoAhorro)

  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastoUltimos7 = transactions.filter(t => t.type === 'gasto' && new Date(t.transaction_date) >= hace7Dias).reduce((s, t) => s + Number(t.amount), 0)
  const gastoDiarioPromedio    = gastoUltimos7 / 7
  const gastoDiarioRecomendado = diasRestantes > 0 ? dineroLibre / diasRestantes : 0

  const proyeccion = totalGastado + gastoDiarioPromedio * diasRestantes
  const superavit  = ingresoEfectivo - proyeccion - objetivoAhorro
  const vaALlegar  = superavit >= 0

  const budgetsMes = budgets.filter(b => b.month_period === selectedMonth)
  const budgetAnalysis = budgetsMes.map(b => {
    const spent = txMes.filter(t => t.type === 'gasto' && t.category === b.category).reduce((s, t) => s + Number(t.amount), 0)
    const pct   = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
    const projected = spent + (spent / diasTranscurridos) * diasRestantes
    const status = pct >= 100 ? 'excedido' : pct >= 85 ? 'rojo' : pct >= 60 ? 'amarillo' : 'verde'
    return { category: b.category, limit: b.limit_amount, spent, remaining: b.limit_amount - spent, percentUsed: Math.round(pct), status, projectedEndOfMonth: Math.round(projected), willExceed: projected > b.limit_amount }
  })

  const catMap: Record<string, number> = {}
  txMes.filter(t => t.type === 'gasto').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount) })
  const topGastos = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, total]) => ({ category: cat, total: Math.round(total) }))

  const metasActivas  = goals.filter(g => !g.is_completed)
  const aportePorMeta = metasActivas.length > 0 ? dineroLibre / metasActivas.length : 0
  const goalAnalysis  = metasActivas.map(g => {
    const remaining = Math.max(0, g.target_amount - g.current_amount)
    const pct       = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0
    return { name: g.name, target: g.target_amount, current: g.current_amount, remaining, percentComplete: pct, monthsToComplete: aportePorMeta > 0 ? Math.ceil(remaining / aportePorMeta) : null }
  })

  const alertas: string[] = []
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  if (!vaALlegar) alertas.push(`A este ritmo te van a faltar ${fmt(Math.abs(superavit))} para llegar a fin de mes`)
  budgetAnalysis.filter(b => b.percentUsed >= 85).forEach(b => {
    alertas.push(b.status === 'excedido' ? `Superaste el límite de ${b.category} en ${fmt(Math.abs(b.remaining))}` : `${b.category} está al ${b.percentUsed}% del límite`)
  })
  if (gastoDiarioPromedio > gastoDiarioRecomendado * 1.3 && gastoDiarioRecomendado > 0) {
    alertas.push(`Gastás ${fmt(gastoDiarioPromedio)}/día pero deberías gastar ${fmt(gastoDiarioRecomendado)}/día`)
  }

  const score  = Math.max(0, Math.min(100, 70 + (vaALlegar ? 15 : -20) + (budgetAnalysis.filter(b => b.percentUsed >= 80).length === 0 ? 10 : -5) + (dineroLibre > 0 ? 5 : 0)))
  const estado = score >= 70 ? 'bien' : score >= 45 ? 'cuidado' : 'mal'

  const resumen = [
    `ESTADO: ${estado.toUpperCase()} (score ${score}/100)`,
    `INGRESO: ${fmt(ingresoEfectivo)} | GASTADO: ${fmt(totalGastado)} | LIBRE: ${fmt(dineroLibre)} | AHORRO OBJETIVO: ${fmt(objetivoAhorro)}`,
    `DÍAS RESTANTES: ${diasRestantes} | GASTO DIARIO REAL: ${fmt(gastoDiarioPromedio)}/día | RECOMENDADO: ${fmt(gastoDiarioRecomendado)}/día`,
    `PROYECCIÓN FIN DE MES: ${vaALlegar ? 'LLEGA' : 'NO LLEGA'} (superávit proyectado: ${fmt(superavit)})`,
    '', 'PRESUPUESTOS:',
    ...budgetAnalysis.map(b => `  [${b.status.toUpperCase()}] ${b.category}: gastó ${fmt(b.spent)} de ${fmt(b.limit)} (${b.percentUsed}%)${b.willExceed ? ' — VA A EXCEDER' : ''}`),
    budgetAnalysis.length === 0 ? '  Sin presupuestos configurados' : '',
    '', 'METAS:',
    ...goalAnalysis.map(g => `  ${g.name}: ${fmt(g.current)} de ${fmt(g.target)} (${g.percentComplete}%)${g.monthsToComplete ? ` — ~${g.monthsToComplete} meses` : ''}`),
    goalAnalysis.length === 0 ? '  Sin metas activas' : '',
    '', 'TOP GASTOS DEL MES:',
    ...topGastos.map(c => `  ${c.category}: ${fmt(c.total)}`),
    topGastos.length === 0 ? '  Sin gastos registrados este mes' : '',
    alertas.length > 0 ? '\nALERTAS:\n' + alertas.map(a => `  ⚠️ ${a}`).join('\n') : ''
  ].join('\n')

  return { estado, score, ingresoEfectivo, totalIngresado, totalGastado, dineroDisponible, dineroLibre, objetivoAhorro, gastoDiarioPromedio, gastoDiarioRecomendado, diasRestantes, vaALlegar, superavit, budgetAnalysis, goalAnalysis, topGastos, alertas, resumen }
}

// ─── Intent ──────────────────────────────────────────────────
type Intent = 'registro' | 'consulta_simple' | 'complejo'

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase()
  const tieneNumero = /\d/.test(m)
  const verbosGasto   = ['gasté', 'gaste', 'pagué', 'pague', 'compré', 'compre', 'salió', 'salio', 'costó', 'costo']
  const verbosIngreso = ['cobré', 'cobre', 'me pagaron', 'entraron', 'ingresé', 'ingrese', 'recibí', 'recibi', 'gané']
  if (tieneNumero && (verbosGasto.some(v => m.includes(v)) || verbosIngreso.some(v => m.includes(v)))) return 'registro'
  if (m.includes('puedo gastar') || m.includes('por día') || m.includes('cómo voy') || m.includes('como voy') || m.includes('resumen') || m.includes('estado')) return 'consulta_simple'
  return 'complejo'
}

// ─── Auto-respuestas ─────────────────────────────────────────
function autoRespond(msg: string, ctx: ReturnType<typeof buildFinancialContext>): string | null {
  const m   = msg.toLowerCase()
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  if (m.includes('por día') || m.includes('por dia') || m.includes('diario') || m.includes('cuánto puedo gastar')) {
    if (ctx.gastoDiarioRecomendado <= 0) return `No te queda margen para gastar este mes.`
    const comp = ctx.gastoDiarioPromedio > ctx.gastoDiarioRecomendado
      ? `Ahora vas a ${fmt(ctx.gastoDiarioPromedio)}/día, tenés que bajar.`
      : `Vas bien, estás dentro del rango.`
    return `Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día para llegar a fin de mes. ${comp}`
  }
  if (m.includes('cómo voy') || m.includes('como voy') || m.includes('resumen') || m.includes('estado')) {
    const emoji = ctx.estado === 'bien' ? '🟢' : ctx.estado === 'cuidado' ? '🟡' : '🔴'
    const proy  = ctx.vaALlegar ? `Llegás con ${fmt(ctx.superavit)} de sobra.` : `Te faltan ${fmt(Math.abs(ctx.superavit))} para llegar.`
    return `${emoji} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ${proy}${ctx.alertas[0] ? ' ' + ctx.alertas[0] + '.' : ''}`
  }
  const matchPuedo = m.match(/(?:puedo|alcanza|tengo para)[^$\d]*\$?([\d.,]+)/)
  if (matchPuedo) {
    const monto = parseFloat(matchPuedo[1].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(monto)) {
      const libre = ctx.dineroLibre
      if (monto > libre) return `No te alcanza. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
      if (monto > libre * 0.5) return `Podés, pero te deja justo. Usarías el ${Math.round((monto / libre) * 100)}% de lo que te queda.`
      return `Sí, andá tranquilo. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
    }
  }
  return null
}

// ─── Acciones rápidas (cards tocables) ───────────────────────
// Reemplazan a los chips de texto plano.
// Cada card tiene un emoji grande, un label corto y dispara un mensaje predefinido.
interface QuickAction {
  id: string
  emoji: string
  label: string
  message: string
  color: string
}

function getQuickActions(ctx: ReturnType<typeof buildFinancialContext> | null, esUsuarioNuevo: boolean): QuickAction[] {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  // Usuario nuevo: onboarding directo
  if (esUsuarioNuevo) {
    return [
      { id: 'gasto-rapido', emoji: '☕', label: 'Café / delivery', message: 'Gasté en café hoy', color: 'border-[#FF6D00]/25 bg-[#FF6D00]/8' },
      { id: 'super', emoji: '🛒', label: 'Supermercado', message: 'Fui al super hoy', color: 'border-white/10 bg-white/4' },
      { id: 'transporte', emoji: '🚌', label: 'Transporte', message: 'Gasté en transporte hoy', color: 'border-white/10 bg-white/4' },
      { id: 'otro', emoji: '➕', label: 'Otro gasto', message: 'Quiero registrar un gasto', color: 'border-white/10 bg-white/4' },
    ]
  }

  if (!ctx) return []

  const actions: QuickAction[] = []

  // Card 1: siempre — registrar gasto de hoy
  const hora = new Date().getHours()
  const label = hora < 12 ? 'Anotar gasto de hoy' : hora < 17 ? 'Anotar almuerzo / salida' : 'Cerrar el día'
  actions.push({ id: 'anotar', emoji: '✏️', label, message: '¿Cómo voy hoy?', color: 'border-[#00C853]/25 bg-[#00C853]/8' })

  // Card 2: contexto inteligente
  if (!ctx.vaALlegar) {
    actions.push({ id: 'plan', emoji: '🎯', label: 'Armá un plan', message: '¿Cómo puedo llegar a fin de mes?', color: 'border-[#FF5252]/20 bg-[#FF5252]/8' })
  } else if (ctx.estado === 'bien' && ctx.dineroLibre > 0) {
    actions.push({ id: 'sobra', emoji: '💰', label: `Tengo ${fmt(ctx.dineroLibre)} libres`, message: '¿Qué hago con el dinero que me sobra?', color: 'border-[#00C853]/20 bg-[#00C853]/5' })
  } else {
    actions.push({ id: 'status', emoji: '📊', label: '¿Cómo voy?', message: '¿Cómo voy este mes?', color: 'border-white/10 bg-white/4' })
  }

  // Card 3: presupuesto en riesgo o meta
  const enRiesgo = ctx.budgetAnalysis.find(b => b.status === 'rojo' && b.category !== 'otros')
  const metaActiva = ctx.goalAnalysis[0]
  if (enRiesgo) {
    actions.push({ id: 'riesgo', emoji: '⚠️', label: `${enRiesgo.category} al ${enRiesgo.percentUsed}%`, message: `¿Cuánto me queda en ${enRiesgo.category}?`, color: 'border-[#FFD740]/20 bg-[#FFD740]/8' })
  } else if (metaActiva) {
    actions.push({ id: 'meta', emoji: '🏆', label: metaActiva.name.slice(0, 14), message: `¿Cómo voy con mi meta de ${metaActiva.name}?`, color: 'border-[#69F0AE]/15 bg-[#69F0AE]/5' })
  } else {
    actions.push({ id: 'diario', emoji: '📅', label: `${fmt(ctx.gastoDiarioRecomendado)}/día`, message: '¿Cuánto puedo gastar por día?', color: 'border-white/10 bg-white/4' })
  }

  return actions
}

// ─── Mensaje proactivo ───────────────────────────────────────
function getProactiveMessage(ctx: ReturnType<typeof buildFinancialContext>, onboarding: { nombre?: string }): string | null {
  const fmt  = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  const hora       = new Date().getHours()
  const dia        = new Date().getDate()
  const diaSemana  = new Date().getDay()

  if (ctx.totalGastado === 0) return null
  if (diaSemana === 1) return null // lunes lo cubre el weekly

  const excedido = ctx.budgetAnalysis.find(b => b.status === 'excedido' && b.category !== 'otros')
  if (excedido) return `Superaste ${excedido.category} en ${fmt(Math.abs(excedido.remaining))}. ¿Querés ver en qué gastaste ahí?`

  if (!ctx.vaALlegar && ctx.diasRestantes > 5) return `A este ritmo te van a faltar ${fmt(Math.abs(ctx.superavit))} para llegar a fin de mes. ¿Armamos un plan?`

  const enRiesgo = ctx.budgetAnalysis.find(b => b.status === 'rojo' && b.category !== 'otros')
  if (enRiesgo) return `${enRiesgo.category} está al ${enRiesgo.percentUsed}% del límite, quedan ${ctx.diasRestantes} días. ¿Revisamos?`

  if (dia <= 3 && ctx.totalIngresado === 0) return `¿Ya llegó el sueldo? Registralo para que el plan funcione bien.`

  if (ctx.estado === 'bien' && ctx.diasRestantes <= 7) return `Vas a cerrar el mes en verde con ${fmt(ctx.superavit)} de sobra 🟢`

  if (hora >= 20) return `¿Cómo terminó el día? Si gastaste algo, lo anoto.`
  if (hora >= 12 && hora <= 14 && ctx.gastoDiarioRecomendado > 0) return `Recordatorio de mediodía: podés gastar hasta ${fmt(ctx.gastoDiarioRecomendado)} hoy.`

  return null
}

// ─── Welcome ─────────────────────────────────────────────────
function getWelcome(ctx: ReturnType<typeof buildFinancialContext> | null, esUsuarioNuevo: boolean, nombre?: string, streak?: number): string {
  const fmt    = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  const saludo = nombre ? `, ${nombre}` : ''
  const hora   = new Date().getHours()
  const greeting = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  if (esUsuarioNuevo) {
    return `${greeting}${saludo}! Para empezar, contame tu último gasto — puede ser cualquier cosa. Café, nafta, supermercado. Lo registro al toque.`
  }

  if (!ctx || ctx.totalGastado === 0) {
    return `${greeting}${saludo}! Todavía no registraste gastos este mes. ¿Qué fue lo último que pagaste?`
  }

  if (ctx.estado === 'bien') {
    const streakMsg = streak && streak > 1 ? ` ${streak} días seguidos registrando 🔥` : ''
    return `${greeting}${saludo}!${streakMsg} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ¿Qué registramos hoy?`
  }
  if (ctx.estado === 'cuidado') {
    return `${greeting}${saludo}! Ya gastaste ${fmt(ctx.totalGastado)} y te quedan ${fmt(ctx.dineroLibre)} libres — ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿Qué gastos registramos?`
  }
  return `${greeting}${saludo}! Gastaste ${fmt(ctx.totalGastado)} y a este ritmo no llegás a fin de mes. ¿Armamos un plan ya?`
}

// ─── Formato fecha sidebar ────────────────────────────────────
function formatSessionDate(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff  = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Ayer'
  if (diff < 7)   return d.toLocaleDateString('es-AR', { weekday: 'short' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const ACCIONES_QUE_MODIFICAN = ['INSERT_TRANSACTION', 'CREATE_GOAL', 'CREATE_BUDGET', 'UPDATE_GOAL_PROGRESS']

// ─── Componente principal ─────────────────────────────────────
export default function ChatTab({ selectedMonth, onDataChanged, onNavigateToBudgets }: ChatTabProps) {
  const { transactions, budgets, goals, refresh } = useSimpleSupabase()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [messages, setMessages]                       = useState<Message[]>([])
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [activeSessionId, setActiveSessionId]         = useState<string | null>(null)

  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sessions, setSessions]               = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const [inputValue, setInputValue]       = useState('')
  const [isLoading, setIsLoading]         = useState(false)
  const [ctx, setCtx]                     = useState<ReturnType<typeof buildFinancialContext> | null>(null)
  const [onboarding, setOnboarding]       = useState<{ nombre?: string; ingreso_mensual?: number; objetivo_ahorro?: number }>({})
  const [userId, setUserId]               = useState<string | null>(null)
  const [streak, setStreak]               = useState(0)
  const [showSuccessFlash, setShowSuccessFlash] = useState(false) // flash al registrar
  const [gastoInusualAlert, setGastoInusualAlert]       = useState<{ categoria: string; gastoActual: number; promedioHistorico: number } | null>(null)
  const [pendingAccountMessage, setPendingAccountMessage] = useState<string | null>(null)
  const [accountPickerOptions, setAccountPickerOptions]   = useState<{ id: string; name: string; type: string }[]>([])
  const [proactiveShown, setProactiveShown] = useState(false)

  const [dataLoaded, setDataLoaded] = useState(false)
  const esUsuarioNuevo = dataLoaded && transactions.length === 0

  const weeklySummary         = useWeeklySummary()
  const weeklySummaryInjected = useRef(false)
  const messagesEndRef        = useRef<HTMLDivElement>(null)

  // ── Token helper ──
  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [supabase])

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [getToken])

  // ── Sesiones ──
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const h = await authHeaders()
      const res  = await fetch('/api/chat-sessions', { headers: h })
      const json = await res.json()
      setSessions(json.sessions ?? [])
    } catch { } finally { setLoadingSessions(false) }
  }, [authHeaders])

  const fetchMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true)
    try {
      const h = await authHeaders()
      const res  = await fetch(`/api/chat-sessions/${sessionId}/messages`, { headers: h })
      const json = await res.json()
      const restored: Message[] = (json.messages ?? []).map((m: any) => ({
        id: m.id, text: m.content, sender: m.role === 'user' ? 'user' : 'ai',
        timestamp: new Date(m.created_at), isAuto: m.is_auto,
      }))
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
      for (const m of json.messages ?? []) {
        if (!m.is_auto) history.push({ role: m.role, content: m.content })
      }
      setMessages(restored)
      setConversationHistory(history)
      setActiveSessionId(sessionId)
      setSidebarOpen(false)
    } catch { } finally { setLoadingMessages(false) }
  }, [authHeaders])

  const createSession = useCallback(async (title: string): Promise<string | null> => {
    try {
      const h = await authHeaders()
      const res  = await fetch('/api/chat-sessions', { method: 'POST', headers: h, body: JSON.stringify({ title }) })
      const json = await res.json()
      setSessions(prev => [json.session, ...prev])
      return json.session.id
    } catch { return null }
  }, [authHeaders])

  const persistMessage = useCallback(async (sessionId: string, role: 'user' | 'assistant', content: string, isAuto = false) => {
    try {
      const h = await authHeaders()
      await fetch(`/api/chat-sessions/${sessionId}/messages`, {
        method: 'POST', headers: h, body: JSON.stringify({ role, content, is_auto: isAuto }),
      })
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s)
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      )
    } catch { }
  }, [authHeaders])

  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const h = await authHeaders()
      await fetch('/api/chat-sessions', { method: 'DELETE', headers: h, body: JSON.stringify({ sessionId }) })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (sessionId === activeSessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId)
        if (remaining.length > 0) fetchMessages(remaining[0].id)
        else startNewSession()
      }
    } catch { }
  }, [authHeaders, activeSessionId, sessions])

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

  useEffect(() => { if (sidebarOpen) fetchSessions() }, [sidebarOpen])

  // ── Cargar usuario, onboarding y streak ──
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id
      if (!uid) return
      setUserId(uid)
      setStreak(getStreak(uid))
      const stored = localStorage.getItem(`ai_wallet_onboarding_${uid}`)
      if (stored) { try { setOnboarding(JSON.parse(stored)) } catch { } }
    }
    load()
  }, [])

  useEffect(() => { if (transactions !== undefined) setDataLoaded(true) }, [transactions])

  // ── Resumen semanal ──
  useEffect(() => {
    if (!transactions?.length || weeklySummaryInjected.current) return
    if (!weeklySummary.shouldShow('user')) return
    const summaryData = weeklySummary.buildSummary(transactions, budgets, goals)
    if (!summaryData) return
    const mensaje = weeklySummary.formatSummaryMessage(summaryData)
    setMessages(prev => [{ id: `weekly-${Date.now()}`, text: mensaje, sender: 'ai', timestamp: new Date(), isAuto: true }, ...prev])
    weeklySummaryInjected.current = true
    weeklySummary.markShown('user')
  }, [transactions, budgets, goals])

  // ── Contexto financiero ──
  useEffect(() => {
    if (!transactions || !budgets || !goals) return
    const ob = { ingreso_mensual: onboarding.ingreso_mensual || 0, objetivo_ahorro: onboarding.objetivo_ahorro || 0 }
    setCtx(buildFinancialContext(transactions, budgets, goals, ob, selectedMonth))
  }, [transactions?.length, budgets?.length, goals?.length, selectedMonth, onboarding])

  // ── Mensaje proactivo ──
  useEffect(() => {
    if (!ctx || !dataLoaded || messages.length > 0 || proactiveShown || esUsuarioNuevo) return
    if (new Date().getDay() === 1 && transactions.length > 0) return
    const proactivo = getProactiveMessage(ctx, onboarding)
    if (!proactivo) return
    const timer = setTimeout(() => {
      setMessages(prev => {
        if (prev.length > 0) return prev
        return [{ id: `proactive-${Date.now()}`, text: proactivo, sender: 'ai', timestamp: new Date(), isAuto: true }]
      })
      setProactiveShown(true)
    }, 400)
    return () => clearTimeout(timer)
  }, [ctx, dataLoaded, messages.length, proactiveShown, esUsuarioNuevo])

  // ── Scroll ──
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Contexto backend ──
  const buildBackendContext = useCallback(() => {
    if (!ctx) return {}
    const hoy = new Date()
    const hace3Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1).toISOString().slice(0, 7)
    const txHistorico = transactions.filter(t => {
      const mes = (t.transaction_date || '').slice(0, 7)
      return mes >= hace3Meses && mes < selectedMonth && t.type === 'gasto'
    })
    const mesesConDatos = Array.from(new Set(txHistorico.map(t => (t.transaction_date || '').slice(0, 7)))).filter(Boolean)
    const cantMeses = Math.max(1, mesesConDatos.length)
    const promedioPorCategoria: Record<string, number> = {}
    txHistorico.forEach(t => { const cat = t.category || 'otros'; promedioPorCategoria[cat] = (promedioPorCategoria[cat] || 0) + Number(t.amount) })
    Object.keys(promedioPorCategoria).forEach(cat => { promedioPorCategoria[cat] = Math.round(promedioPorCategoria[cat] / cantMeses) })
    const gastoMensualPromedio = Object.values(promedioPorCategoria).reduce((s, v) => s + v, 0)
    const esenciales     = ['alimentacion','comida','supermercado','alquiler','servicios','luz','gas','agua','internet','telefono','salud','medicina','farmacia','educacion','transporte','nafta','sube']
    const discrecionales = ['salidas','entretenimiento','ropa','caprichos','suscripciones','hobbies','viajes','restaurante','bar','delivery']
    const categoriasClasificadas = Object.entries(promedioPorCategoria).map(([cat, promedio]) => ({
      categoria: cat,
      promedio_mensual: promedio,
      tipo: esenciales.some(e => cat.includes(e) || e.includes(cat)) ? 'esencial' : discrecionales.some(d => cat.includes(d) || d.includes(cat)) ? 'discrecional' : 'variable',
      gasto_este_mes: ctx.budgetAnalysis.find(b => b.category === cat)?.spent ||
        transactions.filter(t => t.type === 'gasto' && t.category === cat && (t.transaction_date || '').startsWith(selectedMonth)).reduce((s, t) => s + Number(t.amount), 0),
    }))
    const gastoMinimoMensual = categoriasClasificadas.filter(c => c.tipo === 'esencial').reduce((s, c) => s + c.promedio_mensual, 0)
    return {
      nombre_usuario: onboarding.nombre || null,
      medio_pago_habitual: null,
      resumen_financiero: ctx.resumen,
      usuario_nuevo: esUsuarioNuevo,
      fecha_hoy: new Date().toISOString().split('T')[0],
      mes_seleccionado: selectedMonth,
      ingreso_mensual: onboarding.ingreso_mensual || 0,
      objetivo_ahorro: ctx.objetivoAhorro,
      dinero_libre: Math.round(ctx.dineroLibre),
      gasto_diario_recomendado: Math.round(ctx.gastoDiarioRecomendado),
      dias_restantes: ctx.diasRestantes,
      estado_mes: ctx.estado,
      budgets: ctx.budgetAnalysis.map(b => ({ categoria: b.category, limite: b.limit, gastado: b.spent, disponible: b.remaining, estado: b.status, porcentaje: b.percentUsed })),
      goals: ctx.goalAnalysis.map(g => ({ nombre: g.name, objetivo: g.target, actual: g.current, faltante: g.remaining, porcentaje: g.percentComplete, meses_estimados: g.monthsToComplete })),
      alertas: ctx.alertas,
      historico: { meses_analizados: cantMeses, gasto_mensual_promedio: Math.round(gastoMensualPromedio), gasto_minimo_mensual: Math.round(gastoMinimoMensual), categorias: categoriasClasificadas },
    }
  }, [ctx, selectedMonth, transactions, onboarding, esUsuarioNuevo])

  const addMessage = useCallback((text: string, sender: 'user' | 'ai', isAuto = false, type: Message['type'] = 'normal'): Message => {
    const msg: Message = { id: `${Date.now()}-${Math.random()}`, text, sender, timestamp: new Date(), isAuto, type }
    setMessages(prev => [...prev, msg])
    return msg
  }, [])

  // ── Enviar mensaje ──
  const handleSendMessage = async (message: string, overrideAccountId?: string) => {
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

      if (intent === 'consulta_simple' && ctx && !overrideAccountId && !esUsuarioNuevo) {
        const auto = autoRespond(message, ctx)
        if (auto) {
          setTimeout(async () => {
            addMessage(auto, 'ai', true)
            if (sessionId) await persistMessage(sessionId, 'assistant', auto, true)
            setIsLoading(false)
          }, 200)
          return
        }
      }

      const contexto = buildBackendContext()
      if (overrideAccountId) (contexto as any).resolved_account_id = overrideAccountId

      const token = await getToken()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ message, context: contexto, history: conversationHistory.slice(-6) }),
      })

      if (!response.ok) throw new Error('Error en el servidor')
      const data = await response.json()

      if (data.action === 'NEEDS_ACCOUNT_SELECTION') {
        addMessage(data.mensaje_respuesta, 'ai')
        if (sessionId) await persistMessage(sessionId, 'assistant', data.mensaje_respuesta)
        setPendingAccountMessage(message)
        setAccountPickerOptions(data.data?.accounts || [])
        setIsLoading(false)
        return
      }

      const aiText = data.mensaje_respuesta || 'No pude procesar tu mensaje'
      const msgType: Message['type'] = data.action === 'INSERT_TRANSACTION' ? 'success' : 'normal'
      addMessage(aiText, 'ai', false, msgType)
      if (sessionId) await persistMessage(sessionId, 'assistant', aiText)

      // Flash de éxito + streak al registrar
      if (data.action === 'INSERT_TRANSACTION') {
        setShowSuccessFlash(true)
        setTimeout(() => setShowSuccessFlash(false), 1800)
        if (userId) {
          const newStreak = bumpStreak(userId)
          setStreak(newStreak)
        }
      }

      // Gasto inusual
      if (data.action === 'INSERT_TRANSACTION' && data.data?.type === 'gasto') {
        const cat2   = data.data.category
        const monto2 = data.data.amount
        const ctx2   = buildBackendContext()
        const catHist = ctx2.historico?.categorias?.find((c: any) => c.categoria === cat2)
        if (catHist && catHist.promedio_mensual > 0 && monto2 / catHist.promedio_mensual > 0.4) {
          setGastoInusualAlert({ categoria: cat2, gastoActual: monto2, promedioHistorico: catHist.promedio_mensual })
        } else {
          setGastoInusualAlert(null)
        }
      }

      setConversationHistory(prev => [
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
    if (inputValue.trim()) { handleSendMessage(inputValue.trim()); setInputValue('') }
  }

  const quickActions = getQuickActions(ctx, esUsuarioNuevo)
  const welcome      = getWelcome(ctx, esUsuarioNuevo, onboarding.nombre, streak)
  const showQuickActions = messages.length === 0 || (messages.length > 0 && messages[messages.length - 1].sender === 'ai')

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
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-0 left-0 z-50 h-full w-72 bg-[#0a120e] border-r border-white/8 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
              <div>
                <p className="text-white font-semibold text-sm">Historial</p>
                <p className="text-white/30 text-xs">{sessions.length} conversaciones</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-white/30 hover:text-white/60 transition-colors"><X size={18} /></button>
            </div>
            <div className="px-3 py-2.5 border-b border-white/5">
              <button onClick={startNewSession} className="w-full flex items-center justify-center gap-2 text-sm text-[#69F0AE] border border-[#00C853]/30 rounded-xl py-2 hover:bg-[#00C853]/10 transition-colors">
                <Plus size={14} /> Nueva conversación
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {loadingSessions && <div className="flex justify-center py-8"><div className="w-4 h-4 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" /></div>}
              {!loadingSessions && sessions.length === 0 && <p className="text-white/20 text-xs text-center py-8">Sin conversaciones</p>}
              {!loadingSessions && sessions.map(session => (
                <div key={session.id} onClick={() => fetchMessages(session.id)}
                  className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${session.id === activeSessionId ? 'bg-[#00C853]/10 border border-[#00C853]/20' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug truncate ${session.id === activeSessionId ? 'text-[#69F0AE]' : 'text-white/70'}`}>{session.title}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">{formatSessionDate(session.updated_at)}</p>
                  </div>
                  <button onClick={(e) => deleteSession(session.id, e)} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-[#FF5252] transition-all"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-white/30 hover:text-white/60 transition-colors p-1">
            <History size={18} />
          </button>
          <div className="w-9 h-9 bg-[#00C853]/20 rounded-full flex items-center justify-center text-lg">🤖</div>
          <div>
            <p className="text-white font-semibold text-sm">Tu Coach</p>
            <p className="text-white/40 text-xs">{esUsuarioNuevo ? 'Empecemos' : 'Financiero personal'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Streak badge — solo si tiene más de 1 día */}
          {streak > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FF6D00]/15 border border-[#FF6D00]/20">
              <Flame size={11} className="text-[#FF6D00]" />
              <span className="text-[#FF6D00] text-[11px] font-semibold">{streak}</span>
            </div>
          )}
          {ctx && !esUsuarioNuevo && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              ctx.estado === 'bien'    ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              ctx.estado === 'cuidado' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                         'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {ctx.estado === 'bien' ? '🟢' : ctx.estado === 'cuidado' ? '🟡' : '🔴'}
              {ctx.estado === 'bien' ? 'Bien' : ctx.estado === 'cuidado' ? 'Cuidado' : 'Mal'}
            </div>
          )}
          <button onClick={startNewSession} className="text-white/20 hover:text-white/40 transition-colors p-1">
            <Plus size={14} />
          </button>
        </div>
      </div>

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
            {!esUsuarioNuevo && ctx && ctx.totalGastado > 0 && (
              <div className="ml-10 grid grid-cols-3 gap-2">
                <MiniCard label="Gastado" value={`$${Math.round(ctx.totalGastado).toLocaleString('es-AR')}`} />
                <MiniCard label="Libre" value={`$${Math.round(ctx.dineroLibre).toLocaleString('es-AR')}`} highlight={ctx.dineroLibre > 0 ? 'green' : 'red'} />
                <MiniCard label="Por día" value={`$${Math.round(ctx.gastoDiarioRecomendado).toLocaleString('es-AR')}`} />
              </div>
            )}
          </>
        )}

        {!loadingMessages && messages.map((msg, index) => (
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    msg.type === 'success' ? 'bg-[#00C853]/30' : 'bg-[#00C853]/20'
                  }`}>
                    {msg.type === 'success' ? '✅' : '🤖'}
                  </div>
                  <div className="max-w-[85%]">
                    <div className={`rounded-2xl rounded-bl-sm px-4 py-3 ${
                      msg.type === 'success'
                        ? 'bg-[#00C853]/10 border border-[#00C853]/25'
                        : 'bg-[#141A17] border border-white/5'
                    }`}>
                      <p className="text-white text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    {msg.isAuto && <p className="text-white/20 text-[10px] mt-0.5 ml-1">respuesta instantánea</p>}
                  </div>
                </div>
                {index === messages.length - 1 && msg.sender === 'ai' && gastoInusualAlert && (
                  <GastoInusualAlert
                    categoria={gastoInusualAlert.categoria}
                    gastoActual={gastoInusualAlert.gastoActual}
                    promedioHistorico={gastoInusualAlert.promedioHistorico}
                    onVerDetalle={() => { setGastoInusualAlert(null); onNavigateToBudgets?.() }}
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

      {/* Account picker */}
      {accountPickerOptions.length > 0 && (
        <div className="px-4 pb-1 flex-shrink-0">
          <p className="text-white/30 text-xs mb-1.5">Elegí la cuenta:</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {accountPickerOptions.map(acc => (
              <button key={acc.id}
                onClick={() => { const msg = pendingAccountMessage; setPendingAccountMessage(null); setAccountPickerOptions([]); if (msg) handleSendMessage(msg, acc.id) }}
                disabled={isLoading}
                className="flex-shrink-0 text-xs bg-[#00C853]/10 border border-[#00C853]/30 rounded-full px-3 py-1.5 text-[#00C853] hover:bg-[#00C853]/20 transition-colors disabled:opacity-30"
              >
                {acc.type === 'credit' ? '💳' : '🏦'} {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions (cards) — reemplazan los chips de texto ── */}
      {accountPickerOptions.length === 0 && showQuickActions && quickActions.length > 0 && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {quickActions.map(action => (
              <button
                key={action.id}
                onClick={() => handleSendMessage(action.message)}
                disabled={isLoading}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all active:scale-95 disabled:opacity-30 ${action.color}`}
              >
                <span className="text-base leading-none">{action.emoji}</span>
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
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder={esUsuarioNuevo ? '¿Cuál fue tu último gasto?' : 'Escribí un gasto o una pregunta...'}
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
      <p className={`text-xs font-semibold ${highlight === 'green' ? 'text-green-400' : highlight === 'red' ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function GastoInusualAlert({ categoria, gastoActual, promedioHistorico, onVerDetalle }: { categoria: string; gastoActual: number; promedioHistorico: number; onVerDetalle: () => void }) {
  const veces = promedioHistorico > 0 ? (gastoActual / promedioHistorico).toFixed(1) : '2+'
  const fmt   = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  return (
    <div className="ml-10 mt-1">
      <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-yellow-400 text-sm mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-yellow-400/90 text-xs font-medium">Gasto inusual en {categoria}</p>
            <p className="text-yellow-400/60 text-xs mt-0.5">Es {veces}x tu promedio ({fmt(promedioHistorico)}/mes)</p>
          </div>
        </div>
        <button onClick={onVerDetalle} className="mt-2 w-full text-xs text-yellow-400/70 hover:text-yellow-400 border border-yellow-500/20 hover:border-yellow-500/40 rounded-lg py-1.5 transition-colors">
          Ver presupuesto de {categoria} →
        </button>
      </div>
    </div>
  )
}