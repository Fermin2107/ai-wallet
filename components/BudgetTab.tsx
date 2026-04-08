'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Edit2, Check, X, AlertTriangle, Lightbulb } from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import { formatCategoria } from '../lib/types';
import { supabase } from '../lib/supabase';
import { recalcularAlAgregar } from './Onboarding';

interface BudgetTabProps {
  selectedMonth?: string;
  refreshTrigger?: number;
}

// ─── Semáforo ────────────────────────────────────────────────
const getColorByPercentage = (pct: number) => {
  if (pct >= 100) return { bg: 'bg-red-900/20',    text: 'text-red-400',    border: 'border-red-500/30',    bar: '#FF5252', icon: '🔴' }
  if (pct >= 85)  return { bg: 'bg-red-800/20',    text: 'text-red-500',    border: 'border-red-500/20',    bar: '#FF6D6D', icon: '🟠' }
  if (pct >= 60)  return { bg: 'bg-yellow-900/20', text: 'text-yellow-400', border: 'border-yellow-500/30', bar: '#FFD740', icon: '🟡' }
  return           { bg: 'bg-green-900/20',  text: 'text-green-400',  border: 'border-green-500/30',  bar: '#00C853', icon: '🟢' }
}

// ─── Emojis y labels ─────────────────────────────────────────
const EMOJI: Record<string, string> = {
  alimentacion: '🍔', supermercado: '🛒', transporte: '🚌',
  salidas: '🎉', servicios: '💡', suscripciones: '📱',
  salud: '🏥', ropa: '👕', gym: '💪', mascotas: '🐕',
  educacion: '📚', otros: '📦',
}
const getEmoji = (cat: string) => EMOJI[cat.toLowerCase().trim()] ?? '📦'

// ─── Aliases fuzzy ───────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  alimentacion: ['super', 'supermercado', 'mercado', 'comida', 'almacen', 'verduleria', 'carniceria', 'panaderia', 'kiosco', 'delivery'],
  transporte:   ['nafta', 'colectivo', 'subte', 'uber', 'taxi', 'remis', 'sube', 'combustible', 'peaje'],
  salidas:      ['bar', 'restaurant', 'restaurante', 'cine', 'teatro', 'boliche', 'entretenimiento', 'salida'],
  salud:        ['farmacia', 'medico', 'dentista', 'clinica', 'prepaga'],
  servicios:    ['luz', 'gas', 'agua', 'internet', 'telefono', 'expensas'],
}

function categoriasMatch(bc: string, tc: string): boolean {
  const b = bc.toLowerCase().trim()
  const t = tc.toLowerCase().trim()
  if (b === t) return true
  if (t.includes(b) || b.includes(t)) return true
  return ALIASES[b]?.includes(t) ?? false
}

// ─── Sugerencias de re-categorización para gastos en 'otros' ─
const RECATEGORIZACION: Array<{ keywords: string[]; sugerencia: string; label: string }> = [
  { keywords: ['super', 'mercado', 'almacen', 'verduleria', 'carniceria', 'panaderia', 'kiosco', 'comida', 'delivery', 'rappi', 'pedidosya'], sugerencia: 'alimentacion', label: 'Comida y delivery' },
  { keywords: ['nafta', 'ypf', 'shell', 'axion', 'sube', 'colectivo', 'subte', 'uber', 'taxi', 'remis', 'peaje'], sugerencia: 'transporte', label: 'Transporte' },
  { keywords: ['farmacia', 'medico', 'doctor', 'dentista', 'clinica', 'hospital', 'prepaga', 'osde', 'swiss'], sugerencia: 'salud', label: 'Salud' },
  { keywords: ['netflix', 'spotify', 'disney', 'hbo', 'amazon', 'icloud', 'adobe', 'gym', 'gimnasio'], sugerencia: 'suscripciones', label: 'Suscripciones' },
  { keywords: ['bar', 'restaurant', 'restaurante', 'cine', 'teatro', 'boliche', 'fiesta'], sugerencia: 'salidas', label: 'Salidas' },
  { keywords: ['zara', 'h&m', 'adidas', 'nike', 'ropa', 'zapatillas', 'indumentaria'], sugerencia: 'ropa', label: 'Ropa' },
]

function sugerirCategoria(descripcion: string): { sugerencia: string; label: string } | null {
  const desc = descripcion.toLowerCase()
  for (const rule of RECATEGORIZACION) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      return { sugerencia: rule.sugerencia, label: rule.label }
    }
  }
  return null
}

// ─── Umbral de alerta para 'otros' ───────────────────────────
const OTROS_ALERT_PCT_OF_TOTAL = 0.25  // 25% del gasto total

export default function BudgetTab({ selectedMonth, refreshTrigger }: BudgetTabProps) {
  const { budgets, loading, error, refresh, updateBudget, createBudget, deleteBudget } = useSimpleSupabase()
  const { transactions } = useSimpleAdaptedData(selectedMonth)

  const [onboardingData, setOnboardingData] = useState({ ingreso_mensual: 0, objetivo_ahorro: 0 })
  const [showEditModal, setShowEditModal]   = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newLimit, setNewLimit]             = useState('')
  const [newBudget, setNewBudget]           = useState({ category: '', limit: 0 })
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null)
  const [creandoSugeridos, setCreandoSugeridos] = useState(false)

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) refresh()
  }, [refreshTrigger])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id
      if (!uid) return
      const stored = localStorage.getItem(`ai_wallet_onboarding_${uid}`)
      if (stored) setOnboardingData(JSON.parse(stored))
    }
    load()
  }, [])

  const targetMonth     = selectedMonth || new Date().toISOString().slice(0, 7)
  const filteredBudgets = (budgets || []).filter(b => b.month_period === targetMonth)

  // Separar 'otros' del resto para tratamiento especial
  const budgetsSinOtros = filteredBudgets.filter(b => b.category !== 'otros')
  const budgetOtros     = filteredBudgets.find(b => b.category === 'otros')

  const getSpent = (budget: any) => {
    if (!transactions) return 0
    return transactions
      .filter(t => {
        const tc    = typeof t.categoria === 'string' ? t.categoria : t.categoria?.id || t.categoria?.nombre || ''
        const monthOk = t.fecha?.startsWith(targetMonth)
        const catOk   = categoriasMatch(budget.category, tc)
        return catOk && monthOk && t.tipo === 'gasto'
      })
      .reduce((s, t) => s + (Number(t.monto) || 0), 0)
  }

  // Total gastado en todas las categorías (para calcular % de 'otros')
  const totalGastado = filteredBudgets.reduce((s, b) => s + getSpent(b), 0)

  // Gastos de 'otros' para sugerencias de re-categorización
  const gastosEnOtros = budgetOtros
    ? (transactions || []).filter(t => {
        const tc = typeof t.categoria === 'string' ? t.categoria : t.categoria?.id || t.categoria?.nombre || ''
        return categoriasMatch('otros', tc) && t.fecha?.startsWith(targetMonth) && t.tipo === 'gasto'
      })
    : []

  // Sugerencias de re-categorización (solo si hay gastos en 'otros' con datos claros)
  const sugerencias = gastosEnOtros
    .map(t => ({ tx: t, sug: sugerirCategoria(t.descripcion || '') }))
    .filter(({ sug }) => sug !== null)
    .slice(0, 3)

  // ─── Handlers ────────────────────────────────────────────
  const handleUpdateBudget = async (id: string) => {
    const limit = parseFloat(newLimit)
    if (limit > 0) {
      await updateBudget(id, limit)
      setShowEditModal(null)
      setNewLimit('')
      refresh()
    }
  }

  const handleCreateBudget = async () => {
    if (!newBudget.category || newBudget.limit <= 0) return

    const disponible = onboardingData.ingreso_mensual - onboardingData.objetivo_ahorro

    if (disponible > 0 && filteredBudgets.length > 0) {
      const mapaActual = filteredBudgets.reduce<Record<string, number>>((acc, b) => {
        acc[b.category] = b.limit_amount
        return acc
      }, {})

      const mapaRecalculado = recalcularAlAgregar(mapaActual, newBudget.category, disponible)

      for (const b of filteredBudgets) {
        const nuevoLimite = mapaRecalculado[b.category]
        if (nuevoLimite !== undefined && nuevoLimite !== b.limit_amount) {
          await updateBudget(b.id, nuevoLimite)
        }
      }

      await createBudget(newBudget.category, mapaRecalculado[newBudget.category] ?? newBudget.limit, targetMonth)
    } else {
      await createBudget(newBudget.category, newBudget.limit, targetMonth)
    }

    setShowCreateModal(false)
    setNewBudget({ category: '', limit: 0 })
    refresh()
  }

  const handleDeleteBudget = async (id: string) => {
    if (confirm('¿Estás seguro de que querés eliminar este límite?')) {
      await deleteBudget(id)
      refresh()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  // ─── Render de una tarjeta de budget ─────────────────────
  const renderBudgetCard = (budget: any, isOtros = false) => {
    const spent      = getSpent(budget)
    const remaining  = budget.limit_amount - spent
    const pct        = budget.limit_amount > 0 ? (spent / budget.limit_amount) * 100 : 0
    const colors     = getColorByPercentage(pct)
    const emoji      = getEmoji(budget.category)
    const isExpanded = expandedBudget === budget.id

    return (
      <div
        key={budget.id}
        className={`${isOtros ? 'bg-white/3 border-white/5' : colors.bg + ' ' + colors.border}
          rounded-2xl p-5 border transition-all duration-300
          ${isOtros ? 'opacity-70' : 'hover:scale-[1.01]'} cursor-pointer`}
        onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${isOtros ? 'opacity-50' : ''}`}>{emoji}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${isOtros ? 'text-white/40' : 'text-white'}`}>
                  {isOtros ? 'Varios y otros' : formatCategoria(budget.category)}
                </h3>
                {isOtros && (
                  <span className="text-[10px] text-white/20 bg-white/5 rounded-full px-2 py-0.5">
                    gastos sin categoría
                  </span>
                )}
              </div>
              {!isOtros && (
                <span className="text-[10px] text-white/25">
                  {new Date(budget.month_period + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={e => { e.stopPropagation(); setShowEditModal(budget.id); setNewLimit(budget.limit_amount.toString()) }}
              className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            {!isOtros && (
              <button
                onClick={e => { e.stopPropagation(); handleDeleteBudget(budget.id) }}
                className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Barra */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/40">
              ${Math.round(spent).toLocaleString('es-AR')} de ${budget.limit_amount.toLocaleString('es-AR')}
            </span>
            <span className={`text-xs font-medium ${isOtros ? 'text-white/30' : colors.text}`}>
              {!isOtros && colors.icon + ' '}{Math.round(pct)}%
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: isOtros ? 'rgba(255,255,255,0.15)' : colors.bar,
              }}
            />
          </div>
          <p className={`text-xs mt-1.5 ${remaining < 0 ? 'text-red-400' : isOtros ? 'text-white/25' : 'text-white/50'}`}>
            {remaining < 0
              ? `Excedido en $${Math.abs(Math.round(remaining)).toLocaleString('es-AR')}`
              : `Disponible: $${Math.round(remaining).toLocaleString('es-AR')}`}
          </p>
        </div>

        {/* Alerta de exceso — solo para categorías normales */}
        {!isOtros && pct >= 85 && (
          <div className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${pct >= 100 ? 'bg-red-500/15 text-red-400' : 'bg-orange-500/15 text-orange-400'}`}>
            <AlertTriangle size={12} />
            {pct >= 100 ? '¡Límite superado!' : 'Casi alcanzás el límite. Cuidá los gastos.'}
          </div>
        )}

        {/* Transacciones expandidas */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-white/30 text-[10px] mb-2">Últimos gastos</p>
            {(() => {
              const txs = (transactions || [])
                .filter(t => {
                  const tc = typeof t.categoria === 'string' ? t.categoria : t.categoria?.id || t.categoria?.nombre || ''
                  return categoriasMatch(budget.category, tc) && t.tipo === 'gasto' && t.fecha?.startsWith(targetMonth)
                })
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .slice(0, 5)

              if (txs.length === 0) return <p className="text-white/20 text-xs italic">Sin gastos registrados</p>

              return txs.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 border-t border-white/5 first:border-0">
                  <p className="flex-1 text-white/50 text-xs truncate">{t.descripcion}</p>
                  <p className="text-[#FF5252] text-xs font-medium shrink-0">
                    -${Math.abs(Number(t.monto)).toLocaleString('es-AR')}
                  </p>
                </div>
              ))
            })()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Mis Límites</h2>
          <p className="text-white/40 text-sm">
            {new Date(targetMonth + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#00C853] text-black text-sm font-semibold px-4 py-2 rounded-xl transition-colors hover:bg-[#00C853]/80"
        >
          <DollarSign size={15} />
          Nuevo límite
        </button>
      </div>

      {/* ── Budgets principales (sin 'otros') ── */}
      {budgetsSinOtros.length > 0 && (
        <div className="space-y-3">
          {budgetsSinOtros.map(b => renderBudgetCard(b, false))}
        </div>
      )}

      {/* ── Alerta especial de 'otros' si supera umbral ── */}
      {budgetOtros && (() => {
        const spentOtros = getSpent(budgetOtros)
        const pctDeTotal = totalGastado > 0 ? spentOtros / totalGastado : 0
        if (pctDeTotal < OTROS_ALERT_PCT_OF_TOTAL) return null

        return (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Lightbulb size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400/90 text-sm font-medium">
                  Tenés mucho gasto en "Otros" ({Math.round(pctDeTotal * 100)}% de lo gastado)
                </p>
                <p className="text-amber-400/50 text-xs mt-0.5">
                  Organizarlo en categorías te va a ayudar a entender mejor en qué se va tu plata.
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Sugerencias de re-categorización ── */}
      {sugerencias.length > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-2">
          <p className="text-white/40 text-xs font-medium">💡 Estos gastos podrían tener mejor categoría:</p>
          {sugerencias.map(({ tx, sug }) => (
            <div key={tx.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/60 text-xs truncate">{tx.descripcion}</p>
                <p className="text-white/30 text-[10px]">
                  ${Math.abs(Number(tx.monto)).toLocaleString('es-AR')} · parece {sug!.label}
                </p>
              </div>
              <button
                onClick={async () => {
                  const { error } = await supabase
                    .from('transactions')
                    .update({ category: sug!.sugerencia })
                    .eq('id', tx.id)
                  if (!error) refresh()
                }}
                className="shrink-0 text-[10px] text-[#00C853] border border-[#00C853]/30 rounded-full px-2.5 py-1 hover:bg-[#00C853]/10 transition-colors"
              >
                Mover a {sug!.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Budget 'otros' al final, visualmente secundario ── */}
      {budgetOtros && (
        <div className="opacity-60 hover:opacity-80 transition-opacity">
          {renderBudgetCard(budgetOtros, true)}
        </div>
      )}

      {/* ── Estado vacío ── */}
      {filteredBudgets.length === 0 && (() => {
        const ingreso  = onboardingData.ingreso_mensual || 0
        const objetivo = onboardingData.objetivo_ahorro || 0
        const disp     = ingreso - objetivo

        const sugeridos = [
          { categoria: 'alimentacion', emoji: '🍔', label: 'Comida',         monto: Math.round(disp * 0.28) },
          { categoria: 'transporte',   emoji: '🚌', label: 'Transporte',     monto: Math.round(disp * 0.15) },
          { categoria: 'salidas',      emoji: '🎉', label: 'Salidas',        monto: Math.round(disp * 0.12) },
          { categoria: 'otros',        emoji: '📦', label: 'Varios y otros', monto: 0 },
        ]
        const asignado = sugeridos.slice(0, 3).reduce((s, l) => s + l.monto, 0)
        sugeridos[3].monto = disp - asignado

        return (
          <div className="bg-[#141A17] border border-white/5 rounded-2xl p-5">
            <p className="text-white font-medium mb-1">Basándome en tu objetivo, te sugiero:</p>
            <p className="text-white/40 text-sm mb-4">Podés ajustarlos cuando quieras</p>
            <div className="space-y-2 mb-4">
              {sugeridos.map(l => (
                <div key={l.categoria} className="flex items-center justify-between">
                  <span className={`text-sm ${l.categoria === 'otros' ? 'text-white/30' : 'text-white/60'}`}>
                    {l.emoji} {l.label}
                    {l.categoria === 'otros' && <span className="text-[10px] text-white/20 ml-1">(gastos varios)</span>}
                  </span>
                  <span className={`font-medium text-sm ${l.categoria === 'otros' ? 'text-white/30' : 'text-white'}`}>
                    ${l.monto.toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
            <button
              disabled={creandoSugeridos}
              onClick={async () => {
                setCreandoSugeridos(true)
                for (const l of sugeridos) {
                  await createBudget(l.categoria, l.monto, targetMonth)
                }
                refresh()
                setCreandoSugeridos(false)
              }}
              className="w-full bg-[#00C853] text-black font-semibold rounded-xl py-3 text-sm disabled:opacity-50"
            >
              {creandoSugeridos ? 'Creando...' : 'Aceptar estos límites'}
            </button>
          </div>
        )
      })()}

      {/* ── Modal crear ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#141A17] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Nuevo límite</h3>

            <div className="space-y-4">
              <div>
                <label className="text-white/40 text-xs block mb-1.5">Categoría</label>
                <input
                  type="text"
                  placeholder="Ej: ropa, gym, mascotas..."
                  value={newBudget.category}
                  onChange={e => setNewBudget(p => ({ ...p, category: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00C853]/40"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {['👕 ropa', '💪 gym', '🐕 mascotas', '💊 salud', '📚 educacion'].map(opt => {
                    const cat = opt.split(' ').slice(1).join(' ')
                    return (
                      <button
                        key={cat}
                        onClick={() => setNewBudget(p => ({ ...p, category: cat }))}
                        className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2.5 py-1 text-white/40 hover:text-white hover:border-white/30 transition-colors"
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-white/40 text-xs block mb-1.5">Límite mensual</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                  <input
                    type="number"
                    value={newBudget.limit || ''}
                    onChange={e => setNewBudget(p => ({ ...p, limit: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 pl-7 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00C853]/40"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Aviso de recálculo si hay presupuestos existentes */}
              {filteredBudgets.length > 0 && onboardingData.ingreso_mensual > 0 && (
                <div className="bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                  <p className="text-white/30 text-[11px] leading-relaxed">
                    💡 Se va a ajustar el resto de tus presupuestos proporcionalmente para que sigan sumando a tu disponible.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setShowCreateModal(false); setNewBudget({ category: '', limit: 0 }) }}
                className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateBudget}
                disabled={!newBudget.category.trim() || newBudget.limit <= 0}
                className="flex-1 bg-[#00C853] text-black font-semibold py-3 rounded-xl text-sm disabled:opacity-30"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#141A17] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Editar límite</h3>
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input
                type="number"
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 pl-7 text-white text-sm focus:outline-none focus:border-[#00C853]/40"
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowEditModal(null); setNewLimit('') }}
                className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateBudget(showEditModal)}
                disabled={!newLimit || parseFloat(newLimit) <= 0}
                className="flex-1 bg-[#00C853] text-black font-semibold py-3 rounded-xl text-sm disabled:opacity-30"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
