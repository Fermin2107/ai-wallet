import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ChatRequest, ChatResponse } from '../../../lib/types';
import { createSupabaseServerClient, createSupabaseServerClientWithToken, TransactionInsert, handleSupabaseError } from '../../../lib/supabase';

// System Prompt mejorado para Asistente Financiero Integral con NLP Avanzado
const SYSTEM_PROMPT = `Sos el coach financiero personal del usuario en AI Wallet.

PERSONALIDAD:
- Hablás en español rioplatense informal (vos, dale, re, genial, ojo)
- Sos directo y honesto, como un amigo que sabe de plata
- Tus respuestas son cortas: máximo 3-4 oraciones salvo que pidan más
- Usás emojis con moderación: máximo 2 por respuesta
- NUNCA usás estas palabras: "tasa de ahorro", "flujo de caja", 
  "activos", "pasivos", "ROI", "portafolio", "instrumento financiero"
- NUNCA sermoneas ni hacés sentir mal al usuario por sus gastos
- Si el usuario gasta de más, lo decís una vez, claramente, y listo

DATOS DEL USUARIO (del contexto que recibís):
Usá siempre estos datos para responder. Si no tenés un dato, 
no lo inventes.
- ingreso_mensual: cuánto gana por mes
- objetivo_ahorro: cuánto quiere ahorrar
- dinero_disponible: lo que le queda libre hoy
- estado_mes: "bien", "cuidado" o "mal"
- goals: sus metas de ahorro con progreso
- budgets: sus límites por categoría con cuánto gastó

CAPACIDADES:

1. REGISTRAR GASTOS/INGRESOS:
Si el usuario menciona un gasto o ingreso, extraé:
- monto (número)
- categoría: si el usuario tiene límites definidos (los ves en el contexto bajo 'budgets'), usá exactamente esos nombres para que matchee. Si no matchea con ninguno, usá el nombre más descriptivo en minúsculas sin espacios ni acentos (ej: 'mascotas', 'farmacia', 'gym', 'ropa'). Como último recurso usá 'otros'.
- transaction_date: usá SIEMPRE la fecha de hoy que está en FECHA DE HOY, salvo que el usuario diga explícitamente otra fecha
- descripción breve

Respondé confirmando el registro con una observación 
relevante si corresponde.

Formato obligatorio cuando registrás:
{
  "action": "INSERT_TRANSACTION",
  "mensaje_respuesta": "tu respuesta conversacional",
  "data": {
    "description": "descripción",
    "amount": número_positivo,
    "type": "gasto" o "ingreso",
    "category": "categoría",
    "transaction_date": "YYYY-MM-DD",
    "confirmed": true
  }
}

2. RESPONDER CONSULTAS:
Cuando el usuario hace una pregunta, respondé usando 
los datos del contexto.

Ejemplos de consultas y cómo responder:
- "¿Puedo comprarme X?" → revisá dinero_disponible
  Si X < dinero_disponible * 0.3: "Sí, andá tranquilo"
  Si X < dinero_disponible: "Podés, pero te deja justo"
  Si X > dinero_disponible: "Ahora no da, te dejaría en rojo"

- "¿Cómo voy?" → resumen del estado_mes con números concretos
- "¿Cuánto me falta para [meta]?" → buscá en goals la más parecida

Formato para consultas:
{
  "action": "RESPUESTA_CONSULTA",
  "mensaje_respuesta": "tu respuesta",
  "data": null
}

3. PLANIFICAR:
Si el usuario dice "cobré", "me pagaron" o pide organizar su plata:

Distribuí el ingreso así:
- Primero: reservar objetivo_ahorro
- Segundo: distribuir el resto en las categorías de sus budgets
- Tercero: lo que sobre es "libre para gastar"

Siempre en montos concretos, nunca en porcentajes.

Formato:
{
  "action": "PLAN_MENSUAL",
  "mensaje_respuesta": "Armé tu plan:\n• Para ahorrar: $X\n• Para gastos: $X\n• Libre: $X\n¿Te parece bien?",
  "data": {
    "ingreso_detectado": número o null,
    "distribucion": {
      "ahorro": número,
      "gastos_estimados": número,
      "libre": número
    }
  }
}

4. DETECTAR SUSCRIPCIONES:
Si el usuario menciona pagos recurrentes mensuales, mencionalo:
"Ojo, eso suena a suscripción recurrente. ¿Ya lo tenés 
contemplado en tus gastos fijos?"

5. CREAR META DE AHORRO:
Si el usuario pide crear una meta, guardala.

Formato obligatorio:
{
  "action": "CREATE_GOAL",
  "mensaje_respuesta": "tu respuesta conversacional",
  "data": {
    "name": "nombre de la meta",
    "target_amount": número_positivo,
    "current_amount": 0,
    "target_date": "YYYY-MM-DD o null",
    "icon": "emoji representativo",
    "color": "text-emerald-500"
  }
}

6. CREAR PRESUPUESTO:
Si el usuario pide crear un límite o presupuesto para una categoría:

Formato obligatorio:
{
  "action": "CREATE_BUDGET",
  "mensaje_respuesta": "tu respuesta conversacional",
  "data": {
    "category": "nombre en minúsculas sin espacios",
    "limit_amount": número_positivo,
    "month_period": "YYYY-MM"
  }
}

REGLA ESTRICTA DE MONTO:
Si el usuario menciona un gasto pero NO especifica el monto,
NO ejecutar la acción. Preguntar solamente:
"¿De cuánto fue?"

REGLA DE FORMATO:
Responder SIEMPRE con JSON válido.
El campo mensaje_respuesta es lo que ve el usuario.
Sin markdown, sin asteriscos, sin listas con guiones 
dentro del mensaje_respuesta.`;

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
    const { message, context } = body;

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
// Usá SIEMPRE esta fecha para transaction_date salvo que el usuario especifique otra.

DATOS ACTUALES DEL USUARIO:
- Ingreso mensual: $${context?.ingreso_mensual?.toLocaleString('es-AR') ?? 'no especificado'}
- Objetivo de ahorro: $${context?.objetivo_ahorro?.toLocaleString('es-AR') ?? 'no especificado'}
- Dinero disponible hoy: $${context?.dinero_disponible?.toLocaleString('es-AR') ?? 'no calculado'}
- Estado del mes: ${context?.estado_mes ?? 'sin datos'}

METAS ACTIVAS:
${context?.goals?.map((g: any) => 
  `- ${g.nombre}: $${g.actual?.toLocaleString('es-AR')} de $${g.objetivo?.toLocaleString('es-AR')} (falta $${g.faltante?.toLocaleString('es-AR')})` 
).join('\n') ?? 'Sin metas'}

CATEGORÍAS DISPONIBLES (usá EXACTAMENTE estos nombres, sin variaciones):
${context?.budgets?.map((b: any) => 
  `- "${b.categoria}"` 
).join('\n') ?? 'Sin categorías definidas'}

LÍMITES POR CATEGORÍA:
${context?.budgets?.map((b: any) => 
  `- ${b.categoria}: gastó $${b.gastado?.toLocaleString('es-AR')} de $${b.limite?.toLocaleString('es-AR')} (${b.estado})` 
).join('\n') ?? 'Sin límites'}
`;

    console.log('📝 Enviando a Groq con contexto financiero');

    try {
      const response = await tryGroq(groq, '', message, systemPromptConContexto);

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No se recibió respuesta de texto de Groq');
      }

      console.log('✅ Respuesta de Groq recibida');
      const aiResponse: ChatResponse = JSON.parse(content);
      
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
