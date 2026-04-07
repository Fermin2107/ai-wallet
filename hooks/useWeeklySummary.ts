import { useCallback } from 'react'
import { SimpleTransaction, SimpleBudget, SimpleGoal } from './useSimpleSupabase'

interface WeeklySummaryData {
  totalGastado: number
  totalIngresado: number
  topCategoria: { nombre: string; total: number } | null
  cantidadTransacciones: number
  diasConGastos: number
}

interface UseWeeklySummaryReturn {
  shouldShow: (userId: string) => boolean
  markShown: (userId: string) => void
  buildSummary: (
    transactions: SimpleTransaction[],
    budgets: SimpleBudget[],
    goals: SimpleGoal[]
  ) => WeeklySummaryData | null
  formatSummaryMessage: (data: WeeklySummaryData) => string
}

// Semana ISO: número de semana del año
function getISOWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  ) + 1
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}` 
}

function getLSKey(userId: string): string {
  return `ai_wallet_weekly_summary_${userId}` 
}

export function useWeeklySummary(): UseWeeklySummaryReturn {
  // Devuelve true solo si: es lunes Y no se mostró esta semana
  const shouldShow = useCallback((userId: string): boolean => {
    const hoy = new Date()
    if (hoy.getDay() !== 1) return false // 1 = lunes

    const semanaActual = getISOWeek(hoy)
    try {
      const stored = localStorage.getItem(getLSKey(userId))
      if (!stored) return true
      const { lastShownWeek } = JSON.parse(stored)
      return lastShownWeek !== semanaActual
    } catch {
      return true
    }
  }, [])

  const markShown = useCallback((userId: string): void => {
    try {
      localStorage.setItem(
        getLSKey(userId),
        JSON.stringify({ lastShownWeek: getISOWeek(new Date()) })
      )
    } catch {
      // localStorage lleno o bloqueado — silenciar
    }
  }, [])

  const buildSummary = useCallback(
    (
      transactions: SimpleTransaction[],
      _budgets: SimpleBudget[],
      _goals: SimpleGoal[]
    ): WeeklySummaryData | null => {
      const hoy = new Date()
      // Semana pasada: lunes a domingo
      const lunesAnterior = new Date(hoy)
      lunesAnterior.setDate(hoy.getDate() - 7)
      lunesAnterior.setHours(0, 0, 0, 0)

      const domingoAnterior = new Date(lunesAnterior)
      domingoAnterior.setDate(lunesAnterior.getDate() + 6)
      domingoAnterior.setHours(23, 59, 59, 999)

      const txSemana = transactions.filter(t => {
        const fecha = new Date(t.transaction_date + 'T12:00:00') // forzar hora local
        return fecha >= lunesAnterior && fecha <= domingoAnterior
      })

      if (txSemana.length === 0) return null

      const gastos = txSemana.filter(t => t.type === 'gasto')
      const ingresos = txSemana.filter(t => t.type === 'ingreso')

      const totalGastado = gastos.reduce((s, t) => s + Number(t.amount), 0)
      const totalIngresado = ingresos.reduce((s, t) => s + Number(t.amount), 0)

      // Top categoría de gasto
      const porCategoria: Record<string, number> = {}
      gastos.forEach(t => {
        porCategoria[t.category] = (porCategoria[t.category] || 0) + Number(t.amount)
      })
      const topEntry = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0]
      const topCategoria = topEntry
        ? { nombre: topEntry[0], total: Math.round(topEntry[1]) }
        : null

      // Días únicos con al menos un gasto
      const diasUnicos = new Set(gastos.map(t => t.transaction_date))

      return {
        totalGastado: Math.round(totalGastado),
        totalIngresado: Math.round(totalIngresado),
        topCategoria,
        cantidadTransacciones: gastos.length,
        diasConGastos: diasUnicos.size
      }
    },
    []
  )

  const formatSummaryMessage = useCallback((data: WeeklySummaryData): string => {
    const fmt = (n: number) => `$${n.toLocaleString('es-AR')}` 
    const promedioDiario = data.diasConGastos > 0
      ? Math.round(data.totalGastado / data.diasConGastos)
      : 0

    const partes: string[] = [
      `Resumen de la semana pasada 📊`,
      `Gastaste ${fmt(data.totalGastado)} en ${data.cantidadTransacciones} movimiento${data.cantidadTransacciones !== 1 ? 's' : ''}, ${data.diasConGastos} día${data.diasConGastos !== 1 ? 's' : ''} activo${data.diasConGastos !== 1 ? 's' : ''}.`,
    ]

    if (data.topCategoria) {
      partes.push(
        `Lo que más te pesó fue ${data.topCategoria.nombre} con ${fmt(data.topCategoria.total)}.` 
      )
    }

    if (promedioDiario > 0) {
      partes.push(`Promedio diario: ${fmt(promedioDiario)}.`)
    }

    if (data.totalIngresado > 0) {
      partes.push(`Ingresaste ${fmt(data.totalIngresado)} esta semana.`)
    }

    return partes.join(' ')
  }, [])

  return { shouldShow, markShown, buildSummary, formatSummaryMessage }
}
