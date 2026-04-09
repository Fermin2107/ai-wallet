import { useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────
interface FinancialCtx {
  estado: 'bien' | 'cuidado' | 'mal'
  totalGastado: number
  dineroLibre: number
  gastoDiarioRecomendado: number
  gastoDiarioPromedio: number
  diasRestantes: number
  vaALlegar: boolean
  superavit: number
  ingresoEfectivo: number
  budgetAnalysis: Array<{
    category: string
    percentUsed: number
    status: string
    remaining: number
  }>
}

interface DailyMessageResult {
  shouldShow: boolean
  message: string
  markShown: (userId: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────
function getTodayKey(userId: string): string {
  const fecha = new Date().toISOString().split('T')[0]
  return `ai_wallet_daily_${userId}_${fecha}`
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

// ─── Hook ─────────────────────────────────────────────────────
export function useDailyCoachMessage(): {
  shouldShowDaily: (userId: string) => boolean
  buildDailyMessage: (
    ctx: FinancialCtx,
    nombre: string | undefined,
    coachState: string
  ) => string | null
  markDailyShown: (userId: string) => void
} {
  const shouldShowDaily = useCallback((userId: string): boolean => {
    try {
      const key = getTodayKey(userId)
      return !localStorage.getItem(key)
    } catch {
      return false
    }
  }, [])

  const markDailyShown = useCallback((userId: string): void => {
    try {
      localStorage.setItem(getTodayKey(userId), '1')
    } catch {
      // localStorage lleno o bloqueado
    }
  }, [])

  const buildDailyMessage = useCallback(
    (
      ctx: FinancialCtx,
      nombre: string | undefined,
      coachState: string
    ): string | null => {
      const n = nombre ? `, ${nombre}` : ''
      const hora = new Date().getHours()
      const saludo =
        hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

      // Sin cuentas ni datos → el welcome ya lo cubre
      if (coachState === 'sin_cuentas' || coachState === 'sin_transacciones') {
        return null
      }

      // Sin ingreso → no calcular gasto diario
      if (ctx.ingresoEfectivo <= 0) {
        return `${saludo}${n}. Registrá tu ingreso del mes para que pueda armar tu plan.`
      }

      switch (coachState) {
        case 'presupuesto_critico': {
          const critico = ctx.budgetAnalysis.find((b) => b.percentUsed >= 85)
          if (!critico) return null
          return `Ojo con ${critico.category}${n ? ' hoy' : ''} — está al ${critico.percentUsed}% del límite. Podés gastar máx ${fmt(ctx.gastoDiarioRecomendado)} hoy.`
        }

        case 'fin_mes_mal':
          return `Último tramo del mes${n}. Te faltan ${fmt(Math.abs(ctx.superavit))} para llegar. Gastá máximo ${fmt(ctx.gastoDiarioRecomendado)}/día.`

        case 'fin_mes_bien':
          return `${saludo}${n}. Vas a cerrar el mes en verde con ${fmt(ctx.superavit)} de sobra. Podés gastar ${fmt(ctx.gastoDiarioRecomendado)} hoy. 💪`

        case 'mitad_mes_mal':
          return `${saludo}${n}. A este ritmo te faltan ${fmt(Math.abs(ctx.superavit))}. Hoy gastá máximo ${fmt(ctx.gastoDiarioRecomendado)}.`

        case 'inicio_mes':
        case 'mitad_mes_bien':
        case 'normal':
        default:
          return `${saludo}${n}. Llevás ${fmt(ctx.totalGastado)} gastados este mes. Hoy podés gastar ${fmt(ctx.gastoDiarioRecomendado)}. 💪`
      }
    },
    []
  )

  return { shouldShowDaily, buildDailyMessage, markDailyShown }
}
