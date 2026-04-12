// ============================================================
// AI Wallet — Motor de Contexto Histórico
// lib/historical-context.ts
//
// Pre-calcula TODO lo que la IA necesita para responder
// preguntas históricas, simulaciones y comparativas.
// La IA NO calcula nada — solo interpreta estos datos.
// ============================================================

import type { SimpleTransaction } from '../hooks/useSimpleSupabase'

// ── Tipos de salida ──────────────────────────────────────────────────────────

export interface MesResumen {
  mes: string           // YYYY-MM
  total: number
  ingresos: number
  gastos: number
  transacciones: number
  categorias: Record<string, number>
}

export interface CategoriaHistorico {
  categoria: string
  totalAnio: number
  promedioMensual: number
  meses: Record<string, number>   // YYYY-MM → total
  maxMes: { mes: string; total: number }
  minMes: { mes: string; total: number }
  tendencia: 'subiendo' | 'bajando' | 'estable'
}

export interface DeudaInformal {
  id: string
  contraparte: string
  monto: number
  tipo: 'debo' | 'me_deben'
  descripcion: string
  fecha: string
  saldada: boolean
}

export interface SimulacionAhorro {
  categoria: string
  gastoMensualActual: number
  gastoMensualReducido: number
  ahorroMensual: number
  ahorro6Meses: number
  ahorro12Meses: number
}

export interface GastoFrecuente {
  descripcion: string
  categoria: string
  veces: number
  totalGastado: number
  promedioMonto: number
  ultimaVez: string
  primerVez: string
}

export interface ComparativaSemana {
  promedioLunesViernes: number
  promedioSabadoDomingo: number
  factorFinDeSemana: number        // cuántas veces más gasta el finde
  diasOrdenados: Array<{ dia: string; promedio: number }>
}

export interface HistoricalContext {
  // Resumen por mes (todos los meses con datos)
  mesesResumen: MesResumen[]
  
  // Mes más caro y más barato
  mesMasCaro: MesResumen | null
  mesMasBarato: MesResumen | null

  // Por categoría — histórico anual
  categoriaHistorico: CategoriaHistorico[]

  // Últimas N transacciones
  ultimasTransacciones: Array<{
    descripcion: string
    categoria: string
    monto: number
    tipo: 'gasto' | 'ingreso'
    fecha: string
    cuenta?: string
  }>

  // Gasto por semana promedio
  gastoPorSemanaPromedio: number

  // Comparativa día de semana vs fin de semana
  comparativaSemana: ComparativaSemana

  // Frecuencia de gastos (para "¿cuántas veces fui al super?")
  gastosFrecuentes: GastoFrecuente[]

  // Gasto en categoría este año
  gastoAnualPorCategoria: Record<string, number>

  // Días sin gastar en categorías de riesgo
  diasSinGastarEn: Record<string, number>   // categoría → días desde último gasto

  // Simulaciones pre-calculadas (top 5 categorías discrecionales)
  simulaciones: SimulacionAhorro[]

  // Cumplimiento de objetivo de ahorro (últimos meses)
  cumplimientoAhorro: Array<{
    mes: string
    objetivoAhorro: number
    realAhorrado: number
    cumplido: boolean
    pct: number
  }>

  // Resumen compacto para el prompt
  resumenHistoricoParaIA: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  const nombres = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${nombres[parseInt(m)]}/${y}`
}


function getISOWeekKey(fecha: Date): string {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7) + 1
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

const CATEGORIAS_DISCRECIONALES = [
  'salidas', 'entretenimiento', 'delivery', 'ropa', 'suscripciones',
  'hobbies', 'viajes', 'restaurante', 'bar', 'caprichos', 'cafe', 'café',
]

// ── Función principal ────────────────────────────────────────────────────────

export function buildHistoricalContext(
  transactions: SimpleTransaction[],
  selectedMonth: string,
  objetivoAhorro: number
): HistoricalContext {

  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]

  // ── Año en curso (desde enero de este año)
  const anioActual = selectedMonth.slice(0, 4)
  const inicioAnio = `${anioActual}-01`

  // ── Ordenar todas las transacciones por fecha desc
  const txOrdenadas = [...transactions].sort(
    (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  )

  // ── PASADA ÚNICA — clasificar todo de una vez ────────────────────────────

  const mesesMap: Record<string, MesResumen> = {}
  const catAnioMap: Record<string, number> = {}
  const catMesesMap: Record<string, Record<string, number>> = {}
  const ultimoGastoEnCat: Record<string, string> = {}
  const semanasMap: Record<string, number> = {}
  const diaSemanaMap: Record<number, { total: number; semanas: Set<string> }> = {}
  for (let i = 0; i < 7; i++) diaSemanaMap[i] = { total: 0, semanas: new Set() }

  // Para frecuencia de gastos
  const descNormMap: Record<string, {
    descripcion: string; categoria: string; veces: number
    total: number; montos: number[]; fechas: string[]
  }> = {}

  for (const tx of transactions) {
    const mes = tx.transaction_date.slice(0, 7)
    const fechaObj = new Date(tx.transaction_date + 'T00:00:00')
    const diaSemana = fechaObj.getDay()
    const semanaKey = getISOWeekKey(fechaObj)

    // Resumen por mes
    if (!mesesMap[mes]) {
      mesesMap[mes] = { mes, total: 0, ingresos: 0, gastos: 0, transacciones: 0, categorias: {} }
    }
    mesesMap[mes].transacciones += 1
    if (tx.type === 'gasto') {
      mesesMap[mes].gastos += tx.amount
      mesesMap[mes].total += tx.amount
      mesesMap[mes].categorias[tx.category] = (mesesMap[mes].categorias[tx.category] || 0) + tx.amount

      // Año actual por categoría
      if (mes >= inicioAnio) {
        catAnioMap[tx.category] = (catAnioMap[tx.category] || 0) + tx.amount
      }

      // Histórico por categoría por mes
      if (!catMesesMap[tx.category]) catMesesMap[tx.category] = {}
      catMesesMap[tx.category][mes] = (catMesesMap[tx.category][mes] || 0) + tx.amount

      // Último gasto en categoría
      if (!ultimoGastoEnCat[tx.category] || tx.transaction_date > ultimoGastoEnCat[tx.category]) {
        ultimoGastoEnCat[tx.category] = tx.transaction_date
      }

      // Por semana
      semanasMap[semanaKey] = (semanasMap[semanaKey] || 0) + tx.amount

      // Por día de semana
      diaSemanaMap[diaSemana].total += tx.amount
      diaSemanaMap[diaSemana].semanas.add(semanaKey)

      // Frecuencia de gastos — normalizar descripción
      const descNorm = tx.description.toLowerCase().trim().slice(0, 30)
      if (!descNormMap[descNorm]) {
        descNormMap[descNorm] = {
          descripcion: tx.description,
          categoria: tx.category,
          veces: 0, total: 0, montos: [], fechas: []
        }
      }
      descNormMap[descNorm].veces += 1
      descNormMap[descNorm].total += tx.amount
      descNormMap[descNorm].montos.push(tx.amount)
      descNormMap[descNorm].fechas.push(tx.transaction_date)

    } else {
      mesesMap[mes].ingresos += tx.amount
    }
  }

  // ── Meses resumen ordenados
  const mesesResumen = Object.values(mesesMap)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({
      ...m,
      total: Math.round(m.total),
      ingresos: Math.round(m.ingresos),
      gastos: Math.round(m.gastos),
    }))

  // ── Mes más caro / más barato (excluyendo mes actual si incompleto)
  const mesesCompletos = mesesResumen.filter(m => m.mes < selectedMonth && m.gastos > 0)
  const mesMasCaro = mesesCompletos.reduce<MesResumen | null>(
    (max, m) => (!max || m.gastos > max.gastos ? m : max), null
  )
  const mesMasBarato = mesesCompletos.reduce<MesResumen | null>(
    (min, m) => (!min || m.gastos < min.gastos ? m : min), null
  )

  // ── Histórico por categoría
  const categoriaHistorico: CategoriaHistorico[] = Object.entries(catMesesMap)
    .map(([categoria, meses]) => {
      const mesEntries = Object.entries(meses)
        .filter(([m]) => m >= inicioAnio)
        .sort((a, b) => a[0].localeCompare(b[0]))

      const totalAnio = mesEntries.reduce((s, [, v]) => s + v, 0)
      const cantMeses = mesEntries.length || 1
      const promedioMensual = totalAnio / cantMeses

      const maxEntry = mesEntries.reduce<[string, number] | null>(
        (max, e) => (!max || e[1] > max[1] ? e : max), null
      )
      const minEntry = mesEntries.reduce<[string, number] | null>(
        (min, e) => (!min || e[1] < min[1] ? e : min), null
      )

      // Tendencia: últimos 2 meses vs primeros 2
      let tendencia: 'subiendo' | 'bajando' | 'estable' = 'estable'
      if (mesEntries.length >= 3) {
        const ultimos2 = mesEntries.slice(-2).reduce((s, [, v]) => s + v, 0) / 2
        const primeros2 = mesEntries.slice(0, 2).reduce((s, [, v]) => s + v, 0) / 2
        const delta = primeros2 > 0 ? (ultimos2 - primeros2) / primeros2 : 0
        tendencia = delta > 0.08 ? 'subiendo' : delta < -0.08 ? 'bajando' : 'estable'
      }

      return {
        categoria,
        totalAnio: Math.round(totalAnio),
        promedioMensual: Math.round(promedioMensual),
        meses: Object.fromEntries(mesEntries.map(([m, v]) => [m, Math.round(v)])),
        maxMes: maxEntry ? { mes: maxEntry[0], total: Math.round(maxEntry[1]) } : { mes: '', total: 0 },
        minMes: minEntry ? { mes: minEntry[0], total: Math.round(minEntry[1]) } : { mes: '', total: 0 },
        tendencia,
      }
    })
    .filter(c => c.totalAnio > 0)
    .sort((a, b) => b.totalAnio - a.totalAnio)

  // ── Últimas 10 transacciones
  const ultimasTransacciones = txOrdenadas.slice(0, 10).map(tx => ({
    descripcion: tx.description,
    categoria: tx.category,
    monto: Math.round(tx.amount),
    tipo: tx.type,
    fecha: tx.transaction_date,
  }))

  // ── Gasto por semana promedio
  const semanaValues = Object.values(semanasMap)
  const gastoPorSemanaPromedio = semanaValues.length > 0
    ? Math.round(semanaValues.reduce((s, v) => s + v, 0) / semanaValues.length)
    : 0

  // ── Comparativa día de semana vs fin de semana
  const promediosDia: Array<{ dia: string; diaN: number; promedio: number }> = []
  const diasNombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  for (let i = 0; i < 7; i++) {
    const { total, semanas } = diaSemanaMap[i]
    const cantSemanas = semanas.size || 1
    promediosDia.push({ dia: diasNombres[i], diaN: i, promedio: Math.round(total / cantSemanas) })
  }

  const diasSemana = promediosDia.filter(d => d.diaN >= 1 && d.diaN <= 5)
  const diasFinde = promediosDia.filter(d => d.diaN === 0 || d.diaN === 6)
  const promedioLunesViernes = Math.round(
    diasSemana.reduce((s, d) => s + d.promedio, 0) / (diasSemana.length || 1)
  )
  const promedioSabadoDomingo = Math.round(
    diasFinde.reduce((s, d) => s + d.promedio, 0) / (diasFinde.length || 1)
  )
  const factorFinDeSemana = promedioLunesViernes > 0
    ? Math.round((promedioSabadoDomingo / promedioLunesViernes) * 10) / 10
    : 1

  const comparativaSemana: ComparativaSemana = {
    promedioLunesViernes,
    promedioSabadoDomingo,
    factorFinDeSemana,
    diasOrdenados: promediosDia
      .sort((a, b) => b.promedio - a.promedio)
      .map(d => ({ dia: d.dia, promedio: d.promedio })),
  }

  // ── Gastos frecuentes (aparecen 3+ veces)
  const gastosFrecuentes: GastoFrecuente[] = Object.values(descNormMap)
    .filter(g => g.veces >= 3)
    .map(g => {
      const fechasOrdenadas = [...g.fechas].sort()
      return {
        descripcion: g.descripcion,
        categoria: g.categoria,
        veces: g.veces,
        totalGastado: Math.round(g.total),
        promedioMonto: Math.round(g.total / g.veces),
        ultimaVez: fechasOrdenadas[fechasOrdenadas.length - 1],
        primerVez: fechasOrdenadas[0],
      }
    })
    .sort((a, b) => b.totalGastado - a.totalGastado)
    .slice(0, 10)

  // ── Gasto anual por categoría
  const gastoAnualPorCategoria: Record<string, number> = Object.fromEntries(
    Object.entries(catAnioMap).map(([k, v]) => [k, Math.round(v)])
  )

  // ── Días sin gastar en categorías clave
  const diasSinGastarEn: Record<string, number> = {}
  for (const [cat, ultimaFecha] of Object.entries(ultimoGastoEnCat)) {
    const diff = Math.floor(
      (new Date(hoyStr).getTime() - new Date(ultimaFecha).getTime()) / 86400000
    )
    diasSinGastarEn[cat] = diff
  }

  // ── Simulaciones de ahorro (top discrecionales con datos)
  const simulaciones: SimulacionAhorro[] = CATEGORIAS_DISCRECIONALES
    .map(cat => {
      const catHist = categoriaHistorico.find(c => c.categoria === cat)
      if (!catHist || catHist.promedioMensual < 1000) return null
      const reduccion = 0.5  // 50% de reducción como ejemplo base
      const gastoReducido = Math.round(catHist.promedioMensual * (1 - reduccion))
      const ahorroMensual = catHist.promedioMensual - gastoReducido
      return {
        categoria: cat,
        gastoMensualActual: catHist.promedioMensual,
        gastoMensualReducido: gastoReducido,
        ahorroMensual,
        ahorro6Meses: ahorroMensual * 6,
        ahorro12Meses: ahorroMensual * 12,
      }
    })
    .filter((s): s is SimulacionAhorro => s !== null)
    .sort((a, b) => b.ahorroMensual - a.ahorroMensual)
    .slice(0, 5)

  // ── Cumplimiento de objetivo de ahorro (últimos 6 meses)
  const cumplimientoAhorro = mesesResumen
    .filter(m => m.mes < selectedMonth && m.ingresos > 0)
    .slice(-6)
    .map(m => {
      const realAhorrado = Math.max(0, m.ingresos - m.gastos)
      const pct = objetivoAhorro > 0 ? Math.round((realAhorrado / objetivoAhorro) * 100) : 0
      return {
        mes: m.mes,
        objetivoAhorro,
        realAhorrado,
        cumplido: realAhorrado >= objetivoAhorro,
        pct,
      }
    })

  // ── Resumen compacto para el prompt ─────────────────────────────────────
  const lines: string[] = []

  // Meses recientes
  const mesesRecientes = mesesResumen.slice(-4)
  if (mesesRecientes.length > 0) {
    lines.push('HISTORIAL MENSUAL (últimos meses):')
    mesesRecientes.forEach(m => {
      lines.push(`  ${mesLabel(m.mes)}: gastos ${fmt(m.gastos)} | ingresos ${fmt(m.ingresos)} | ${m.transacciones} mov`)
    })
    lines.push('')
  }

  // Mes más caro
  if (mesMasCaro) {
    lines.push(`MES MÁS CARO: ${mesLabel(mesMasCaro.mes)} con ${fmt(mesMasCaro.gastos)}`)
  }
  if (mesMasBarato) {
    lines.push(`MES MÁS BARATO: ${mesLabel(mesMasBarato.mes)} con ${fmt(mesMasBarato.gastos)}`)
  }
  lines.push('')

  // Gasto por semana y día
  lines.push(`GASTO PROMEDIO POR SEMANA: ${fmt(gastoPorSemanaPromedio)}`)
  lines.push(`SEMANA vs FINDE: lunes-viernes ${fmt(comparativaSemana.promedioLunesViernes)}/día | sáb-dom ${fmt(comparativaSemana.promedioSabadoDomingo)}/día (factor: x${factorFinDeSemana})`)
  lines.push('')

  // Top categorías anuales
  if (categoriaHistorico.length > 0) {
    lines.push('GASTO ANUAL POR CATEGORÍA:')
    categoriaHistorico.slice(0, 8).forEach(c => {
      lines.push(`  ${c.categoria}: ${fmt(c.totalAnio)} en el año | prom ${fmt(c.promedioMensual)}/mes | tendencia: ${c.tendencia}`)
    })
    lines.push('')
  }

  // Simulaciones
  if (simulaciones.length > 0) {
    lines.push('SIMULACIONES DE AHORRO (si recortara 50% de cada categoría discrecional):')
    simulaciones.forEach(s => {
      lines.push(`  Si recorta ${s.categoria} a la mitad → ahorra ${fmt(s.ahorroMensual)}/mes | ${fmt(s.ahorro12Meses)}/año`)
    })
    lines.push('')
  }

  // Últimos gastos
  if (ultimasTransacciones.length > 0) {
    lines.push('ÚLTIMAS TRANSACCIONES:')
    ultimasTransacciones.slice(0, 5).forEach(tx => {
      const signo = tx.tipo === 'ingreso' ? '+' : '-'
      lines.push(`  ${tx.fecha}: ${signo}${fmt(tx.monto)} en ${tx.categoria} (${tx.descripcion})`)
    })
    lines.push('')
  }

  // Días sin gastar en categorías de riesgo
  const catsSinGastar = Object.entries(diasSinGastarEn)
    .filter(([, dias]) => dias > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  if (catsSinGastar.length > 0) {
    lines.push('DÍAS DESDE ÚLTIMO GASTO POR CATEGORÍA:')
    catsSinGastar.forEach(([cat, dias]) => {
      lines.push(`  ${cat}: hace ${dias} día${dias !== 1 ? 's' : ''}`)
    })
    lines.push('')
  }

  // Cumplimiento objetivo ahorro
  if (cumplimientoAhorro.length > 0) {
    const cumplidos = cumplimientoAhorro.filter(c => c.cumplido).length
    lines.push(`CUMPLIMIENTO OBJETIVO AHORRO: ${cumplidos}/${cumplimientoAhorro.length} meses cumplidos`)
    cumplimientoAhorro.slice(-3).forEach(c => {
      lines.push(`  ${mesLabel(c.mes)}: ahorró ${fmt(c.realAhorrado)} vs objetivo ${fmt(c.objetivoAhorro)} (${c.pct}%) ${c.cumplido ? '✅' : '❌'}`)
    })
  }

  return {
    mesesResumen,
    mesMasCaro,
    mesMasBarato,
    categoriaHistorico,
    ultimasTransacciones,
    gastoPorSemanaPromedio,
    comparativaSemana,
    gastosFrecuentes,
    gastoAnualPorCategoria,
    diasSinGastarEn,
    simulaciones,
    cumplimientoAhorro,
    resumenHistoricoParaIA: lines.join('\n'),
  }
}

// ── Serialización para el prompt ─────────────────────────────────────────────

export function serializeHistoricalContext(ctx: HistoricalContext): string {
  return ctx.resumenHistoricoParaIA
}

// ── Helpers de respuesta rápida (sin IA) ────────────────────────────────────
// Para consultas históricas simples que no necesitan Groq

export function tryAutoHistoricalResponse(
  message: string,
  ctx: HistoricalContext,
  selectedMonth: string
): string | null {
  const m = message.toLowerCase()
  const fmtL = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  // "Cuánto gasté en delivery este año / mes"
  for (const cat of Object.keys(ctx.gastoAnualPorCategoria)) {
    if (m.includes(cat) && (m.includes('año') || m.includes('anual') || m.includes('total'))) {
      const total = ctx.gastoAnualPorCategoria[cat]
      const prom = Math.round(total / Math.max(1, ctx.mesesResumen.filter(m => m.mes >= selectedMonth.slice(0, 4) + '-01' && m.categorias[cat] > 0).length))
      return `Este año llevás ${fmtL(total)} en ${cat}. Eso es ${fmtL(prom)}/mes en promedio.`
    }
  }

  // "Mis últimos gastos / últimas transacciones"
  if (m.includes('últimos') || m.includes('ultimo') || m.includes('últimas') || m.includes('recientes')) {
    if (ctx.ultimasTransacciones.length === 0) return 'Todavía no tenés gastos registrados.'
    const lista = ctx.ultimasTransacciones.slice(0, 5)
      .map(tx => `${tx.fecha}: ${tx.tipo === 'ingreso' ? '+' : '-'}${fmtL(tx.monto)} en ${tx.categoria} (${tx.descripcion})`)
      .join('\n')
    return `Tus últimas transacciones:\n${lista}`
  }

  // "Mes más caro"
  if ((m.includes('mes') && m.includes('caro')) || m.includes('mes más caro')) {
    if (!ctx.mesMasCaro) return 'No tengo suficientes datos para comparar meses.'
    return `Tu mes más caro fue ${mesLabel(ctx.mesMasCaro.mes)} con ${fmtL(ctx.mesMasCaro.gastos)} en gastos.`
  }

  // "Cuánto gasto por semana"
  if (m.includes('semana') && (m.includes('cuánto') || m.includes('promedio') || m.includes('gasto'))) {
    return `Gastás ${fmtL(ctx.gastoPorSemanaPromedio)} por semana en promedio.`
  }

  return null
}