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
import { useAccounts } from '../hooks/useAccounts';

export default function Home() {
  const { accounts } = useAccounts();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [onboardingDone, setOnboardingDone] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        setCheckingOnboarding(false);
        return;
      }

      // 1. Intentar Supabase primero
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed, nombre, ingreso_mensual, objetivo_ahorro, medio_pago_habitual, categorias')
        .eq('user_id', userId)
        .single();

      if (profile?.onboarding_completed) {
        // Sincronizar Supabase → localStorage (fuente de verdad = Supabase)
        localStorage.setItem(`ai_wallet_onboarding_${userId}`, JSON.stringify({
          onboarding_completed: true,
          nombre:              profile.nombre,
          ingreso_mensual:     profile.ingreso_mensual,
          objetivo_ahorro:     profile.objetivo_ahorro,
          medio_pago_habitual: profile.medio_pago_habitual,
          categorias:          profile.categorias,
          userId,
        }));
        setOnboardingDone(true);
        setCheckingOnboarding(false);
        return;
      }

      // 2. Fallback: localStorage
      const stored = localStorage.getItem(`ai_wallet_onboarding_${userId}`);
      const completed = stored ? JSON.parse(stored).onboarding_completed : false;
      setOnboardingDone(completed);
      setCheckingOnboarding(false);
    };

    checkOnboarding();
  }, []);

  // ── FIX CRÍTICO: no sobreescribir localStorage acá
  // Onboarding.tsx ya guarda todo correctamente en handleConfirmar.
  // page.tsx solo actualiza el estado React.
  const handleOnboardingComplete = () => {
    setOnboardingDone(true);
  };

  const handlePrevMonth = () => {
    setSelectedMonth(prev => {
      const [year, month] = prev.split('-').map(Number);
      const d = new Date(year, month - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const handleNextMonth = () => {
    setSelectedMonth(prev => {
      const [year, month] = prev.split('-').map(Number);
      const d = new Date(year, month, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            selectedMonth={selectedMonth}
            onNavigateToChat={() => setActiveTab('chat')}
            onNavigateToMetas={() => setActiveTab('metas')}
            onNavigateToBudgets={() => setActiveTab('limites')}
            accounts={accounts}
          />
        );

      case 'chat':
        return (
          <ChatTab
            selectedMonth={selectedMonth}
            onDataChanged={() => setRefreshTrigger(t => t + 1)}
            onNavigateToBudgets={() => setActiveTab('limites')}
          />
        );

      case 'limites':
        return (
          <BudgetTab
            selectedMonth={selectedMonth}
            refreshTrigger={refreshTrigger}
          />
        );

      case 'metas':
        return (
          <GoalsTab
            selectedMonth={selectedMonth}
            refreshTrigger={refreshTrigger}
            onNavigateToChat={() => setActiveTab('chat')}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {checkingOnboarding ? (
        <div className="min-h-screen bg-[#0A0F0D] flex items-center justify-center">
          <div className="text-white/40 text-sm">Cargando...</div>
        </div>
      ) : (
        <>
          <Navigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            alertCount={0}
          />

          <main className="md:ml-64">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32 md:pb-6">
              {!onboardingDone ? (
                <Onboarding onComplete={handleOnboardingComplete} />
              ) : (
                <>
                  {/* Selector de mes */}
                  <div className="mb-6">
                    <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-800">
                      <div className="flex items-center justify-center space-x-6">
                        <button
                          onClick={handlePrevMonth}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 hover:scale-105 group"
                        >
                          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-white capitalize">
                            {formatMonth(selectedMonth)}
                          </h2>
                          <p className="text-sm text-slate-400 mt-1">Período de análisis</p>
                        </div>
                        <button
                          onClick={handleNextMonth}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all duration-200 hover:scale-105 group"
                        >
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                      </div>
                    </div>
                  </div>

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