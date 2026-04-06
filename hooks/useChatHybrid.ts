import { useState, useCallback } from 'react';
import { ChatRequest, ChatResponse, Transaction, Goal, Budget } from '../lib/types';

interface ChatResponseData {
  mensaje_respuesta?: string;
  transacciones?: Array<{
    monto: number;
    descripcion: string;
    categoria: string;
    tipo: 'gasto' | 'ingreso';
    fecha?: string;
  }>;
  acciones_metas?: Array<{
    accion: string;
    monto?: number;
    meta_id?: string;
    nombre_nueva_meta?: string;
    nuevo_objetivo?: number;
  }>;
  acciones_presupuestos?: Array<{
    categoria: string;
    nuevo_limite?: number;
  }>;
}
import { useLocalStorage } from './useLocalStorage';

export function useChatHybrid() {
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('ai-wallet-transactions', []);
  const [goals, setGoals] = useLocalStorage<Goal[]>('ai-wallet-goals', []);
  const [budgets, setBudgets] = useLocalStorage<Budget[]>('ai-wallet-presupuestos', []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processMessage = useCallback(async (message: string): Promise<string> => {
    console.log('🚀 === INICIANDO PROCESAMIENTO DE MENSAJE ===');
    console.log('📝 Mensaje original:', message);
    console.log('📊 Estado actual:', { 
      transactionsCount: transactions.length,
      goalsCount: goals.length, 
      budgetsCount: budgets.length 
    });
    
    setIsLoading(true);
    setError(null);

    try {
      const request: ChatRequest = {
        message,
        current_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        currentGoals: goals,
        currentBudgets: budgets
      };

      console.log('📤 Enviando request a API:', request);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      console.log('📥 Response status:', response.status);

      const data: ChatResponseData = await response.json();

      if (!response.ok) {
        const errorText = (data as ChatResponseData).mensaje_respuesta;
        console.error('❌ Error en la llamada a la API:', response.status, errorText);
        
        // Fallback a procesamiento básico si OpenAI falla
        console.log('🔄 Haciendo fallback a procesamiento básico...');
        return processBasicMessage(message);
      }

      console.log('✅ === RESPUESTA RECIBIDA DE GROQ ===');
      console.log('🤖 Datos brutos de la API:', JSON.stringify(data, null, 2));
      console.log('� Mensaje de respuesta:', data.mensaje_respuesta);
      console.log('💰 Transacciones detectadas:', data.transacciones?.length || 0);

      // Procesar transacciones
      if ((data as ChatResponseData).transacciones && (data as ChatResponseData).transacciones!.length > 0) {
        console.log('💰 === PROCESANDO TRANSACCIONES ===');
        console.log('📊 Transacciones actuales en localStorage:', transactions.length);
        console.log('� Transacciones recibidas de la API:', (data as ChatResponseData).transacciones);
        
        const nuevasTransacciones = (data as ChatResponseData).transacciones!.map((tx: any, index: number) => {
          console.log(`🔍 Analizando transacción ${index + 1}:`, tx);
          
          // Validación robusta del monto
          let montoValidado = tx.monto;
          
          if (typeof montoValidado !== 'number' || isNaN(montoValidado)) {
            console.warn('⚠️ Monto inválido recibido:', montoValidado, 'tipo:', typeof montoValidado);
            montoValidado = 0; // Fallback a 0 si es inválido
          }
          
          if (montoValidado <= 0) {
            console.warn('⚠️ Monto cero o negativo:', montoValidado);
          }
          
          const transaction: Transaction = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            fecha: tx.fecha || new Date().toISOString().split('T')[0], // Usar fecha de la API o hoy
            monto: montoValidado,
            descripcion: tx.descripcion || 'Transacción sin descripción',
            categoria: getCategoriaPorNombre(tx.categoria),
            tipo: tx.tipo || 'expense',
            confirmado: false
          };
          
          console.log(`✅ Transacción ${index + 1} validada y creada:`, transaction);
          return transaction;
        });

        console.log('📝 === GUARDANDO TRANSACCIONES EN LOCALSTORAGE ===');
        console.log('💾 Transacciones a agregar:', nuevasTransacciones.length);
        console.log('💾 Estado anterior del localStorage:', transactions.length, 'transacciones');
        
        // Actualizar el estado
        setTransactions(prev => {
          const nuevoEstado = [...prev, ...nuevasTransacciones];
          console.log('💾 === TRANSACCIONES GUARDADAS ===');
          console.log('💾 Nuevo estado del localStorage:', nuevoEstado.length, 'transacciones');
          console.log('📋 Lista completa de transacciones:', nuevoEstado);
          
          // Verificación adicional
          console.log('🔍 Verificación: ¿Se guardaron correctamente?', 
            nuevoEstado.length === prev.length + nuevasTransacciones.length ? '✅ SÍ' : '❌ NO');
          
          return nuevoEstado;
        });
        
        console.log('✅ === RESUMEN DE TRANSACCIONES AGREGADAS ===');
        nuevasTransacciones.forEach((tx, index) => {
          console.log(`  ${index + 1}. $${tx.monto.toLocaleString('es-AR')} - ${tx.descripcion} (${tx.categoria.nombre})`);
        });
      } else {
        console.log('ℹ️ No se detectaron transacciones en la respuesta de la API');
      }

      // Procesar acciones sobre metas
      if ((data as ChatResponseData).acciones_metas && (data as ChatResponseData).acciones_metas!.length > 0) {
        console.log('🎯 Procesando acciones de metas:', (data as ChatResponseData).acciones_metas);
        (data as ChatResponseData).acciones_metas!.forEach((accion: any) => {
          if (accion.accion === 'crear' && accion.nombre_nueva_meta) {
            // Crear nueva meta
            const nuevaMeta: Goal = {
              id: Date.now().toString(),
              titulo: accion.nombre_nueva_meta,
              icono: '🎯',
              montoActual: accion.monto || 0,
              montoObjetivo: (accion.monto || 0) * 2, // Objetivo doble del aporte inicial
              color: 'text-emerald-500'
            };
            setGoals(prev => [...prev, nuevaMeta]);
            console.log('✅ Meta creada:', nuevaMeta);
          } else if (accion.accion === 'sumar' || accion.accion === 'restar') {
            // Actualizar meta existente
            setGoals(prev => prev.map(goal => 
              goal.id === accion.meta_id 
                ? { 
                    ...goal, 
                    montoActual: accion.accion === 'sumar' 
                      ? Math.min(goal.montoActual + (accion.monto || 0), goal.montoObjetivo)
                      : Math.max(goal.montoActual - (accion.monto || 0), 0)
                  }
                : goal
            ));
            console.log('✅ Meta actualizada:', accion);
          } else if (accion.accion === 'editar_objetivo' && accion.meta_id && accion.nuevo_objetivo) {
            // Editar objetivo de meta existente
            setGoals(prev => prev.map(goal => 
              goal.id === accion.meta_id 
                ? { ...goal, montoObjetivo: accion.nuevo_objetivo! }
                : goal
            ));
            console.log('✅ Objetivo de meta actualizado:', accion);
          } else if (accion.accion === 'eliminar' && accion.meta_id) {
            // Eliminar meta existente
            setGoals(prev => prev.filter(goal => goal.id !== accion.meta_id));
            console.log('✅ Meta eliminada:', accion);
          }
        });
      }

      // Procesar acciones sobre presupuestos
      if ((data as ChatResponseData).acciones_presupuestos && (data as ChatResponseData).acciones_presupuestos!.length > 0) {
        console.log('💰 Procesando acciones de presupuestos:', (data as ChatResponseData).acciones_presupuestos);
        (data as ChatResponseData).acciones_presupuestos!.forEach((accion: any) => {
          setBudgets(prev => prev.map(budget => 
            budget.categoriaId === accion.categoriaId 
              ? { ...budget, limite: accion.nuevoLimite }
              : budget
          ));
          console.log('✅ Presupuesto actualizado:', accion);
        });
      }

      return (data as ChatResponseData).mensaje_respuesta || 'Procesado correctamente';

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('💥 Error en processMessage:', err);
      setError(errorMessage);
      
      // Fallback a procesamiento básico
      console.log('🔄 Haciendo fallback a procesamiento básico...');
      return processBasicMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [transactions, goals, budgets]);

  // Función de fallback para procesamiento básico con análisis analítico
  function processBasicMessage(message: string): string {
    console.log('🤖 === INICIANDO PROCESAMIENTO BÁSICO (FALLBACK) ===');
    console.log('📝 Mensaje a procesar:', message);
    
    // Primero verificar si es una pregunta analítica
    const lowerMessage = message.toLowerCase();
    
    // Análisis de gastos por categoría
    if (lowerMessage.includes('cuánto gasté') || lowerMessage.includes('cuanto gaste')) {
      console.log('📊 Consulta: análisis de gastos por categoría');
      
      if (lowerMessage.includes('comida') || lowerMessage.includes('alimentación')) {
        const gastosComida = transactions
          .filter(t => t.tipo === 'gasto' && (t.categoria.nombre.toLowerCase().includes('comida') || t.categoria.nombre.toLowerCase().includes('alimentación')))
          .reduce((sum, t) => sum + t.monto, 0);
        console.log('💰 Gastos en alimentación calculados:', gastosComida);
        return `💰 Gastaste $${gastosComida.toLocaleString('es-AR')} en comida y alimentación.`;
      }
      
      if (lowerMessage.includes('transporte')) {
        const gastosTransporte = transactions
          .filter(t => t.tipo === 'gasto' && t.categoria.nombre.toLowerCase().includes('transporte'))
          .reduce((sum, t) => sum + t.monto, 0);
        console.log('💰 Gastos en transporte calculados:', gastosTransporte);
        return `🚗 Gastaste $${gastosTransporte.toLocaleString('es-AR')} en transporte.`;
      }
      
      // Gasto total
      const gastosTotales = transactions
        .filter(t => t.tipo === 'gasto')
        .reduce((sum, t) => sum + t.monto, 0);
      console.log('💰 Gastos totales calculados:', gastosTotales);
      return `💰 Gastaste un total de $${gastosTotales.toLocaleString('es-AR')} en todos tus gastos.`;
    }
    
    // Gasto más grande
    if (lowerMessage.includes('gasto más grande') || lowerMessage.includes('gasto mas grande')) {
      if (transactions.length === 0) return '❌ No hay transacciones registradas.';
      
      const gastoMasGrande = transactions
        .filter(t => t.tipo === 'gasto')
        .sort((a, b) => b.monto - a.monto)[0];
      
      if (gastoMasGrande) {
        return `🔥 Tu gasto más grande fue $${gastoMasGrande.monto.toLocaleString('es-AR')} en ${gastoMasGrande.descripcion} (${gastoMasGrande.categoria.nombre}) el ${gastoMasGrande.fecha}.`;
      }
      return '❌ No tienes gastos registrados.';
    }
    
    // Ingresos
    if (lowerMessage.includes('cuánto ingresé') || lowerMessage.includes('cuanto ingrese') || lowerMessage.includes('cuánto gané')) {
      const ingresosTotales = transactions
        .filter(t => t.tipo === 'ingreso')
        .reduce((sum, t) => sum + t.monto, 0);
      return `💵 Ingresaste un total de $${ingresosTotales.toLocaleString('es-AR')}.`;
    }
    
    // Balance
    if (lowerMessage.includes('balance') || lowerMessage.includes('cuánto tengo') || lowerMessage.includes('cuanto tengo')) {
      const ingresos = transactions
        .filter(t => t.tipo === 'ingreso')
        .reduce((sum, t) => sum + t.monto, 0);
      const gastos = transactions
        .filter(t => t.tipo === 'gasto')
        .reduce((sum, t) => sum + t.monto, 0);
      const balance = ingresos - gastos;
      
      return `💰 Tu balance actual es $${balance.toLocaleString('es-AR')} (Ingresos: $${ingresos.toLocaleString('es-AR')} - Gastos: $${gastos.toLocaleString('es-AR')}).`;
    }
    
    // Categoría de mayor gasto
    if (lowerMessage.includes('categoría') || lowerMessage.includes('categoria')) {
      if (lowerMessage.includes('mayor gasto') || lowerMessage.includes('mayor gasto')) {
        const gastosPorCategoria = transactions
          .filter(t => t.tipo === 'gasto')
          .reduce((acc, t) => {
            acc[t.categoria.nombre] = (acc[t.categoria.nombre] || 0) + t.monto;
            return acc;
          }, {} as Record<string, number>);
        
        const categoriaMayor = Object.entries(gastosPorCategoria)
          .sort(([,a], [,b]) => b - a)[0];
        
        if (categoriaMayor) {
          return `🏆 Tu categoría de mayor gasto es ${categoriaMayor[0]} con $${categoriaMayor[1].toLocaleString('es-AR')}.`;
        }
        return '❌ No tienes gastos registrados.';
      }
    }
    
    // Número de transacciones
    if (lowerMessage.includes('cuántas transacciones') || lowerMessage.includes('cuantas transacciones')) {
      return `📊 Realizaste ${transactions.length} transacciones en total.`;
    }
    
    // Patrones mejorados para detección por contexto (sin palabras clave)
    const contextoGastoPatterns = [
      // Contextos de alimentación
      /(?:fui al|estuve en|pasé por|comí en|almorcé|cenen|desayuné|meriendé|tomé)\s+(?:super|supermercado|mercado|restauran|local|bar|cafetería|kiosco|almacén|verduría|carnicería|panadería)[\s,]*(?:y me salió|por|costó)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:super|mercado|restauran|comida|almuerzo|cena|desayuno|café|helado|empanada|pizza|hamburguesa|pollo|sushi)[\s,]*(?:me salió|costó|valió|pagué)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Contextos de transporte
      /(?:cargué|eché|puse)\s+(?:nafta|gasolina|combustible)[\s,]*(?:por|de)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:pagué|cargué|usé)\s+(?:el|la)?\s*(?:sube|colectivo|subte|tren|taxi|uber|cabify|remis)[\s,]*(?:por|de)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:estacionamiento|peaje|mantenimiento|servicio)\s+(?:del|de la)?\s*(?:auto|coche|vehículo)[\s,]*(?:costó|valió)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Contextos de compras generales
      /(?:compré|me compré|gasté en|tiré|usé)\s+(?:ropa|zapatillas|calzado|jeans|pantalón|remera|camisa|vestido|bolso|accesorio)[\s,]*(?:por|de)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:compré|me gasté|dejé)\s+(?:en|por)?\s*\$?(\d+(?:\.\d+)?)\s*(?:en|para|por)\s*(?:ropa|compras|mercado|centro|negocio|tienda)/i,
      
      // Contextos de servicios
      /(?:pagué|aboné)\s+(?:la|el)?\s*(?:luz|gas|agua|internet|teléfono|expensas|cuota|factura|alquiler|impuesto|abl|seguro)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Contextos de ocio
      /(?:fui al|estuve en|salí a|fui a)\s+(?:cine|teatro|concierto|recital|show|boliche|bolich|fiesta|evento)[\s,]*(?:y me salió|por|costó)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:entradas|boletos|tickets)\s+(?:para|de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Expresiones rioplatenses
      /(?:me patinaste|me patinaron|perdí|se me fue|se me cayó)\s+\$?(\d+(?:\.\d+)?)/i,
      /(?:tiré|dejar|gasté|usé)\s+\$?(\d+(?:\.\d+)?)\s*(?:en|para|por)\s*(?:ropa|joda|salida|fiesta|boliche|cine)/i,
      /(?:hice|armé|preparé)\s+(?:un\s+)?(?:asado|bbq|parrillada)[\s,]*(?:y me salió|por|costó)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:chori|chorizo|choripán|bondiola|costillita|vacío|matambre)[\s,]*(?:con\s+)?(?:papas|fritas|ensalada)[\s,]*(?:por|de)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Patrones genéricos con contexto
      /(?:me salió|costó|valió|pagué|dejé)\s+\$?(\d+(?:\.\d+)?)(?:\s+(?:en|para|por)\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+))?/i,
      /(?:fui a|estuve en|pasé por)\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)[\s,]*(?:y me salió|por|costó)?\s*\$?(\d+(?:\.\d+)?)/i
    ];

    const contextoIngresoPatterns = [
      // Ingresos laborales
      /(?:me depositaron|me cayeron|me pagaron|recibí|cobré)\s+(?:el\s+)?(?:sueldo|salario|aguinaldo|bonificación|pago|haber|remuneración)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:me cayeron|llegaron|recibí)\s+(?:los\s+)?(?:mangos|lucas|pesos|billetes|guita|plata)[\s,]*(?:del\s+)?(?:laburo|trabajo|cliente|proyecto)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:me pagaron|cobré|recibí)\s+(?:un\s+)?(?:freelance|proyecto|trabajo|servicio|consultoría)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      
      // Otros ingresos
      /(?:me regalaron|regaló|regalaron)\s+(?:guita|plata|dinero|mangos|lucas)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i,
      /(?:recibí|cobré)\s+(?:una\s+)?(?:renta|dividendo|interés|ganancia|beneficio)[\s,]*(?:de|por)?\s*\$?(\d+(?:\.\d+)?)/i
    ];

    // Patrones para montos en palabras
    const montoPalabrasPatterns = [
      { pattern: /un palo/gi, value: 1000000 },
      { pattern: /dos palos/gi, value: 2000000 },
      { pattern: /tres palos/gi, value: 3000000 },
      { pattern: /un luca/gi, value: 1000 },
      { pattern: /dos lucas/gi, value: 2000 },
      { pattern: /tres lucas/gi, value: 3000 },
      { pattern: /cuatro lucas/gi, value: 4000 },
      { pattern: /cinco lucas/gi, value: 5000 },
      { pattern: /diez lucas/gi, value: 10000 },
      { pattern: /un mango/gi, value: 1000 },
      { pattern: /dos mangos/gi, value: 2000 },
      { pattern: /tres mangos/gi, value: 3000 },
      { pattern: /cinco mangos/gi, value: 5000 },
      { pattern: /diez mangos/gi, value: 10000 },
      { pattern: /cien/gi, value: 100 },
      { pattern: /doscientos/gi, value: 200 },
      { pattern: /trescientos/gi, value: 300 },
      { pattern: /cuatrocientos/gi, value: 400 },
      { pattern: /quinientos/gi, value: 500 },
      { pattern: /seiscientos/gi, value: 600 },
      { pattern: /setecientos/gi, value: 700 },
      { pattern: /ochocientos/gi, value: 800 },
      { pattern: /novecientos/gi, value: 900 },
      { pattern: /mil/gi, value: 1000 },
      { pattern: /dos mil/gi, value: 2000 },
      { pattern: /tres mil/gi, value: 3000 },
      { pattern: /cuatro mil/gi, value: 4000 },
      { pattern: /cinco mil/gi, value: 5000 },
      { pattern: /seis mil/gi, value: 6000 },
      { pattern: /siete mil/gi, value: 7000 },
      { pattern: /ocho mil/gi, value: 8000 },
      { pattern: /nueve mil/gi, value: 9000 },
      { pattern: /diez mil/gi, value: 10000 }
    ];

    // Función para convertir montos en palabras a números
    function convertirMonto(texto: string): number {
      let resultado = texto;
      montoPalabrasPatterns.forEach(({ pattern, value }) => {
        resultado = resultado.replace(pattern, value.toString());
      });
      return parseFloat(resultado) || 0;
    }

    // Procesar patrones de contexto para gastos
    for (const pattern of contextoGastoPatterns) {
      const match = message.match(pattern);
      if (match) {
        console.log('🎯 === PATRÓN DE GASTO DETECTADO (PROCESAMIENTO BÁSICO) ===');
        console.log('🔍 Patrón coincidente:', pattern);
        console.log('🔍 Match encontrado:', match);
        
        let monto = parseFloat(match[1]) || 0;
        let descripcion = match[2] || match[1] || 'gasto';
        
        // Si el monto es 0, intentar convertir desde palabras
        if (monto === 0) {
          monto = convertirMonto(message);
          console.log('💱 Monto convertido desde palabras:', monto);
        }
        
        if (monto > 0) {
          const categoria = getCategoriaPorNombre(descripcion);
          const nuevaTransaccion: Transaction = {
            id: Date.now().toString(),
            fecha: new Date().toISOString().split('T')[0],
            monto,
            descripcion: descripcion.trim(),
            categoria,
            tipo: 'gasto',
            confirmado: false
          };
          
          console.log('💾 === GUARDANDO TRANSACCIÓN DESDE PROCESAMIENTO BÁSICO ===');
          console.log('💾 Transacción a guardar:', nuevaTransaccion);
          
          setTransactions(prev => {
            const nuevoEstado = [...prev, nuevaTransaccion];
            console.log('💾 Transacción guardada. Total:', nuevoEstado.length);
            return nuevoEstado;
          });
          
          console.log('✅ Gasto detectado por contexto:', nuevaTransaccion);
          return `¡Listo! Registré un gasto de $${monto.toLocaleString('es-AR')} en ${categoria.nombre}.`;
        }
      }
    }

    // Procesar patrones de contexto para ingresos
    for (const pattern of contextoIngresoPatterns) {
      const match = message.match(pattern);
      if (match) {
        console.log('🎯 === PATRÓN DE INGRESO DETECTADO (PROCESAMIENTO BÁSICO) ===');
        console.log('🔍 Patrón coincidente:', pattern);
        console.log('🔍 Match encontrado:', match);
        
        let monto = parseFloat(match[1]) || 0;
        let descripcion = match[2] || 'ingreso';
        
        // Si el monto es 0, intentar convertir desde palabras
        if (monto === 0) {
          monto = convertirMonto(message);
          console.log('💱 Monto convertido desde palabras:', monto);
        }
        
        if (monto > 0) {
          const categoria = getCategoriaPorNombre(descripcion);
          const nuevaTransaccion: Transaction = {
            id: Date.now().toString(),
            fecha: new Date().toISOString().split('T')[0],
            monto,
            descripcion: descripcion.trim(),
            categoria,
            tipo: 'ingreso',
            confirmado: false
          };
          
          console.log('💾 === GUARDANDO TRANSACCIÓN DESDE PROCESAMIENTO BÁSICO ===');
          console.log('💾 Transacción a guardar:', nuevaTransaccion);
          
          setTransactions(prev => {
            const nuevoEstado = [...prev, nuevaTransaccion];
            console.log('💾 Transacción guardada. Total:', nuevoEstado.length);
            return nuevoEstado;
          });
          
          console.log('✅ Ingreso detectado por contexto:', nuevaTransaccion);
          return `¡Perfecto! Registré un ingreso de $${monto.toLocaleString('es-AR')} por ${categoria.nombre}.`;
        }
      }
    }

    // Patrones tradicionales como fallback
    const transaccionPattern = /(?:gasté|me tiré|pagué|compré|gaste|tiré|pagué|compré|use|consumí)\s+\$?(\d+(?:\.\d+)?)\s*(?:en|por|para|de)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i;
    const ingresoPattern = /(?:recibí|gané|cobré|me pagaron|depositaron|ingresé)\s+\$?(\d+(?:\.\d+)?)\s*(?:de|por|en)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i;
    
    // Patrones más flexibles para metas
    const metaPattern = /(?:guardá|guardar|aportá|aportar|sumá|sumar|depositá|depositar)\s+\$?(\d+(?:\.\d+)?)\s*(?:para|a|en)\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i;
    const crearMetaPattern = /(?:creá|crear|agregá|agregar)\s+(?:una\s+)?meta\s+(?:para|de|del)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)(?:\s+con\s+\$?(\d+(?:\.\d+)?))?/i;
    const retirarPattern = /(?:retirá|retirar|sacá|sacar|quitá|quitar)\s+\$?(\d+(?:\.\d+)?)\s*(?:de|desde)\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i;
    const editarObjetivoPattern = /(?:cambiá|cambiar|modificá|modificar|actualizá|actualizar|poné|poner)\s+(?:el\s+)?objetivo\s+(?:de|del)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\s+(?:a|en)?\s*\$?(\d+(?:\.\d+)?)/i;
    const eliminarMetaPattern = /(?:eliminá|eliminar|borrá|borrar|sacá|sacar)\s+(?:la\s+)?meta\s+(?:de|del)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)/i;
    
    // Patrones más flexibles para presupuestos
    const presupuestoPattern = /(?:aumentá|aumentar|reducí|reducir|ajustá|ajustar|cambiá|cambiar)\s+(?:el\s+)?presupuesto\s+(?:de|del)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\s*(?:a|en)?\s*\$?(\d+(?:\.\d+)?)/i;
    
    const transaccionMatch = message.match(transaccionPattern);
    const ingresoMatch = message.match(ingresoPattern);
    const metaMatch = message.match(metaPattern);
    const crearMetaMatch = message.match(crearMetaPattern);
    const retirarMatch = message.match(retirarPattern);
    const editarObjetivoMatch = message.match(editarObjetivoPattern);
    const eliminarMetaMatch = message.match(eliminarMetaPattern);
    const presupuestoMatch = message.match(presupuestoPattern);
    
    // Procesar transacción de gasto
    if (transaccionMatch) {
      const monto = parseFloat(transaccionMatch[1]);
      const descripcion = transaccionMatch[2].trim();
      const categoria = getCategoriaPorNombre(descripcion);
      
      const nuevaTransaccion: Transaction = {
        id: Date.now().toString(),
        fecha: new Date().toISOString().split('T')[0],
        monto,
        descripcion,
        categoria,
        tipo: 'gasto',
        confirmado: false
      };
      
      setTransactions(prev => [...prev, nuevaTransaccion]);
      console.log('✅ Gasto registrado:', nuevaTransaccion);
      return `✅ Registré un gasto de $${monto.toLocaleString('es-AR')} en ${categoria.nombre}.`;
    }
    
    // Procesar transacción de ingreso
    if (ingresoMatch) {
      const monto = parseFloat(ingresoMatch[1]);
      const descripcion = ingresoMatch[2].trim();
      const categoria = getCategoriaPorNombre(descripcion);
      
      const nuevaTransaccion: Transaction = {
        id: Date.now().toString(),
        fecha: new Date().toISOString().split('T')[0],
        monto,
        descripcion,
        categoria,
        tipo: 'ingreso',
        confirmado: false
      };
      
      setTransactions(prev => [...prev, nuevaTransaccion]);
      console.log('✅ Ingreso registrado:', nuevaTransaccion);
      return `✅ Registré un ingreso de $${monto.toLocaleString('es-AR')} por ${categoria.nombre}.`;
    }
    
    // Procesar creación de meta
    if (crearMetaMatch) {
      const nombreMeta = crearMetaMatch[1].trim();
      const montoInicial = crearMetaMatch[2] ? parseFloat(crearMetaMatch[2]) : 0;
      
      const nuevaMeta: Goal = {
        id: Date.now().toString(),
        titulo: nombreMeta,
        icono: '🎯',
        montoActual: montoInicial,
        montoObjetivo: Math.max(montoInicial * 2, 50000), // Mínimo 50k si no hay monto inicial
        color: 'text-emerald-500'
      };
      
      setGoals(prev => [...prev, nuevaMeta]);
      console.log('✅ Meta creada:', nuevaMeta);
      
      if (montoInicial > 0) {
        return `✅ Creé la meta "${nombreMeta}" con un aporte inicial de $${montoInicial.toLocaleString('es-AR')}.`;
      } else {
        return `✅ Creé la meta "${nombreMeta}" con un objetivo de $${nuevaMeta.montoObjetivo.toLocaleString('es-AR')}.`;
      }
    }
    
    // Procesar retiro de meta
    if (retirarMatch) {
      const monto = parseFloat(retirarMatch[1]);
      const nombreMeta = retirarMatch[2].trim();
      
      // Buscar meta existente
      let metaExistente = goals.find(g => g.titulo.toLowerCase().includes(nombreMeta.toLowerCase()));
      
      if (metaExistente) {
        setGoals(prev => prev.map(goal => 
          goal.id === metaExistente.id 
            ? { ...goal, montoActual: Math.max(goal.montoActual - monto, 0) }
            : goal
        ));
        console.log('✅ Retiro de meta procesado:', { metaId: metaExistente.id, monto });
        return `✅ Retiré $${monto.toLocaleString('es-AR')} de tu meta "${metaExistente.titulo}".`;
      } else {
        return `❌ No encontré una meta llamada "${nombreMeta}".`;
      }
    }
    
    // Procesar meta (aportar a existente)
    if (metaMatch) {
      const monto = parseFloat(metaMatch[1]);
      const nombreMeta = metaMatch[2].trim();
      
      // Buscar meta existente o crear nueva
      let metaExistente = goals.find(g => g.titulo.toLowerCase().includes(nombreMeta.toLowerCase()));
      
      if (metaExistente) {
        setGoals(prev => prev.map(goal => 
          goal.id === metaExistente.id 
            ? { ...goal, montoActual: Math.min(goal.montoActual + monto, goal.montoObjetivo) }
            : goal
        ));
        console.log('✅ Aporte a meta procesado:', { metaId: metaExistente.id, monto });
        return `✅ Aporté $${monto.toLocaleString('es-AR')} a tu meta "${metaExistente.titulo}".`;
      } else {
        // Si no existe, crear nueva
        const nuevaMeta: Goal = {
          id: Date.now().toString(),
          titulo: nombreMeta,
          icono: '🎯',
          montoActual: monto,
          montoObjetivo: monto * 2,
          color: 'text-emerald-500'
        };
        setGoals(prev => [...prev, nuevaMeta]);
        console.log('✅ Meta creada automáticamente:', nuevaMeta);
        return `✅ Creé la meta "${nombreMeta}" con un aporte inicial de $${monto.toLocaleString('es-AR')}.`;
      }
    }
    
    // Procesar presupuesto
    if (presupuestoMatch) {
      const categoria = presupuestoMatch[1].trim();
      const nuevoLimite = parseFloat(presupuestoMatch[2]);
      const categoriaObj = getCategoriaPorNombre(categoria);
      
      setBudgets(prev => prev.map(budget => 
        budget.categoriaId === categoriaObj.id 
          ? { ...budget, limite: nuevoLimite }
          : budget
      ));
      console.log('✅ Presupuesto actualizado:', { categoria: categoriaObj.id, nuevoLimite });
      return `✅ Ajusté tu presupuesto de ${categoriaObj.nombre} a $${nuevoLimite.toLocaleString('es-AR')}.`;
    }
    
    // Procesar edición de objetivo de meta
    if (editarObjetivoMatch) {
      const nombreMeta = editarObjetivoMatch[1].trim();
      const nuevoObjetivo = parseFloat(editarObjetivoMatch[2]);
      
      // Buscar meta existente
      let metaExistente = goals.find(g => g.titulo.toLowerCase().includes(nombreMeta.toLowerCase()));
      
      if (metaExistente) {
        setGoals(prev => prev.map(goal => 
          goal.id === metaExistente.id 
            ? { ...goal, montoObjetivo: nuevoObjetivo }
            : goal
        ));
        console.log('✅ Objetivo de meta actualizado:', { metaId: metaExistente.id, nuevoObjetivo });
        return `✅ Actualicé el objetivo de "${metaExistente.titulo}" a $${nuevoObjetivo.toLocaleString('es-AR')}.`;
      } else {
        return `❌ No encontré una meta llamada "${nombreMeta}".`;
      }
    }
    
    // Procesar eliminación de meta
    if (eliminarMetaMatch) {
      const nombreMeta = eliminarMetaMatch[1].trim();
      
      // Buscar meta existente
      let metaExistente = goals.find(g => g.titulo.toLowerCase().includes(nombreMeta.toLowerCase()));
      
      if (metaExistente) {
        setGoals(prev => prev.filter(goal => goal.id !== metaExistente.id));
        console.log('✅ Meta eliminada:', { metaId: metaExistente.id });
        return `✅ Eliminé la meta "${metaExistente.titulo}" con $${metaExistente.montoActual.toLocaleString('es-AR')} ahorrados.`;
      } else {
        return `❌ No encontré una meta llamada "${nombreMeta}".`;
      }
    }
    
    // Respuestas por defecto más inteligentes
    if (lowerMessage.includes('hola') || lowerMessage.includes('buen')) {
      return '👋 ¡Hola! Soy tu asistente financiero. Podés registrar gastos, hacer análisis financieros, gestionar metas o ajustar presupuestos. ¿Qué querés hacer?';
    }
    
    if (lowerMessage.includes('saldo') || lowerMessage.includes('cuánto')) {
      const totalAhorrado = goals.reduce((sum, goal) => sum + goal.montoActual, 0);
      return `💰 Tenés ahorrado $${totalAhorrado.toLocaleString('es-AR')} en tus metas. Podés registrar gastos o hacer análisis financieros escribiendo "¿Cuánto gasté en comida?" o "¿Cuál es mi gasto más grande?".`;
    }
    
    if (lowerMessage.includes('meta') || lowerMessage.includes('ahorro')) {
      return `🎯 Tenés ${goals.length} metas activas. Podés crear una nueva meta con "Creá meta para [nombre]" o aportar a una existente con "Guardá $1000 para [nombre de meta]".`;
    }
    
    const respuestasPorDefecto = [
      'Entendido. ¿En qué puedo ayudarte con tus finanzas?',
      'Claro, puedo registrar gastos, hacer análisis financieros, gestionar metas o ajustar presupuestos. ¿Qué querés hacer?',
      'Perfecto. Decime qué transacción querés registrar, qué análisis querés hacer o qué meta querés crear.',
      '👋 ¡Hola! Soy tu asistente financiero. ¿Qué querés hacer hoy?'
    ];
    
    return respuestasPorDefecto[Math.floor(Math.random() * respuestasPorDefecto.length)];
  }

  // Función helper para obtener categoría por nombre con Few-Shot y definiciones explícitas
  function getCategoriaPorNombre(descripcion: string) {
    const lowerDescripcion = descripcion.toLowerCase();
    
    // Definiciones explícitas para categorización precisa
    const categoriasValidas = [
      { 
        id: 'alimentacion', 
        nombre: 'Alimentación', 
        icono: '🍔', 
        color: 'text-orange-500', 
        esGasto: true,
        palabrasClave: [
          'supermercado', 'almacen', 'restauran', 'delivery', 'kiosco', 'verduleria', 'carniceria', 
          'panaderia', 'cafeteria', 'bar', 'comida', 'rapida', 'empanada', 'pizza', 'helado',
          'minimercado', 'mercado', 'compras', 'super', 'sushi', 'hamburguesa', 'pollo'
        ]
      },
      { 
        id: 'transporte', 
        nombre: 'Transporte', 
        icono: '🚗', 
        color: 'text-blue-500', 
        esGasto: true,
        palabrasClave: [
          'colectivo', 'subte', 'tren', 'taxi', 'uber', 'cabify', 'nafta', 'gasolina', 'peaje',
          'estacionamiento', 'mantenimiento', 'auto', 'repuesto', 'transporte', 'escolar', 'remis',
          'sube', 'movilidad', 'combustible', 'mecanico'
        ]
      },
      { 
        id: 'ocio', 
        nombre: 'Ocio', 
        icono: '🎮', 
        color: 'text-purple-500', 
        esGasto: true,
        palabrasClave: [
          'cine', 'teatro', 'concierto', 'salida', 'bolich', 'noche', 'juego', 'streaming',
          'entretenimiento', 'deporte', 'gimnasio', 'vacaciones', 'viaje', 'netflix', 'spotify',
          'prime', 'play', 'futbol', 'partido', 'show', 'recital'
        ]
      },
      { 
        id: 'servicios', 
        nombre: 'Servicios', 
        icono: '💡', 
        color: 'text-yellow-500', 
        esGasto: true,
        palabrasClave: [
          'luz', 'gas', 'agua', 'internet', 'telefono', 'expensas', 'cuota', 'tarjeta',
          'suscripcion', 'seguro', 'alquiler', 'impuesto', 'abl', 'edesa', 'personal',
          'telecomunicacion', 'digital', 'factura', 'servicio'
        ]
      },
      { 
        id: 'salud', 
        nombre: 'Salud', 
        icono: '🏥', 
        color: 'text-red-500', 
        esGasto: true,
        palabrasClave: [
          'farmacia', 'medico', 'prepara', 'obra social', 'analisis', 'dentista', 'psicologo',
          'kinesiologo', 'medicamento', 'hospital', 'emergencia', 'clinica', 'salud',
          'remedio', 'drogueria', 'consulta', 'vacuna'
        ]
      },
      { 
        id: 'educacion', 
        nombre: 'Educación', 
        icono: '📚', 
        color: 'text-indigo-500', 
        esGasto: true,
        palabrasClave: [
          'curso', 'libro', 'utiles', 'colegio', 'universidad', 'capacitacion', 'taller',
          'estudio', 'idioma', 'posgrado', 'maestria', 'diploma', 'certificacion',
          'escuela', 'academia', 'educacion'
        ]
      },
      { 
        id: 'otros', 
        nombre: 'Otros', 
        icono: '📦', 
        color: 'text-gray-500', 
        esGasto: true,
        palabrasClave: [
          'ropa', 'calzado', 'accesorio', 'regalo', 'compra', 'mueble', 'hogar',
          'electronica', 'herramienta', 'imprevisto', 'cajero', 'transferencia', 'mercado',
          'libre', 'general', 'varios', 'centro', 'negocio', 'cosas'
        ]
      },
      { 
        id: 'sueldo', 
        nombre: 'Sueldo', 
        icono: '💼', 
        color: 'text-emerald-500', 
        esGasto: false,
        palabrasClave: [
          'sueldo', 'salario', 'aguinaldo', 'bonificacion', 'pago', 'trabajo',
          'dependencia', 'nomina', 'haber', 'remuneracion'
        ]
      },
      { 
        id: 'freelance', 
        nombre: 'Freelance', 
        icono: '💻', 
        color: 'text-cyan-500', 
        esGasto: false,
        palabrasClave: [
          'freelance', 'proyecto', 'honorario', 'profesional', 'consultoria',
          'independiente', 'trabajo', 'servicio', 'desarrollo', 'diseño'
        ]
      },
      { 
        id: 'inversiones', 
        nombre: 'Inversiones', 
        icono: '📈', 
        color: 'text-lime-500', 
        esGasto: false,
        palabrasClave: [
          'dividendo', 'accion', 'interes', 'renta', 'criptomoneda', 'bitcoin',
          'inversion', 'plazo', 'fijo', 'cedear', 'bono', 'rendimiento'
        ]
      },
      { 
        id: 'negocio', 
        nombre: 'Negocio', 
        icono: '🏪', 
        color: 'text-amber-500', 
        esGasto: false,
        palabrasClave: [
          'negocio', 'comercio', 'emprendimiento', 'venta', 'producto', 'servicio',
          'tienda', 'shop', 'local', 'comercio', 'propio'
        ]
      },
      { 
        id: 'regalo', 
        nombre: 'Regalo', 
        icono: '🎁', 
        color: 'text-rose-500', 
        esGasto: false,
        palabrasClave: [
          'regalo', 'herencia', 'obsequio', 'regalaron', 'me regalaron',
          'presente', 'detalle', 'bono regalo'
        ]
      }
    ];

    // Few-Shot examples para clasificación precisa
    const ejemplosFewShot = [
      { texto: 'mercadolibre', categoria: 'otros' },
      { texto: 'empanada', categoria: 'alimentacion' },
      { texto: 'sube', categoria: 'transporte' },
      { texto: 'luz', categoria: 'servicios' },
      { texto: 'farmacia', categoria: 'salud' },
      { texto: 'cine', categoria: 'ocio' },
      { texto: 'jeans', categoria: 'otros' },
      { texto: 'alquiler', categoria: 'negocio' },
      { texto: 'aguinaldo', categoria: 'sueldo' }
    ];

    // Buscar coincidencia exacta en ejemplos Few-Shot primero
    for (const ejemplo of ejemplosFewShot) {
      if (lowerDescripcion.includes(ejemplo.texto)) {
        return categoriasValidas.find(cat => cat.id === ejemplo.categoria)!;
      }
    }

    // Buscar por palabras clave en cada categoría
    for (const categoria of categoriasValidas) {
      for (const palabra of categoria.palabrasClave) {
        if (lowerDescripcion.includes(palabra)) {
          return categoria;
        }
      }
    }

    // Regla de fallback estricta: si es ambiguo, va a Otros
    const esAmbiguo = [
      'gasté', 'compré', 'pagué', 'cosa', 'cosas', 'articulo', 'articulos',
      'centro', 'lugar', 'negocio', 'tienda', 'compra', 'varios', 'general'
    ].some(ambiguo => lowerDescripcion === ambiguo || 
      (lowerDescripcion.includes(ambiguo) && lowerDescripcion.split(' ').length <= 3)
    );

    if (esAmbiguo) {
      return categoriasValidas.find(cat => cat.id === 'otros')!;
    }

    // Último fallback: Otros
    return categoriasValidas.find(cat => cat.id === 'otros')!;
  }

  return {
    processMessage,
    isLoading,
    error,
    transactions,
    setTransactions,
    goals,
    budgets,
    clearError: () => setError(null)
  };
}
