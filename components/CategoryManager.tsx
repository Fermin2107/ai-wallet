'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { createBrowserClient } from '@supabase/ssr'
import {
  buildFinancialContext,
  detectIntent,
  buildAutoResponse,
  FinancialContext,
  RawTransaction,
  RawBudget,
  RawGoal
} from '../lib/financialEngine'

interface ChatTabProps {
  selectedMonth: string
  onDataChanged?: () => void
}

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  isAuto?: boolean   // respuesta local sin IA
  cards?: InsightCard[]
}

interface InsightCard {
  type: 'alerta' | 'tip' | 'meta' | 'presupuesto'
  title: string
  value?: string
  detail?: string
  color: string
}

// ── Chips dinámicos según contexto ──────────────────────────
function getChips(ctx: FinancialContext | null, diaDelMes: number): string[] {
  if (!ctx) return ['¿Cómo voy este mes?', 'Registrar un gasto', 'Ver mis metas']

  if (diaDelMes <= 5) {
    return ['Cobré el sueldo 💰', 'Organizame el mes', '¿Cuánto puedo gastar por día?']
  }
  if (ctx.estado === 'mal') {
    return ['¿Cómo bajo mis gastos?', '¿Cuánto puedo gastar por día?', '¿Cómo voy este mes?']
  }
  if (ctx.categoriasEnRiesgo.length > 0) {
    const cat = ctx.categoriasEnRiesgo[0].category
    return [`¿Cuánto me queda en ${cat}?`, '¿Cómo voy este mes?', 'Registrar un gasto']
  }
  return ['¿Cómo voy este mes?', '¿Cuánto puedo gastar por día?', 'Registrar un gasto']
}

// ── Mensaje de bienvenida según contexto ────────────────────
function getWelcomeMessage(ctx: FinancialContext | null): string {
  if (!ctx || ctx.totalGastado === 0) {
    return '¡Hola! Contame qué gastaste, preguntame cómo vas, o pedime que organice tu plata 💪'
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  if (ctx.estado === 'bien') {
    return `Todo bien por ahora 🟢 Gastaste ${fmt(ctx.totalGastado)} este mes y podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día. ¿En qué te ayudo?`
  }
  if (ctx.estado === 'cuidado') {
    return `Ojo con los gastos 🟡 Ya gastaste ${fmt(ctx.totalGastado)} y te quedan ${fmt(ctx.dineroLibre)} libres. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)}/día.`
  }
  return `Estás complicado este mes 🔴 Gastaste ${fmt(ctx.totalGastado)} y a este ritmo no llegás a fin de mes. ¿Querés ver en qué ajustar?`
}

export default function ChatTab({ selectedMonth, onDataChanged }: ChatTabProps) {
  const { transactions, budgets, goals, refresh } = useSimpleSupabase()

  const supabaseBrowser = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ctx, setCtx] = useState<FinancialContext | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // — Construir contexto financiero cada vez que cambian los datos —
  useEffect(() => {
    if (!transactions || !budgets || !goals) return

    const onboarding = JSON.parse(
      localStorage.getItem('ai_wallet_onboarding') || '{}'
    )

    const rawTx: RawTransaction[] = transactions.map((t: any) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      category: t.category,
      transaction_date: t.transaction_date,
      description: t.description
    }))

    const rawBudgets: RawBudget[] = budgets.map((b: any) => ({
      id: b.id,
      category: b.category,
      limit_amount: b.limit_amount,
      month_period: b.month_period
    }))

    const rawGoals: RawGoal[] = goals.map((g: any) => ({
      id: g.id,
      name: g.name,
      target_amount: g.target_amount,
      current_amount: g.current_amount,
      target_date: g.target_date,
      is_completed: g.is_completed,
      is_active: true
    }))

    const newCtx = buildFinancialContext(rawTx, rawBudgets, rawGoals, onboarding, selectedMonth)
    setCtx(newCtx)
  }, [transactions, budgets, goals, selectedMonth])

  // — Scroll automático —
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // — Construir contexto para el backend (lo que la IA necesita) —
  const buildBackendContext = useCallback(() => {
    if (!ctx) return {}

    const onboarding = JSON.parse(
      localStorage.getItem('ai_wallet_onboarding') || '{}'
    )

    return {
      // Resumen pre-calculado (la IA no tiene que calcular nada)
      resumen_financiero: ctx.resumenParaIA,

      // Datos clave para tomar decisiones
      ingreso_mensual: onboarding.ingreso_mensual || 0,
      objetivo_ahorro: ctx.objetivoAhorro,
      dinero_disponible: ctx.dineroDisponible,
      dinero_libre: ctx.dineroLibre,
      gasto_diario_recomendado: Math.round(ctx.gastoDiarioRecomendado),
      dias_restantes: ctx.diasRestantes,
      estado_mes: ctx.estado,
      va_a_llegar: ctx.vaALlegarAFinDeMes,

      // Presupuestos con estado ya calculado
      budgets: ctx.budgets.map(b => ({
        categoria: b.category,
        limite: b.limit,
        gastado: b.spent,
        disponible: b.remaining,
        estado: b.status,
        porcentaje: Math.round(b.percentUsed)
      })),

      // Metas con progreso ya calculado
      goals: ctx.goals.map(g => ({
        nombre: g.name,
        objetivo: g.target,
        actual: g.current,
        faltante: g.remaining,
        porcentaje: Math.round(g.percentComplete),
        meses_estimados: g.monthsToComplete
      })),

      // Alertas pre-calculadas (la IA solo las menciona si aplica)
      alertas: ctx.alertas,

      // Fecha de hoy
      fecha_hoy: new Date().toISOString().split('T')[0],
      mes_seleccionado: selectedMonth
    }
  }, [ctx, selectedMonth])

  const ACCIONES_QUE_MODIFICAN_DATOS = [
    'INSERT_TRANSACTION', 'CREATE_GOAL', 'CREATE_BUDGET', 'UPDATE_GOAL_PROGRESS'
  ]

  const addMessage = (text: string, sender: 'user' | 'ai', isAuto = false, cards?: InsightCard[]) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      text,
      sender,
      timestamp: new Date(),
      isAuto,
      cards
    }])
  }

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return

    addMessage(message, 'user')
    setIsLoading(true)

    try {
      // — PASO 1: Detectar intención con lógica pura —
      const intent = detectIntent(message)

      // — PASO 2: Respuesta automática si es consulta simple —
      const autoResponse = ctx ? buildAutoResponse(intent, ctx, message) : null

      if (autoResponse && !['registro_gasto', 'registro_ingreso', 'crear_meta', 'crear_presupuesto', 'planificar'].includes(intent)) {
        // Responder sin llamar a la IA
        setTimeout(() => {
          addMessage(autoResponse, 'ai', true)
          setIsLoading(false)
        }, 300)
        return
      }

      // — PASO 3: La IA maneja registros, creaciones y casos complejos —
      const contexto = buildBackendContext()
      const { data: { session } } = await supabaseBrowser.auth.getSession()
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
          intent  // Le mandamos la intención detectada para ayudar al prompt
        })
      })

      if (!response.ok) throw new Error('Error en el servidor')

      const data = await response.json()

      addMessage(data.mensaje_respuesta || 'No pude procesar tu mensaje', 'ai')

      if (ACCIONES_QUE_MODIFICAN_DATOS.includes(data.action)) {
        await refresh()
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

  const chips = getChips(ctx, new Date().getDate())
  const welcomeMessage = getWelcomeMessage(ctx)

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-[#0A0F0D]">

      {/* Header con estado financiero */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#00C853]/20 rounded-full flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Tu Coach</p>
            <p className="text-white/40 text-xs">Financiero personal</p>
          </div>
        </div>

        {/* Indicador de estado del mes */}
        {ctx && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            ctx.estado === 'bien'    ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            ctx.estado === 'cuidado' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                                       'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <span>{ctx.estado === 'bien' ? '🟢' : ctx.estado === 'cuidado' ? '🟡' : '🔴'}</span>
            <span>{ctx.estado === 'bien' ? 'Vas bien' : ctx.estado === 'cuidado' ? 'Cuidado' : 'Complicado'}</span>
          </div>
        )}
      </div>

      {/* Alertas activas (si hay) */}
      {ctx && ctx.alertas.length > 0 && messages.length === 0 && (
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="bg-[#1A1200] border border-yellow-500/20 rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm mt-0.5">⚠️</span>
            <p className="text-yellow-400/80 text-xs leading-relaxed">
              {ctx.alertas[0]}
            </p>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Bienvenida */}
        {messages.length === 0 && (
          <>
            <div className="flex gap-2 items-end">
              <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                🤖
              </div>
              <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]">
                <p className="text-white text-sm leading-relaxed">{welcomeMessage}</p>
              </div>
            </div>

            {/* Mini dashboard en el chat si hay datos */}
            {ctx && ctx.totalGastado > 0 && (
              <div className="ml-10 grid grid-cols-3 gap-2 mt-1">
                <div className="bg-[#141A17] border border-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-white/40 text-[10px] mb-0.5">Gastado</p>
                  <p className="text-white text-xs font-semibold">
                    ${Math.round(ctx.totalGastado).toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="bg-[#141A17] border border-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-white/40 text-[10px] mb-0.5">Disponible</p>
                  <p className={`text-xs font-semibold ${ctx.dineroLibre > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${Math.round(ctx.dineroLibre).toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="bg-[#141A17] border border-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-white/40 text-[10px] mb-0.5">Por día</p>
                  <p className="text-white text-xs font-semibold">
                    ${Math.round(ctx.gastoDiarioRecomendado).toLocaleString('es-AR')}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Mensajes de la conversación */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.sender === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-[#00C853]/15 border border-[#00C853]/25 rounded-2xl rounded-br-sm px-4 py-3 max-w-[80%]">
                  <p className="text-white text-sm">{msg.text}</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 items-end">
                <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                  🤖
                </div>
                <div className="max-w-[85%]">
                  <div className={`rounded-2xl rounded-bl-sm px-4 py-3 ${
                    msg.isAuto
                      ? 'bg-[#141A17] border border-[#00C853]/10'
                      : 'bg-[#141A17] border border-white/5'
                  }`}>
                    <p className="text-white text-sm leading-relaxed">{msg.text}</p>
                  </div>
                  {msg.isAuto && (
                    <p className="text-white/20 text-[10px] mt-1 ml-1">respuesta instantánea</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {isLoading && (
          <div className="flex gap-2 items-end">
            <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
              🤖
            </div>
            <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chips contextuales */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-none">
        {chips.map(chip => (
          <button
            key={chip}
            onClick={() => handleSendMessage(chip)}
            disabled={isLoading}
            className="flex-shrink-0 text-xs bg-[#141A17] border border-white/10 rounded-full px-3 py-1.5 text-white/60 hover:border-[#00C853]/40 hover:text-white/80 transition-colors disabled:opacity-40"
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
            className="bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold px-4 py-3 rounded-xl transition-colors text-sm"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}