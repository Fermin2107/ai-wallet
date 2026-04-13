// ============================================================
// AI Wallet — Sistema centralizado de aliases de categorías
// lib/category-aliases.ts
// ============================================================

// ─── Grupos semánticos ────────────────────────────────────────────────────────
//
// Un grupo semántico es un conjunto de conceptos relacionados.
// NO define a qué categoría va un gasto — eso lo define el usuario.
// Sirve SOLO como fallback: si el input no matchea ninguna userCategory
// directamente, buscamos qué userCategories pertenecen al mismo grupo
// semántico y usamos la más específica.

export const SEMANTIC_GROUPS: Record<string, string[]> = {
  food: [
    // supermercados y almacenes
    'supermercado', 'super', 'mercado', 'almacen', 'almacén', 'verduleria',
    'verdulería', 'carniceria', 'carnicería', 'panaderia', 'panadería',
    'fiambreria', 'fiambería', 'dietética', 'dietetica', 'frutería', 'fruteria',
    'minimarket', 'despensa', 'sodería', 'soderia', 'mayorista',
    // comida genérica
    'comida', 'alimentacion', 'alimentación', 'food', 'groceries',
    'víveres', 'viveres', 'provisiones', 'compras del super',
    // delivery
    'delivery', 'pedidosya', 'rappi', 'uber eats', 'ubereats',
    'pedir comida', 'ordenar comida',
    // fast food
    'mcdonalds', "mcdonald's", 'burger king', 'subway', 'kfc', 'mostaza',
    "wendy's", 'wendys', 'pizza', 'pizzeria', 'sushi', 'hamburguesería',
    'hamburgueseria', 'empanadas', 'medialunas', 'facturas',
    // cafetería
    'cafe', 'café', 'cafeteria', 'cafetería', 'starbucks', 'confiteria',
    'confitería',
    // kiosco
    'kiosco', 'kiosko',
  ],

  transport: [
    // combustible
    'nafta', 'combustible', 'gasoil', 'gnc', 'ypf', 'shell', 'axion',
    'puma', 'petrobras', 'estacion de servicio', 'estación de servicio',
    'surtidor', 'carga nafta', 'carga gasoil',
    // transporte público
    'colectivo', 'bondi', 'subte', 'subterraneo', 'subterráneo', 'tren',
    'sube', 'carga sube', 'recarga sube', 'boleto', 'transporte',
    'transporte publico', 'transporte público',
    // vehículo
    'estacionamiento', 'parking', 'cochera', 'peaje', 'autopista',
    'panamericana', 'riccheri', 'acceso oeste',
    // remis y apps
    'taxi', 'remis', 'uber', 'cabify', 'in driver', 'blablacar',
    // mecánica
    'mecanico', 'mecánico', 'taller', 'service auto', 'patente', 'vtv',
    'seguro auto', 'seguro moto',
    // bicicleta
    'bicicleta', 'bici', 'ecobici',
  ],

  entertainment: [
    // salidas nocturnas
    'bar', 'boliche', 'disco', 'cerveza', 'birra', 'trago', 'copa',
    'vino', 'cervezas', 'fernet', 'aperitivo',
    // restaurantes
    'restaurant', 'restaurante', 'resto', 'parrilla', 'bodegon',
    // espectáculos
    'cine', 'teatro', 'recital', 'show', 'concierto', 'evento',
    'museo', 'parque', 'zoológico', 'zoologico',
    // salida genérica
    'salida', 'salidas', 'entretenimiento', 'diversión', 'diversion', 'ocio',
    // social
    'fiesta', 'asado', 'cumpleaños', 'cumpleanos', 'reunión', 'reunion',
    // gaming
    'steam', 'playstation store', 'xbox store', 'nintendo eshop',
    'juego', 'videojuego',
  ],

  utilities: [
    // energía
    'luz', 'electricidad', 'edesur', 'edenor', 'edelap',
    'gas', 'metrogas', 'naturgy', 'camuzzi',
    'agua', 'aysa', 'absa',
    // telecomunicaciones
    'internet', 'wifi', 'fibertel', 'cablevision', 'telecentro',
    'telefono', 'teléfono', 'celular', 'linea celular', 'recarga celular',
    'cable', 'television', 'televisión',
    // housing
    'expensas', 'alquiler', 'consorcio', 'administración', 'administracion',
    // servicios del hogar
    'plomero', 'electricista', 'gasista', 'pintor',
    'limpieza', 'empleada', 'servicio doméstico', 'servicio domestico',
    // seguros
    'seguro', 'seguros', 'prepaga', 'obra social', 'mutual',
    // genérico
    'servicio', 'servicios', 'utilities',
  ],

  subscriptions: [
    // streaming video
    'netflix', 'disney', 'disney plus', 'disney+', 'hbo', 'hbo max',
    'amazon prime', 'star plus', 'star+', 'paramount', 'apple tv',
    'crunchyroll', 'mubi', 'flow',
    // música
    'spotify', 'apple music', 'deezer', 'tidal', 'youtube premium',
    // software / storage
    'icloud', 'google one', 'dropbox', 'adobe', 'microsoft 365',
    'office 365', 'canva', 'notion', 'figma', 'chatgpt', 'openai',
    // gaming subs
    'playstation plus', 'ps plus', 'xbox game pass', 'nintendo online',
    // genérico
    'suscripcion', 'suscripción', 'subscripcion', 'subscripción',
    'membresía', 'membresia', 'plan mensual', 'plan anual',
    'renovación', 'renovacion', 'suscripciones',
  ],

  health: [
    // farmacia
    'farmacia', 'farmacity', 'dr ahorro', 'farmahorro',
    'medicamento', 'medicamentos', 'remedio', 'remedios',
    'pastillas', 'antibiótico', 'antibiotico', 'vacuna',
    // médicos
    'medico', 'médico', 'doctor', 'doctora', 'consulta médica',
    'consultorio', 'dentista', 'odontólogo', 'odontologo', 'ortodoncia',
    'kinesiologo', 'kinesiólogo', 'fisioterapeuta',
    'psicólogo', 'psicologo', 'psiquiatra', 'terapeuta', 'terapia',
    'oftalmólogo', 'oftalmologo', 'óptica', 'optica',
    // instituciones
    'clínica', 'clinica', 'hospital', 'sanatorio', 'guardia',
    'análisis', 'analisis', 'laboratorio', 'ecografía', 'radiografía',
    // genérico
    'salud', 'health',
  ],

  clothing: [
    'ropa', 'indumentaria', 'vestimenta', 'clothing',
    'zapatillas', 'zapatos', 'botas', 'sandalias', 'ojotas', 'calzado',
    'cartera', 'bolso', 'cinturón', 'cinturon',
    'anteojos', 'lentes', 'gorra', 'gorro', 'bufanda', 'guantes',
    'medias', 'ropa interior', 'calzón', 'boxer',
    'zara', 'h&m', 'hm', 'forever 21', 'adidas', 'nike', 'puma',
    'lacoste', 'polo', 'tommy', "levi's", 'levis', 'gap',
    'shopping', 'outlet', 'tienda de ropa',
  ],

  fitness: [
    'gym', 'gimnasio', 'fitness', 'crossfit', 'pilates', 'yoga',
    'spinning', 'box', 'boxeo', 'musculación', 'musculacion',
    'entrenamiento personal', 'personal trainer',
    'natación', 'natacion', 'pileta', 'piscina',
    'artes marciales', 'judo', 'karate', 'taekwondo',
    'futbol 5', 'pádel', 'padel', 'tenis', 'squash',
    'suplementos', 'proteína', 'proteina', 'creatina', 'whey',
    'running', 'maratón', 'maraton',
  ],

  pets: [
    'mascota', 'mascotas', 'pet', 'pets',
    'perro', 'gato', 'veterinario', 'veterinaria', 'vet',
    'vacuna perro', 'vacuna gato', 'antipulgas', 'antiparasitario',
    'petshop', 'pet shop', 'tienda mascotas',
    'comida perro', 'comida gato', 'croquetas', 'royal canin',
    'pedigree', 'whiskas', 'purina',
    'grooming', 'peluquería canina', 'peluqueria canina',
    'guardería canina', 'guarderia canina', 'hotel mascotas',
    'collar', 'correa', 'juguete perro', 'arenero',
  ],

  education: [
    'educacion', 'educación',
    'universidad', 'facultad', 'colegio', 'escuela', 'instituto',
    'cursillo', 'curso', 'taller', 'seminario',
    'capacitación', 'capacitacion',
    'cuota colegio', 'cuota universidad', 'matrícula', 'matricula',
    'aranceles', 'inscripción', 'inscripcion',
    'inglés', 'ingles', 'idioma',
    'libro', 'libros', 'fotocopias', 'librería', 'libreria',
    'útiles', 'utiles', 'material escolar',
    'udemy', 'coursera', 'platzi', 'coderhouse', 'digital house',
  ],

  hobbies: [
    'hobby', 'hobbies',
    'pintura', 'pinceles', 'lienzo', 'acuarela', 'acrílico',
    'bordado', 'tejido', 'costura', 'tela', 'hilo', 'lana',
    'cerámica', 'ceramica', 'arcilla',
    'guitarra', 'piano', 'batería', 'bateria', 'instrumento musical',
    'fotografía', 'fotografia', 'cámara', 'camara', 'tripode',
    'manga', 'comic', 'cómic', 'colección', 'coleccion', 'figura', 'funko',
    'jardineria', 'jardinería', 'planta', 'plantas', 'maceta',
    'juegos de mesa', 'puzzle', 'rompecabezas',
  ],

  travel: [
    'viaje', 'viajes', 'vacaciones', 'turismo',
    'pasaje', 'vuelo', 'avión', 'avion', 'aerolinea', 'aerolínea',
    'aerolíneas argentinas', 'jetsmart', 'flybondi', 'latam',
    'hotel', 'hostel', 'airbnb', 'alojamiento', 'hospedaje',
    'booking', 'trivago', 'despegar',
    'excursión', 'excursion', 'tour', 'crucero',
    'maleta', 'valija', 'mochila de viaje',
    'seguro de viaje', 'visa', 'pasaporte',
    'souvenirs', 'souvenir',
  ],

  savings: [
    'ahorro', 'ahorros', 'saving', 'savings',
    'plazo fijo', 'fci', 'fondo', 'inversión', 'inversion',
    'cuenta remunerada', 'reserva', 'fondo de emergencia',
    'colchón', 'colchon',
  ],

  income: [
    'sueldo', 'salario', 'jornal',
    'honorarios', 'factura', 'freelance',
    'cobro', 'cobranza', 'pago recibido',
    'bono', 'aguinaldo', 'sac', 'gratificación', 'gratificacion',
    'ingreso', 'ingresos',
    'alquiler cobrado', 'renta', 'dividendo',
    'venta', 'ventas',
  ],
}

// ─── Índice: alias → grupo semántico ─────────────────────────────────────────
//
// Construido una sola vez al importar.
// aliasToGroup.get('netflix') → 'subscriptions'
// aliasToGroup.get('super') → 'food'

const aliasToGroup = new Map<string, string>()

for (const [group, terms] of Object.entries(SEMANTIC_GROUPS)) {
  for (const term of terms) {
    aliasToGroup.set(term.toLowerCase().trim(), group)
  }
}

// ─── getGroupForInput ─────────────────────────────────────────────────────────
//
// Devuelve el grupo semántico al que pertenece un input.
// Usa word-boundary matching para evitar falsos positivos tipo
// "pantalón" → food por contener "pan".

function getGroupForInput(input: string): string | null {
  const normalized = input.toLowerCase().trim()

  // 1. Match exacto
  const exact = aliasToGroup.get(normalized)
  if (exact) return exact

  // 2. Word-boundary: el alias es una palabra completa dentro del input
  //    Evita "pan" matcheando "pantalón"
  for (const [alias, group] of Array.from(aliasToGroup.entries())) {
    if (alias.length <= 2) continue // ignorar aliases muy cortos
    // Construir regex con word boundary adaptado a español
    // \b no funciona bien con tildes, así que usamos espacios/inicio/fin
    const pattern = new RegExp(
      `(^|[\\s,./\\-])${escapeRegex(alias)}($|[\\s,./\\-])`,
      'i'
    )
    if (pattern.test(normalized)) return group
  }

  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── resolveCategory ──────────────────────────────────────────────────────────
//
// Función principal. Recibe:
//   - input: lo que devolvió la IA o escribió el usuario
//   - userCategories: nombres exactos de los budgets del usuario (de DB)
//   - budgetAliases: mapa categoria → aliases custom (de la columna JSONB en DB)
//
// Orden de prioridad (resuelve el punto 3 del análisis de riesgo):
//   1. ¿Existe una userCategory con ese nombre exacto? → esa
//   2. ¿El input es alias custom de alguna userCategory? → esa
//   3. ¿El input es alias del grupo semántico de alguna userCategory? → la más específica
//   4. Fallback → "otros" (si existe en userCategories) o el input original

export function resolveCategory(
  input: string,
  userCategories: string[] = [],
  budgetAliases: Record<string, string[]> = {}
): string {
  if (!input) return userCategories.includes('otros') ? 'otros' : (userCategories[0] ?? 'otros')

  const normalized = input.toLowerCase().trim()

  // ── PASO 1: Match exacto contra userCategories ────────────────────────────
  const exactMatch = userCategories.find(c => c.toLowerCase().trim() === normalized)
  if (exactMatch) return exactMatch.toLowerCase().trim()

  // ── PASO 2: Aliases custom del usuario (vienen de DB) ────────────────────
  // Tienen prioridad sobre el sistema global porque el usuario los definió
  for (const [category, aliases] of Object.entries(budgetAliases)) {
    // Solo evaluar si esa categoría existe en userCategories
    if (!userCategories.some(uc => uc.toLowerCase().trim() === category.toLowerCase().trim())) {
      continue
    }
    for (const alias of aliases) {
      const a = alias.toLowerCase().trim()
      if (a === normalized) return category.toLowerCase().trim()
      // Word-boundary matching
      const pattern = new RegExp(
        `(^|[\\s,./\\-])${escapeRegex(a)}($|[\\s,./\\-])`,
        'i'
      )
      if (pattern.test(normalized)) return category.toLowerCase().trim()
    }
  }

  // ── PASO 3: Grupo semántico ───────────────────────────────────────────────
  // Detectar a qué grupo pertenece el input
  const inputGroup = getGroupForInput(normalized)

  if (inputGroup) {
    // Buscar qué userCategories pertenecen al mismo grupo
    const candidatesInGroup = userCategories.filter(uc => {
      const ucNorm = uc.toLowerCase().trim()
      const ucGroup = getGroupForInput(ucNorm)
      return ucGroup === inputGroup
    })

    if (candidatesInGroup.length === 1) {
      // Solo una userCategory en ese grupo → match directo
      return candidatesInGroup[0].toLowerCase().trim()
    }

    if (candidatesInGroup.length > 1) {
      // Varias userCategories en el mismo grupo (ej: "supermercado" y "alimentacion")
      // Elegir la más específica: la que tiene mayor overlap de caracteres con el input
      const scored = candidatesInGroup.map(c => ({
        category: c.toLowerCase().trim(),
        score: overlapScore(normalized, c.toLowerCase().trim()),
      }))
      scored.sort((a, b) => b.score - a.score)
      return scored[0].category
    }
  }

  // ── PASO 4: Fallback ──────────────────────────────────────────────────────
  if (userCategories.some(uc => uc.toLowerCase().trim() === 'otros')) {
    return 'otros'
  }

  // Si no tiene "otros" como categoría, mantener el input original
  // (podría ser una categoría nueva que la IA detectó correctamente)
  return normalized
}

// ─── overlapScore ─────────────────────────────────────────────────────────────
//
// Puntaje simple de solapamiento entre dos strings.
// "super chino" vs "supermercado" → mayor score que vs "alimentacion"
// porque comparten el prefijo "super".

function overlapScore(a: string, b: string): number {
  const aWords = a.split(/\s+/)
  const bWords = b.split(/\s+/)
  const bWordsSet = new Set(bWords)
  let score = 0
  for (const w of aWords) {
    if (bWordsSet.has(w)) {
      score += w.length * 2
    } else {
      const match = bWords.find(bw => bw.startsWith(w) || w.startsWith(bw))
      if (match) score += Math.min(w.length, match.length)
    }
  }
  return score
}

// ─── categoriasMatch ──────────────────────────────────────────────────────────
//
// Para BudgetTab: ¿debe este gasto (txCategory) contarse en este budget?
// Usa resolveCategory para normalizar la txCategory y ver si resulta
// en la misma categoría que el budget.

export function categoriasMatch(
  budgetCategory: string,
  txCategory: string,
  userCategories: string[] = [],
  budgetAliases: Record<string, string[]> = {}
): boolean {
  const bc = budgetCategory.toLowerCase().trim()
  const tc = txCategory.toLowerCase().trim()

  // Exacto siempre gana
  if (bc === tc) return true

  // Resolver la categoría de la transacción
  const resolved = resolveCategory(tc, userCategories, budgetAliases)
  return resolved === bc
}

// ─── generateAliasesForCustomCategory ────────────────────────────────────────
//
// Para una categoría nueva que el usuario crea (no está en SEMANTIC_GROUPS),
// genera aliases básicos automáticos para sembrar el JSONB.

export function generateAliasesForCustomCategory(category: string): string[] {
  const cat = category.toLowerCase().trim()

  // Si ya tiene grupo semántico, no hace falta generar
  if (getGroupForInput(cat)) return []

  const aliases: string[] = [cat]

  // Singular ↔ plural básico
  if (cat.endsWith('s') && cat.length > 4) {
    aliases.push(cat.slice(0, -1))
  } else {
    aliases.push(cat + 's')
  }

  // Sin tilde
  const sinTilde = cat
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u')
  if (sinTilde !== cat) aliases.push(sinTilde)

  return Array.from(new Set(aliases))
}