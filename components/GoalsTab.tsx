'use client';

import React, { useState, useEffect } from 'react';
import { Target, TrendingUp, Calendar, Award, Plus, Edit2, X, Check } from 'lucide-react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';

interface GoalsTabProps {
  selectedMonth?: string;
}

export default function GoalsTabSimple({ selectedMonth }: GoalsTabProps) {
  const { goals, loading, error, refresh, updateGoal, createGoal } = useSimpleSupabase();
  
  // Debug temporal
  console.log('🔍 GoalsTab - Estado:', { loading, error, goalsCount: goals?.length });
  
  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState({
    name: '',
    icon: '🎯',
    target_amount: 0,
    target_date: '',
    color: 'text-emerald-500'
  });
  const [editingGoal, setEditingGoal] = useState({
    name: '',
    target_amount: 0,
    current_amount: 0,
    target_date: '',
    icon: '🎯',
    color: 'text-emerald-500'
  });

  // Validación de máximo 3 metas activas
  const metasActivas = goals.filter(g => !g.is_completed)
  const puedeCrearMeta = metasActivas.length < 3

  // Cálculo para proyección dinámica
  const onboardingData = JSON.parse(
    localStorage.getItem('ai_wallet_onboarding') || '{}'
  )
  const ingresoMensual = onboardingData.ingreso_mensual || 0
  const objetivoAhorro = onboardingData.objetivo_ahorro || 0

  // Aporte estimado por meta
  const metasActivasCount = goals.filter(g => !g.is_completed).length
  const disponibleParaMetas = Math.max(0, ingresoMensual - objetivoAhorro)
  const aportePorMeta = metasActivasCount > 0 
    ? disponibleParaMetas / metasActivasCount / 3
    : 0

  // Función de verificación de hitos
  const verificarHitos = (metas: typeof goals) => {
    metas.forEach(meta => {
      if (meta.is_completed) return
      const porcentaje = (meta.current_amount / meta.target_amount) * 100
      const hito = [25, 50, 75, 100].find(h => porcentaje >= h)
      if (!hito) return
      
      const hitoKey = `hito_${meta.id}_${hito}` 
      if (localStorage.getItem(hitoKey)) return
      
      localStorage.setItem(hitoKey, 'true')
      
      const mensajes: Record<number, string> = {
        25: `¡Llegaste al 25% de "${meta.name}"! Buen arranque 🙌`,
        50: `¡Mitad del camino para "${meta.name}"! Ya es real 🎯`,
        75: `¡Casi! Solo falta el 25% para "${meta.name}" 🔥`,
        100: `¡Completaste "${meta.name}"! Sos un crack 🎉` 
      }
      
      alert(mensajes[hito])
    })
  }

  // useEffect para verificar hitos
  useEffect(() => {
    if (goals.length > 0) verificarHitos(goals)
  }, [goals])

  // Función para crear nueva meta
  const handleCreateGoal = async () => {
    if (!newGoal.name || newGoal.target_amount <= 0) return;
    
    const success = await createGoal({
      name: newGoal.name,
      target_amount: newGoal.target_amount,
      current_amount: 0,
      target_date: newGoal.target_date || undefined,
      icon: newGoal.icon,
      color: newGoal.color
    });
    
    if (success) {
      setShowCreateModal(false);
      setNewGoal({
        name: '',
        icon: '🎯',
        target_amount: 0,
        target_date: '',
        color: 'text-emerald-500'
      });
    }
  };

  // Función para actualizar meta
  const handleUpdateGoal = async (goalId: string) => {
    if (!editingGoal.name || editingGoal.target_amount <= 0) return;
    
    const success = await updateGoal(goalId, {
      name: editingGoal.name,
      target_amount: editingGoal.target_amount,
      current_amount: editingGoal.current_amount,
      target_date: editingGoal.target_date || undefined,
      icon: editingGoal.icon,
      color: editingGoal.color,
      is_completed: editingGoal.current_amount >= editingGoal.target_amount
    });
    
    if (success) {
      setShowEditModal(null);
    }
  };

  // Función para abrir modal de edición
  const openEditModal = (goal: any) => {
    setEditingGoal({
      name: goal.name,
      target_amount: goal.target_amount,
      current_amount: goal.current_amount,
      target_date: goal.target_date || '',
      icon: goal.icon,
      color: goal.color
    });
    setShowEditModal(goal.id);
  };

  // Función para calcular progreso
  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'text-emerald-400';
    if (percentage >= 75) return 'text-blue-400';
    if (percentage >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getProgressRingColor = (percentage: number) => {
    if (percentage >= 100) return 'stroke-emerald-500';
    if (percentage >= 75) return 'stroke-blue-500';
    if (percentage >= 50) return 'stroke-yellow-500';
    return 'stroke-red-500';
  };

  // Función para formatear fecha
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Sin fecha límite';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  // Función para calcular días restantes
  const getDaysRemaining = (targetDate?: string) => {
    if (!targetDate) return null;
    const today = new Date();
    const target = new Date(targetDate);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white">Cargando metas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-400 mb-4">Error: {error}</div>
        <button 
          onClick={() => refresh(selectedMonth)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Mis Metas</h2>
            <p className="text-slate-400">Seguimiento de objetivos financieros</p>
          </div>
          {puedeCrearMeta ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Nueva Meta</span>
            </button>
          ) : (
            <div className="bg-[#141A17] border border-white/5 rounded-2xl p-4 text-center max-w-xs">
              <p className="text-2xl mb-2">🎯</p>
              <p className="text-white font-medium mb-1">
                Ya tenés 3 metas activas
              </p>
              <p className="text-white/40 text-sm">
                Completá una antes de agregar otra. 
                El foco es clave para ahorrar más.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center h-64">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-lg">No hay metas creadas</p>
            <p className="text-slate-500 text-sm mt-1">Crea tu primera meta para empezar a ahorrar</p>
          </div>
        ) : (
          goals.map((goal) => {
            const progressPercentage = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
            const daysRemaining = getDaysRemaining(goal.target_date);
            const circumference = 2 * Math.PI * 45;
            const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;
            const isCompleted = goal.is_completed || goal.current_amount >= goal.target_amount;
            
            return (
              <div key={goal.id} className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800 hover:border-emerald-500/50 transition-all duration-300">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-3xl">{goal.icon}</div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{goal.name}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => openEditModal(goal)}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress Ring */}
                <div className="flex items-center justify-center mb-4">
                  <div className="relative">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="45"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-slate-700"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="45"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className={`${getProgressRingColor(progressPercentage)} transition-all duration-500`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getProgressColor(progressPercentage)}`}>
                          {Math.round(progressPercentage)}%
                        </div>
                        <div className="text-xs text-slate-400">completado</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Amounts */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Actual:</span>
                    <span className="text-white font-semibold">
                      ${goal.current_amount.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Objetivo:</span>
                    <span className="text-white font-semibold">
                      ${goal.target_amount.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Restante:</span>
                    <span className="text-white font-semibold">
                      ${Math.max(0, goal.target_amount - goal.current_amount).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>

                {/* Proyección dinámica */}
                {!isCompleted && (
                  (() => {
                    // Meses restantes para esta meta
                    const faltante = goal.target_amount - goal.current_amount
                    const mesesRestantes = aportePorMeta > 0
                      ? Math.ceil(faltante / aportePorMeta)
                      : null

                    return (
                      <p className={`text-xs mt-2 ${
                        mesesRestantes === null ? 'text-white/30' :
                        mesesRestantes <= 2 ? 'text-[#00C853]' :
                        mesesRestantes <= 6 ? 'text-[#FFD740]' :
                        'text-white/40'
                      }`}>
                        {mesesRestantes === null 
                          ? 'Agregá tu ingreso para ver proyección'
                          : `A este ritmo: ~${mesesRestantes} ${mesesRestantes === 1 ? 'mes' : 'meses'}` 
                        }
                      </p>
                    )
                  })()
                )}

                {/* Status */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="flex items-center space-x-2">
                    {isCompleted ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400 text-sm">Completada</span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span className="text-blue-400 text-sm">En progreso</span>
                      </>
                    )}
                  </div>
                  {daysRemaining !== null && (
                    <span className="text-slate-400 text-sm">
                      {daysRemaining > 0 ? `${daysRemaining} días` : 'Vencida'}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Metas Completadas */}
      {(() => {
        const completadas = goals.filter(g => g.is_completed)
        if (completadas.length === 0) return null
        return (
          <div className="mt-6">
            <p className="text-white/40 text-xs font-medium mb-3 uppercase tracking-wider">
              Mis victorias 🏆 ({completadas.length})
            </p>
            <div className="space-y-2">
              {completadas.map(meta => (
                <div key={meta.id} 
                     className="bg-[#141A17] border border-white/5 
                                rounded-xl p-3 flex items-center gap-3 
                                opacity-60">
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1">
                    <p className="text-white text-sm">{meta.name}</p>
                    <p className="text-[#00C853] text-xs">
                      ✅ Completada · 
                      ${meta.target_amount.toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-800">
            <h3 className="text-xl font-bold text-white mb-4">Nueva Meta</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Ej: Vacaciones en Brasil"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Monto objetivo</label>
                <input
                  type="number"
                  value={newGoal.target_amount}
                  onChange={(e) => setNewGoal({ ...newGoal, target_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="50000"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Fecha límite (opcional)</label>
                <input
                  type="date"
                  value={newGoal.target_date}
                  onChange={(e) => setNewGoal({ ...newGoal, target_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Icono</label>
                <div className="flex space-x-2">
                  {['🎯', '✈️', '💻', '🏠', '🚗', '📚', '🛡️', '💰'].map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewGoal({ ...newGoal, icon })}
                      className={`p-2 rounded-lg border ${
                        newGoal.icon === icon
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateGoal}
                disabled={!newGoal.name || newGoal.target_amount <= 0}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Crear Meta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-800">
            <h3 className="text-xl font-bold text-white mb-4">Editar Meta</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={editingGoal.name}
                  onChange={(e) => setEditingGoal({ ...editingGoal, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Monto objetivo</label>
                <input
                  type="number"
                  value={editingGoal.target_amount}
                  onChange={(e) => setEditingGoal({ ...editingGoal, target_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Monto actual</label>
                <input
                  type="number"
                  value={editingGoal.current_amount}
                  onChange={(e) => setEditingGoal({ ...editingGoal, current_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Fecha límite (opcional)</label>
                <input
                  type="date"
                  value={editingGoal.target_date}
                  onChange={(e) => setEditingGoal({ ...editingGoal, target_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowEditModal(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateGoal(showEditModal)}
                disabled={!editingGoal.name || editingGoal.target_amount <= 0}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Guardar Cambios
              </button>
            </div>

            <button
              onClick={async () => {
                if (!showEditModal) return
                await updateGoal(showEditModal, { is_completed: true })
                setShowEditModal(null)
                refresh()
              }}
              className="w-full mt-3 text-[#FF5252] text-sm py-2"
            >
              Pausar esta meta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
