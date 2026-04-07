import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ChatRequest, ChatResponse } from '../../../lib/types';
import { createSupabaseServerClient, createSupabaseServerClientWithToken, TransactionInsert, handleSupabaseError } from '../../../lib/supabase';

export const SYSTEM_PROMPT = `Sos el coach financiero personal del usuario en AI Wallet.

PERSONALIDAD:
- Espanol rioplatense, directo, como un amigo que sabe de plata
- Maximo 3-4 oraciones por respuesta general. Para planificaciones, podes extenderte con los numeros.
- Maximo 1 emoji por respuesta
- Sin jerga financiera, sin sermones, sin palabras de relleno como "Claro!" o "Por supuesto!"
- Empezar directo con la info, no con saludos ni confirmaciones

IMPORTANTE — LO QUE NO HACER:
- NUNCA respondas con "$X" o "$Y" — siempre usa los numeros reales del contexto
- NUNCA digas "no tengo informacion" si tenes el resumen_financiero
- NUNCA uses "undefined", "null" ni variables sin resolver
- NUNCA inventes datos que no esten en el contexto

ROL 1 — REGISTRAR GASTOS/INGRESOS:
- Con monto → registrar de inmediato
- Sin monto → preguntar solo "¿De cuánto fue?"
- Fecha: usar siempre fecha_hoy salvo que el usuario diga otra
- Categoria: usar exactamente los nombres de budgets[].categoria del contexto

GASTOS INUSUALES AL REGISTRAR:
Si el contexto incluye historico.categorias y el gasto que estas registrando es
>40% del promedio_mensual de esa categoria en un solo gasto, mencionalo en el mensaje
de forma natural y directa, sin alarmismo. Ejemplo:
"Anotado los $50.000 en salidas ✅ Ojo: con esto ya gastaste casi la mitad de tu 
presupuesto mensual normal para esa categoria ($X promedio/mes)."
Solo mencionarlo una vez, al final del mensaje de confirmacion.

ROL 2 — RESPONDER CONSULTAS CON NUMEROS REALES:
Usar EXACTAMENTE los numeros del resumen_financiero. Nunca redondear mal ni inventar.

ROL 3 — ANALISIS DE OPTIMIZACION DE GASTOS:
Cuando pregunten como ahorrar mas o reducir gastos:

PASO 1 — Clasificar categorias del usuario usando historico.categorias:
  ESENCIALES (no tocar): alimentacion, alquiler, servicios, salud, transporte, educacion
  DISCRECIONALES (recortar primero): salidas, entretenimiento, delivery, suscripciones, ropa, hobbies
  VARIABLES (revisar): todo lo demas — pueden tener margen segun el caso

PASO 2 — Identificar donde hay margen real:
  - Comparar gasto_este_mes vs promedio_mensual de cada categoria
  - Si una discrecional esta por encima del promedio → señalarla primero
  - Si una esencial esta muy por encima del promedio → mencionarla como "revisar" pero nunca como "recortar"

PASO 3 — Respuesta concreta con numeros:
  Ejemplo: "En salidas gastas $X/mes en promedio, este mes ya llevas $Y. Recortando a $Z liberas $W por mes."
  Siempre terminar con el ahorro mensual total posible si aplica los recortes.

ROL 4 — DISTRIBUCION DEL DINERO SOBRANTE:
Cuando pregunten como organizar lo que sobra:

Usar dinero_libre del contexto como base. Distribucion recomendada (adaptable):
  - Ahorro/emergencia: 15-20% del ingreso (idealmente 3-6 meses de gasto_minimo_mensual acumulados)
  - Metas activas: distribuir el resto segun urgencia (target_date mas cercano, mas peso)
  - Fondo vacaciones: si no tiene meta de viaje, sugerir crearla (~10% del ingreso)
  - Libre: siempre dejar algo (~10%) para imprevistos del mes

Respuesta: dar montos concretos, no porcentajes sueltos.
Ejemplo: "Con $X libres: $A a emergencia, $B a [meta mas urgente], $C a vacaciones, $D libre."

ROL 5 — PLANIFICACION MULTI-MES (lo mas importante):
Cuando el usuario mencione que cobra de forma irregular, quiere planificar N meses, o pregunta si le alcanza para algo futuro:

ALGORITMO DE PLANIFICACION:

1. CALCULAR GASTO BASE MENSUAL REAL:
   - Usar historico.gasto_minimo_mensual como piso (gastos esenciales)
   - Para cada categoria en historico.categorias, usar promedio_mensual como estimacion
   - Si no hay historico suficiente (meses_analizados < 2), usar los budgets actuales como referencia
   - Total estimado por mes = suma de promedios por categoria

2. DEFINIR AHORRO OBJETIVO:
   - Apuntar al 15% del ingreso/monto disponible mensual
   - Si el gasto base no lo permite, bajar al 10%
   - Si tampoco, indicar explicitamente que no hay margen para ahorrar ese mes

3. IDENTIFICAR QUE RECORTAR SI NO CIERRA:
   - Si gasto_base + ahorro_objetivo > monto_mensual_disponible:
     → Listar categorias discrecionales con su promedio y sugerir reduccion concreta
     → Ejemplo: "Para que cierre necesitás reducir salidas de $X a $Y (-$Z)"

4. DISTRIBUIR EL PLAN:
   Por mes:
   - Esenciales: usar promedio historico (o presupuesto actual si no hay historico)
   - Discrecionales: usar promedio historico pero ajustado si hay que recortar
   - Ahorro: monto fijo mensual
   - Metas activas: aportes proporcionales a urgencia
   - Libre: lo que queda (nunca negativo — si es negativo, hay que recortar mas)

5. FORMATO DE RESPUESTA PARA PLAN MULTI-MES:
   "Plan para X meses ($TOTAL disponible = $Y/mes):
   Ahorro: $A/mes (Z% — fondo emergencia / [meta])
   [Categoria esencial 1]: $B/mes
   [Categoria esencial 2]: $C/mes
   [Categoria discrecional]: $D/mes (↓ bajaste de $E historico)
   Libre: $F/mes para imprevistos
   
   En X meses acumulas $G de ahorro."

6. PARA PREGUNTAS TIPO "¿ME ALCANZA PARA VACACIONES EN DICIEMBRE?":
   - Calcular meses restantes hasta la fecha
   - Calcular cuanto puede ahorrar por mes (dinero_libre / meses_restantes o promedio historico)
   - Comparar con el faltante de la meta de vacaciones (si existe en goals)
   - Si no tiene meta de vacaciones, pedirle el monto objetivo
   - Respuesta: "Te faltan $X. Ahorrando $Y/mes llegas en Z meses — [si/casi/no] llegas a diciembre."

FORMATOS DE RESPUESTA — siempre JSON valido:

Registrar gasto/ingreso:
{"action":"INSERT_TRANSACTION","mensaje_respuesta":"confirmacion breve","data":{"description":"texto","amount":numero,"type":"gasto","category":"categoria","transaction_date":"YYYY-MM-DD","confirmed":true}}

Responder consulta / analisis / optimizacion:
{"action":"RESPUESTA_CONSULTA","mensaje_respuesta":"respuesta con numeros reales","data":null}

Crear meta:
{"action":"CREATE_GOAL","mensaje_respuesta":"confirmacion","data":{"name":"nombre","target_amount":numero,"current_amount":0,"target_date":null,"icon":"emoji","color":"text-emerald-500"}}

Crear presupuesto:
{"action":"CREATE_BUDGET","mensaje_respuesta":"confirmacion","data":{"category":"nombre","limit_amount":numero,"month_period":"YYYY-MM"}}

Plan multi-mes:
{"action":"PLAN_MENSUAL","mensaje_respuesta":"Plan del mes:\\nAhorro: $X\\n[Categoria]: $X\\nLibre: $X\\n\\nEn X meses acumulas $Y de ahorro.","data":{"ingreso_detectado":numero,"meses":numero,"distribucion":{"ahorro":numero,"categorias":{"nombre":numero},"libre":numero}}

Sin markdown. Sin listas con guiones dentro del JSON. JSON siempre valido.

OPTIMIZACIÓN DE GASTOS:
Cuando pregunten cómo ahorrar más o reducir gastos sin cambiar el estilo de vida:
- Mirá el top de gastos por categoría del contexto
- Identificá las categorías con más margen (salidas, suscripciones, caprichos)
- Dá 2-3 sugerencias concretas con números reales del contexto
- Nunca sugerís recortar alimentación o salud primero

DISTRIBUCIÓN DEL DINERO SOBRANTE:
Cuando pregunten cómo organizar el dinero que sobra o armar fondos:
- Usá el dinero_libre del contexto como base
- Sugerí distribución concreta con porcentajes y montos reales
- Fondos estándar: emergencia (3-6 meses de gastos), vacaciones, jubilación/inversión
- Marco de referencia: 50/30/20 adaptado a la situación real del usuario
- Si ya tiene metas activas, integrarlas a la distribución

PLANIFICACIÓN MULTI-MES:
Cuando el usuario mencione que cobra de forma irregular o quiere planificar varios meses:
- Pedile el monto disponible y cuántos meses necesita cubrir
- Calculá un "presupuesto mensual" dividiendo el total por los meses
- Distribuí en categorías usando los budgets existentes como base
- Acción a usar: PLAN_MENSUAL con el detalle en mensaje_respuesta`

 

// Función para usar Groq
async function tryGroq(groq: Groq, contextInfo: string, message: string, SYSTEM_PROMPT: string) {
  try {
    console.log(`🔄 Enviando a Groq Llama 3.3 70B`);
    
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `CONTEXTO:\n${contextInfo}\n\nMENSAJE DEL USUARIO:\n${message}`
        }
      ]
    });

    console.log(`✅ Groq Llama 3.3 70B funcionando correctamente`);
    return response;
  } catch (error) {
    console.error(`❌ Error en Groq:`, error);
    throw error;
  }
}

// Función para guardar transacciones en Supabase
async function saveTransactionsToSupabase(
  transacciones: any[], 
  originalMessage: string,
  userId: string | null,
  budgetsData?: any[],
  goalsData?: any[],
  userToken?: string | null  // ← AGREGAR
): Promise<void> {
  console.log('💾 === GUARDANDO TRANSACCIONES EN SUPABASE ===');
  
  // ✅ Usar cliente con token si está disponible
  const supabase = userToken 
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();
  
  try {
    // Mapear las transacciones al formato de Supabase
    const transactionsToInsert: TransactionInsert[] = transacciones.map((tx) => {
      const txCategory = tx.category || tx.categoria || ''
      
      console.log('🎯 Buscando budget para categoria:', tx.category || tx.categoria)
      
      // Buscar budget correspondiente con fuzzy match
      const budgetMatch = budgetsData?.find(b => {
        if (b.category === txCategory) return true
        // Fuzzy: si la categoría del tx está contenida en el nombre del budget o viceversa
        if (txCategory.includes(b.category) || b.category.includes(txCategory)) return true
        // Aliases comunes
        const aliases: Record<string, string[]> = {
          'alimentacion': ['super', 'supermercado', 'mercado', 'comida', 'almacen', 'verduleria', 'carniceria', 'panaderia'],
          'transporte':   ['nafta', 'colectivo', 'subte', 'uber', 'taxi', 'remis', 'sube'],
          'salidas':      ['bar', 'restaurant', 'cine', 'teatro', 'boliche', 'entretenimiento'],
          'salud':        ['farmacia', 'medico', 'dentista', 'clinica'],
          'servicios':    ['luz', 'gas', 'agua', 'internet', 'telefono'],
        }
        return aliases[b.category]?.includes(txCategory) ?? false
      });
      
      console.log('🎯 Budget match:', budgetMatch?.id || 'NO ENCONTRADO')
      
      // Buscar goal correspondiente si es ahorro
      const goalMatch = tx.category === 'ahorro' 
        ? goalsData?.find(g => g.is_active && !g.is_completed)
        : null;

      return {
        description: tx.description || tx.descripcion || 'Sin descripción',
        amount: Number(tx.amount || tx.monto) || 0,
        category: txCategory,
        type: (tx.type || tx.tipo || 'gasto') as 'gasto' | 'ingreso',
        transaction_date: tx.transaction_date || tx.fecha 
          || new Date().toISOString().split('T')[0],
        confirmed: tx.confirmed ?? false,
        source: 'voice' as const,
        original_message: originalMessage,
        ai_confidence: 0.95,
        user_id: userId || undefined,
        budget_id: budgetMatch?.id || null,
        goal_id: goalMatch?.id || null
      };
    });

    console.log('📝 Transacción a insertar:', JSON.stringify(transactionsToInsert[0], null, 2));

    console.log('📝 Transacciones a insertar:', transactionsToInsert.length);
    
    // Insertar todas las transacciones en una sola operación
    const { data, error, count } = await supabase
      .from('transactions')
      .insert(transactionsToInsert)
      .select();

    if (error) {
      console.error('❌ Error insertando en Supabase:', error);
      throw handleSupabaseError(error);
    }

    console.log('✅ Transacciones guardadas exitosamente en Supabase:');
    console.log(`📊 Registros insertados: ${count || transactionsToInsert.length}`);
    console.log('📋 IDs generados:', data?.map(t => t.id));
    
  } catch (error) {
    console.error('💥 Error crítico guardando en Supabase:', error);
    throw error;
  }
}

// Función para asegurar que el nombre de la meta tenga un emoji representativo
function ensureGoalEmoji(goalName: string): string {
  // Si ya tiene emoji, retornar como está (usando un regex compatible)
  const hasEmoji = /[\u2600-\u26FF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF\u1F700-\u1F77F\u1F780-\u1F7FF\u1F800-\u1F8FF\u1F900-\u1F9FF\u1FA00-\u1FA6F]/.test(goalName);
  if (hasEmoji) {
    return goalName;
  }

  // Mapeo de palabras clave a emojis específicos (ordenados por prioridad)
  const emojiMap: { [key: string]: string } = {
    // Transporte específico
    'moto': '🏍️',
    'motocicleta': '🏍️',
    'auto': '🚗',
    'coche': '🚗',
    'carro': '🚗',
    'camioneta': '🚙',
    'pickup': '🚙',
    'bicicleta': '�',
    'bici': '�',
    'camión': '�',
    
    // Tecnología específica
    'celular': '📱',
    'telefono': '📱',
    'smartphone': '📱',
    'computadora': '💻',
    'notebook': '💻',
    'laptop': '💻',
    'pc': '💻',
    'tablet': '📋',
    'ipad': '📋',
    'consola': '🎮',
    'playstation': '🎮',
    'xbox': '�',
    'nintendo': '🎮',
    
    // Vivienda específica
    'casa': '�🏠',
    'hogar': '🏠',
    'departamento': '🏠',
    'depto': '🏠',
    'apartamento': '🏠',
    'terreno': '🏞️',
    'lote': '🏞️',
    'quinta': '🏡',
    
    // Viajes específicos
    'viaje': '✈️',
    'viajes': '✈️',
    'vacaciones': '🏖️',
    'playa': '🏖️',
    'caribe': '🏖️',
    'europa': '🌍',
    'disney': '🏰',
    'parque': '🎢',
    'crucero': '🚢',
    'excursión': '🗺️',
    
    // Finanzas específicas
    'emergencia': '🚨',
    'fondo': '💰',
    'ahorro': '💰',
    'ahorros': '💰',
    'inversión': '📈',
    'inversion': '📈',
    'acciones': '📊',
    'bonos': '📋',
    'plazo fijo': '🏦',
    
    // Educación específica
    'estudio': '📚',
    'carrera': '🎓',
    'universidad': '🎓',
    'facultad': '🎓',
    'curso': '📖',
    'maestría': '🎓',
    'doctorado': '🎓',
    'posgrado': '🎓',
    
    // Salud específica
    'salud': '🏥',
    'médico': '👨‍⚕️',
    'doctor': '👨‍⚕️',
    'dentista': '🦷',
    'gimnasio': '💪',
    'gym': '💪',
    'entrenamiento': '💪',
    'nutricionista': '🥗',
    
    // Comida específica
    'comida': '🍔',
    'alimentación': '🍔',
    'restaurante': '🍽️',
    'asado': '🥩',
    'parrilla': '🥩',
    
    // Ropa específica
    'ropa': '👕',
    'vestimenta': '👕',
    'zapatillas': '👟',
    'zapatos': '👟',
    'camisa': '👔',
    'pantalón': '👖',
    'jeans': '👖',
    
    // Eventos específicos
    'regalo': '🎁',
    'cumpleaños': '🎂',
    'navidad': '🎄',
    'año nuevo': '🎊',
    'fiesta': '🎉',
    'celebración': '🎉',
    'casamiento': '💒',
    'boda': '💒',
    'matrimonio': '💒',
    'aniversario': '💑',
    
    // Mascotas específicas
    'mascota': '🐕',
    'perro': '🐕',
    'gato': '🐈',
    'pájaro': '🦜',
    'pez': '🐠',
    
    // Entretenimiento específico
    'música': '🎵',
    'instrumento': '🎸',
    'guitarra': '🎸',
    'piano': '🎹',
    'libro': '📖',
    'lectura': '📖',
    'pelicula': '🎬',
    'cine': '🎬',
    'netflix': '📺',
    'juego': '🎮',
    'gaming': '🎮',
    
    // Deportes específicos
    'deporte': '⚽',
    'fútbol': '⚽',
    'básquet': '🏀',
    'tenis': '🎾',
    'natación': '🏊',
    'correr': '🏃',
    'atletismo': '🏃',
    
    // Trabajo específico
    'negocio': '💼',
    'empresa': '🏢',
    'trabajo': '💼',
    'proyecto': '📋',
    'freelance': '💻',
    'cliente': '🤝',
    
    // Familia específica
    'hijos': '�',
    'familia': '👨‍👩‍👧‍�',
    'bebé': '🍼',
    'niño': '�',
    'niña': '👧',
    'pareja': '❤️',
    'novio': '❤️',
    'novia': '❤️'
  };

  // Buscar coincidencias en el nombre (insensible a mayúsculas/minúsculas)
  const lowerName = goalName.toLowerCase();
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (lowerName.includes(keyword)) {
      return `${emoji} ${goalName}`;
    }
  }

  // Emoji por defecto si no se encuentra coincidencia
  return `🎯 ${goalName}`;
}

// Función para crear una meta en Supabase
async function createGoalInSupabase(
  goalData: any,
  userId: string | null,
  userToken: string | null | undefined  // ← Aceptar undefined también
): Promise<void> {
  console.log('🎯 === CREANDO META EN SUPABASE ===');
  
  if (!userId) {
    throw new Error('userId requerido para crear meta');
  }

  // ✅ Usar cliente con token del usuario (respeta RLS)
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${userToken}` 
        }
      },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );
  
  try {
    // Asegurar que el nombre de la meta tenga un emoji
    const goalNameWithEmoji = ensureGoalEmoji(goalData.name || goalData.title || 'Meta sin nombre');
    
    const { data, error } = await supabase
      .from('goals')
      .insert({
        name: goalNameWithEmoji,
        target_amount: goalData.target_amount,
        current_amount: goalData.current_amount || 0,
        target_date: goalData.target_date || null,
        description: goalData.description || '',
        icon: goalData.icon || '🎯',
        color: goalData.color || 'text-emerald-500',
        user_id: userId
      })
      .select();

    if (error) {
      console.error('❌ Error creando meta en Supabase:', error);
      throw handleSupabaseError(error);
    }

    console.log('✅ Meta creada exitosamente:', data);
    
  } catch (error) {
    console.error('💥 Error crítico creando meta:', error);
    throw error;
  }
}

// Función para crear un presupuesto en Supabase
async function createBudgetInSupabase(
  budgetData: any,
  userId: string | null,
  userToken: string | null | undefined
): Promise<void> {
  console.log('💰 === CREANDO BUDGET EN SUPABASE ===');
  
  if (!userId) throw new Error('userId requerido para crear budget');

  const supabase = userToken
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();

  const normalizedCategory = (budgetData.category || '').toLowerCase().trim();
  const monthPeriod = budgetData.month_period || new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      category: normalizedCategory,
      limit_amount: budgetData.limit_amount,
      month_period: monthPeriod,
      user_id: userId
    })
    .select();

  if (error) {
    console.error('❌ Error creando budget:', error);
    throw handleSupabaseError(error);
  }

  console.log('✅ Budget creado exitosamente:', data);
}

// Función para actualizar progreso de meta
async function updateGoalProgressInSupabase(
  goalName: string, 
  amount: number, 
  userId: string | null,
  userToken: string | null | undefined,
  createIfMissing: boolean = true
): Promise<void> {
  console.log('📈 === ACTUALIZANDO PROGRESO DE META EN SUPABASE ===');
  
  if (!userId) throw new Error('userId requerido');

  const supabase = userToken
    ? createSupabaseServerClientWithToken(userToken)
    : createSupabaseServerClient();
  
  try {
    // Primero buscar la meta por nombre (búsqueda parcial)
    const { data: existingGoals, error: searchError } = await supabase
      .from('goals')
      .select('*')
      .ilike('name', `%${goalName}%`)
      .eq('is_active', true);

    if (searchError) {
      console.error('❌ Error buscando meta:', searchError);
      throw handleSupabaseError(searchError);
    }

    let targetGoal = existingGoals?.[0];

    // Si no existe y se permite crear, crearla
    if (!targetGoal && createIfMissing) {
      console.log('🆕 Meta no encontrada, creando nueva:', goalName);
      
      const targetAmount = amount * 10; // Estimar objetivo como 10x el aporte
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 6); // Estimar 6 meses

      // Asegurar que el nombre tenga emoji
      const goalNameWithEmoji = ensureGoalEmoji(goalName);

      const { data: newGoal, error: createError } = await supabase
        .from('goals')
        .insert({
          name: goalNameWithEmoji,
          target_amount: targetAmount,
          current_amount: amount,
          target_date: targetDate.toISOString().split('T')[0],
          description: `Meta creada automáticamente para "${goalName}"`,
          icon: '🎯',
          color: 'text-emerald-500'
        })
        .select();

      if (createError) {
        console.error('❌ Error creando meta automáticamente:', createError);
        throw handleSupabaseError(createError);
      }

      console.log('✅ Meta creada automáticamente:', newGoal);
      return;
    }

    if (!targetGoal) {
      throw new Error(`No se encontró meta "${goalName}" y no se permite crear automáticamente`);
    }

    // Actualizar el progreso
    const newAmount = targetGoal.current_amount + amount;
    const isCompleted = newAmount >= targetGoal.target_amount;

    const { data, error } = await supabase
      .from('goals')
      .update({
        current_amount: newAmount,
        is_completed: isCompleted
      })
      .eq('id', targetGoal.id)
      .select();

    if (error) {
      console.error('❌ Error actualizando meta:', error);
      throw handleSupabaseError(error);
    }

    console.log('✅ Progreso de meta actualizado:', data);
    
  } catch (error) {
    console.error('💥 Error crítico actualizando meta:', error);
    throw error;
  }
}

// Función para manejar consultas
async function handleQuery(queryType: string, filters?: any): Promise<any> {
  console.log('🔍 === MANEJANDO CONSULTA ===');
  
  const supabase = createSupabaseServerClient();
  
  try {
    switch (queryType) {
      case 'budget_status':
        const category = filters?.category;
        if (!category) throw new Error('Se requiere categoría para consulta de presupuesto');
        
        const { data: budget } = await supabase
          .from('budget_summary')
          .select('*')
          .eq('category', category)
          .single();
          
        return budget;

      case 'goals_summary':
        const { data: goals } = await supabase
          .from('goals_summary')
          .select('*')
          .order('progress_percentage', { ascending: false });
          
        return goals;

      case 'monthly_spending':
        const { data: spending } = await supabase
          .from('monthly_summary')
          .select('*')
          .eq('type', 'gasto')
          .order('total_amount', { ascending: false })
          .limit(5);
          
        return spending;

      default:
        throw new Error(`Tipo de consulta no soportado: ${queryType}`);
    }
  } catch (error) {
    console.error('💥 Error en consulta:', error);
    throw error;
  }
}

// Función principal para ejecutar acciones
async function executeAction(action: string, data: any, originalMessage: string, userId: string | null, budgetsData?: any[], goalsData?: any[], userToken?: string | null): Promise<any> {
  console.log(`🚀 === EJECUTANDO ACCIÓN: ${action} ===`);
  
  switch (action) {
    case 'INSERT_TRANSACTION':
      // Pasar directamente el data de Groq (compatible con ambos formatos)
      const transactions = [data];
      await saveTransactionsToSupabase(transactions, originalMessage, userId, budgetsData, goalsData, userToken);
      return { success: true, message: 'Transacción guardada' };

    case 'CREATE_GOAL':
      await createGoalInSupabase(data, userId, userToken)
      return { success: true, message: 'Meta creada' };

    case 'CREATE_BUDGET':
      await createBudgetInSupabase(data, userId, userToken);
      return { success: true, message: 'Presupuesto creado' };

    case 'UPDATE_GOAL_PROGRESS':
      await updateGoalProgressInSupabase(
        data.goal_name, 
        data.amount, 
        userId,        // ← agregar
        userToken,     // ← agregar
        data.create_if_missing
      );
      return { success: true, message: 'Progreso actualizado' };

    case 'QUERY_BUDGET':
    case 'QUERY_GOALS':
    case 'QUERY_TRANSACTIONS':
      const result = await handleQuery(data.query_type, data.filters);
      return { success: true, data: result };

    case 'RESPUESTA_CONSULTA':
      return { 
        success: true, 
        message: originalMessage
      }

    case 'PLAN_MENSUAL':
      return { 
        success: true, 
        message: originalMessage
      }

    case 'ERROR':
      throw new Error(data.mensaje_respuesta || 'Error en el procesamiento');

    default:
      return { 
        success: true, 
        message: originalMessage
      }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context, history = [] } = body;

    // Justo después de parsear el body:
    console.log('🔑 Authorization header:', 
      request.headers.get('Authorization') ? 'PRESENTE' : 'AUSENTE');

    // Obtener user_id desde el token de autorización
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    let supabaseServer = createSupabaseServerClient();

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      
      // Crear cliente con el token del usuario para validación
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}` 
            }
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      )
      
      const { data: { user }, error: userError } = await supabaseWithToken.auth.getUser()
      console.log('👤 getUser result:', user?.id || 'NULL', userError?.message || 'sin error')
      userId = user?.id || null
      
      // Usar este cliente autenticado para los fetches siguientes
      supabaseServer = supabaseWithToken
    }

    // Justo después de intentar obtener el user:
    console.log('👤 User obtenido:', userId || 'NULL - no se pudo obtener');

    // Obtener budgets y goals del usuario para linkear con transacciones
    let budgetsData: any[] = []
    let goalsData: any[] = []
    if (userId) {
      try {
        const { data: budgetsResult, error: budgetsError } = await supabaseServer
          .from('budgets')
          .select('id, category')
          .or(`user_id.eq.${userId},user_id.is.null`)
        
        console.log('💰 budgets fetch error:', budgetsError?.message || 'ninguno')
        budgetsData = budgetsResult || []
        console.log('💰 budgetsData count:', budgetsData.length)
        console.log('💰 budgetsData:', JSON.stringify(budgetsData))

        const { data: goalsResult, error: goalsError } = await supabaseServer
          .from('goals')
          .select('id, name, is_active, is_completed')
          .eq('is_active', true)
        
        console.log('🎯 goals fetch error:', goalsError?.message || 'ninguno')
        goalsData = goalsResult || []
        console.log('🎯 goalsData count:', goalsData.length)
      } catch (error) {
        console.error('❌ Error fetching budgets/goals:', error)
      }
    } else {
      console.log('❌ No userId - no se pueden fetchear budgets')
    }

    console.log('📥 Request recibido:', { 
      message, 
      hasContext: !!context,
      userId: userId || 'anonymous',
      ingreso_mensual: context?.ingreso_mensual,
      objetivo_ahorro: context?.objetivo_ahorro,
      dinero_disponible: context?.dinero_disponible,
      estado_mes: context?.estado_mes,
      goalsCount: context?.goals?.length || 0, 
      budgetsCount: context?.budgets?.length || 0 
    });

    // Validar que tengamos API key
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ Groq API key no configurada');
      return NextResponse.json(
        { error: 'Groq API key no configurada' },
        { status: 500 }
      );
    }

    console.log('🔑 API Key encontrada, inicializando Groq...');

    // Inicializar Groq
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    // Construir el system prompt con contexto dinámico
    const systemPromptConContexto = `${SYSTEM_PROMPT}

FECHA DE HOY: ${new Date().toISOString().split('T')[0]}

SITUACION FINANCIERA ACTUAL DEL USUARIO:
${context?.resumen_financiero ?? 'Sin datos disponibles'}

CATEGORIAS EXACTAS PARA REGISTRO (usa estos nombres sin variaciones):
${context?.budgets?.map((b: any) => `- "${b.categoria}"`).join('\n') ?? 'Sin categorias'}

DATOS DE METAS:
${context?.goals?.map((g: any) =>
  `- ${g.nombre}: $${g.actual?.toLocaleString('es-AR')} de $${g.objetivo?.toLocaleString('es-AR')} (falta $${g.faltante?.toLocaleString('es-AR')})${g.meses_estimados ? ` — ~${g.meses_estimados} meses` : ''}` 
).join('\n') ?? 'Sin metas'}

ALERTAS ACTIVAS:
${context?.alertas?.map((a: string) => `- ${a}`).join('\n') ?? 'Sin alertas'}

HISTORICO DE GASTOS (promedio ultimos ${context?.historico?.meses_analizados || 0} meses):
Gasto mensual promedio total: $${context?.historico?.gasto_mensual_promedio?.toLocaleString('es-AR') || 'sin datos'}
Gasto minimo mensual (solo esenciales): $${context?.historico?.gasto_minimo_mensual?.toLocaleString('es-AR') || 'sin datos'}

CATEGORIAS ANALIZADAS:
${context?.historico?.categorias?.map((c: any) =>
  `- ${c.categoria} [${c.tipo.toUpperCase()}]: promedio $${c.promedio_mensual?.toLocaleString('es-AR')}/mes | este mes: $${c.gasto_este_mes?.toLocaleString('es-AR') || '0'}` 
).join('\n') ?? 'Sin historial disponible'}

REGLA ABSOLUTA: Tu respuesta debe ser SIEMPRE y UNICAMENTE un objeto JSON valido.
Sin texto antes. Sin texto después. Sin markdown. Sin explicaciones fuera del JSON.
El campo "mensaje_respuesta" es donde va TODO el texto hacia el usuario.
Si no respetas este formato, la app explota. Empeza tu respuesta con { y terminá con }.`;

    console.log('📝 Enviando a Groq con contexto financiero');

    try {
      // Reemplazar la llamada a tryGroq con esto:
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: systemPromptConContexto
          },
          // Historial de la conversación actual
          ...history.map((msg: {role: string, content: string}) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          })),
          // Mensaje actual
          {
            role: "user",
            content: message
          }
        ]
      })

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No se recibió respuesta de texto de Groq');
      }

      console.log('✅ Respuesta de Groq recibida');
      // Limpiar la respuesta: sacar markdown, texto antes/después del JSON
      const cleanContent = (raw: string): string => {
        // 1. Sacar bloques ```json ... ``` o ``` ... ```
        const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (mdMatch) return mdMatch[1].trim()
        
        // 2. Extraer el primer objeto JSON válido
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) return jsonMatch[0]
        
        // 3. Groq respondió texto plano sin JSON — construir JSON de respuesta
        return JSON.stringify({
          action: 'RESPUESTA_CONSULTA',
          mensaje_respuesta: raw.trim(),
          data: null
        })
      }

      const aiResponse: ChatResponse = JSON.parse(cleanContent(content));
      
      // Validar la estructura de la respuesta
      if (!aiResponse.mensaje_respuesta) {
        aiResponse.mensaje_respuesta = 'Procesé tu solicitud, pero tuve problemas para entenderla exactamente.';
      }

      if (!aiResponse.action) {
        aiResponse.action = 'ERROR';
        aiResponse.data = { query_type: 'unknown', filters: {} };
      }

      // === EJECUTAR ACCIÓN SEGÚN EL TIPO ===
      try {
        console.log('🔄 Iniciando ejecución de acción:', aiResponse.action);
        console.log('📦 aiResponse.data:', JSON.stringify(aiResponse.data, null, 2));
        const actionResult = await executeAction(aiResponse.action, aiResponse.data, message, userId, budgetsData, goalsData, authHeader?.replace('Bearer ', '') || null);
        console.log('✅ Acción ejecutada exitosamente:', actionResult);
        
        // Agregar información sobre la ejecución SOLO si fue exitosa
        if (actionResult.success && 
            aiResponse.action === 'INSERT_TRANSACTION') {
          aiResponse.mensaje_respuesta += ' ✅ Guardado.';
        }
        
        // Para consultas, agregar los datos obtenidos
        if (actionResult.data) {
          aiResponse.data.query_result = actionResult.data;
        }
        
      } catch (actionError) {
        console.error('💥 Error ejecutando acción:', actionError);
        
        // Error crítico: si falla la acción, devolver error al frontend
        return NextResponse.json({
          action: 'ERROR',
          error: 'Error ejecutando la acción',
          details: actionError instanceof Error ? actionError.message : 'Error desconocido',
          mensaje_respuesta: `❌ No pude ejecutar tu solicitud: ${actionError instanceof Error ? actionError.message : 'Error desconocido'}`
        }, { status: 500 });
      }

      return NextResponse.json(aiResponse);
    } catch (error) {
      console.error('❌ Error en Groq:', error);
      return NextResponse.json(
        { 
          action: 'ERROR',
          error: 'Error procesando la solicitud',
          details: error instanceof Error ? error.message : 'Error desconocido',
          mensaje_respuesta: '❌ Tuve problemas para entender tu mensaje. ¿Podrías reformularlo?'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('💥 Error en API de chat:', error);
    return NextResponse.json(
      { 
        error: 'Error procesando la solicitud',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}
