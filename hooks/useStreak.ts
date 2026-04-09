// ============================================================
// AI Wallet — Hook useStreak
// hooks/useStreak.ts
//
// Migra el streak de localStorage a Supabase.
// Consistente entre web y futuro WhatsApp.
// Maneja hitos con análisis especial vía /api/chat.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseClient } from '../lib/supabase'

// ─── Hitos y recompensas ──────────────────────────────────────────────────────

export interface StreakMilestone {
  dias: number
  titulo: string
  mensaje: string          // mensaje que el coach manda al alcanzarlo
  analisisIntent: string   // qué pedirle a Groq cuando se alcanza
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  {
    dias: 7,
    titulo: '1 semana seguida 🔥',
    mensaje: 'Llevás 7 días registrando todo. Aprendí bastante de tus hábitos esta semana.',
    analisisIntent: 'Dame un análisis de mis patrones de gasto de los últimos 7 días',
  },
  {
    dias: 14,
    titulo: '2 semanas',
    mensaje: 'Con 14 días de datos reales puedo decirte exactamente cómo vas a cerrar el mes.',
    analisisIntent: 'Con 14 días de datos, ¿cómo voy a cerrar el mes?',
  },
  {
    dias: 30,
    titulo: '1 mes completo 🏆',
    mensaje: 'Tenés un mes entero registrado. Esto es lo que tus gastos dicen de vos.',
    analisisIntent: 'Haceme un análisis de mi perfil financiero del último mes completo',
  },
  {
    dias: 60,
    titulo: '2 meses',
    mensaje: 'Primera comparativa real: este mes vs el anterior.',
    analisisIntent: 'Comparame este mes contra el anterior, ¿mejoré o empeoré?',
  },
  {
    dias: 90,
    titulo: '3 meses 🎯',
    mensaje: 'Con 3 meses de datos puedo proyectar cómo va a terminar tu año.',
    analisisIntent: 'Con 3 meses de datos, ¿cómo va a terminar mi año financieramente?',
  },
]

// Próximo hito a partir del streak actual
export function getNextMilestone(currentStreak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.dias > currentStreak) ?? null
}

// Hito recién alcanzado (exactamente en este bump)
export function getJustReachedMilestone(
  prevStreak: number,
  newStreak: number
): StreakMilestone | null {
  return (
    STREAK_MILESTONES.find(
      (m) => m.dias > prevStreak && m.dias <= newStreak
    ) ?? null
  )
}

// ─── Tipos del hook ───────────────────────────────────────────────────────────

export interface StreakData {
  currentStreak:     number
  longestStreak:     number
  totalDaysActive:   number
  lastActivityDate:  string | null
  milestonesReached: number[]
}

export interface UseStreakReturn {
  streak:            StreakData
  loaded:            boolean
  justReachedMilestone: StreakMilestone | null  // no null = mostrar celebración
  clearMilestone:    () => void
  bumpStreak:        () => Promise<{ newStreak: number; milestone: StreakMilestone | null }>
}

const EMPTY_STREAK: StreakData = {
  currentStreak:     0,
  longestStreak:     0,
  totalDaysActive:   0,
  lastActivityDate:  null,
  milestonesReached: [],
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStreak(): UseStreakReturn {
  const [streak, setStreak]   = useState<StreakData>(EMPTY_STREAK)
  const [loaded, setLoaded]   = useState(false)
  const [justReachedMilestone, setJustReachedMilestone] =
    useState<StreakMilestone | null>(null)

  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null)
  if (!supabaseRef.current) supabaseRef.current = getSupabaseClient()
  const supabase = supabaseRef.current

  // ── Cargar streak inicial ────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('user_streaks')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error cargando streak:', error.message)
          return
        }

        if (data) {
          // Verificar si el streak sigue vigente (hoy o ayer)
          const hoy   = new Date().toISOString().split('T')[0]
          const ayer  = new Date(Date.now() - 86400000).toISOString().split('T')[0]
          const last  = data.last_activity_date

          const currentStreak =
            last === hoy || last === ayer ? data.current_streak : 0

          // Si el streak se rompió, actualizar en Supabase
          if (currentStreak === 0 && data.current_streak > 0) {
            await supabase
              .from('user_streaks')
              .update({ current_streak: 0 })
              .eq('user_id', user.id)
          }

          setStreak({
            currentStreak,
            longestStreak:     data.longest_streak     ?? 0,
            totalDaysActive:   data.total_days_active  ?? 0,
            lastActivityDate:  data.last_activity_date ?? null,
            milestonesReached: data.milestones_reached ?? [],
          })
        }
      } catch (err) {
        console.error('Error en useStreak load:', err)
      } finally {
        setLoaded(true)
      }
    }

    load()
  }, [supabase])

  // ── Bump: llamar cada vez que el usuario registra una transacción ────────

  const bumpStreak = useCallback(async (): Promise<{
    newStreak: number
    milestone: StreakMilestone | null
  }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { newStreak: streak.currentStreak, milestone: null }

      const hoy  = new Date().toISOString().split('T')[0]
      const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const last = streak.lastActivityDate

      // Si ya registró hoy, no incrementar
      if (last === hoy) {
        return { newStreak: streak.currentStreak, milestone: null }
      }

      const prevStreak   = last === ayer ? streak.currentStreak : 0
      const newStreak    = prevStreak + 1
      const newLongest   = Math.max(streak.longestStreak, newStreak)
      const newTotal     = streak.totalDaysActive + 1

      // Detectar hito recién alcanzado
      const milestone = getJustReachedMilestone(prevStreak, newStreak)
      const newMilestones = milestone
        ? Array.from(new Set([...streak.milestonesReached, milestone.dias]))
        : streak.milestonesReached

      // Upsert en Supabase
      const { error } = await supabase
        .from('user_streaks')
        .upsert(
          {
            user_id:            user.id,
            current_streak:     newStreak,
            longest_streak:     newLongest,
            last_activity_date: hoy,
            total_days_active:  newTotal,
            milestones_reached: newMilestones,
            updated_at:         new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (error) {
        console.error('Error bumpeando streak:', error.message)
        return { newStreak: streak.currentStreak, milestone: null }
      }

      // Actualizar estado local
      const newData: StreakData = {
        currentStreak:     newStreak,
        longestStreak:     newLongest,
        totalDaysActive:   newTotal,
        lastActivityDate:  hoy,
        milestonesReached: newMilestones,
      }
      setStreak(newData)

      if (milestone) {
        setJustReachedMilestone(milestone)
      }

      return { newStreak, milestone }
    } catch (err) {
      console.error('Error en bumpStreak:', err)
      return { newStreak: streak.currentStreak, milestone: null }
    }
  }, [streak, supabase])

  const clearMilestone = useCallback(() => {
    setJustReachedMilestone(null)
  }, [])

  return {
    streak,
    loaded,
    justReachedMilestone,
    clearMilestone,
    bumpStreak,
  }
}