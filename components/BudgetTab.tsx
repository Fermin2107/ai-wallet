'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, DollarSign, Edit2, Check, X, Calendar } from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import { useSimpleAdaptedData } from '../hooks/useSimpleAdaptedData';
import { CATEGORIA_EMOJI } from '../lib/types';

interface BudgetTabProps {
  selectedMonth?: string;
  refreshTrigger?: number; // ← agregar
}

// 🆕 Función para obtener color según porcentaje gastado (Semáforo de Ansiedad)
const getColorByPercentage = (percentage: number): { bg: string; text: string; border: string; icon: string } => {
  if (percentage >= 100) {
    return {
      bg: 'bg-red-900/20',
      text: 'text-red-400',
      border: 'border-red-500/30',
      icon: '🔴'
    };
  } else if (percentage >= 85) {
    return {
      bg: 'bg-red-800/20',
      text: 'text-red-500',
      border: 'border-red-500/20',
      icon: '🟠'
    };
  } else if (percentage >= 60) {
    return {
      bg: 'bg-yellow-900/20',
      text: 'text-yellow-400',
      border: 'border-yellow-500/30',
      icon: '🟡'
    };
  } else {
    return {
      bg: 'bg-green-900/20',
      text: 'text-green-400',
      border: 'border-green-500/30',
      icon: '🟢'
    };
  }
};

// 🆕 Función para obtener emoji según la categoría (versión completa de todas las versiones)
const getEmojiForCategory = (category: string): string => {
  const normalizedCategory = category.toLowerCase().trim();
  
  const categoryEmojiMap: { [key: string]: string } = {
    // Alimentación
    'alimentación': '🍔',
    'comida': '🍔',
    'supermercado': '🛒',
    'restaurantes': '🍽️',
    'cafetería': '☕',
    'delivery': '🚚',
    'bebidas': '🥤',
    
    // Transporte
    'transporte': '🚌',
    'nafta': '⛽',
    'colectivo': '🚌',
    'subte': '🚇',
    'uber': '🚗',
    'taxi': '🚕',
    'estacionamiento': '🅿️',
    'peaje': '🛣️',
    
    // Servicios
    'servicios': '💡',
    'luz': '💡',
    'gas': '🔥',
    'internet': '🌐',
    'teléfono': '📞',
    'expensas': '🏠',
    'alquiler': '🏠',
    'seguro': '🛡️',
    'agua': '💧',
    
    // Compras
    'compras': '🛍️',
    'ropa': '👕',
    'calzado': '👟',
    'electrónica': '📱',
    
    // Salud
    'salud': '🏥',
    'medicamentos': '💊',
    'doctor': '👨‍⚕️',
    
    // Educación
    'educación': '📚',
    'cursos': '📖',
    'libros': '📕',
    
    // Entretenimiento
    'entretenimiento': '🎬',
    'cine': '🎥',
    'netflix': '📺',
    'juegos': '🎮',
    
    // Otros
    'otros': '📦'
  };
  
  return categoryEmojiMap[normalizedCategory] || '📦';
};

export default function BudgetTabFinal({ selectedMonth, refreshTrigger }: BudgetTabProps) {
  const { budgets, loading, error, refresh, updateBudget, createBudget, deleteBudget } = useSimpleSupabase();
  const { transactions } = useSimpleAdaptedData(selectedMonth);
  
  // ← agregar efecto para refresh trigger
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger]);
  
  // Debug temporal
  console.log('🔍 BudgetTabFinal - Estado:', { loading, error, budgetsCount: budgets?.length, transactionsCount: transactions?.length });
  
  // Estados para modales
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLimit, setNewLimit] = useState<string>('');
  const [newBudget, setNewBudget] = useState({ category: '', limit: 0 });
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);;

  const ALIASES: Record<string, string[]> = {
    'alimentacion': ['super', 'supermercado', 'mercado', 'comida', 'almacen', 
                     'verduleria', 'carniceria', 'panaderia', 'kiosco', 'delivery'],
    'transporte':   ['nafta', 'colectivo', 'subte', 'uber', 'taxi', 'remis', 
                     'sube', 'combustible', 'peaje'],
    'salidas':      ['bar', 'restaurant', 'restaurante', 'cine', 'teatro', 
                     'boliche', 'entretenimiento', 'salida'],
    'salud':        ['farmacia', 'medico', 'dentista', 'clinica', 'prepaga'],
    'servicios':    ['luz', 'gas', 'agua', 'internet', 'telefono', 'expensas'],
  }

  const categoriasMatch = (budgetCategory: string, txCategory: string): boolean => {
    const bc = budgetCategory.toLowerCase().trim()
    const tc = txCategory.toLowerCase().trim()
    if (bc === tc) return true
    if (tc.includes(bc) || bc.includes(tc)) return true
    return ALIASES[bc]?.includes(tc) ?? false
  }

  // 🔄 Calcular gastado por límite usando month_period (lógica correcta)
  const getSpentByCategory = (budget: any) => {
    if (!transactions) return 0;
    
    const targetMonth = selectedMonth || new Date().toISOString().slice(0, 7);
    
    return transactions
      .filter(t => {
        // Verificar que la categoría coincida con fuzzy matching
        const txCat = typeof t.categoria === 'string' 
          ? t.categoria 
          : t.categoria?.id || t.categoria?.nombre || ''
        const monthOk = t.fecha?.startsWith(targetMonth)
        const catOk = categoriasMatch(budget.category, txCat)
        const isExpense = t.tipo === 'gasto'
        return catOk && monthOk && isExpense
      })
      .reduce((sum, t) => sum + (Number(t.monto) || 0), 0)
  };

  // Función para actualizar límite
  const handleUpdateBudget = async (id: string) => {
    const limit = parseFloat(newLimit);
    if (limit > 0) {
      const success = await updateBudget(id, limit);
      if (success) {
        setShowEditModal(null);
        setNewLimit('');
        refresh(selectedMonth);
      }
    }
  };

  // Función para crear límite
  const handleCreateBudget = async () => {
    if (newBudget.category && newBudget.limit > 0) {
      const targetMonth = selectedMonth || new Date().toISOString().slice(0, 7);
      const success = await createBudget(newBudget.category, newBudget.limit, targetMonth);
      if (success) {
        setShowCreateModal(false);
        setNewBudget({ category: '', limit: 0 });
        refresh(targetMonth);
      }
    }
  };

  // Función para eliminar límite
  const handleDeleteBudget = async (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este límite?')) {
      const success = await deleteBudget(id);
      if (success) {
        refresh(selectedMonth);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Mis Límites</h2>
          <p className="text-slate-400">
            {selectedMonth ? `Cuánto podés gastar por categoría para ${new Date(selectedMonth + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}` : 'Cuánto podés gastar por categoría mensual'}
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <DollarSign className="w-4 h-4" />
          <span>Nuevo Límite</span>
        </button>
      </div>

      {/* 📋 Lista Vertical de Límites con Semáforo de Ansiedad */}
      <div className="space-y-4">
        {budgets?.map((budget) => {
          const spentAmount = getSpentByCategory(budget);
          const remainingAmount = budget.limit_amount - spentAmount;
          const percentageUsed = budget.limit_amount > 0 ? (spentAmount / budget.limit_amount) * 100 : 0;
          
          // 🆕 Obtener colores según semáforo de ansiedad
          const colors = getColorByPercentage(percentageUsed);
          const categoryEmoji = getEmojiForCategory(budget.category);
          
          return (
            <div 
              key={budget.id} 
              className={`${colors.bg} backdrop-blur-sm rounded-2xl p-6 border ${colors.border} transition-all duration-300 hover:scale-[1.02] cursor-pointer`}
              onClick={() => setExpandedBudget(
                expandedBudget === budget.id ? null : budget.id
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{categoryEmoji}</div>
                  <div>
                    <h3 className="text-lg font-semibold text-white capitalize">
                      {budget.category}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-slate-400">
                        {new Date(budget.month_period + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-lg">{colors.icon}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setShowEditModal(budget.id);
                      setNewLimit(budget.limit_amount.toString());
                    }}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBudget(budget.id)}
                    className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 📊 Barra de Progreso Mejorada */}
              <div className="mb-4">
                {(() => {
                  const porcentaje = budget.limit_amount > 0
                    ? Math.min((spentAmount / budget.limit_amount) * 100, 100)
                    : 0

                  const colorBarra = 
                    porcentaje < 70 ? '#00C853' :
                    porcentaje < 90 ? '#FFD740' : '#FF5252'

                  const semaforoEmoji = 
                    porcentaje < 70 ? '🟢' :
                    porcentaje < 90 ? '🟡' : '🔴'

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">{semaforoEmoji}</span>
                        <span className="text-white/40 text-xs">
                          {Math.round(porcentaje)}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full mb-2">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${porcentaje}%`,
                            backgroundColor: colorBarra
                          }}
                        />
                      </div>
                      <p className="text-white/60 text-sm">
                        Te quedan{' '}
                        <span className="text-white font-medium">
                          ${(budget.limit_amount - spentAmount)
                            .toLocaleString('es-AR')}
                        </span>
                        {' '}de ${budget.limit_amount.toLocaleString('es-AR')}
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* Transacciones expandidas */}
              {expandedBudget === budget.id && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-white/40 text-xs mb-3">Últimos gastos de esta categoría</p>
                  {(() => {
                    const transaccionesPorCategoria = transactions
                      .filter(t => {
                        const catNombre = typeof t.categoria === 'string' ? t.categoria : t.categoria?.nombre || '';
                        return catNombre.toLowerCase() === budget.category.toLowerCase() && 
                               t.tipo === 'gasto' &&
                               t.fecha.startsWith(selectedMonth || new Date().toISOString().slice(0, 7));
                      })
                      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                      .slice(0, 5);

                    if (transaccionesPorCategoria.length === 0) {
                      return (
                        <p className="text-white/20 text-sm italic">No hay gastos recientes en esta categoría</p>
                      );
                    }

                    return transaccionesPorCategoria.map(t => (
                      <div key={t.id} 
                           className="flex items-center gap-2 py-2 
                                      border-t border-white/5 first:border-0">
                        <span className="text-sm">
                          {CATEGORIA_EMOJI[typeof t.categoria === 'string' ? t.categoria : t.categoria?.nombre || ''] || '📦'}
                        </span>
                        <p className="flex-1 text-white/60 text-xs truncate">
                          {t.descripcion}
                        </p>
                        <p className="text-[#FF5252] text-xs font-medium">
                          -${Math.abs(Number(t.monto)).toLocaleString('es-AR')}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Detalles */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-slate-400 mb-1">Límite</p>
                  <p className="text-lg font-semibold text-white">
                    ${budget.limit_amount.toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-400 mb-1">Gastado</p>
                  <p className={`text-lg font-semibold ${colors.text}`}>
                    ${spentAmount.toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-400 mb-1">Disponible</p>
                  <p className={`text-lg font-semibold ${remainingAmount < 0 ? 'text-red-400' : 'text-white'}`}>
                    ${remainingAmount.toLocaleString('es-AR')}
                  </p>
                </div>
              </div>

              {/* 🚨 Alerta si está en peligro */}
              {percentageUsed >= 85 && (
                <div className={`mt-4 p-3 rounded-lg ${percentageUsed >= 100 ? 'bg-red-500/20 border border-red-500/30' : 'bg-orange-500/20 border border-orange-500/30'}`}>
                  <p className={`text-sm flex items-center ${percentageUsed >= 100 ? 'text-red-400' : 'text-orange-400'}`}>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {percentageUsed >= 100 
                      ? '¡Límite excedido! Revisá tus gastos urgentemente.' 
                      : '⚠️ Casi alcanzás el límite. Cuidá los gastos.'
                    }
                  </p>
                </div>
              )}

              {/* 💡 Recomendación si está bien */}
              {percentageUsed < 60 && (
                <div className="mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-green-400 flex items-center">
                    <Check className="w-4 h-4 mr-2" />
                    ¡Bien controlado! Tenés margen para gastar.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Estado vacío con sugerencias */}
      {budgets?.length === 0 && (
        (() => {
          const onboardingData = JSON.parse(
            localStorage.getItem('ai_wallet_onboarding') || '{}'
          )
          const ingreso = onboardingData.ingreso_mensual || 0
          const objetivo = onboardingData.objetivo_ahorro || 0
          const disponible = ingreso - objetivo

          const limitesSugeridos = [
            { categoria: 'alimentacion', emoji: '🍔', 
              monto: Math.round(disponible * 0.30) },
            { categoria: 'transporte', emoji: '🚌', 
              monto: Math.round(disponible * 0.15) },
            { categoria: 'salidas', emoji: '🎉', 
              monto: Math.round(disponible * 0.15) },
            { categoria: 'otros', emoji: '📦', 
              monto: Math.round(disponible * 0.40) },
          ]

          return (
            <div className="bg-[#141A17] border border-white/5 rounded-2xl p-5">
              <p className="text-white font-medium mb-1">
                Basándome en tu objetivo de ahorro, te sugiero:
              </p>
              <p className="text-white/40 text-sm mb-4">
                Podés ajustarlos cuando quieras
              </p>
              <div className="space-y-2 mb-4">
                {limitesSugeridos.map(l => (
                  <div key={l.categoria} 
                       className="flex items-center justify-between">
                    <span className="text-white/60 text-sm">
                      {l.emoji} {l.categoria}
                    </span>
                    <span className="text-white font-medium text-sm">
                      ${l.monto.toLocaleString('es-AR')}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  for (const limite of limitesSugeridos) {
                    await createBudget(
                      limite.categoria, 
                      limite.monto, 
                      selectedMonth || new Date().toISOString().slice(0, 7)
                    )
                  }
                  refresh(selectedMonth)
                }}
                className="w-full bg-[#00C853] text-black font-semibold 
                           rounded-xl py-3 text-sm"
              >
                Aceptar estos límites
              </button>
            </div>
          )
        })()
      )}

      {/* Modal para crear límite */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Nuevo Límite</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Categoría</label>
                <input
                  type="text"
                  placeholder="Ej: Mascotas, Ropa, Farmacia..."
                  value={newBudget.category}
                  onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
                />
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {['🍔 Comida', '🚌 Transporte', '🎉 Salidas',
                    '🛒 Super', '💡 Servicios', '📱 Suscripciones',
                    '👕 Ropa', '🐕 Mascotas', '💊 Salud', '💪 Gym'
                  ].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setNewBudget(
                        { ...newBudget, 
                          category: cat.split(' ').slice(1).join(' ').toLowerCase()
                        }
                      )}
                      className="text-xs bg-white/5 border border-white/10 
                                 rounded-full px-3 py-1 text-white/50 
                                 hover:text-white hover:border-white/30 
                                 transition-colors"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Límite mensual</label>
                <input
                  type="number"
                  value={newBudget.limit}
                  onChange={(e) => setNewBudget({ ...newBudget, limit: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              
              <div className="text-sm text-slate-400">
                Mes: {selectedMonth ? new Date(selectedMonth + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : 'Mes actual'}
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateBudget}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar límite */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Editar Límite</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Nuevo límite mensual</label>
              <input
                type="number"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                className="w-full bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(null);
                  setNewLimit('');
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateBudget(showEditModal)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
