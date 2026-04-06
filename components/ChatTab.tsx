'use client'

import { useState, useRef, useEffect } from 'react'
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { ChatMessage } from '../lib/types'
import { createBrowserClient } from '@supabase/ssr'

interface ChatTabProps {
  selectedMonth: string
  onDataChanged?: () => void
}

export default function ChatTab({ selectedMonth, onDataChanged }: ChatTabProps) {
  const supabaseBrowser = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { transactions, goals, budgets } = useSimpleAdaptedData(selectedMonth)
  const { refresh } = useSimpleSupabase()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const hayLimiteEnRojo = budgets.some(
    (b: any) => ((b.spent || 0) / b.limit_amount) > 0.9
  )
  const esPrincipioDeMes = new Date().getDate() <= 5
  const chips = esPrincipioDeMes
    ? ['Cobré el sueldo 💰', 'Organizame el mes', '¿Cómo arranco?']
    : hayLimiteEnRojo
    ? ['¿Cómo bajo mis gastos?', 'Ver qué gasté', 'Necesito ayuda']
    : ['Registrar un gasto', '¿Cómo voy este mes?', 'Ver mis metas']

  const calcularContexto = () => {
    const onboardingData = JSON.parse(
      localStorage.getItem('ai_wallet_onboarding') || '{}'
    )
    const totalIngresos = transactions
      .filter((t: any) => t.type === 'ingreso')
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0)
    const totalGastos = transactions
      .filter((t: any) => t.type === 'gasto')
      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0)
    const dineroDisponible = totalIngresos - totalGastos

    const hoy = new Date()
    const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
    const gastos7dias = transactions.filter((t: any) => {
      const fecha = new Date(t.transaction_date)
      return t.type === 'gasto' && fecha >= hace7Dias
    })
    const promedioDiario = gastos7dias.length > 0
      ? gastos7dias.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0) / 7
      : 0
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    const diasRestantes = ultimoDia.getDate() - hoy.getDate()
    const ahorroProyectado = dineroDisponible - (promedioDiario * diasRestantes)
    const objetivoAhorro = onboardingData.objetivo_ahorro || 0

    const estadoMes: 'bien' | 'cuidado' | 'mal' =
      ahorroProyectado >= objetivoAhorro ? 'bien' :
      ahorroProyectado >= objetivoAhorro * 0.5 ? 'cuidado' : 'mal'

    return {
      ingreso_mensual: onboardingData.ingreso_mensual || 0,
      objetivo_ahorro: objetivoAhorro,
      dinero_disponible: dineroDisponible,
      estado_mes: estadoMes,
      goals: goals.map((g: any) => ({
        nombre: g.name,
        objetivo: g.target_amount,
        actual: g.current_amount,
        faltante: g.target_amount - g.current_amount
      })),
      budgets: budgets.map((b: any) => ({
        categoria: b.category,
        limite: b.limit_amount,
        gastado: b.spent || 0,
        estado: b.status || 'verde'
      }))
    }
  }

  const ACCIONES_QUE_MODIFICAN_DATOS = [
    'INSERT_TRANSACTION',
    'CREATE_GOAL',
    'CREATE_BUDGET',
    'UPDATE_GOAL_PROGRESS'
  ]

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: message,
      sender: 'user',
      timestamp: new Date()
    }])
    setIsLoading(true)

    try {
      const contexto = calcularContexto()
      const { data: { session } } = await supabaseBrowser.auth.getSession()
      const token = session?.access_token

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ message, context: contexto })
      })

      if (!response.ok) throw new Error('Error en el servidor')

      const data = await response.json()

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: data.mensaje_respuesta || 'No pude procesar tu mensaje',
        sender: 'ai',
        timestamp: new Date()
      }])

      // ✅ Refresh automático si el backend modificó datos
      if (ACCIONES_QUE_MODIFICAN_DATOS.includes(data.action)) {
        await refresh()
        onDataChanged?.()
      }

    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: 'Ocurrió un error. Intentá de nuevo.',
        sender: 'ai',
        timestamp: new Date()
      }])
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

  return (
    <div className="flex flex-col h-screen bg-[#0A0F0D]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5 flex-shrink-0">
        <div className="w-9 h-9 bg-[#00C853]/20 rounded-full flex items-center justify-center text-lg">
          🤖
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Tu Coach</p>
          <p className="text-white/40 text-xs">Financiero personal</p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex gap-2 items-end">
            <div className="w-8 h-8 bg-[#00C853]/20 rounded-full flex items-center justify-center text-sm flex-shrink-0">
              🤖
            </div>
            <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]">
              <p className="text-white text-sm leading-relaxed">
                ¡Hola! Contame qué gastaste, preguntame cómo vas, o pedime que organice tu plata 💪
              </p>
            </div>
          </div>
        )}

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
                <div className="bg-[#141A17] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]">
                  <p className="text-white text-sm leading-relaxed">{msg.text}</p>
                </div>
              </div>
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
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
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
            onClick={() => { handleSendMessage(chip) }}
            className="flex-shrink-0 text-xs bg-[#141A17] border border-white/10 rounded-full px-3 py-1.5 text-white/60 hover:border-[#00C853]/40 hover:text-white/80 transition-colors"
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
            className="bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold px-4 py-3 rounded-xl transition-colors text-sm"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
