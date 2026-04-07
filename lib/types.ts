// Estructura de datos centralizada para la billetera

export interface Transaction {
  id: string;
  fecha: string; // formato: '2024-03-31'
  monto: number;
  descripcion: string;
  categoria: Categoria;
  tipo: 'gasto' | 'ingreso';
  confirmado: boolean; // para permitir deshacer
}

export interface Categoria {
  id: string;
  nombre: string;
  icono: string; // emoji o nombre de icono
  color: string; // clase de color Tailwind
  esGasto: boolean;
}

// Nuevos tipos para la arquitectura modular
export interface Budget {
  categoriaId: string;
  limite: number;
  gastado: number;
  periodo: 'mensual' | 'semanal' | 'anual';
  monthPeriod?: string; // YYYY-MM format para filtrado por mes
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
  datos?: any;
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

// Tipos para la API de chat (actualizado para asistente integral)
export interface ChatRequest {
  message: string;
  current_date: string; // formato: '2024-03-31'
  currentGoals: Goal[];
  currentBudgets: Budget[];
}

export interface ChatResponse {
  action: 'INSERT_TRANSACTION' | 'CREATE_GOAL' | 'UPDATE_GOAL_PROGRESS' | 'QUERY_BUDGET' | 'QUERY_GOALS' | 'QUERY_TRANSACTIONS' | 'ERROR';
  mensaje_respuesta: string;
  data: {
    // Para INSERT_TRANSACTION
    monto?: number;
    descripcion?: string;
    categoria?: string;
    tipo?: 'gasto' | 'ingreso';
    fecha?: string;
    
    // Para CREATE_GOAL
    name?: string;
    target_amount?: number;
    current_amount?: number;
    target_date?: string;
    description?: string;
    icon?: string;
    color?: string;
    
    // Para UPDATE_GOAL_PROGRESS
    goal_name?: string;
    amount?: number;
    create_if_missing?: boolean;
    
    // Para consultas
    query_type?: string;
    filters?: Record<string, any>;
    query_result?: any; // Resultado de consultas
  };
}

// Categorías fijas para que la IA no invente nombres
export const CATEGORIAS_FIJAS = [
  'alimentacion',    // comida, super, delivery, restaurante
  'transporte',      // nafta, colectivo, uber, taxi, auto
  'salidas',         // bares, entretenimiento, cine, salidas
  'servicios',       // luz, gas, agua, internet, telefono
  'suscripciones',   // netflix, spotify, gimnasio, apps
  'salud',           // farmacia, medico, dentista
  'ropa',            // indumentaria, zapatillas, accesorios
  'sueldo',          // ingreso mensual, cobro
  'ahorro',          // transferencia a ahorro, meta
  'otros',           // todo lo que no entra en las anteriores
] as const;

export type CategoriaFija = typeof CATEGORIAS_FIJAS[number];

// Emoji mapping unificado
export const CATEGORIA_EMOJI: Record<string, string> = {
  alimentacion: '🍔',
  transporte: '🚌',
  salidas: '�',
  servicios: '💡',
  suscripciones: '📱',
  salud: '🏥',
  ropa: '👕',
  sueldo: '💼',
  ahorro: '💰',
  otros: '📦',
};

// Agrupar transacciones por fecha
export interface TransaccionesPorFecha {
  fecha: string;
  etiqueta: string; // 'Hoy', 'Ayer', 'Lunes 25', etc.
  transacciones: Transaction[];
}

export const agruparTransaccionesPorFecha = (transacciones: Transaction[]): TransaccionesPorFecha[] => {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  
  const grupos: { [key: string]: Transaction[] } = {};
  
  transacciones.forEach(transaccion => {
    const fechaTransaccion = new Date(transaccion.fecha);
    let etiqueta = '';
    
    // Comparar fechas sin tener en cuenta la hora
    const fechaTransaccionSoloDia = new Date(fechaTransaccion.getFullYear(), fechaTransaccion.getMonth(), fechaTransaccion.getDate());
    const hoySoloDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const ayerSoloDia = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate());
    
    if (fechaTransaccionSoloDia.getTime() === hoySoloDia.getTime()) {
      etiqueta = 'Hoy';
    } else if (fechaTransaccionSoloDia.getTime() === ayerSoloDia.getTime()) {
      etiqueta = 'Ayer';
    } else {
      const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      etiqueta = `${diasSemana[fechaTransaccion.getDay()]} ${fechaTransaccion.getDate()}`;
    }
    
    if (!grupos[etiqueta]) {
      grupos[etiqueta] = [];
    }
    grupos[etiqueta].push(transaccion);
  });
  
  return Object.entries(grupos).map(([etiqueta, transacciones]) => ({
    fecha: transacciones[0].fecha,
    etiqueta,
    transacciones: transacciones.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  })).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
};

// Mapa de normalización de categorías — usar en toda la UI
export const CATEGORIA_DISPLAY: Record<string, string> = {
  alimentacion:   'Alimentación',
  transporte:     'Transporte',
  salidas:        'Salidas',
  servicios:      'Servicios',
  salud:          'Salud',
  educacion:      'Educación',
  entretenimiento: 'Entretenimiento',
  suscripciones:  'Suscripciones',
  ropa:           'Ropa',
  hobbies:        'Hobbies',
  mascotas:       'Mascotas',
  gym:            'Gym',
  viajes:         'Viajes',
  ahorro:         'Ahorro',
  ingreso:        'Ingreso',
  otros:          'Otros',
}

export function formatCategoria(cat: string): string {
  if (!cat) return 'Otros'
  const key = cat.toLowerCase().trim()
  return CATEGORIA_DISPLAY[key] || 
    // Capitalizar primera letra si no está en el mapa
    cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()
}
