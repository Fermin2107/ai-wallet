// ========================================
// AI Wallet - Hook Simple Supabase con Fetch Directo
// ========================================
// Archivo: hooks/useSimpleSupabase.ts
// ========================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabase';

export interface SimpleTransaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  type: 'gasto' | 'ingreso';
  transaction_date: string;
  created_at: string;
  confirmed: boolean;
  source: 'voice' | 'text' | 'manual';
}

export interface SimpleBudget {
  id: string;
  category: string;
  limit_amount: number;
  period: string;
  month_period: string;
}

export interface SimpleGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date?: string;
  icon: string;
  color: string;
  is_completed: boolean;
}

export interface UseSimpleSupabaseReturn {
  transactions: SimpleTransaction[];
  budgets: SimpleBudget[];
  goals: SimpleGoal[];
  loading: boolean;
  error: string | null;
  refresh: (selectedMonth?: string) => Promise<void>;
  updateGoal: (id: string, updates: Partial<SimpleGoal>) => Promise<boolean>;
  createGoal: (goal: Omit<SimpleGoal, 'id' | 'created_at' | 'is_active' | 'is_completed'>) => Promise<boolean>;
  updateBudget: (id: string, limitAmount: number) => Promise<boolean>;
  createBudget: (category: string, limitAmount: number, monthPeriod?: string) => Promise<boolean>;
  deleteBudget: (id: string) => Promise<boolean>;
}

// ✅ Helper: siempre obtiene el userId fresco, nunca desde estado
async function getFreshUserId(supabase: ReturnType<typeof getSupabaseClient>): Promise<string | null> {
  try {
    // getUser() hace una llamada al servidor — nunca devuelve null si estás logueado
    const { data: { user }, error } = await supabase.auth.getUser();
    const userId = user?.id || null;
    console.log('🔑 getFreshUserId:', userId || 'NULL');
    return userId;
  } catch (err) {
    console.error('❌ Error obteniendo userId:', err);
    return null;
  }
}

// ✅ Helper: refresca todos los datos y actualiza estado
async function fetchAllData(supabase: ReturnType<typeof getSupabaseClient>) {
  const [transactionsRes, budgetsRes, goalsRes] = await Promise.all([
    supabase.from('transactions').select('*').order('created_at', { ascending: false }),
    supabase.from('budgets').select('*').order('category'),
    supabase.from('goals').select('*').order('target_date', { ascending: true })
  ]);

  if (transactionsRes.error) throw new Error(`Transacciones: ${transactionsRes.error.message}`);
  if (budgetsRes.error) throw new Error(`Presupuestos: ${budgetsRes.error.message}`);
  if (goalsRes.error) throw new Error(`Metas: ${goalsRes.error.message}`);

  return {
    transactions: transactionsRes.data || [],
    budgets: budgetsRes.data || [],
    goals: goalsRes.data || []
  };
}

export function useSimpleSupabase(): UseSimpleSupabaseReturn {
  const [transactions, setTransactions] = useState<SimpleTransaction[]>([]);
  const [budgets, setBudgets] = useState<SimpleBudget[]>([]);
  const [goals, setGoals] = useState<SimpleGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Supabase singleton estable
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = getSupabaseClient();
  }
  const supabase = supabaseRef.current;

  // ✅ Helper interno para actualizar estado desde resultado
  const applyData = useCallback((data: { transactions: any[], budgets: any[], goals: any[] }) => {
    setTransactions(data.transactions);
    setBudgets(data.budgets);
    setGoals(data.goals);
    setError(null);
  }, []);

  // Función de refresco
  const refresh = useCallback(async () => {
    console.log('🔄 Starting refresh...');
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllData(supabase);
      applyData(data);
      console.log('✅ Refresh completado');
    } catch (err) {
      console.error('❌ Error en refresh:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar datos');
      setTransactions([]);
      setBudgets([]);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  // Inicialización y listener de auth
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchAllData(supabase);
        if (isMounted) applyData(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error desconocido');
          setTransactions([]);
          setBudgets([]);
          setGoals([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // ✅ Recargar cuando el usuario vuelve a la pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await loadData();
      }
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setTransactions([]);
          setBudgets([]);
          setGoals([]);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ─── GOALS ───────────────────────────────────────────────

  const createGoal = useCallback(async (data: Omit<SimpleGoal, 'id' | 'is_completed'>): Promise<boolean> => {
    try {
      // ✅ Siempre obtener userId fresco — nunca desde estado
      const userId = await getFreshUserId(supabase);
      if (!userId) {
        console.error('❌ No hay userId para crear goal');
        setError('Usuario no autenticado');
        return false;
      }

      console.log('🎯 Creando goal con userId:', userId);

      const { error } = await supabase
        .from('goals')
        .insert({ ...data, is_completed: false, user_id: userId });

      if (error) {
        console.error('❌ Error creando goal:', error);
        setError(error.message);
        return false;
      }

      const freshData = await fetchAllData(supabase);
      applyData(freshData);
      console.log('✅ Goal creado exitosamente');
      return true;
    } catch (err) {
      console.error('❌ Error en createGoal:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData]);

  const updateGoal = useCallback(async (id: string, data: Partial<SimpleGoal>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('goals')
        .update({
          ...data,
          is_completed: data.current_amount !== undefined
            ? data.current_amount >= (data.target_amount || 0)
            : undefined
        })
        .eq('id', id);

      if (error) {
        console.error('❌ Error actualizando goal:', error);
        return false;
      }

      const freshData = await fetchAllData(supabase);
      applyData(freshData);
      return true;
    } catch (err) {
      console.error('❌ Error en updateGoal:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData]);

  // ─── BUDGETS ─────────────────────────────────────────────

  const createBudget = useCallback(async (category: string, limitAmount: number, monthPeriod?: string): Promise<boolean> => {
    try {
      // ✅ Siempre obtener userId fresco — nunca desde estado
      const userId = await getFreshUserId(supabase);
      if (!userId) {
        console.error('❌ No hay userId para crear budget');
        setError('Usuario no autenticado');
        return false;
      }

      console.log('💰 Creando budget con userId:', userId);

      const normalizedCategory = category.toLowerCase().trim();
      const budgetMonthPeriod = monthPeriod || new Date().toISOString().slice(0, 7);

      const { error } = await supabase
        .from('budgets')
        .insert({
          category: normalizedCategory,
          limit_amount: limitAmount,
          month_period: budgetMonthPeriod,
          user_id: userId
        });

      if (error) {
        console.error('❌ Error creando budget:', error.message, error.code, error.details);
        setError(error.message);
        return false;
      }

      const freshData = await fetchAllData(supabase);
      applyData(freshData);
      console.log('✅ Budget creado exitosamente');
      return true;
    } catch (err) {
      console.error('❌ Error en createBudget:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData]);

  const updateBudget = useCallback(async (id: string, limitAmount: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ limit_amount: limitAmount })
        .eq('id', id);

      if (error) {
        console.error('❌ Error actualizando budget:', error);
        return false;
      }

      const freshData = await fetchAllData(supabase);
      applyData(freshData);
      return true;
    } catch (err) {
      console.error('❌ Error en updateBudget:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData]);

  const deleteBudget = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error eliminando budget:', error);
        return false;
      }

      const freshData = await fetchAllData(supabase);
      applyData(freshData);
      return true;
    } catch (err) {
      console.error('❌ Error en deleteBudget:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData]);

  return {
    transactions: transactions || [],
    budgets: budgets || [],
    goals: goals || [],
    loading,
    error,
    refresh,
    updateGoal,
    createGoal,
    updateBudget,
    createBudget,
    deleteBudget
  };
}