// ========================================
// AI Wallet - Hook para datos de Supabase
// ========================================
// Archivo: hooks/useSupabaseData.ts
// Propósito: Obtener y gestionar datos reales de Supabase
// Author: Senior Data Architect
// ========================================

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient, DatabaseTransaction } from '../lib/supabase';

// Tipos para los datos de Supabase
export interface Budget {
  id: string;
  category: string;
  limit_amount: number;
  period: string;
  spent_amount: number;
  percentage_used: number;
  remaining_amount: number;
  status: 'seguro' | 'casi_límite' | 'excedido';
  is_active: boolean;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date?: string;
  icon: string;
  color: string;
  progress_percentage: number;
  remaining_amount: number;
  days_remaining?: number;
  status: 'en_progreso' | 'completada' | 'vencida' | 'urgente';
  daily_needed: number;
  is_active: boolean;
  description?: string;
}

export interface SupabaseData {
  transactions: DatabaseTransaction[];
  budgets: Budget[];
  goals: Goal[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSupabaseData(): SupabaseData {
  const [transactions, setTransactions] = useState<DatabaseTransaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  // Obtener transacciones
  const fetchTransactions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setTransactions(data || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Error al cargar transacciones');
    }
  }, [supabase]);

  // Obtener presupuestos (desde la vista con cálculos reales)
  const fetchBudgets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('budget_summary')
        .select('*')
        .order('category');

      if (error) throw error;
      
      setBudgets(data || []);
    } catch (err) {
      console.error('Error fetching budgets:', err);
      setError('Error al cargar presupuestos');
    }
  }, [supabase]);

  // Obtener metas (desde la vista con progreso real)
  const fetchGoals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('goals_summary')
        .select('*')
        .order('target_date', { ascending: true });

      if (error) throw error;
      
      setGoals(data || []);
    } catch (err) {
      console.error('Error fetching goals:', err);
      setError('Error al cargar metas');
    }
  }, [supabase]);

  // Función de refresco completo
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchTransactions(),
        fetchBudgets(),
        fetchGoals()
      ]);
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Error al actualizar datos');
    } finally {
      setLoading(false);
    }
  }, [fetchTransactions, fetchBudgets, fetchGoals]);

  // Cargar datos iniciales
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Suscripción a cambios en tiempo real
  useEffect(() => {
    // Suscribirse a cambios en transactions
    const transactionSubscription = supabase
      .channel('transactions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          console.log('🔄 Cambios en transactions detectados');
          refresh();
        }
      )
      .subscribe();

    // Suscribirse a cambios en budgets
    const budgetSubscription = supabase
      .channel('budgets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budgets' },
        () => {
          console.log('🔄 Cambios en budgets detectados');
          fetchBudgets();
        }
      )
      .subscribe();

    // Suscribirse a cambios en goals
    const goalsSubscription = supabase
      .channel('goals-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals' },
        () => {
          console.log('🔄 Cambios en goals detectados');
          fetchGoals();
        }
      )
      .subscribe();

    // CLEANUP CORRECTO - Esto es lo que faltaba:
    return () => {
      console.log('🧹 Limpiando suscripciones Realtime...');
      supabase.removeChannel(transactionSubscription);
      supabase.removeChannel(budgetSubscription);
      supabase.removeChannel(goalsSubscription);
    };
  }, [supabase, refresh, fetchBudgets, fetchGoals]);

  return {
    transactions,
    budgets,
    goals,
    loading,
    error,
    refresh
  };
}

// Hook específico para presupuestos
export function useSupabaseBudgets() {
  const { budgets, loading, error, refresh } = useSupabaseData();
  
  const updateBudget = useCallback(async (id: string, limitAmount: number) => {
    const supabase = getSupabaseClient();
    
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ limit_amount: limitAmount })
        .eq('id', id);

      if (error) throw error;
      
      await refresh();
      return { success: true };
    } catch (err) {
      console.error('Error updating budget:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }, [refresh]);

  return {
    budgets,
    loading,
    error,
    updateBudget,
    refresh
  };
}

// Hook específico para metas
export function useSupabaseGoals() {
  const { goals, loading, error, refresh } = useSupabaseData();
  
  const updateGoal = useCallback(async (id: string, currentAmount: number) => {
    const supabase = getSupabaseClient();
    
    try {
      const { error } = await supabase
        .from('goals')
        .update({ 
          current_amount: currentAmount,
          is_completed: currentAmount >= (goals.find(g => g.id === id)?.target_amount || 0)
        })
        .eq('id', id);

      if (error) throw error;
      
      await refresh();
      return { success: true };
    } catch (err) {
      console.error('Error updating goal:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }, [refresh, goals]);

  const addGoal = useCallback(async (goal: Omit<Goal, 'id' | 'progress_percentage' | 'remaining_amount' | 'status' | 'daily_needed' | 'description'> & { description?: string }) => {
    const supabase = getSupabaseClient();
    
    try {
      const { error } = await supabase
        .from('goals')
        .insert({
          name: goal.name,
          target_amount: goal.target_amount,
          current_amount: goal.current_amount,
          target_date: goal.target_date,
          description: goal.description || '',
          icon: goal.icon,
          color: goal.color
        });

      if (error) throw error;
      
      await refresh();
      return { success: true };
    } catch (err) {
      console.error('Error adding goal:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }, [refresh]);

  return {
    goals,
    loading,
    error,
    updateGoal,
    addGoal,
    refresh
  };
}
