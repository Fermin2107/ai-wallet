'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { History, X, Plus } from 'lucide-react'
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
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
}

// ─── Motor financiero ────────────────────────────────────────
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
  const totalGastado   = txMes.filter(t => t.type === 'gasto').reduce((s, t)   => s + Number(t.amount), 0)

  const ingresoEfectivo = totalIngresado > 0 ? totalIngresado : (onboarding.ingreso_mensual || 0)
  const objetivoAhorro  = onboarding.objetivo_ahorro || 0
  const dineroDisponible = ingresoEfectivo - totalGastado
  const dineroLibre      = Math.max(0, dineroDisponible - objetivoAhorro)

  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastoUltimos7 = transactions
    .filter(t => t.type === 'gasto' && new Date(t.transaction_date) >= hace7Dias)
    .reduce((s, t) => s + Number(t.amount), 0)
  const gastoDiarioPromedio    = gastoUltimos7 / 7
  const gastoDiarioRecomendado = diasRestantes > 0 ? dineroLibre / diasRestantes : 0

  const proyeccion = totalGastado + gastoDiarioPromedio * diasRestantes
  const superavit  = ingresoEfectivo - proyeccion - objetivoAhorro
  const vaALlegar  = superavit >= 0

  const budgetsMes = budgets.filter(b => b.month_period === selectedMonth)
  const budgetAnalysis = budgetsMes.map(b => {
    const spent = txMes
      .filter(t => t.type === 'gasto' && t.category === b.category)
      .reduce((s, t) => s + Number(t.amount), 0)
    const pct        = b.limit_amount > 0 ? (spent / b.limit_amount) * 100 : 0
    const spentPerDay = spent / diasTranscurridos
    const projected  = spent + spentPerDay * diasRestantes
    const status     = pct >= 100 ? 'excedido' : pct >= 85 ? 'rojo' : pct >= 60 ? 'amarillo' : 'verde'
    return { category: b.category, limit: b.limit_amount, spent, remaining: b.limit_amount - spent, percentUsed: Math.round(pct), status, projectedEndOfMonth: Math.round(projected), willExceed: projected > b.limit_amount }
  })

  const catMap: Record<string, number> = {}
  txMes.filter(t => t.type === 'gasto').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount) })
  const topGastos = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, total]) => ({ category: cat, total: Math.round(total) }))

  const metasActivas  = goals.filter(g => !g.is_completed)
  const aportePorMeta = metasActivas.length > 0 ? dineroLibre / metasActivas.length : 0
  const goalAnalysis  = metasActivas.map(g => {
    const remaining     = Math.max(0, g.target_amount - g.current_amount)
    const pct           = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0
    const meses         = aportePorMeta > 0 ? Math.ceil(remaining / aportePorMeta) : null
    return { name: g.name, target: g.target_amount, current: g.current_amount, remaining, percentComplete: pct, monthsToComplete: meses }
  })

  const alertas: string[] = []
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  if (!vaALlegar) alertas.push(`A este ritmo te van a faltar ${fmt(Math.abs(superavit))} para llegar a fin de mes`)
  budgetAnalysis.filter(b => b.percentUsed >= 85).forEach(b => {
    alertas.push(b.status === 'excedido'
      ? `Superaste el límite de ${b.category} en ${fmt(Math.abs(b.remaining))}`
      : `${b.category} está al ${b.percentUsed}% del límite`)
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
    topGastos.length === 0 ? '  Sin gastos registrados' : '',
    alertas.length > 0 ? '\nALERTAS:\n' + alertas.map(a => `  ⚠️ ${a}`).join('\n') : ''
  ].join('\n')

  return { estado, score, ingresoEfectivo, totalGastado, dineroDisponible, dineroLibre, objetivoAhorro, gastoDiarioPromedio, gastoDiarioRecomendado, diasRestantes, vaALlegar, superavit, budgetAnalysis, goalAnalysis, topGastos, alertas, resumen }
}

// ─── Intent y auto-respuestas ────────────────────────────────
type Intent = 'registro' | 'consulta_simple' | 'complejo'

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase()
  const tieneNumero = /\d/.test(m)
  const verbosGasto   = ['gasté', 'gaste', 'pagué', 'pague', 'compré', 'compre', 'salió', 'salio', 'costó', 'costo']
  const verbosIngreso = ['cobré', 'cobre', 'me pagaron', 'entraron', 'ingresé', 'ingrese', 'recibí', 'recibi', 'gané']
  if (tieneNumero && (verbosGasto.some(v => m.includes(v)) || verbosIngreso.some(v => m.includes(v)))) return 'registro'
  if (m.includes('puedo gastar') || m.includes('puedo comprar') || m.includes('por día') || m.includes('por dia') || m.includes('cómo voy') || m.includes('como voy') || m.includes('resumen') || m.includes('estado')) return 'consulta_simple'
  return 'complejo'
}

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
    const proy  = ctx.vaALlegar ? `Proyección: llegás con ${fmt(ctx.superavit)} de sobra.` : `Proyección: te faltan ${fmt(Math.abs(ctx.superavit))} para llegar.`
    return `${emoji} Gastaste ${fmt(ctx.totalGastado)} este mes, te quedan ${fmt(ctx.dineroLibre)} libres. ${proy}${ctx.alertas[0] ? ' ' + ctx.alertas[0] + '.' : ''}`
  }
  const matchPuedo = m.match(/(?:puedo|alcanza|tengo para)[^$\d]*\$?([\d.,]+)/)
  if (matchPuedo) {
    const monto = parseFloat(matchPuedo[1].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(monto)) {
      const libre = ctx.dineroLibre
      if (monto > libre) return `No te alcanza. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}. Te quedarías en rojo.`
      if (monto > libre * 0.5) return `Podés, pero te deja justo. Usarías el ${Math.round((monto / libre) * 100)}% de lo que te queda. Pensalo.`
      return `Sí, andá tranquilo. Tenés ${fmt(libre)} disponibles y eso cuesta ${fmt(monto)}.`
    }
  }
  return null
}

function getChips(ctx: ReturnType<typeof buildFinancialContext> | null): string[] {
  if (!ctx || ctx.totalGastado === 0) return ['¿Cómo voy este mes?', 'Registrar un gasto', 'Ver mis metas']
  if (new Date().getDate() <= 5) return ['Cobré el sueldo 💰', 'Organizame el mes', 'Planificar próximos meses 📅', '¿Cuánto puedo gastar por día?']
  if (ctx.estado === 'mal') return ['¿Cómo bajo mis gastos?', '¿Cuánto puedo gastar por día?', '¿Cómo voy este mes?']
  if (ctx.budgetAnalysis.some(b => b.percentUsed >= 80)) return ['¿En qué estoy gastando más?', '¿Cuánto puedo gastar por día?', '¿Cómo voy este mes?']
  return ['¿Cómo voy este mes?', '¿Cuánto puedo gastar por día?', 'Registrar un gasto']
}

function getWelcome(ctx: ReturnType<typeof buildFinancialContext> | null): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  if (!ctx || ctx.totalGastado === 0) return '¡Hola! Contame qué gastaste, preguntame cómo vas, o pedime que organice tu plata 💪'
  if (ctx.estado === 'bien')    return `Todo bien por ahora 🟢 Gastaste ${fmt(ctx.totalGastado)} este mes. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿En qué te ayudo?`
  if (ctx.estado === 'cuidado') return `Ojo con los gastos 🟡 Ya gastaste ${fmt(ctx.totalGastado)} y te quedan ${fmt(ctx.dineroLibre)} libres. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día.`
  return `Estás complicado este mes 🔴 Gastaste ${fmt(ctx.totalGastado)} y a este ritmo no llegás. ¿Querés ver en qué ajustar?`
}

function formatSessionDate(iso: string): string {
  const d     = new Date(iso)
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff  = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Ayer'
  if (diff < 7)   return d.toLocaleDateString('es-AR', { weekday: 'short' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const ACCIONES_QUE_MODIFICAN = ['INSERT_TRANSACTION', 'CREATE_GOAL', 'CREATE_BUDGET', 'UPDATE_GOAL_PROGRESS']

// ─── Componente principal ────────────────────────────────────
export default function ChatTab({ selectedMonth, onDataChanged, onNavigateToBudgets }: ChatTabProps) {
  const { transactions, budgets, goals, refresh } = useSimpleSupabase()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Estado del chat ──
  const [messages, setMessages]                       = useState<Message[]>([])
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [activeSessionId, setActiveSessionId]         = useState<string | null>(null)

  // ── Estado del sidebar ──
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sessions, setSessions]               = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)

  // ── Estado general ──
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading]   = useState(false)
  const [ctx, setCtx]               = useState<ReturnType<typeof buildFinancialContext> | null>(null)
  const [gastoInusualAlert, setGastoInusualAlert]   = useState<{ categoria: string; gastoActual: number; promedioHistorico: number } | null>(null)
  const [pendingAccountMessage, setPendingAccountMessage] = useState<string | null>(null)
  const [accountPickerOptions, setAccountPickerOptions]   = useState<{ id: string; name: string; type: string }[]>([])

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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [getToken])

  // ── Cargar lista de sesiones ──
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const headers = await authHeaders()
      const res  = await fetch('/api/chat-sessions', { headers })
      const json = await res.json()
      setSessions(json.sessions ?? [])
    } catch (e) {
      console.error('Error cargando sesiones:', e)
    } finally {
      setLoadingSessions(false)
    }
  }, [authHeaders])

  // ── Cargar mensajes de una sesión ──
  const fetchMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true)
    try {
      const headers = await authHeaders()
      const res  = await fetch(`/api/chat-sessions/${sessionId}/messages`, { headers })
      const json = await res.json()

      const restored: Message[] = (json.messages ?? []).map((m: any) => ({
        id:        m.id,
        text:      m.content,
        sender:    m.role === 'user' ? 'user' : 'ai',
        timestamp: new Date(m.created_at),
        isAuto:    m.is_auto,
      }))

      // Reconstruir conversationHistory sin mensajes is_auto (no aportan contexto al modelo)
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
      for (const m of json.messages ?? []) {
        if (!m.is_auto) history.push({ role: m.role as 'user' | 'assistant', content: m.content })
      }

      setMessages(restored)
      setConversationHistory(history)
      setActiveSessionId(sessionId)
      setSidebarOpen(false)
    } catch (e) {
      console.error('Error cargando mensajes:', e)
    } finally {
      setLoadingMessages(false)
    }
  }, [authHeaders])

  // ── Crear sesión en Supabase ──
  const createSession = useCallback(async (title: string): Promise<string | null> => {
    try {
      const headers = await authHeaders()
      const res  = await fetch('/api/chat-sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      })
      const json       = await res.json()
      const newSession: ChatSession = json.session
      setSessions(prev => [newSession, ...prev])
      return newSession.id
    } catch (e) {
      console.error('Error creando sesión:', e)
      return null
    }
  }, [authHeaders])

  // ── Persistir un mensaje en Supabase ──
  const persistMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    isAuto = false
  ) => {
    try {
      const headers = await authHeaders()
      await fetch(`/api/chat-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role, content, is_auto: isAuto }),
      })
      // Bump updated_at en la UI (la DB lo hace vía trigger)
      setSessions(prev =>
        prev
          .map(s => s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      )
    } catch (e) {
      console.error('Error guardando mensaje:', e)
    }
  }, [authHeaders])

  // ── Eliminar sesión ──
  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const headers = await authHeaders()
      await fetch('/api/chat-sessions', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ sessionId }),
      })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (sessionId === activeSessionId) {
        const remaining = sessions.filter(s => s.id !== sessionId)
        if (remaining.length > 0) fetchMessages(remaining[0].id)
        else startNewSession()
      }
    } catch (e) {
      console.error('Error eliminando sesión:', e)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders, activeSessionId, sessions])

  // ── Nueva sesión (UI-only; se crea en DB al primer mensaje) ──
  const startNewSession = useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
    setConversationHistory([])
    setGastoInusualAlert(null)
    setPendingAccountMessage(null)
    setAccountPickerOptions([])
    setSidebarOpen(false)
  }, [])

  // ── Al abrir sidebar, cargar sesiones ──
  useEffect(() => {
    if (sidebarOpen) fetchSessions()
  }, [sidebarOpen, fetchSessions])

  // ── Resumen semanal ──
  useEffect(() => {
    if (!transactions?.length || weeklySummaryInjected.current) return
    const tryInject = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return
      if (!weeklySummary.shouldShow(user.id)) return
      const summaryData = weeklySummary.buildSummary(transactions, budgets, goals)
      if (!summaryData) return
      const mensaje = weeklySummary.formatSummaryMessage(summaryData)
      setMessages(prev => [{
        id: `weekly-${Date.now()}`,
        text: mensaje,
        sender: 'ai' as const,
        timestamp: new Date(),
        isAuto: true,
      }, ...prev])
      weeklySummaryInjected.current = true
      weeklySummary.markShown(user.id)
    }
    tryInject()
  }, [transactions, budgets, goals]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Contexto financiero ──
  useEffect(() => {
    if (!transactions || !budgets || !goals) return
    const onboarding = JSON.parse(localStorage.getItem('ai_wallet_onboarding') || '{}')
    setCtx(buildFinancialContext(transactions, budgets, goals, onboarding, selectedMonth))
  }, [transactions?.length, budgets?.length, goals?.length, selectedMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Contexto para el backend ──
  const buildBackendContext = useCallback(() => {
    if (!ctx) return {}
    const onboarding: { ingreso_mensual?: number; objetivo_ahorro?: number; nombre?: string; medio_pago_habitual?: string } =
      JSON.parse(localStorage.getItem('ai_wallet_onboarding') || '{}')

    const hoy = new Date()
    const hace3Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1).toISOString().slice(0, 7)
    const txHistorico = transactions.filter(t => {
      const mes = (t.transaction_date || '').slice(0, 7)
      return mes >= hace3Meses && mes < selectedMonth && t.type === 'gasto'
    })
    const mesesConDatos = Array.from(new Set(txHistorico.map(t => (t.transaction_date || '').slice(0, 7)))).filter(Boolean)
    const cantMeses = Math.max(1, mesesConDatos.length)
    const promedioPorCategoria: Record<string, number> = {}
    txHistorico.forEach(t => {
      const cat = t.category || 'otros'
      promedioPorCategoria[cat] = (promedioPorCategoria[cat] || 0) + Number(t.amount)
    })
    Object.keys(promedioPorCategoria).forEach(cat => {
      promedioPorCategoria[cat] = Math.round(promedioPorCategoria[cat] / cantMeses)
    })
    const gastoMensualPromedio   = Object.values(promedioPorCategoria).reduce((s, v) => s + v, 0)
    const esenciales             = ['alimentacion','comida','supermercado','alquiler','servicios','luz','gas','agua','internet','telefono','salud','medicina','farmacia','educacion','transporte','nafta','sube']
    const discrecionales         = ['salidas','entretenimiento','ropa','caprichos','suscripciones','hobbies','viajes','restaurante','bar','delivery']
    const categoriasClasificadas = Object.entries(promedioPorCategoria).map(([cat, promedio]) => ({
      categoria: cat,
      promedio_mensual: promedio,
      tipo: esenciales.some(e => cat.includes(e) || e.includes(cat))     ? 'esencial'
          : discrecionales.some(d => cat.includes(d) || d.includes(cat)) ? 'discrecional'
          : 'variable',
      gasto_este_mes:
        ctx.budgetAnalysis.find(b => b.category === cat)?.spent ||
        transactions
          .filter(t => t.type === 'gasto' && t.category === cat && (t.transaction_date || '').startsWith(selectedMonth))
          .reduce((s, t) => s + Number(t.amount), 0),
    }))
    const gastoMinimoMensual = categoriasClasificadas.filter(c => c.tipo === 'esencial').reduce((s, c) => s + c.promedio_mensual, 0)

    return {
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
      budgets: ctx.budgetAnalysis.map(b => ({ categoria: b.category, limite: b.limit, gastado: b.spent, disponible: b.remaining, estado: b.status, porcentaje: b.percentUsed })),
      goals:   ctx.goalAnalysis.map(g => ({ nombre: g.name, objetivo: g.target, actual: g.current, faltante: g.remaining, porcentaje: g.percentComplete, meses_estimados: g.monthsToComplete })),
      alertas: ctx.alertas,
      historico: { meses_analizados: cantMeses, gasto_mensual_promedio: Math.round(gastoMensualPromedio), gasto_minimo_mensual: Math.round(gastoMinimoMensual), categorias: categoriasClasificadas },
    }
  }, [ctx, selectedMonth, transactions])

  const addMessage = useCallback((text: string, sender: 'user' | 'ai', isAuto = false): Message => {
    const msg: Message = { id: `${Date.now()}-${Math.random()}`, text, sender, timestamp: new Date(), isAuto }
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

    // Lazy session creation — se crea en DB al primer mensaje, no al abrir el componente
    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession(message.slice(0, 80))
      if (sessionId) setActiveSessionId(sessionId)
    }

    if (sessionId) await persistMessage(sessionId, 'user', message)

    try {
      const intent = detectIntent(message)

      // Respuesta automática sin IA
      if (intent === 'consulta_simple' && ctx && !overrideAccountId) {
        const auto = autoRespond(message, ctx)
        if (auto) {
          setTimeout(async () => {
            addMessage(auto, 'ai', true)
            if (sessionId) await persistMessage(sessionId, 'assistant', auto, true)
            setIsLoading(false)
          }, 250)
          return
        }
      }

      const contexto = buildBackendContext()
      if (overrideAccountId) (contexto as any).resolved_account_id = overrideAccountId

      const token = await getToken()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
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
      addMessage(aiText, 'ai')
      if (sessionId) await persistMessage(sessionId, 'assistant', aiText)

      // Detección de gasto inusual
      if (data.action === 'INSERT_TRANSACTION' && data.data?.type === 'gasto') {
        const categoria  = data.data.category
        const montoGasto = data.data.amount
        const ctx2       = buildBackendContext()
        const catHist    = ctx2.historico?.categorias?.find((c: any) => c.categoria === categoria)
        if (catHist && catHist.promedio_mensual > 0 && montoGasto / catHist.promedio_mensual > 0.4) {
          setGastoInusualAlert({ categoria, gastoActual: montoGasto, promedioHistorico: catHist.promedio_mensual })
        } else {
          setGastoInusualAlert(null)
        }
      }

      setConversationHistory(prev => [
        ...prev,
        { role: 'user',      content: message  },
        { role: 'assistant', content: aiText   },
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

  const chips   = getChips(ctx)
  const welcome = getWelcome(ctx)

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[500px] bg-[#0A0F0D] relative">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-0 left-0 z-50 h-full w-72 bg-[#0a120e] border-r border-white/8 flex flex-col">

            <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
              <div>
                <p className="text-white font-semibold text-sm">Historial</p>
                <p className="text-white/30 text-xs">{sessions.length} conversaciones</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-3 py-2.5 border-b border-white/5">
              <button
                onClick={startNewSession}
                className="w-full flex items-center justify-center gap-2 text-sm text-[#69F0AE] border border-[#00C853]/30 rounded-xl py-2 hover:bg-[#00C853]/10 transition-colors"
              >
                <Plus size={14} />
                Nueva conversación
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {loadingSessions && (
                <div className="flex justify-center py-8">
                  <div className="w-4 h-4 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" />
                </div>
              )}
              {!loadingSessions && sessions.length === 0 && (
                <p className="text-white/20 text-xs text-center py-8">No hay conversaciones guardadas</p>
              )}
              {!loadingSessions && sessions.map(session => (
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
                    <p className={`text-sm leading-snug truncate ${session.id === activeSessionId ? 'text-[#69F0AE]' : 'text-white/70'}`}>
                      {session.title}
                    </p>
                    <p className="text-[10px] text-white/25 mt-0.5">{formatSessionDate(session.updated_at)}</p>
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

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-white/30 hover:text-white/60 transition-colors p-1" title="Ver historial">
            <History size={18} />
          </button>
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
            <button onClick={startNewSession} className="text-white/20 hover:text-white/40 transition-colors" title="Nueva conversación">
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Alerta activa */}
      {ctx && ctx.alertas.length > 0 && messages.length === 0 && (
        <div className="mx-4 mt-3 flex-shrink-0">
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2">
            <p className="text-yellow-400/80 text-xs">⚠️ {ctx.alertas[0]}</p>
          </div>
        </div>
      )}

      {/* ── Mensajes ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/10 border-t-[#00C853] rounded-full animate-spin" />
          </div>
        )}

        {!loadingMessages && messages.length === 0 && (
          <>
            <BotMessage text={welcome} />
            {ctx && ctx.totalGastado > 0 && (
              <div className="ml-10 grid grid-cols-3 gap-2">
                <MiniCard label="Gastado"    value={`$${Math.round(ctx.totalGastado).toLocaleString('es-AR')}`} />
                <MiniCard label="Disponible" value={`$${Math.round(ctx.dineroLibre).toLocaleString('es-AR')}`} highlight={ctx.dineroLibre > 0 ? 'green' : 'red'} />
                <MiniCard label="Por día"    value={`$${Math.round(ctx.gastoDiarioRecomendado).toLocaleString('es-AR')}`} />
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
                  <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                  <div className="max-w-[85%]">
                    <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
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

      {/* Chips */}
      {accountPickerOptions.length === 0 && (
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
      )}

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
      <p className={`text-xs font-semibold ${highlight === 'green' ? 'text-green-400' : highlight === 'red' ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function GastoInusualAlert({ categoria, gastoActual, promedioHistorico, onVerDetalle }: {
  categoria: string
  gastoActual: number
  promedioHistorico: number
  onVerDetalle: () => void
}) {
  const veces = promedioHistorico > 0 ? (gastoActual / promedioHistorico).toFixed(1) : '2+'
  const fmt   = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
  return (
    <div className="ml-10 mt-1">
      <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-yellow-400 text-sm mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-yellow-400/90 text-xs font-medium">Gasto inusual en {categoria}</p>
            <p className="text-yellow-400/60 text-xs mt-0.5">
              Este gasto es {veces}x tu promedio histórico ({fmt(promedioHistorico)}/mes)
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
