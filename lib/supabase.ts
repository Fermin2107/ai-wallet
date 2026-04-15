// ========================================
// AI Wallet — Cliente Supabase
// lib/supabase.ts
//
// SEGURIDAD:
// - Browser client: singleton via globalThis (sobrevive hot reload en dev)
// - Server client (anon):  usa JWT del usuario → RLS activo
// - Server client (service): usa SERVICE_ROLE_KEY → bypasea RLS,
//   solo para el path interno WhatsApp con secret validado
// - Logs de infraestructura eliminados en producción
// ========================================

import { createBrowserClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─────────────────────────────────────────────────────────────────────────────
// Browser client — singleton via globalThis para sobrevivir hot reload
// ─────────────────────────────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & { _supabaseBrowser?: SupabaseClient }

export const getSupabaseClient = (): SupabaseClient => {
  if (!g._supabaseBrowser) {
    g._supabaseBrowser = createBrowserClient(url, anonKey)
    if (process.env.NODE_ENV === 'development') {
      console.log('[supabase] browser client created')
    }
  }
  return g._supabaseBrowser
}

export const supabase = getSupabaseClient()

// Destruye el singleton en logout para limpiar la sesión en memoria
export const resetSupabaseClient = (): void => {
  g._supabaseBrowser = undefined
  if (process.env.NODE_ENV === 'development') {
    console.log('[supabase] browser client reset')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server client — autenticado con JWT del usuario (RLS activo)
// Usar para TODAS las llamadas de usuario normal desde route handlers
// ─────────────────────────────────────────────────────────────────────────────

export const createSupabaseServerClientWithToken = (token: string): SupabaseClient =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  })

// ─────────────────────────────────────────────────────────────────────────────
// Server client — service role (bypasea RLS)
// SOLO para el path interno WhatsApp donde ya se validó INTERNAL_API_SECRET.
// Requiere SUPABASE_SERVICE_ROLE_KEY en variables de entorno del servidor
// (sin NEXT_PUBLIC_ — nunca llega al browser).
//
// Si la variable no está definida lanza en runtime para evitar silenciar
// el error y terminar usando anonKey sin darse cuenta.
// ─────────────────────────────────────────────────────────────────────────────

export const createSupabaseServiceClient = (): SupabaseClient => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY no está definida. ' +
      'Agregala en las variables de entorno del servidor (sin NEXT_PUBLIC_).'
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Alias legacy — evita romper imports existentes en route.ts
// Se mantiene pero internamente ahora llama a createSupabaseServiceClient
// SOLO cuando se usa desde el path interno. Ver route.ts para el contexto.
export const createSupabaseServerClient = (): SupabaseClient =>
  createSupabaseServiceClient()

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface DatabaseTransaction {
  id:               string
  description:      string
  amount:           number
  category:         string
  type:             'gasto' | 'ingreso'
  transaction_date: string
  created_at:       string
  updated_at:       string
  confirmed:        boolean
  source:           'voice' | 'text' | 'manual'
  original_message?: string
  ai_confidence?:   number
  user_id?:         string
  budget_id?:       string
  goal_id?:         string
}

export interface TransactionInsert {
  description:       string
  amount:            number
  category:          string
  type:              'gasto' | 'ingreso'
  transaction_date?: string
  confirmed?:        boolean
  source?:           'voice' | 'text' | 'manual'
  original_message?: string
  ai_confidence?:    number
  user_id?:          string
  budget_id?:        string
  goal_id?:          string
  account_id?:       string | null
  installment_count?: number
  first_due_month?:  string
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejo de errores
// ─────────────────────────────────────────────────────────────────────────────

export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?:    string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'SupabaseError'
  }
}

export const handleSupabaseError = (error: unknown): SupabaseError => {
  const e = error as { code?: string; message?: string; details?: unknown }

  // En producción: solo loguear código y mensaje, nunca el objeto completo
  // (puede contener queries SQL o detalles de schema)
  if (process.env.NODE_ENV === 'production') {
    console.error('[supabase] error', { code: e.code, message: e.message })
  } else {
    console.error('[supabase] error (dev)', error)
  }

  if (e.code) {
    switch (e.code) {
      case '23505': return new SupabaseError('Registro duplicado',           e.code, e.details)
      case '23503': return new SupabaseError('Violación de clave foránea',   e.code, e.details)
      case '23514': return new SupabaseError('Violación de constraint',      e.code, e.details)
      case 'PGRST116': return new SupabaseError('Registro no encontrado',    e.code, e.details)
      default:      return new SupabaseError(e.message ?? 'Error desconocido de Supabase', e.code, e.details)
    }
  }

  return new SupabaseError(e.message ?? 'Error desconocido de Supabase')
}

export default getSupabaseClient

// Desconectar realtime — la app no usa subscriptions en tiempo real
supabase.realtime.disconnect()