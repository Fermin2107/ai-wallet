// ========================================
// AI Wallet - Hook Adaptador Simple para Dashboard
// ========================================
// Archivo: hooks/useSimpleAdaptedData.ts

import { useMemo, useRef, useEffect } from 'react';
import { useSimpleSupabase } from './useSimpleSupabase';
import type { SimpleAccount, SimpleInstallment } from './useSimpleSupabase';
import type { Transaction, Goal, Budget } from '../lib/types';

// Funciones adaptadoras (fuera del hook principal para mayor limpieza)
const adaptSimpleTransaction = (st: any): Transaction => ({
  id: st.id,
  descripcion: st.description,
  monto: st.amount,
  categoria: {
    id: st.category,
    nombre: st.category.charAt(0).toUpperCase() + st.category.slice(1),
    icono: '📦',
    color: 'text-gray-500',
    esGasto: st.type === 'gasto'
  },
  fecha: st.transaction_date,
  tipo: st.type,
  confirmado: st.confirmed
});

const adaptSimpleGoal = (sg: any): Goal => ({
  id: sg.id,
  titulo: sg.name,
  icono: sg.icon,
  montoActual: sg.current_amount,
  montoObjetivo: sg.target_amount,
  fechaLimite: sg.target_date,
  color: sg.color
});

const adaptSimpleBudget = (sb: any): Budget => ({
  categoriaId: sb.category.toLowerCase().replace(' ', '_'),
  limite: sb.limit_amount,
  gastado: 0, // Se calcula en el componente
  periodo: 'mensual',
  monthPeriod: sb.month_period // Incluir el month_period de Supabase
});

export function useSimpleAdaptedData(selectedMonth?: string) {
  // Usar el mes actual como fallback si no se proporciona selectedMonth
  const targetMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  
  const simpleData = useSimpleSupabase();
  
  // 🚨 DEBUG: Log solo cuando realmente cambia el contenido, no la referencia
  const prevDataRef = useRef(simpleData);
  useEffect(() => {
    const hasChanged = 
      prevDataRef.current.loading !== simpleData.loading ||
      prevDataRef.current.error !== simpleData.error ||
      prevDataRef.current.transactions?.length !== simpleData.transactions?.length ||
      prevDataRef.current.goals?.length !== simpleData.goals?.length ||
      prevDataRef.current.budgets?.length !== simpleData.budgets?.length;
      
    if (hasChanged) {
      console.log('🔍 useSimpleAdaptedData - simpleData changed:', {
        loading: simpleData.loading,
        error: simpleData.error,
        transactionsCount: simpleData.transactions?.length,
        goalsCount: simpleData.goals?.length,
        budgetsCount: simpleData.budgets?.length,
        targetMonth
      });
      prevDataRef.current = simpleData;
    }
  });
  
  const adaptedData = useMemo(() => {
    console.log('🔄 useSimpleAdaptedData - Recalculating memoized data with month filter:', targetMonth);
    
    // 🚨 PROTECCIÓN: Asegurar que los arrays existan
    const safeTransactions = simpleData.transactions || [];
    const safeGoals = simpleData.goals || [];
    const safeBudgets = simpleData.budgets || [];
    
    // 🔄 Filtrar transacciones por selectedMonth
    const filteredTransactions = safeTransactions.filter(t => {
      const transactionDate = t.transaction_date || t.created_at || '';
      return transactionDate.startsWith(targetMonth);
    });
    
    // 🔄 Filtrar presupuestos por selectedMonth
    const filteredBudgets = safeBudgets.filter(b => {
      return b.month_period === targetMonth;
    });
    
    const transactions: Transaction[] = filteredTransactions.map(adaptSimpleTransaction);
    const goals: Goal[] = safeGoals.map(adaptSimpleGoal); // Las metas no se filtran por mes
    const budgets: Budget[] = filteredBudgets.map(adaptSimpleBudget);
    
    console.log('✅ useSimpleAdaptedData - Data adapted and filtered:', {
      transactions: transactions.length,
      goals: goals.length,
      budgets: budgets.length,
      filteredFrom: {
        transactions: safeTransactions.length,
        budgets: safeBudgets.length
      }
    });
    
    const accounts: SimpleAccount[]      = simpleData.accounts      || [];
    const installments: SimpleInstallment[] = simpleData.installments || [];

    return {
      transactions,
      goals,
      budgets,
      accounts,
      installments,
      loading: simpleData.loading,
      error: simpleData.error,
      refresh: simpleData.refresh,
      refreshWithMonth: (month?: string) => simpleData.refresh(month || targetMonth),
      updateGoal: simpleData.updateGoal,
      updateBudget: simpleData.updateBudget,
      createGoal: simpleData.createGoal,
      createAccount: simpleData.createAccount,
    };
  }, [
    simpleData.loading,
    simpleData.error,
    simpleData.transactions?.length,
    simpleData.goals?.length,
    simpleData.budgets?.length,
    simpleData.accounts?.length,
    simpleData.installments?.length,
    simpleData.refresh,
    simpleData.updateGoal,
    simpleData.updateBudget,
    simpleData.createGoal,
    simpleData.createAccount,
    targetMonth
  ]);
  
  return adaptedData;
}