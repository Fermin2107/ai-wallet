// ============================================================
// AI Wallet — Tipos centralizados
// ============================================================

export interface Transaction {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string;
  categoria: Categoria;
  tipo: 'gasto' | 'ingreso';
  confirmado: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  esGasto: boolean;
}

export interface Budget {
  categoriaId: string;
  limite: number;
  gastado: number;
  periodo: 'mensual' | 'semanal' | 'anual';
  monthPeriod?: string;
}

export interface Goal {
  id: string;
  titulo: string;
  icono: string;
  montoActual: number;
  montoObjetivo: number;
  fechaLimite?: string;
  color: string;
}

export interface Insight {
  id: string;
  tipo: 'patron' | 'suscripcion' | 'prediccion' | 'consejo';
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  datos?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  transaction?: Transaction;
  actionableCard?: ActionableCard;
}

export interface ActionableCard {
  transaction: Transaction;
  consejo: string;
  categoria: Categoria;
}

// ─── CUENTAS ──────────────────────────────────────────────────────────────────

/**
 * Representa una cuenta del usuario.
 *
 * Semántica de `balance` según tipo:
 *   - liquid / savings : saldo disponible (positivo = tiene plata)
 *   - credit           : deuda actual (positivo = debe esa cantidad)
 *
 * `disponible_tarjeta` = credit_limit - balance  (calculado en hook)
 */
export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'liquid' | 'credit' | 'savings';
  balance: number;
  currency: string;
  credit_limit?: number;
  closing_day?: number;
  due_day?: number;
  color?: string;
  icon?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface Installment {
  id: string;
  transaction_id: string;
  account_id: string;
  user_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  due_month: string; // YYYY-MM
  is_paid: boolean;
  created_at: string;
}

/**
 * Resumen financiero calculado a partir de las cuentas.
 *
 * realDisponible = totalLiquid - totalCreditDebt
 *   (efectivo en mano menos deuda de tarjetas)
 *
 * availableCredit = totalCreditLimit - totalCreditDebt
 *   (cuánto queda disponible en tarjetas para gastar)
 */
export interface AccountSummary {
  totalLiquid: number;            // suma balances liquid
  totalSavings: number;           // suma balances savings
  totalCreditDebt: number;        // suma deuda actual credit (balance)
  totalCreditLimit: number;       // suma credit_limit de todas las credit
  availableCredit: number;        // totalCreditLimit - totalCreditDebt
  realDisponible: number;         // totalLiquid - totalCreditDebt
  installmentsThisMonth: number;  // suma cuotas que vencen este mes
}

// ─── API DE CHAT ───────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  current_date: string;
  currentGoals: Goal[];
  currentBudgets: Budget[];
}

export interface ChatResponse {
  action:
    | 'INSERT_TRANSACTION'
    | 'CREATE_GOAL'
    | 'UPDATE_GOAL_PROGRESS'
    | 'QUERY_BUDGET'
    | 'QUERY_GOALS'
    | 'QUERY_TRANSACTIONS'
    | 'CREATE_ACCOUNT'
    | 'UPDATE_ACCOUNT_BALANCE'
    | 'CREATE_BUDGET'
    | 'PLAN_MENSUAL'
    | 'RESPUESTA_CONSULTA'
    | 'NEEDS_ACCOUNT_SELECTION'
    | 'ERROR';
  mensaje_respuesta: string;
  data: {
    // INSERT_TRANSACTION
    description?: string;
    amount?: number;
    type?: 'gasto' | 'ingreso';
    category?: string;
    transaction_date?: string;
    confirmed?: boolean;
    installment_count?: number;
    first_due_month?: string;
    account_id?: string | null;

    // CREATE_GOAL
    name?: string;
    target_amount?: number;
    current_amount?: number;
    target_date?: string;
    icon?: string;
    color?: string;

    // UPDATE_GOAL_PROGRESS
    goal_name?: string;
    create_if_missing?: boolean;

    // CREATE_ACCOUNT
    account_type?: 'liquid' | 'credit' | 'savings';
    balance?: number;
    credit_limit?: number;
    closing_day?: number;
    due_day?: number;
    set_as_default?: boolean;

    // UPDATE_ACCOUNT_BALANCE
    account_name?: string;
    new_balance?: number;

    // CREATE_BUDGET
    limit_amount?: number;
    month_period?: string;

    // PLAN_MENSUAL
    ingreso_detectado?: number;
    meses?: number;
    distribucion?: {
      ahorro: number;
      categorias: Record<string, number>;
      libre: number;
    };

    // NEEDS_ACCOUNT_SELECTION
    accounts?: Array<{ id: string; name: string; type: string }>;
    pending_message?: string;

    // Consultas
    query_type?: string;
    filters?: Record<string, unknown>;
    query_result?: unknown;
  };
  ui?: {
    type: 'progress_bar' | 'category_chips' | 'goal_card' | 'budget_alert' | 'daily_limit' | 'plan_mensual';
    data: Record<string, unknown>;
  };
}

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────

export const CATEGORIAS_FIJAS = [
  'alimentacion',
  'transporte',
  'salidas',
  'servicios',
  'suscripciones',
  'salud',
  'ropa',
  'sueldo',
  'ahorro',
  'otros',
] as const;

export type CategoriaFija = (typeof CATEGORIAS_FIJAS)[number];

export const CATEGORIA_EMOJI: Record<string, string> = {
  alimentacion: '🍔',
  transporte: '🚌',
  salidas: '🍻',
  servicios: '💡',
  suscripciones: '📱',
  salud: '🏥',
  ropa: '👕',
  sueldo: '💼',
  ahorro: '💰',
  otros: '📦',
};

export interface TransaccionesPorFecha {
  fecha: string;
  etiqueta: string;
  transacciones: Transaction[];
}

export const agruparTransaccionesPorFecha = (
  transacciones: Transaction[]
): TransaccionesPorFecha[] => {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);

  const grupos: { [key: string]: Transaction[] } = {};

  transacciones.forEach((transaccion) => {
    const fechaTransaccion = new Date(transaccion.fecha);
    let etiqueta = '';

    const fechaSoloDia = new Date(
      fechaTransaccion.getFullYear(),
      fechaTransaccion.getMonth(),
      fechaTransaccion.getDate()
    );
    const hoySoloDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const ayerSoloDia = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate());

    if (fechaSoloDia.getTime() === hoySoloDia.getTime()) {
      etiqueta = 'Hoy';
    } else if (fechaSoloDia.getTime() === ayerSoloDia.getTime()) {
      etiqueta = 'Ayer';
    } else {
      const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      etiqueta = `${diasSemana[fechaTransaccion.getDay()]} ${fechaTransaccion.getDate()}`;
    }

    if (!grupos[etiqueta]) grupos[etiqueta] = [];
    grupos[etiqueta].push(transaccion);
  });

  return Object.entries(grupos)
    .map(([etiqueta, txs]) => ({
      fecha: txs[0].fecha,
      etiqueta,
      transacciones: txs.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      ),
    }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
};

export const CATEGORIA_DISPLAY: Record<string, string> = {
  alimentacion: 'Alimentación',
  transporte: 'Transporte',
  salidas: 'Salidas',
  servicios: 'Servicios',
  salud: 'Salud',
  educacion: 'Educación',
  entretenimiento: 'Entretenimiento',
  suscripciones: 'Suscripciones',
  ropa: 'Ropa',
  hobbies: 'Hobbies',
  mascotas: 'Mascotas',
  gym: 'Gym',
  viajes: 'Viajes',
  ahorro: 'Ahorro',
  ingreso: 'Ingreso',
  otros: 'Otros',
};

export function formatCategoria(cat: string): string {
  if (!cat) return 'Otros';
  const key = cat.toLowerCase().trim();
  return (
    CATEGORIA_DISPLAY[key] ||
    cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()
  );
}

export type {
  FinancialPatterns,
  PatronesDiaSemana,
  ComparativaMeses,
  Recurrente,
  GastosHormiga,
  Tendencia3Meses,
  NombreDia,
} from './financial-patterns'
