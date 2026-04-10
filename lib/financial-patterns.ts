// ============================================================
// AI Wallet — Motor de Patrones Temporales
// lib/financial-patterns.ts
// ============================================================
// REGLA DE ORO: La IA no calcula nada. Todo se resuelve acá.
// Esta función detecta patrones a partir del historial de
// transacciones y devuelve un objeto FinancialPatterns listo
// para pasarle a Groq como contexto ya procesado.
// ============================================================

import type { SimpleTransaction } from '../hooks/useSimpleSupabase'

// ── Tipos de salida ──────────────────────────────────────────────────────────

export interface DiaSemanaStats {
  promedio: number
  transacciones: number
}

export type NombreDia =
  | 'lunes'
  | 'martes'
  | 'miércoles'
  | 'jueves'
  | 'viernes'
  | 'sábado'
  | 'domingo'

export interface PatronesDiaSemana {
  lunes:      DiaSemanaStats
  martes:     DiaSemanaStats
  miércoles:  DiaSemanaStats
  jueves:     DiaSemanaStats
  viernes:    DiaSemanaStats
  sábado:     DiaSemanaStats
  domingo:    DiaSemanaStats
  diaMasGasto:   NombreDia
  diaMenosGasto: NombreDia
  factorPico: number   // cuántas veces más gasta el día pico vs el promedio global
}

export interface ComparativaCategoria {
  categoria:    string
  mesActual:    number
  mesAnterior:  number
  delta:        number     // mesActual - mesAnterior (negativo = gastó menos → bien)
  deltaPct:     number     // redondeado
  tendencia:    'subio' | 'bajo' | 'estable'
}

export interface ComparativaMeses {
  mesActual:              string   // YYYY-MM
  mesAnterior:            string   // YYYY-MM
  totalMesActual:         number
  totalMesAnterior:       number
  deltaTotalPct:          number
  tendencia:              'mejorando' | 'empeorando' | 'estable'
  porCategoria:           ComparativaCategoria[]
  categoriasMasSubieron:  Array<{ categoria: string; deltaPct: number }>
  categoriasMasBajaron:   Array<{ categoria: string; deltaPct: number }>
}

export interface Recurrente {
  descripcion:            string
  categoria:              string
  montoPromedio:          number
  frecuenciaDias:         number
  tipo:                   'mensual' | 'semanal' | 'irregular'
  proximaFechaEstimada:   string   // YYYY-MM-DD
  esProbableSuscripcion:  boolean
  apariciones:            number
}

export interface GastosHormiga {
  umbral:           number
  cantidad:         number
  totalSumado:      number
  pctDelGastoTotal: number
  porCategoria:     Array<{ categoria: string; cantidad: number; total: number }>
  esSignificativo:  boolean   // true si totalSumado > 10% del gasto total del mes
}

export interface MesTendencia {
  mes:        string          // YYYY-MM
  total:      number
  vsAnterior: number | null   // null para el primero de la serie
}

export interface Tendencia3Meses {
  meses:             MesTendencia[]
  direccion:         'aumentando' | 'disminuyendo' | 'estable' | 'sin_datos'
  promedioMensual:   number
}

export interface FinancialPatterns {
  diasSemana:       PatronesDiaSemana
  comparativaMeses: ComparativaMeses
  recurrentes:      Recurrente[]
  gastosHormiga:    GastosHormiga
  tendencia3Meses:  Tendencia3Meses
}

// ── Constantes ───────────────────────────────────────────────────────────────


// Palabras ignorables típicas en descripciones de bancos argentinos
const PALABRAS_IGNORABLES = new Set([
  'visa', 'mastercard', 'amex', 'naranja', 'datos', 'compra',
  'debito', 'debito', 'credito', 'credito', 'pago', 'cuota',
  'cargo', 'cargos', 'comision', 'comision', 'banco', 'bank',
  'digital', 'online', 'www', 'http', 'https', 'arg',
  'argentina', 'sa', 'srl', 'sl',
])

const UMBRAL_HORMIGA_MIN = 500
const UMBRAL_HORMIGA_MAX = 3000
const DELTA_ESTABLE_PCT  = 5   // ± 5% se considera estable

// ── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Normaliza una descripción para agrupar recurrentes:
 * lowercase, sin tildes, sin números, sin puntuación, sin palabras ignorables.
 */
function normalizarDescripcion(desc: string): string {
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')    // quitar tildes
    .replace(/[*.,/#!$%^&()={}[\]:;"'<>?\\|`~@]/g, ' ')  // quitar puntuación
    .replace(/\d+/g, ' ')               // quitar números
    .split(/\s+/)
    .filter(word => word.length > 2 && !PALABRAS_IGNORABLES.has(word))
    .join(' ')
    .trim()
}

/** Agrega días al formato YYYY-MM-DD */
function addDias(fechaStr: string, dias: number): string {
  const d = new Date(fechaStr + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Calcula la diferencia en días entre dos fechas YYYY-MM-DD */
function diffDias(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

/** Mes anterior a YYYY-MM */
function mesAnteriorA(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * detectPatterns
 *
 * Analiza el historial completo de transacciones y devuelve patrones
 * pre-calculados para que Groq los use sin hacer ningún cálculo propio.
 *
 * Performance: recorre el array de transacciones la menor cantidad de
 * veces posible. Los filtros por fecha y tipo se hacen en una sola
 * pasada inicial, los sub-análisis trabajan sobre los arrays ya filtrados.
 *
 * @param transactions  - Array completo del hook useSimpleSupabase
 * @param selectedMonth - Mes actual en formato YYYY-MM
 * @param ingresoEfectivo - Ingreso efectivo del mes (puede ser 0)
 */
export function detectPatterns(
  transactions: SimpleTransaction[],
  selectedMonth: string,
  ingresoEfectivo: number
): FinancialPatterns {

  const hoy = new Date()

  // ── PASADA ÚNICA: clasificar todas las transacciones de una vez ──────────
  // Calculamos las fechas límite una sola vez y particionamos en arrays
  // específicos. Evitamos múltiples .filter() encadenados sobre el array
  // completo.

  const hace60Dias    = new Date(hoy.getTime() - 60  * 24 * 60 * 60 * 1000)
  const hace90Dias    = new Date(hoy.getTime() - 90  * 24 * 60 * 60 * 1000)
  const mesAnterior   = mesAnteriorA(selectedMonth)

  // Los últimos 3 meses completos (excluyendo el mes actual)
  const [_selY, _selM] = selectedMonth.split('-').map(Number)
  const mes3  = mesAnteriorA(mesAnteriorA(mesAnterior))  // 3 meses antes del actual
  const mes2  = mesAnteriorA(mesAnterior)                // 2 meses antes
  // mes1 = mesAnterior, mes0 = selectedMonth

  // Arrays particionados (una pasada)
  const gastos60:        SimpleTransaction[] = []
  const gastos90:        SimpleTransaction[] = []
  const gastosMesActual: SimpleTransaction[] = []
  const gastosMesAnt:    SimpleTransaction[] = []
  const gastosMes3:      SimpleTransaction[] = []   // 3 meses antes
  const gastosMes2:      SimpleTransaction[] = []   // 2 meses antes

  for (const tx of transactions) {
    if (tx.type !== 'gasto') continue
    const fecha    = tx.transaction_date
    const mesStr   = fecha.slice(0, 7)
    const fechaObj = new Date(fecha + 'T00:00:00')

    if (fechaObj >= hace90Dias) {
      gastos90.push(tx)
      if (fechaObj >= hace60Dias) {
        gastos60.push(tx)
      }
    }

    if (mesStr === selectedMonth)  gastosMesActual.push(tx)
    if (mesStr === mesAnterior)    gastosMesAnt.push(tx)
    if (mesStr === mes2)           gastosMes2.push(tx)
    if (mesStr === mes3)           gastosMes3.push(tx)
  }

  // ── 1. PATRONES POR DÍA DE SEMANA ──────────────────────────────────────

  const diasSemana = calcularPatronesDiaSemana(gastos60)

  // ── 2. COMPARATIVA MES A MES ────────────────────────────────────────────

  const comparativaMeses = calcularComparativaMeses(
    gastosMesActual,
    gastosMesAnt,
    selectedMonth,
    mesAnterior
  )

  // ── 3. RECURRENTES Y SUSCRIPCIONES ─────────────────────────────────────

  const recurrentes = detectarRecurrentes(gastos90, hoy)

  // ── 4. GASTOS HORMIGA ───────────────────────────────────────────────────

  const gastosHormiga = calcularGastosHormiga(
    gastosMesActual,
    ingresoEfectivo
  )

  // ── 5. TENDENCIA 3 MESES ────────────────────────────────────────────────

  const tendencia3Meses = calcularTendencia3Meses(
    gastosMes3,
    gastosMes2,
    gastosMesAnt,
    mes3,
    mes2,
    mesAnterior,
    selectedMonth
  )

  return {
    diasSemana,
    comparativaMeses,
    recurrentes,
    gastosHormiga,
    tendencia3Meses,
  }
}

// ── Sub-funciones de análisis ────────────────────────────────────────────────

function calcularPatronesDiaSemana(gastos60: SimpleTransaction[]): PatronesDiaSemana {

  // Acumular por día de semana (0=dom, 1=lun, ..., 6=sáb)
  const totalPorDia:  number[] = [0, 0, 0, 0, 0, 0, 0]
  const txPorDia:     number[] = [0, 0, 0, 0, 0, 0, 0]
  // Rastrear semanas únicas con al menos una transacción por día
  const semanasPorDia: Set<string>[] = Array.from({ length: 7 }, () => new Set())

  for (const tx of gastos60) {
    const d         = new Date(tx.transaction_date + 'T00:00:00')
    const diaSemana = d.getDay()
    // Clave de semana: año + número de semana ISO
    const semanaKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`

    totalPorDia[diaSemana]  += tx.amount
    txPorDia[diaSemana]     += 1
    semanasPorDia[diaSemana].add(semanaKey)
  }

  // Promedios: total / semanas con al menos 1 tx ese día
  const promedios: number[] = totalPorDia.map((total, i) => {
    const semanas = semanasPorDia[i].size
    return semanas > 0 ? Math.round(total / semanas) : 0
  })

  // Promedio global (solo días con datos)
  const diasConDatos = promedios.filter(p => p > 0)
  const promedioGlobal = diasConDatos.length > 0
    ? diasConDatos.reduce((s, v) => s + v, 0) / diasConDatos.length
    : 1  // evitar división por 0

  // Días indexados 1-6 + 0 → nombres
  const estadisticas: Record<NombreDia, DiaSemanaStats> = {
    lunes:      { promedio: promedios[1], transacciones: txPorDia[1] },
    martes:     { promedio: promedios[2], transacciones: txPorDia[2] },
    miércoles:  { promedio: promedios[3], transacciones: txPorDia[3] },
    jueves:     { promedio: promedios[4], transacciones: txPorDia[4] },
    viernes:    { promedio: promedios[5], transacciones: txPorDia[5] },
    sábado:     { promedio: promedios[6], transacciones: txPorDia[6] },
    domingo:    { promedio: promedios[0], transacciones: txPorDia[0] },
  }

  // Día pico y mínimo (solo considerar días con al menos 1 transacción)
  const diasOrdenados = (Object.entries(estadisticas) as [NombreDia, DiaSemanaStats][])
    .filter(([, stats]) => stats.transacciones > 0)
    .sort((a, b) => b[1].promedio - a[1].promedio)

  const diaMasGasto   = diasOrdenados.length > 0 ? diasOrdenados[0][0]                         : 'lunes'
  const diaMenosGasto = diasOrdenados.length > 1 ? diasOrdenados[diasOrdenados.length - 1][0]  : 'domingo'

  const promedioPico  = estadisticas[diaMasGasto].promedio
  const factorPico    = promedioGlobal > 0
    ? Math.round((promedioPico / promedioGlobal) * 10) / 10
    : 1

  return {
    ...estadisticas,
    diaMasGasto,
    diaMenosGasto,
    factorPico,
  }
}

function calcularComparativaMeses(
  gastosMesActual: SimpleTransaction[],
  gastosMesAnt:    SimpleTransaction[],
  selectedMonth:   string,
  mesAnterior:     string
): ComparativaMeses {

  // Totales por categoría en cada mes
  const catActual:  Record<string, number> = {}
  const catAnterior: Record<string, number> = {}

  for (const tx of gastosMesActual) {
    catActual[tx.category] = (catActual[tx.category] || 0) + tx.amount
  }
  for (const tx of gastosMesAnt) {
    catAnterior[tx.category] = (catAnterior[tx.category] || 0) + tx.amount
  }

  const totalMesActual  = Object.values(catActual).reduce((s, v) => s + v, 0)
  const totalMesAnterior = Object.values(catAnterior).reduce((s, v) => s + v, 0)

  const deltaTotalPct = totalMesAnterior > 0
    ? Math.round(((totalMesActual - totalMesAnterior) / totalMesAnterior) * 100)
    : 0

  const tendenciaTotal: ComparativaMeses['tendencia'] =
    Math.abs(deltaTotalPct) <= DELTA_ESTABLE_PCT ? 'estable' :
    deltaTotalPct < 0 ? 'mejorando' : 'empeorando'

  // Por categoría: todas las que aparecen en al menos un mes
  const todasCategorias = new Set([
    ...Object.keys(catActual),
    ...Object.keys(catAnterior),
  ])

  const porCategoria: ComparativaCategoria[] = []

  for (const cat of Array.from(todasCategorias)) {
    const actual   = Math.round(catActual[cat]   || 0)
    const anterior = Math.round(catAnterior[cat] || 0)
    const delta    = actual - anterior
    const deltaPct = anterior > 0
      ? Math.round((delta / anterior) * 100)
      : actual > 0 ? 100 : 0

    const tendencia: ComparativaCategoria['tendencia'] =
      Math.abs(deltaPct) <= DELTA_ESTABLE_PCT ? 'estable' :
      delta > 0 ? 'subio' : 'bajo'

    porCategoria.push({ categoria: cat, mesActual: actual, mesAnterior: anterior, delta, deltaPct, tendencia })
  }

  // Top 2 que más subieron / bajaron
  const queMasSubieron = [...porCategoria]
    .filter(c => c.tendencia === 'subio')
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 2)
    .map(c => ({ categoria: c.categoria, deltaPct: c.deltaPct }))

  const queMasBajaron = [...porCategoria]
    .filter(c => c.tendencia === 'bajo')
    .sort((a, b) => a.deltaPct - b.deltaPct)
    .slice(0, 2)
    .map(c => ({ categoria: c.categoria, deltaPct: c.deltaPct }))

  return {
    mesActual:              selectedMonth,
    mesAnterior,
    totalMesActual:         Math.round(totalMesActual),
    totalMesAnterior:       Math.round(totalMesAnterior),
    deltaTotalPct,
    tendencia:              tendenciaTotal,
    porCategoria,
    categoriasMasSubieron:  queMasSubieron,
    categoriasMasBajaron:   queMasBajaron,
  }
}

function detectarRecurrentes(
  gastos90: SimpleTransaction[],
  _hoy:     Date
): Recurrente[] {

  if (gastos90.length < 2) return []

  // ── Estrategia de agrupación: Categoría + Monto (±15%) tiene prioridad
  // sobre descripción exacta. Descripción normalizada es secundaria.
  //
  // Clave del grupo: `categoria::descripcionNormalizada`
  // Si la descripción normalizada es muy corta (<3 chars tras limpiar),
  // agrupamos solo por categoría + rango de monto.

  type GrupoRecurrente = {
    descripcionOriginal: string
    descripcionNorm:     string
    categoria:           string
    montos:              number[]
    fechas:              string[]   // YYYY-MM-DD ordenadas asc
    apariciones:         number
  }

  const grupos: Record<string, GrupoRecurrente> = {}

  for (const tx of gastos90) {
    const descNorm   = normalizarDescripcion(tx.description)
    const montoBase  = tx.amount

    // Clave primaria: categoría + descripción normalizada (si tiene suficiente info)
    const clavePrimaria = descNorm.length >= 3
      ? `${tx.category}::${descNorm}`
      : `${tx.category}::_sin_desc`

    // Buscar si ya existe un grupo con monto similar (±15%)
    let claveElegida: string | null = null

    for (const clave in grupos) {
      if (!clave.startsWith(tx.category + '::')) continue
      const g = grupos[clave]
      const promExistente = g.montos.reduce((s, v) => s + v, 0) / g.montos.length
      const diferencia    = Math.abs(montoBase - promExistente) / promExistente
      // Misma categoría + descripción similar + monto ±15%
      if (diferencia <= 0.15 && clave === clavePrimaria) {
        claveElegida = clave
        break
      }
    }

    if (!claveElegida) claveElegida = clavePrimaria

    if (!grupos[claveElegida]) {
      grupos[claveElegida] = {
        descripcionOriginal: tx.description,
        descripcionNorm:     descNorm,
        categoria:           tx.category,
        montos:              [],
        fechas:              [],
        apariciones:         0,
      }
    }

    grupos[claveElegida].montos.push(montoBase)
    grupos[claveElegida].fechas.push(tx.transaction_date)
    grupos[claveElegida].apariciones += 1
  }

  const recurrentes: Recurrente[] = []

  for (const grupo of Object.values(grupos)) {
    if (grupo.apariciones < 2) continue

    // Ordenar fechas
    grupo.fechas.sort()

    // Calcular intervalos entre fechas consecutivas
    const intervalos: number[] = []
    for (let i = 1; i < grupo.fechas.length; i++) {
      intervalos.push(diffDias(grupo.fechas[i - 1], grupo.fechas[i]))
    }

    if (intervalos.length === 0) continue

    const intervaloPromedio = intervalos.reduce((s, v) => s + v, 0) / intervalos.length

    // Clasificar frecuencia
    let tipo: Recurrente['tipo']
    let frecuenciaDias: number

    if (intervaloPromedio >= 25 && intervaloPromedio <= 35) {
      tipo            = 'mensual'
      frecuenciaDias  = 30
    } else if (intervaloPromedio >= 6 && intervaloPromedio <= 8) {
      tipo            = 'semanal'
      frecuenciaDias  = 7
    } else {
      // Solo incluir como irregular si el intervalo tiene cierta consistencia
      // (desviación estándar no muy alta relativa al promedio)
      const desviacion = Math.sqrt(
        intervalos.reduce((s, v) => s + Math.pow(v - intervaloPromedio, 2), 0) / intervalos.length
      )
      if (desviacion / intervaloPromedio > 0.5) continue  // demasiado irregular
      tipo           = 'irregular'
      frecuenciaDias = Math.round(intervaloPromedio)
    }

    const montoPromedio  = Math.round(
      grupo.montos.reduce((s, v) => s + v, 0) / grupo.montos.length
    )
    const ultimaFecha    = grupo.fechas[grupo.fechas.length - 1]
    const proximaFecha   = addDias(ultimaFecha, frecuenciaDias)

    // Es probable suscripción si la categoría dice "suscripciones"
    // o si el monto es exactamente igual en todas las apariciones
    const todosMontoIgual = grupo.montos.every(m => m === grupo.montos[0])
    const esProbableSuscripcion =
      grupo.categoria.toLowerCase().includes('suscr') ||
      grupo.categoria.toLowerCase().includes('streaming') ||
      todosMontoIgual

    recurrentes.push({
      descripcion:           grupo.descripcionOriginal,
      categoria:             grupo.categoria,
      montoPromedio,
      frecuenciaDias,
      tipo,
      proximaFechaEstimada:  proximaFecha,
      esProbableSuscripcion,
      apariciones:           grupo.apariciones,
    })
  }

  // Ordenar por monto promedio descendente (los más costosos primero)
  return recurrentes.sort((a, b) => b.montoPromedio - a.montoPromedio)
}

function calcularGastosHormiga(
  gastosMesActual: SimpleTransaction[],
  ingresoEfectivo: number
): GastosHormiga {

  const totalGastadoMes = gastosMesActual.reduce((s, tx) => s + tx.amount, 0)

  // Edge case: ingreso 0 o inválido → usar umbral mínimo
  // Protección estricta contra NaN y división por cero
  const ingresoValido =
    typeof ingresoEfectivo === 'number' &&
    isFinite(ingresoEfectivo) &&
    ingresoEfectivo > 0
      ? ingresoEfectivo
      : 0

  const umbralCalculado = ingresoValido > 0
    ? ingresoValido * 0.02
    : 0

  const umbral = Math.round(
    Math.max(
      UMBRAL_HORMIGA_MIN,
      Math.min(UMBRAL_HORMIGA_MAX, umbralCalculado)
    )
  )

  // Filtrar gastos hormiga y acumular por categoría en un solo bucle
  const catMap: Record<string, { cantidad: number; total: number }> = {}
  let cantidad   = 0
  let totalSumado = 0

  for (const tx of gastosMesActual) {
    if (tx.amount >= umbral) continue

    cantidad     += 1
    totalSumado  += tx.amount

    if (!catMap[tx.category]) catMap[tx.category] = { cantidad: 0, total: 0 }
    catMap[tx.category].cantidad += 1
    catMap[tx.category].total   += tx.amount
  }

  const totalSumadoRedondeado = Math.round(totalSumado)

  // Protección: si totalGastadoMes es 0 evitar NaN
  const pctDelGastoTotal = totalGastadoMes > 0
    ? Math.round((totalSumado / totalGastadoMes) * 100)
    : 0

  const porCategoria = Object.entries(catMap)
    .map(([categoria, { cantidad, total }]) => ({
      categoria,
      cantidad,
      total: Math.round(total),
    }))
    .sort((a, b) => b.total - a.total)

  return {
    umbral,
    cantidad,
    totalSumado:      totalSumadoRedondeado,
    pctDelGastoTotal,
    porCategoria,
    esSignificativo:  totalSumadoRedondeado > 0 && pctDelGastoTotal > 10,
  }
}

function calcularTendencia3Meses(
  gastosMes3:   SimpleTransaction[],
  gastosMes2:   SimpleTransaction[],
  gastosMesAnt: SimpleTransaction[],
  mes3Label:    string,
  mes2Label:    string,
  mesAntLabel:  string,
  _mesActual:   string   // no incluir el mes en curso
): Tendencia3Meses {

  const totalMes3  = Math.round(gastosMes3.reduce((s, tx) => s + tx.amount, 0))
  const totalMes2  = Math.round(gastosMes2.reduce((s, tx) => s + tx.amount, 0))
  const totalMes1  = Math.round(gastosMesAnt.reduce((s, tx) => s + tx.amount, 0))

  // Solo incluir meses con datos
  const mesesConDatos: MesTendencia[] = []

  const push = (mes: string, total: number, prev: number | null) => {
    if (total === 0) return   // mes sin transacciones = no incluir
    const vsAnterior = prev !== null && prev > 0
      ? Math.round(total - prev)
      : null
    mesesConDatos.push({ mes, total, vsAnterior })
  }

  push(mes3Label,  totalMes3,  null)
  push(mes2Label,  totalMes2,  totalMes3 || null)
  push(mesAntLabel, totalMes1, totalMes2 || totalMes3 || null)

  if (mesesConDatos.length < 2) {
    return {
      meses:          mesesConDatos,
      direccion:      'sin_datos',
      promedioMensual: mesesConDatos.length === 1 ? mesesConDatos[0].total : 0,
    }
  }

  // Dirección: comparar el promedio de la primera mitad vs la segunda
  const totales     = mesesConDatos.map(m => m.total)
  const primero     = totales[0]
  const ultimo      = totales[totales.length - 1]
  const cambio      = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0

  const direccion: Tendencia3Meses['direccion'] =
    Math.abs(cambio) <= DELTA_ESTABLE_PCT ? 'estable' :
    cambio > 0 ? 'aumentando' : 'disminuyendo'

  const promedioMensual = Math.round(
    totales.reduce((s, v) => s + v, 0) / totales.length
  )

  return {
    meses:          mesesConDatos,
    direccion,
    promedioMensual,
  }
}

// ── Serialización para el contexto de Groq ───────────────────────────────────

/**
 * Convierte FinancialPatterns al objeto comprimido que va en buildBackendContext.
 * Solo incluye los datos que Groq necesita para generar insights.
 */
export function serializePatterns(patterns: FinancialPatterns) {
  return {
    dia_pico:              patterns.diasSemana.diaMasGasto,
    factor_pico:           patterns.diasSemana.factorPico,
    tendencia_mes:         patterns.comparativaMeses.tendencia,
    delta_total_pct:       patterns.comparativaMeses.deltaTotalPct,
    categorias_que_subieron: patterns.comparativaMeses.categoriasMasSubieron,
    recurrentes_count:     patterns.recurrentes.length,
    recurrentes:           patterns.recurrentes.map(r => ({
      descripcion: r.descripcion,
      monto:       r.montoPromedio,
      tipo:        r.tipo,
      proxima:     r.proximaFechaEstimada,
    })),
    hormiga_significativo: patterns.gastosHormiga.esSignificativo,
    hormiga_total:         patterns.gastosHormiga.totalSumado,
    hormiga_pct:           patterns.gastosHormiga.pctDelGastoTotal,
    tendencia_3_meses:     patterns.tendencia3Meses.direccion,
  }
}