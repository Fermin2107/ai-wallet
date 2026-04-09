// ============================================================
// AI Wallet — Hook useAccounts
// ============================================================
// Archivo: hooks/useAccounts.ts
//
// Semántica de balance:
//   liquid/savings → saldo disponible (positivo = tiene plata)
//   credit         → deuda actual     (positivo = debe esa cantidad)
//
// El trigger de Supabase actualiza balance automáticamente
// al insertar/modificar/eliminar transacciones.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import type { Account, Installment, AccountSummary } from '../lib/types';

// ─── Tipos de retorno e input ──────────────────────────────────────────────────

export type AccountCreateInput = Omit<Account, 'id' | 'user_id' | 'created_at'>;

export interface UseAccountsReturn {
  accounts: Account[];
  installments: Installment[];
  summary: AccountSummary;
  loading: boolean;
  error: string | null;
  createAccount: (data: AccountCreateInput) => Promise<boolean>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<boolean>;
  deleteAccount: (id: string) => Promise<boolean>;
  updateBalance: (id: string, newBalance: number) => Promise<boolean>;
  setDefaultAccount: (id: string, type: Account['type']) => Promise<boolean>;
  refresh: () => Promise<void>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: AccountSummary = {
  totalLiquid: 0,
  totalSavings: 0,
  totalCreditDebt: 0,
  totalCreditLimit: 0,
  availableCredit: 0,
  realDisponible: 0,
  installmentsThisMonth: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function computeSummary(accounts: Account[], installments: Installment[]): AccountSummary {
  const thisMonth = currentYearMonth();

  const totalLiquid = accounts
    .filter((a) => a.type === 'liquid' && a.is_active)
    .reduce((sum, a) => sum + a.balance, 0);

  const totalSavings = accounts
    .filter((a) => a.type === 'savings' && a.is_active)
    .reduce((sum, a) => sum + a.balance, 0);

  const totalCreditDebt = accounts
    .filter((a) => a.type === 'credit' && a.is_active)
    .reduce((sum, a) => sum + a.balance, 0);

  const totalCreditLimit = accounts
    .filter((a) => a.type === 'credit' && a.is_active)
    .reduce((sum, a) => sum + (a.credit_limit ?? 0), 0);

  const availableCredit = Math.max(0, totalCreditLimit - totalCreditDebt);

  // Disponible real: efectivo en mano menos deuda de tarjetas
  const realDisponible = totalLiquid - totalCreditDebt;

  const installmentsThisMonth = installments
    .filter((i) => i.due_month === thisMonth && !i.is_paid)
    .reduce((sum, i) => sum + i.amount, 0);

  return {
    totalLiquid,
    totalSavings,
    totalCreditDebt,
    totalCreditLimit,
    availableCredit,
    realDisponible,
    installmentsThisMonth,
  };
}

async function fetchAccounts(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<{ accounts: Account[]; installments: Installment[] }> {
  const [accountsRes, installmentsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('installments')
      .select('*')
      .eq('is_paid', false)
      .order('due_month', { ascending: true }),
  ]);

  if (accountsRes.error) {
    throw new Error(`Error cargando cuentas: ${accountsRes.error.message}`);
  }

  const accounts = (accountsRes.data ?? []) as Account[];
  const installments = installmentsRes.error ? [] : ((installmentsRes.data ?? []) as Installment[]);

  return { accounts, installments };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [summary, setSummary] = useState<AccountSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Singleton estable
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = getSupabaseClient();
  }
  const supabase = supabaseRef.current;

  // ── Aplicar datos y recalcular summary ─────────────────────────────────────
  const applyData = useCallback(
    (accs: Account[], insts: Installment[]) => {
      setAccounts(accs);
      setInstallments(insts);
      setSummary(computeSummary(accs, insts));
      setError(null);
    },
    []
  );

  // ── Refresh público ────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
      applyData(accs, insts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [applyData, supabase]);

  // ── Inicialización ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (mounted) {
            applyData([], []);
            setLoading(false);
          }
          return;
        }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        if (mounted) applyData(accs, insts);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load();
      if (event === 'SIGNED_OUT' && mounted) {
        applyData([], []);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── createAccount ──────────────────────────────────────────────────────────
  const createAccount = useCallback(
    async (data: AccountCreateInput): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Usuario no autenticado'); return false; }

        // Si va a ser default, desactivar la default actual del mismo tipo
        if (data.is_default) {
          await supabase
            .from('accounts')
            .update({ is_default: false })
            .eq('user_id', user.id)
            .eq('type', data.type)
            .eq('is_default', true);
        }

        const { error: insertErr } = await supabase.from('accounts').insert({
          user_id:      user.id,
          name:         data.name,
          type:         data.type,
          balance:      data.balance,
          currency:     data.currency ?? 'ARS',
          credit_limit: data.credit_limit ?? null,
          closing_day:  data.closing_day  ?? null,
          due_day:      data.due_day      ?? null,
          color:        data.color        ?? null,
          icon:         data.icon         ?? null,
          is_active:    true,
          is_default:   data.is_default   ?? false,
        });

        if (insertErr) { setError(insertErr.message); return false; }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        applyData(accs, insts);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        return false;
      }
    },
    [applyData, supabase]
  );

  // ── updateAccount ──────────────────────────────────────────────────────────
  const updateAccount = useCallback(
    async (id: string, data: Partial<Account>): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Usuario no autenticado'); return false; }

        // Mantener unicidad del default si se actualiza ese campo
        if (data.is_default === true) {
          const current = accounts.find((a) => a.id === id);
          if (current) {
            await supabase
              .from('accounts')
              .update({ is_default: false })
              .eq('user_id', user.id)
              .eq('type', current.type)
              .eq('is_default', true)
              .neq('id', id);
          }
        }

        // Nunca enviar campos calculados / de solo lectura
        const { id: _id, user_id: _uid, created_at: _ca, ...payload } = data as Account;
        const { error: updateErr } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', id);

        if (updateErr) { setError(updateErr.message); return false; }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        applyData(accs, insts);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        return false;
      }
    },
    [accounts, applyData, supabase]
  );

  // ── deleteAccount (soft delete) ────────────────────────────────────────────
  const deleteAccount = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { error: delErr } = await supabase
          .from('accounts')
          .update({ is_active: false })
          .eq('id', id);

        if (delErr) { setError(delErr.message); return false; }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        applyData(accs, insts);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        return false;
      }
    },
    [applyData, supabase]
  );

  // ── updateBalance ──────────────────────────────────────────────────────────
  // Actualiza el balance directamente (para edición inline del usuario).
  // NO dispara el trigger de transacciones — es una corrección manual.
  const updateBalance = useCallback(
    async (id: string, newBalance: number): Promise<boolean> => {
      try {
        const { error: updateErr } = await supabase
          .from('accounts')
          .update({ balance: newBalance })
          .eq('id', id);

        if (updateErr) { setError(updateErr.message); return false; }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        applyData(accs, insts);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        return false;
      }
    },
    [applyData, supabase]
  );

  // ── setDefaultAccount ──────────────────────────────────────────────────────
  const setDefaultAccount = useCallback(
    async (id: string, type: Account['type']): Promise<boolean> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Usuario no autenticado'); return false; }

        // Quitar default del mismo tipo
        await supabase
          .from('accounts')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('type', type)
          .eq('is_default', true);

        // Poner la nueva default
        const { error: setErr } = await supabase
          .from('accounts')
          .update({ is_default: true })
          .eq('id', id);

        if (setErr) { setError(setErr.message); return false; }

        const { accounts: accs, installments: insts } = await fetchAccounts(supabase);
        applyData(accs, insts);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        return false;
      }
    },
    [applyData, supabase]
  );

  return {
    accounts,
    installments,
    summary,
    loading,
    error,
    createAccount,
    updateAccount,
    deleteAccount,
    updateBalance,
    setDefaultAccount,
    refresh,
  };
}