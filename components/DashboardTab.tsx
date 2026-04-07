'use client';

import React, { useState, useEffect } from 'react';
import { MessageCircle, Brain, Sparkles, TrendingUp, TrendingDown, Wallet, Lightbulb, Edit2, Trash2, X, Check, Calendar, Tag, HelpCircle, AlertTriangle, DollarSign } from 'lucide-react';
import { Transaction, ChatMessage, agruparTransaccionesPorFecha } from '../lib/types';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import { supabase } from '../lib/supabase';

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

interface DashboardTabProps {
  selectedMonth: string;
  onNavigateToChat?: () => void;
  onNavigateToMetas?: () => void;
}

interface TransaccionPendiente {
  transaction: Transaction;
  estado: 'pendiente' | 'confirmado' | 'deshaciendo';
}

interface TransaccionEditada {
  id: string;
  descripcion: string;
  monto: number;
  categoria: any;
  fecha: string;
  tipo: 'gasto' | 'ingreso';
}

export default function DashboardTab({ selectedMonth, onNavigateToChat, onNavigateToMetas }: DashboardTabProps) {
  // Estados principales
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transaccionesPendientes, setTransaccionesPendientes] = useState<TransaccionPendiente[]>([]);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [editTransaction, setEditTransaction] = useState<TransaccionEditada | null>(null);
  const [objetivoAhorro, setObjetivoAhorro] = useState(0);
  
  // Cargar objetivoAhorro desde localStorage
  useEffect(() => {
    const loadOnboarding = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id
      if (!userId) return

      // Leer con userId — nunca la key genérica
      const stored = localStorage.getItem(`ai_wallet_onboarding_${userId}`)
      if (stored) {
        const data = JSON.parse(stored)
        setObjetivoAhorro(data.objetivo_ahorro || 0)
      }
    }
    loadOnboarding()
  }, [])
  
  // Usar datos adaptados simples de Supabase
  const { 
    transactions, 
    goals, 
    budgets,
    refresh,
    refreshWithMonth
  } = useSimpleAdaptedData(selectedMonth);
  
  // Cálculos del dashboard
  const totalIngresos = transactions
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + Number(t.monto), 0)

  const totalGastos = transactions
    .filter(t => t.tipo === 'gasto')
    .reduce((sum, t) => sum + Math.abs(Number(t.monto)), 0)

  const dineroDisponible = totalIngresos - totalGastos

  const hoy = new Date()
  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const gastos7dias = transactions.filter(t => {
    const fecha = new Date(t.fecha)
    return t.tipo === 'gasto' && fecha >= hace7Dias
  })
  const promedioDiario = gastos7dias.length > 0
    ? gastos7dias.reduce((s, t) => s + Math.abs(Number(t.monto)), 0) / 7
    : 0

  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  const diasRestantes = ultimoDia.getDate() - hoy.getDate()
  const ahorroProyectado = dineroDisponible - (promedioDiario * diasRestantes)

  const estadoMes: 'bien' | 'cuidado' | 'mal' =
    ahorroProyectado >= objetivoAhorro ? 'bien' :
    ahorroProyectado >= objetivoAhorro * 0.5 ? 'cuidado' : 'mal'

  const mensajePrincipal =
    estadoMes === 'bien'
      ? `Vas muy bien 💪 Este mes vas a ahorrar $${dineroDisponible.toLocaleString('es-AR')}` 
      : estadoMes === 'cuidado'
      ? `Cuidado ⚠️ A este ritmo vas a ahorrar menos de lo planeado` 
      : `Ojo 🔴 Revisá tus gastos, este mes va complicado` 

  const estadoConfig = {
    bien:    { bg: 'bg-[#0A2E1A]', border: 'border-[#00C853]/20', emoji: '✅' },
    cuidado: { bg: 'bg-[#2E2200]', border: 'border-[#FFD740]/20', emoji: '⚠️' },
    mal:     { bg: 'bg-[#2E0A0A]', border: 'border-[#FF5252]/20', emoji: '🚨' },
  }

  const topMetas = [...goals]
    .slice(0, 2)

  const ultimasTransacciones = [...transactions]
    .sort((a, b) =>
      new Date(b.fecha).getTime() -
      new Date(a.fecha).getTime()
    )
    .slice(0, 5)

  const fechaRelativa = (dateStr: string): string => {
    const fecha = new Date(dateStr)
    const diff = Math.floor(
      (new Date().getTime() - fecha.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    if (diff < 7) return `Hace ${diff} días` 
    return fecha.toLocaleDateString('es-AR', 
      { day: 'numeric', month: 'short' })
  }

  return (
    <div className="space-y-4 pb-6">

      <div className={`${estadoConfig[estadoMes].bg} border ${estadoConfig[estadoMes].border} rounded-2xl p-6 text-center`}>
        <div className="text-4xl mb-3">{estadoConfig[estadoMes].emoji}</div>
        <p className="text-white font-semibold text-lg leading-snug mb-2">
          {mensajePrincipal}
        </p>
        <p className="text-white/50 text-sm">
          Dinero libre hoy:{' '}
          <span className="text-white font-medium">
            ${dineroDisponible.toLocaleString('es-AR')}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '↑ Entraron', value: totalIngresos, color: 'text-[#69F0AE]' },
          { label: '↓ Salieron', value: totalGastos, color: 'text-[#FF5252]' },
          { label: '💰 Ahorrado', value: Math.max(0, dineroDisponible), color: 'text-white' },
        ].map(item => (
          <div key={item.label} 
               className="bg-[#141A17] border border-white/5 rounded-xl p-3 text-center">
            <p className="text-white/40 text-xs mb-1">{item.label}</p>
            <p className={`${item.color} font-bold text-sm`}>
              ${item.value.toLocaleString('es-AR')}
            </p>
          </div>
        ))}
      </div>

      <div
        onClick={() => onNavigateToChat?.()}
        className="bg-[#141A17] border border-white/5 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-[#00C853]/30 transition-colors"
      >
        <span className="text-2xl">💬</span>
        <div>
          <p className="text-white font-medium">Hablá con tu coach</p>
          <p className="text-white/40 text-sm">Registrá gastos o hacé consultas</p>
        </div>
        <span className="ml-auto text-white/30">→</span>
      </div>

      {topMetas.length > 0 && (
        <div className="bg-[#141A17] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-medium text-sm">Mis Metas</p>
            <button
              onClick={() => onNavigateToMetas?.()}
              className="text-[#00C853] text-xs"
            >
              Ver todas →
            </button>
          </div>
          <div className="space-y-3">
            {topMetas.map(meta => {
              const progreso = Math.min(
                (meta.montoActual / meta.montoObjetivo) * 100, 100
              )
              return (
                <div key={meta.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span>{meta.icono}</span>
                      <span className="text-white text-sm">{meta.titulo}</span>
                    </div>
                    <span className="text-white/40 text-xs">
                      {Math.round(progreso)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full">
                    <div
                      className="h-full bg-[#00C853] rounded-full transition-all"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                  <p className="text-white/30 text-xs mt-1">
                    Te faltan $
                    {(meta.montoObjetivo - meta.montoActual)
                      .toLocaleString('es-AR')}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {ultimasTransacciones.length > 0 && (
        <div className="bg-[#141A17] border border-white/5 rounded-2xl p-4">
          <p className="text-white font-medium text-sm mb-3">
            Actividad reciente
          </p>
          <div className="space-y-3">
            {ultimasTransacciones.map(t => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-lg">
                  {getEmojiCategoria(t.categoria?.id || 'otros')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">
                    {t.descripcion}
                  </p>
                  <p className="text-white/30 text-xs">
                    {fechaRelativa(t.fecha)}
                  </p>
                </div>
                <p className={`text-sm font-medium flex-shrink-0 ${
                  t.tipo === 'ingreso'
                    ? 'text-[#69F0AE]'
                    : 'text-[#FF5252]'
                }`}>
                  {t.tipo === 'ingreso' ? '+' : '-'}$
                  {Math.abs(Number(t.monto)).toLocaleString('es-AR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
