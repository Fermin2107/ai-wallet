'use client'

import { useState, useRef, useEffect } from 'react'
import { useChatHybrid } from '../hooks/useChatHybrid'
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData'
import { ChatMessage } from '../lib/types'
import { createBrowserClient } from '@supabase/ssr'

const getEmojiCategoria = (categoria: string): string => {
  const mapa: Record<string, string> = {
    alimentacion: '🍔', comida: '🍔',
    transporte: '🚌', nafta: '🚌',
    salidas: '🎉', entretenimiento: '🎉',
    sueldo: '💼', salario: '💼',
    ahorro: '💰', 
    supermercado: '🛒', super: '🛒',
    servicios: '💡', luz: '💡', gas: '💡',
    suscripciones: '📱', netflix: '📱',
    salud: '💊', farmacia: '💊', medico: '💊',
    ropa: '👕', zapatillas: '👟',
    mascotas: '🐕', perro: '🐕', gato: '🐈',
    gym: '💪', gimnasio: '💪',
    educacion: '📚', curso: '📚',
    viaje: '✈️', vacaciones: '🏖️',
    regalo: '🎁',
    otros: '📦'
  }
  const key = Object.keys(mapa).find(k =>
    categoria.toLowerCase().includes(k)
  )
  return key ? mapa[key] : '📦'
}

interface ChatTabProps {
  selectedMonth: string
  onTransactionCreated?: () => void
}

export default function ChatTab({ selectedMonth, onTransactionCreated }: ChatTabProps) {
  // Cliente Supabase para manejo de sesión
  const supabaseBrowser = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  // Hook del chat
  const { 
    processMessage, 
    isLoading, 
    error, 
    clearError 
  } = useChatHybrid()

  // Hook de datos
  const { 
    transactions, 
    goals, 
    budgets
  } = useSimpleAdaptedData(selectedMonth)

  // Estado de mensajes
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')

  // Chips contextuales
  const hayLimiteEnRojo = budgets.some(
    (b: any) => b.status === 'rojo' || 
    ((b.spent || 0) / b.limit_amount) > 0.9
  )
  const esPrincipioDeMes = new Date().getDate() <= 5

  const chips = esPrincipioDeMes
    ? ['Cobré el sueldo 💰', 'Organizame el mes', '¿Cómo arranco?']
    : hayLimiteEnRojo
    ? ['¿Cómo bajo mis gastos?', 'Ver qué gasté', 'Necesito ayuda']
    : ['Registrar un gasto', '¿Cómo voy este mes?', 'Ver mis metas']

  // Referencia para scroll automático
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Función para enviar con el nuevo estado
  const handleSubmit = () => {
    if (inputValue.trim() && !isLoading) {
      handleSendMessage(inputValue.trim())
      setInputValue('')
    }
  }

  // Cálculo del contexto financiero
  const calcularContextoFinanciero = () => {
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
      ? gastos7dias.reduce((s: number, t: any) => 
          s + Math.abs(Number(t.amount)), 0) / 7
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

  // Función para enviar mensaje
  const handleSendMessage = async (message: string) => {
    try {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        text: message,
        sender: 'user',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, userMessage])
      
      // Calcular contexto financiero
      const contexto = calcularContextoFinanciero()
      
      // Obtener sesión para token de autorización
      const { data: { session } } = await supabaseBrowser.auth.getSession()
      const token = session?.access_token
      console.log('🔑 Token presente:', token ? 'SÍ - ' + token.substring(0, 20) + '...' : 'NO')
      
      // Enviar al API con contexto y token
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ 
          message: message,
          context: contexto
        })
      })
      
      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor')
      }
      
      const data = await response.json()
      
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.mensaje_respuesta || 'No pude procesar tu mensaje',
        sender: 'ai',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, aiMessage])
      
      // Callback si se creó una transacción
      if (data.mensaje_respuesta?.includes('💾 ¡Guardado en la base de datos!') || 
          data.mensaje_respuesta?.includes('✅') || 
          data.mensaje_respuesta?.includes('Registré') ||
          data.mensaje_respuesta?.includes('Creé') ||
          data.mensaje_respuesta?.includes('Actualicé') ||
          data.mensaje_respuesta?.includes('Aporté')) {
        onTransactionCreated?.()
      }
      
    } catch (err) {
      console.error('Error processing message:', err)
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Ocurrió un error al procesar tu mensaje. Intentá de nuevo.',
        sender: 'ai',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    }
  }

  // Nuevo return:
return (
  <div className="flex flex-col h-screen bg-[#0A0F0D]">

    {/* Header */}
    <div className="flex items-center gap-3 p-4 border-b border-white/5 flex-shrink-0">
      <div className="w-9 h-9 bg-[#00C853]/20 rounded-full 
                      flex items-center justify-center text-lg">
        🤖
      </div>
      <div>
        <p className="text-white font-semibold text-sm">Tu Coach</p>
        <p className="text-white/40 text-xs">Financiero personal</p>
      </div>
    </div>

    {/* Área de mensajes */}
    <div className="flex-1 overflow-y-auto p-4 space-y-3">

      {/* Mensaje de bienvenida si no hay mensajes */}
      {messages.length === 0 && (
        <div className="flex gap-2 items-end">
          <div className="w-8 h-8 bg-[#00C853]/20 rounded-full 
                          flex items-center justify-center text-sm flex-shrink-0">
            🤖
          </div>
          <div className="bg-[#141A17] border border-white/5 
                          rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]">
            <p className="text-white text-sm leading-relaxed">
              ¡Hola! Podés contarme qué gastaste, preguntarme 
              cómo vas, o pedirme que organice tu plata 💪
            </p>
          </div>
        </div>
      )}

      {/* Lista de mensajes */}
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.sender === 'user' ? (
            <div className="flex justify-end">
              <div className="bg-[#00C853]/15 border border-[#00C853]/25 
                              rounded-2xl rounded-br-sm px-4 py-3 max-w-[80%]">
                <p className="text-white text-sm">{msg.text}</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="w-8 h-8 bg-[#00C853]/20 rounded-full 
                              flex items-center justify-center text-sm 
                              flex-shrink-0">
                🤖
              </div>
              <div className="bg-[#141A17] border border-white/5 
                              rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%]">
                <p className="text-white text-sm leading-relaxed">
                  {msg.text}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Typing indicator */}
      {isLoading && (
        <div className="flex gap-2 items-end">
          <div className="w-8 h-8 bg-[#00C853]/20 rounded-full 
                          flex items-center justify-center text-sm flex-shrink-0">
            🤖
          </div>
          <div className="bg-[#141A17] border border-white/5 
                          rounded-2xl rounded-bl-sm px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-white/40 rounded-full 
                               animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-white/40 rounded-full 
                               animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-white/40 rounded-full 
                               animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>

    {/* Chips de sugerencias */}
    <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0
                    scrollbar-none">
      {chips.map(chip => (
        <button
          key={chip}
          onClick={() => {
            setInputValue(chip)
            handleSendMessage(chip)
            setInputValue('')
          }}
          className="flex-shrink-0 text-xs bg-[#141A17] border 
                     border-white/10 rounded-full px-3 py-1.5 
                     text-white/60 hover:border-[#00C853]/40 
                     hover:text-white/80 transition-colors"
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
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="Contame qué gastaste..."
          className="flex-1 bg-[#141A17] border border-white/10 
                     rounded-xl px-4 py-3 text-white text-sm
                     placeholder-white/30 focus:outline-none 
                     focus:border-[#00C853]/40 transition-colors"
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading || !inputValue.trim()}
          className="bg-[#00C853] hover:bg-[#00C853]/80 
                     disabled:opacity-30 disabled:cursor-not-allowed 
                     text-black font-semibold px-4 py-3 rounded-xl 
                     transition-colors text-sm"
        >
          →
        </button>
      </div>
    </div>

  </div>
)
}
