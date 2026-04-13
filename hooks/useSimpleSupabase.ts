// ============================================================
// AI Wallet — Hook useSimpleSupabase (actualizado)
// hooks/useSimpleSupabase.ts
//
// Cambios respecto a versión anterior:
//   - SimpleBudget incluye custom_aliases
//   - fetchAllData selecciona custom_aliases
//   - createBudget acepta custom_aliases
//   - nueva función: updateBudgetAliases
// ============================================================

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
  account_id?: string | null;
}

export interface SimpleBudget {
  id: string;
  category: string;
  limit_amount: number;
  period: string;
  month_period: string;
  custom_aliases: string[]  // ← NUEVO: aliases guardados en DB
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

export interface SimpleAccount {
  id: string;
  name: string;
  type: 'liquid' | 'credit' | 'savings';
  balance: number;
  credit_limit?: number | null;
  closing_day?: number | null;
  due_day?: number | null;
  color?: string | null;
  icon?: string | null;
  is_default: boolean;
  currency: string;
}

export interface SimpleInstallment {
  id: string;
  transaction_id: string;
  account_id: string;
  due_month: string;
  amount: number;
  is_paid: boolean;
}

export interface CreateAccountInput {
  name: string;
  type: 'liquid' | 'credit' | 'savings';
  balance: number;
  credit_limit?: number;
  closing_day?: number;
  due_day?: number;
  color?: string;
  icon?: string;
  is_default?: boolean;
}

export interface UseSimpleSupabaseReturn {
  transactions: SimpleTransaction[];
  budgets: SimpleBudget[];
  goals: SimpleGoal[];
  accounts: SimpleAccount[];
  installments: SimpleInstallment[];
  loading: boolean;
  error: string | null;
  refresh: (selectedMonth?: string) => Promise<void>;
  updateGoal: (id: string, updates: Partial<SimpleGoal>) => Promise<boolean>;
  createGoal: (goal: Omit<SimpleGoal, 'id' | 'is_completed'>) => Promise<boolean>;
  updateBudget: (id: string, limitAmount: number) => Promise<boolean>;
  createBudget: (category: string, limitAmount: number, monthPeriod?: string, customAliases?: string[]) => Promise<boolean>;
  deleteBudget: (id: string) => Promise<boolean>;
  updateBudgetAliases: (id: string, aliases: string[]) => Promise<boolean>; // ← NUEVO
  setDefaultAccount: (id: string) => Promise<boolean>;
  createAccount: (data: CreateAccountInput) => Promise<SimpleAccount | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getFreshUserId(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

async function fetchAllData(supabase: ReturnType<typeof getSupabaseClient>) {
  const [transactionsRes, budgetsRes, goalsRes, accountsRes, installmentsRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('budgets')
      .select('id, category, limit_amount, period, month_period, custom_aliases') // ← custom_aliases
      .order('category'),
    supabase
      .from('goals')
      .select('*')
      .eq('is_active', true)
      .order('target_date', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, name, type, balance, credit_limit, closing_day, due_day, color, icon, is_default, currency')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('installments')
      .select('id, transaction_id, account_id, due_month, amount, is_paid')
      .eq('is_paid', false),
  ]);

  if (transactionsRes.error) throw new Error(`Transacciones: ${transactionsRes.error.message}`);
  if (budgetsRes.error)      throw new Error(`Presupuestos: ${budgetsRes.error.message}`);
  if (goalsRes.error)        throw new Error(`Metas: ${goalsRes.error.message}`);

  // Garantizar que custom_aliases siempre sea array
  const budgets = (budgetsRes.data || []).map((b: Record<string, unknown>) => ({
    ...b,
    custom_aliases: Array.isArray(b.custom_aliases) ? b.custom_aliases : [],
  }));

  return {
    transactions: transactionsRes.data || [],
    budgets,
    goals:        goalsRes.data        || [],
    accounts:     accountsRes.error    ? [] : (accountsRes.data     || []),
    installments: installmentsRes.error ? [] : (installmentsRes.data || []),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSimpleSupabase(): UseSimpleSupabaseReturn {
  const [transactions, setTransactions] = useState<SimpleTransaction[]>([]);
  const [budgets, setBudgets]           = useState<SimpleBudget[]>([]);
  const [goals, setGoals]               = useState<SimpleGoal[]>([]);
  const [accounts, setAccounts]         = useState<SimpleAccount[]>([]);
  const [installments, setInstallments] = useState<SimpleInstallment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = getSupabaseClient();
  const supabase = supabaseRef.current;

  const applyData = useCallback(
    (data: { transactions: unknown[]; budgets: unknown[]; goals: unknown[]; accounts: unknown[]; installments: unknown[] }) => {
      setTransactions(data.transactions as SimpleTransaction[]);
      setBudgets(data.budgets as SimpleBudget[]);
      setGoals(data.goals as SimpleGoal[]);
      setAccounts(data.accounts as SimpleAccount[]);
      setInstallments(data.installments as SimpleInstallment[]);
      setError(null);
    },
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllData(supabase);
      applyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar datos');
      setTransactions([]); setBudgets([]); setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [applyData, supabase]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (isMounted) {
            setTransactions([]); setBudgets([]); setGoals([]); setLoading(false);
          }
          return;
        }

        const data = await fetchAllData(supabase);
        if (isMounted) applyData(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error desconocido');
          setTransactions([]); setBudgets([]); setGoals([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') await loadData();
      if (event === 'SIGNED_OUT' && isMounted) {
        setTransactions([]); setBudgets([]); setGoals([]); setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Goals ────────────────────────────────────────────────────────────────

  const createGoal = useCallback(async (data: Omit<SimpleGoal, 'id' | 'is_completed'>): Promise<boolean> => {
    try {
      const userId = await getFreshUserId(supabase);
      if (!userId) { setError('Usuario no autenticado'); return false; }
      const { error } = await supabase.from('goals').insert({ ...data, is_completed: false, user_id: userId });
      if (error) { setError(error.message); return false; }
      applyData(await fetchAllData(supabase));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData, supabase]);

  const updateGoal = useCallback(async (id: string, data: Partial<SimpleGoal>): Promise<boolean> => {
    try {
      const is_completed =
        data.is_completed !== undefined
          ? data.is_completed
          : data.current_amount !== undefined
            ? data.current_amount >= (data.target_amount ?? 0)
            : undefined;

      const payload: Record<string, unknown> = { ...data };
      if (is_completed !== undefined) payload.is_completed = is_completed;
      else delete payload.is_completed;

      const { error } = await supabase.from('goals').update(payload).eq('id', id);
      if (error) { setError(error.message); return false; }
      applyData(await fetchAllData(supabase));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData, supabase]);

  // ── Budgets ───────────────────────────────────────────────────────────────

  const createBudget = useCallback(async (
    category: string,
    limitAmount: number,
    monthPeriod?: string,
    customAliases: string[] = []  // ← NUEVO parámetro
  ): Promise<boolean> => {
    try {
      const userId = await getFreshUserId(supabase);
      if (!userId) { setError('Usuario no autenticado'); return false; }

      const { error } = await supabase.from('budgets').insert({
        category:      category.toLowerCase().trim(),
        limit_amount:  limitAmount,
        month_period:  monthPeriod || new Date().toISOString().slice(0, 7),
        user_id:       userId,
        custom_aliases: customAliases,  // ← guardar aliases desde el inicio
      });
      if (error) { setError(error.message); return false; }

      applyData(await fetchAllData(supabase));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [applyData, supabase]);

  const updateBudget = useCallback(async (id: string, limitAmount: number): Promise<boolean> => {
    try {
      const { error } = await supabase.from('budgets').update({ limit_amount: limitAmount }).eq('id', id);
      if (error) return false;
      applyData(await fetchAllData(supabase));
      return true;
    } catch { return false; }
  }, [applyData, supabase]);

  // ← NUEVA función
  const updateBudgetAliases = useCallback(async (id: string, aliases: string[]): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ custom_aliases: aliases })
        .eq('id', id);
      if (error) return false;
      applyData(await fetchAllData(supabase));
      return true;
    } catch { return false; }
  }, [applyData, supabase]);

  const deleteBudget = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', id);
      if (error) return false;
      applyData(await fetchAllData(supabase));
      return true;
    } catch { return false; }
  }, [applyData, supabase]);

  // ── Accounts ─────────────────────────────────────────────────────────────

  const createAccount = useCallback(async (data: CreateAccountInput): Promise<SimpleAccount | null> => {
    try {
      const userId = await getFreshUserId(supabase);
      if (!userId) { setError('Usuario no autenticado'); return null; }

      if (data.is_default) {
        await supabase
          .from('accounts')
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('type', data.type)
          .eq('is_default', true);
      }

      const { data: account, error } = await supabase
        .from('accounts')
        .insert({
          user_id:      userId,
          name:         data.name,
          type:         data.type,
          balance:      data.balance,
          credit_limit: data.credit_limit  ?? null,
          closing_day:  data.closing_day   ?? null,
          due_day:      data.due_day       ?? null,
          color:        data.color         ?? null,
          icon:         data.icon          ?? null,
          is_default:   data.is_default    ?? false,
          is_active:    true,
          currency:     'ARS',
        })
        .select()
        .single();

      if (error) { setError(error.message); return null; }
      applyData(await fetchAllData(supabase));
      return account as SimpleAccount;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return null;
    }
  }, [applyData, supabase]);

  const setDefaultAccount = useCallback(async (id: string): Promise<boolean> => {
    try {
      const userId = await getFreshUserId(supabase);
      if (!userId) { setError('Usuario no autenticado'); return false; }

      const target = accounts.find((a) => a.id === id);
      if (!target) return false;

      await supabase
        .from('accounts')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('type', target.type)
        .eq('is_default', true);

      const { error } = await supabase.from('accounts').update({ is_default: true }).eq('id', id);
      if (error) { setError(error.message); return false; }

      applyData(await fetchAllData(supabase));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      return false;
    }
  }, [accounts, applyData, supabase]);

  return {
    transactions: transactions || [],
    budgets:      budgets      || [],
    goals:        goals        || [],
    accounts:     accounts     || [],
    installments: installments || [],
    loading,
    error,
    refresh,
    updateGoal,
    createGoal,
    updateBudget,
    createBudget,
    deleteBudget,
    updateBudgetAliases,  // ← NUEVO
    setDefaultAccount,
    createAccount,
  };
}