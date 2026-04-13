'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Edit2, X, AlertTriangle, Lightbulb } from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import type { SimpleBudget } from '../hooks/useSimpleSupabase';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import { formatCategoria } from '../lib/types';
import { categoriasMatch, resolveCategory, generateAliasesForCustomCategory } from '../lib/category-aliases';
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

// ─── Emojis ──────────────────────────────────────────────────
const EMOJI: Record<string, string> = {
  alimentacion: '🍔', supermercado: '🛒', comida: '🍽️', delivery: '🛵',
  transporte: '🚌', salidas: '🎉', servicios: '💡', suscripciones: '📱',
  salud: '🏥', ropa: '👕', gym: '💪', mascotas: '🐕',
  educacion: '📚', hobbies: '🎨', viajes: '✈️', otros: '📦',
}
const getEmoji = (cat: string) => EMOJI[cat.toLowerCase().trim()] ?? '📦'

// ─── sugerirCategoria usando el sistema centralizado ─────────
function sugerirCategoria(
  descripcion: string,
  userCategories: string[]
): { sugerencia: string; label: string } | null {
  const resolved = resolveCategory(descripcion.toLowerCase(), userCategories, {})
  if (!resolved || resolved === 'otros') return null

  const labels: Record<string, string> = {
    alimentacion: 'Alimentación', supermercado: 'Supermercado', comida: 'Comida',
    transporte: 'Transporte', salidas: 'Salidas', servicios: 'Servicios',
    suscripciones: 'Suscripciones', salud: 'Salud', ropa: 'Ropa',
    gym: 'Gym', mascotas: 'Mascotas', educacion: 'Educación',
    hobbies: 'Hobbies', viajes: 'Viajes',
  }

  return {
    sugerencia: resolved,
    label: labels[resolved] ?? resolved.charAt(0).toUpperCase() + resolved.slice(1),
  }
}

// ─── Umbral de alerta para 'otros' ───────────────────────────
const OTROS_ALERT_PCT_OF_TOTAL = 0.25

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
  }, [refreshTrigger, refresh])

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

  const budgetsSinOtros = filteredBudgets.filter(b => b.category !== 'otros')
  const budgetOtros     = filteredBudgets.find(b => b.category === 'otros')

  // ─── Mapas para el sistema de aliases (construidos una sola vez) ──
  const userCategories = filteredBudgets.map(b => b.category)
  const budgetAliasesMap: Record<string, string[]> = {}
  for (const b of filteredBudgets) {
    budgetAliasesMap[b.category] = b.custom_aliases ?? []
  }

  const getSpent = (budget: SimpleBudget) => {
    if (!transactions) return 0
    return transactions
      .filter(t => {
        const tc = typeof t.categoria === 'string'
          ? t.categoria
          : (t.categoria as { id?: string; nombre?: string })?.id
            || (t.categoria as { id?: string; nombre?: string })?.nombre
            || ''
        const monthOk = t.fecha?.startsWith(targetMonth)
        const catOk   = categoriasMatch(budget.category, tc, userCategories, budgetAliasesMap)
        return catOk && monthOk && t.tipo === 'gasto'
      })
      .reduce((s, t) => s + (Number(t.monto) || 0), 0)
  }

  const totalGastado = filteredBudgets.reduce((s, b) => s + getSpent(b), 0)

  const gastosEnOtros = budgetOtros
    ? (transactions || []).filter(t => {
        const tc = typeof t.categoria === 'string'
          ? t.categoria
          : (t.categoria as { id?: string; nombre?: string })?.id
            || (t.categoria as { id?: string; nombre?: string })?.nombre
            || ''
        return categoriasMatch('otros', tc, userCategories, budgetAliasesMap)
          && t.fecha?.startsWith(targetMonth)
          && t.tipo === 'gasto'
      })
    : []

  const sugerencias = gastosEnOtros
    .map(t => ({ tx: t, sug: sugerirCategoria(t.descripcion || '', userCategories) }))
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

    // Generar aliases automáticos para categorías no reconocidas por el sistema global
    const autoAliases = generateAliasesForCustomCategory(newBudget.category)

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

      await createBudget(
        newBudget.category,
        mapaRecalculado[newBudget.category] ?? newBudget.limit,
        targetMonth,
        autoAliases
      )
    } else {
      await createBudget(newBudget.category, newBudget.limit, targetMonth, autoAliases)
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
  const renderBudgetCard = (budget: SimpleBudget, isOtros = false) => {
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

        {/* Alerta de exceso */}
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
                  const tc = typeof t.categoria === 'string'
                    ? t.categoria
                    : (t.categoria as { id?: string; nombre?: string })?.id
                      || (t.categoria as { id?: string; nombre?: string })?.nombre
                      || ''
                  return categoriasMatch(budget.category, tc, userCategories, budgetAliasesMap)
                    && t.tipo === 'gasto'
                    && t.fecha?.startsWith(targetMonth)
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

      {/* Budgets principales */}
      {budgetsSinOtros.length > 0 && (
        <div className="space-y-3">
          {budgetsSinOtros.map(b => renderBudgetCard(b, false))}
        </div>
      )}

      {/* Alerta especial de 'otros' si supera umbral */}
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
                  Tenés mucho gasto en &quot;Otros&quot; ({Math.round(pctDeTotal * 100)}% de lo gastado)
                </p>
                <p className="text-amber-400/50 text-xs mt-0.5">
                  Organizarlo en categorías te va a ayudar a entender mejor en qué se va tu plata.
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Sugerencias de re-categorización */}
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

      {/* Budget 'otros' al final */}
      {budgetOtros && (
        <div className="opacity-60 hover:opacity-80 transition-opacity">
          {renderBudgetCard(budgetOtros, true)}
        </div>
      )}

      {/* Estado vacío */}
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

      {/* Modal crear */}
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

      {/* Modal editar */}
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