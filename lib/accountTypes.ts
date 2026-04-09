// ============================================================
// AI Wallet — Configuración unificada de tipos de cuenta
// lib/accountTypes.ts
//
// ÚNICA fuente de verdad para tipos, labels, comportamiento e iconos.
// Tanto el modal como el panel importan desde acá.
// ============================================================

export type AccountDbType = 'liquid' | 'credit' | 'savings';

/**
 * Tipos de cuenta tal como el USUARIO los entiende.
 * 'cash' y 'digital' son ambos liquid en Supabase —
 * los distinguimos en UI para mejorar la claridad.
 */
export type AccountUiKind = 'digital' | 'cash' | 'credit' | 'savings';

export interface AccountKindConfig {
  kind: AccountUiKind;
  dbType: AccountDbType;
  emoji: string;
  label: string;
  sublabel: string;
  /** Placeholder para el campo nombre */
  namePlaceholder: string;
  /** Label del campo de balance */
  balanceLabel: string;
  /** Hint del campo de balance */
  balanceHint: string;
  /** ¿Muestra campos de tarjeta (límite, cierre, vencimiento)? */
  isCreditCard: boolean;
  /** ¿El balance se edita inline en el panel? */
  inlineEditable: boolean;
  /** Color del balance en el panel */
  balanceColor: 'green' | 'red' | 'neutral';
}

export const ACCOUNT_KINDS: AccountKindConfig[] = [
  {
    kind: 'digital',
    dbType: 'liquid',
    emoji: '🏦',
    label: 'Cuenta digital / banco',
    sublabel: 'Mercado Pago, Brubank, Santander...',
    namePlaceholder: 'Ej: Mercado Pago, Brubank, Galicia',
    balanceLabel: '¿Cuánto tenés ahí ahora?',
    balanceHint: 'El saldo que ves en la app o en el cajero',
    isCreditCard: false,
    inlineEditable: true,
    balanceColor: 'green',
  },
  {
    kind: 'cash',
    dbType: 'liquid',
    emoji: '💵',
    label: 'Efectivo',
    sublabel: 'La plata en tu billetera',
    namePlaceholder: 'Efectivo',
    balanceLabel: '¿Cuánto llevás encima?',
    balanceHint: 'Podés actualizarlo cada vez que cambie',
    isCreditCard: false,
    inlineEditable: true,
    balanceColor: 'green',
  },
  {
    kind: 'credit',
    dbType: 'credit',
    emoji: '💳',
    label: 'Tarjeta de crédito',
    sublabel: 'Visa, Mastercard, Naranja X...',
    namePlaceholder: 'Ej: Visa Galicia, Naranja X, BBVA',
    balanceLabel: '¿Cuánto debés hoy?',
    balanceHint: 'Lo que ya gastaste y todavía no pagaste',
    isCreditCard: true,
    inlineEditable: false,
    balanceColor: 'red',
  },
  {
    kind: 'savings',
    dbType: 'savings',
    emoji: '🏦',
    label: 'Caja de ahorro',
    sublabel: 'Plazo fijo, cripto, dólares...',
    namePlaceholder: 'Ej: Plazo fijo, Dólares, USDT',
    balanceLabel: '¿Cuánto tenés guardado?',
    balanceHint: 'No impacta en tu disponible del día a día',
    isCreditCard: false,
    inlineEditable: true,
    balanceColor: 'neutral',
  },
];

export const KIND_BY_VALUE = Object.fromEntries(
  ACCOUNT_KINDS.map(k => [k.kind, k])
) as Record<AccountUiKind, AccountKindConfig>;

/** Inferir el kind UI desde el tipo Supabase + contexto (para el panel) */
export function inferKind(dbType: AccountDbType, name: string): AccountKindConfig {
  if (dbType === 'credit')  return KIND_BY_VALUE.credit;
  if (dbType === 'savings') return KIND_BY_VALUE.savings;
  // liquid: diferenciar efectivo por nombre
  const isCash = /efectivo|cash|billetera física/i.test(name);
  return isCash ? KIND_BY_VALUE.cash : KIND_BY_VALUE.digital;
}

// ─── Paleta compartida ────────────────────────────────────────────────────────
export const PALETTE = {
  bg:      '#09100D',
  surface: '#111916',
  card:    '#161F1B',
  border:  'rgba(255,255,255,0.06)',
  green:   '#00E676',
  greenDim:'rgba(0,230,118,0.12)',
  yellow:  '#FFD740',
  red:     '#FF5252',
  redDim:  'rgba(255,82,82,0.12)',
  white:   '#FFFFFF',
  dim:     'rgba(255,255,255,0.35)',
  mid:     'rgba(255,255,255,0.65)',
} as const;
