// ========================================
// AI Wallet - Cliente Supabase Singleton Real
// ========================================
// Archivo: lib/supabase.ts
// Propósito: Singleton real de Supabase - UNA sola instancia global
// Author: SRE Full-Stack Developer
// ========================================

import { createBrowserClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ✅ Singleton usando @supabase/ssr — lee la sesión desde cookies, igual que el middleware
let browserClient: SupabaseClient | null = null

export const getSupabaseClient = (): SupabaseClient => {
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey)
    console.log('🔧 Supabase browser client created (SSR-compatible)')
  }
  return browserClient
}

export const supabase = getSupabaseClient()

// Agregar esta función — permite destruir el singleton en logout
export const resetSupabaseClient = (): void => {
  browserClient = null
  console.log('🔧 Supabase browser client reset')
}

// Cliente para el lado del servidor (API routes)
export const createSupabaseServerClient = (): SupabaseClient => {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

// Nuevo: cliente autenticado con token del usuario
export const createSupabaseServerClientWithToken = (token: string): SupabaseClient => {
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    },
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

// Tipos para la tabla transactions
export interface DatabaseTransaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  type: 'gasto' | 'ingreso';
  transaction_date: string;
  created_at: string;
  updated_at: string;
  confirmed: boolean;
  source: 'voice' | 'text' | 'manual';
  original_message?: string;
  ai_confidence?: number;
  user_id?: string;
  budget_id?: string;
  goal_id?: string;
}

// Tipos para inserción (sin campos auto-generados)
export interface TransactionInsert {
  description: string;
  amount: number;
  category: string;
  type: 'gasto' | 'ingreso';
  transaction_date?: string;
  confirmed?: boolean;
  source?: 'voice' | 'text' | 'manual';
  original_message?: string;
  ai_confidence?: number;
  user_id?: string;
  budget_id?: string;
  goal_id?: string;
  account_id?: string | null;
  installment_count?: number;
  first_due_month?: string;
}

// Utilidades para manejo de errores
export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

// Función utilitaria para manejar errores de Supabase
export const handleSupabaseError = (error: unknown): SupabaseError => {
  const e = error as { code?: string; message?: string; details?: unknown };
  console.error('Error de Supabase:', error);

  if (e.code) {
    switch (e.code) {
      case '23505':
        return new SupabaseError('Registro duplicado', e.code, e.details);
      case '23503':
        return new SupabaseError('Violación de clave foránea', e.code, e.details);
      case '23514':
        return new SupabaseError('Violación de constraint', e.code, e.details);
      case 'PGRST116':
        return new SupabaseError('Registro no encontrado', e.code, e.details);
      default:
        return new SupabaseError(e.message || 'Error desconocido de Supabase', e.code, e.details);
    }
  }

  return new SupabaseError(e.message || 'Error desconocido de Supabase');
};

// Exportaciones por defecto
export default getSupabaseClient;

// Desconectar realtime completamente si no se usa
supabase.realtime.disconnect();
