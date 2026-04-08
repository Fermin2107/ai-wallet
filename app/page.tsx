'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Navigation from '../components/Navigation';
import DashboardTab from '../components/DashboardTab';
import BudgetTab from '../components/BudgetTab';
import GoalsTab from '../components/GoalsTab';
import Onboarding from '../components/Onboarding';
import ChatTab from '../components/ChatTab';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [metasSubTab, setMetasSubTab] = useState<'metas' | 'limites'>('metas');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // ← agregar trigger
  
  // 📅 Estado para el selector de meses
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Iniciar con el mes actual en formato YYYY-MM usando hora local
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  // 🎯 Estado para onboarding
const [onboardingDone, setOnboardingDone] = useState(false)
const [checkingOnboarding, setCheckingOnboarding] = useState(true)

useEffect(() => {
  const checkOnboarding = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id

    if (!userId) {
      setCheckingOnboarding(false)
      return
    }

    // 1. Intentar leer desde Supabase (fuente de verdad)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed, nombre, ingreso_mensual, objetivo_ahorro, medio_pago_habitual, categorias')
      .eq('user_id', userId)
      .single()

    if (profile?.onboarding_completed) {
      // Sincronizar localStorage para que buildFinancialContext lo lea sin async
      localStorage.setItem(`ai_wallet_onboarding_${userId}`, JSON.stringify({
        onboarding_completed: true,
        nombre: profile.nombre,
        ingreso_mensual: profile.ingreso_mensual,
        objetivo_ahorro: profile.objetivo_ahorro,
        medio_pago_habitual: profile.medio_pago_habitual,
        categorias: profile.categorias,
        userId,
      }))
      setOnboardingDone(true)
      setCheckingOnboarding(false)
      return
    }

    // 2. Fallback: localStorage (usuarios existentes pre-migración)
    const key = `ai_wallet_onboarding_${userId}` 
    const stored = localStorage.getItem(key)
    const completed = stored ? JSON.parse(stored).onboarding_completed : false
    setOnboardingDone(completed)
    setCheckingOnboarding(false)
  }

  checkOnboarding()
}, [])

  const handleOnboardingComplete = () => {
    // Obtener userId para guardar con key correcta
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id
      if (userId) {
        const key = `ai_wallet_onboarding_${userId}` 
        localStorage.setItem(key, JSON.stringify({ 
          onboarding_completed: true 
        }))
      }
    })
    setOnboardingDone(true)
  }

  // 🔄 Funciones para navegar entre meses (lógica a prueba de fallos)
  const handlePrevMonth = () => {
    setSelectedMonth((prev) => {
      const [year, month] = prev.split('-').map(Number);
      const newDate = new Date(year, month - 2, 1); // -2 porque el mes en JS empieza en 0, y queremos el anterior
      return `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => {
      const [year, month] = prev.split('-').map(Number);
      const newDate = new Date(year, month, 1); // 'month' ya es el siguiente en el índice de JS
      return `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  // 📝 Función para formatear el mes para visualización
  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-').map(Number);
    const date = new Date(year, month - 1, 1); // constructor local, no UTC
    return date.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric'
    });
  };

  const renderContent = () => {
  switch (activeTab) {
    case 'dashboard':
      return (
        <DashboardTab
          selectedMonth={selectedMonth}
          onNavigateToChat={() => setActiveTab('chat')}
          onNavigateToMetas={() => setActiveTab('metas')}
          onNavigateToBudgets={() => setActiveTab('budgets')}
        />
      )
    case 'chat':
      return (
        <ChatTab
          selectedMonth={selectedMonth}
          onDataChanged={() => setRefreshTrigger(t => t + 1)}
          onNavigateToBudgets={() => {        // ← agregar
            setActiveTab('metas')             // ← agregar
            setMetasSubTab('limites')         // ← agregar
          }}                                  // ← agregar
        />
      )
    case 'budgets':
      return (
        <BudgetTab
          selectedMonth={selectedMonth}
          refreshTrigger={refreshTrigger}
        />
      )
    case 'metas':
      return (
        <div>
          <div className="flex gap-2 p-4 pb-0">
            <button
              onClick={() => setMetasSubTab('metas')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium 
                         transition-colors ${
                metasSubTab === 'metas'
                  ? 'bg-[#00C853]/10 text-[#00C853]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              🎯 Mis Metas
            </button>
            <button
              onClick={() => setMetasSubTab('limites')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium 
                         transition-colors ${
                metasSubTab === 'limites'
                  ? 'bg-[#00C853]/10 text-[#00C853]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              💡 Mis Límites
            </button>
          </div>
          {metasSubTab === 'metas'
            ? <GoalsTab selectedMonth={selectedMonth} refreshTrigger={refreshTrigger} />
            : <BudgetTab selectedMonth={selectedMonth} refreshTrigger={refreshTrigger} />
          }
        </div>
      )
    default:
      return null
  }
}

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Mientras verifica, no mostrar nada (evita flash) */}
      {checkingOnboarding ? (
        <div className="min-h-screen bg-[#0A0F0D] flex items-center 
                        justify-center">
          <div className="text-white/40 text-sm">Cargando...</div>
        </div>
      ) : (
        <>
          {/* Navigation */}
          <Navigation 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            alertCount={0}
          />

          {/* Main Content */}
          <main className="md:ml-64">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32 md:pb-6">
              {/* Mostrar Onboarding si no está completado */}
              {!onboardingDone ? (
                <Onboarding onComplete={handleOnboardingComplete} />
              ) : (
                <>
                  {/* 📅 Selector de Meses */}
                  <div className="mb-6">
                    <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-800">
                      <div className="flex items-center justify-center space-x-6">
                        {/* Botón Mes Anterior */}
                        <button
                          onClick={handlePrevMonth}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 hover:scale-105 group"
                          aria-label="Mes anterior"
                        >
                          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                        
                        {/* Texto del Mes Actual */}
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-white capitalize">
                            {formatMonth(selectedMonth)}
                          </h2>
                          <p className="text-sm text-slate-400 mt-1">
                            Período de análisis
                          </p>
                        </div>
                        
                        {/* Botón Mes Siguiente */}
                        <button
                          onClick={handleNextMonth}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 hover:scale-105 group"
                          aria-label="Mes siguiente"
                        >
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Renderizar tab activa */}
                  {renderContent()}
                </>
              )}
            </div>
          </main>
        </>
      )}
    </div>
  );
}
