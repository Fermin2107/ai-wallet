// ============================================================
// AI Wallet — Hook useCoachProfile
// hooks/useCoachProfile.ts
//
// Carga y actualiza el perfil persistente del coach.
// Patrón idéntico a useSimpleSupabase.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseClient } from '../lib/supabase'

export interface CoachProfile {
  objetivo_principal:       string | null
  restriccion_conocida:     string | null
  contexto_personal:        string | null
  dia_de_cobro:             number | null
  categoria_problema:       string | null
  ultima_celebracion_fecha: string | null
}

// Lo que puede devolver el extractor de Groq
export interface ProfileExtract {
  objetivo_principal?:   string | null
  restriccion_conocida?: string | null
  contexto_personal?:    string | null
  dia_de_cobro?:         number | null
}

const EMPTY_PROFILE: CoachProfile = {
  objetivo_principal:       null,
  restriccion_conocida:     null,
  contexto_personal:        null,
  dia_de_cobro:             null,
  categoria_problema:       null,
  ultima_celebracion_fecha: null,
}

export function useCoachProfile() {
  const [profile, setProfile] = useState<CoachProfile>(EMPTY_PROFILE)
  const [loaded, setLoaded]   = useState(false)

  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null)
  if (!supabaseRef.current) supabaseRef.current = getSupabaseClient()
  const supabase = supabaseRef.current

  // ── Cargar perfil ────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_coach_profile')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found — es normal en usuarios nuevos
        console.error('Error cargando perfil del coach:', error.message)
        return
      }

      if (data) {
        setProfile({
          objetivo_principal:       data.objetivo_principal       ?? null,
          restriccion_conocida:     data.restriccion_conocida     ?? null,
          contexto_personal:        data.contexto_personal        ?? null,
          dia_de_cobro:             data.dia_de_cobro             ?? null,
          categoria_problema:       data.categoria_problema       ?? null,
          ultima_celebracion_fecha: data.ultima_celebracion_fecha ?? null,
        })
      }
    } catch (err) {
      console.error('Error en loadProfile:', err)
    } finally {
      setLoaded(true)
    }
  }, [supabase])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // ── Actualizar perfil con extracción parcial ─────────────────────────────
  // Hace upsert: solo actualiza los campos que el extractor devolvió (no null)

  const updateProfile = useCallback(async (extract: ProfileExtract): Promise<void> => {
    // Filtrar: solo persistir campos que tienen valor real
    const updates: Record<string, string | number> = {}

    if (extract.objetivo_principal)   updates.objetivo_principal   = extract.objetivo_principal
    if (extract.restriccion_conocida) updates.restriccion_conocida = extract.restriccion_conocida
    if (extract.contexto_personal)    updates.contexto_personal    = extract.contexto_personal
    if (extract.dia_de_cobro != null) updates.dia_de_cobro         = extract.dia_de_cobro

    // Si no hay nada nuevo, no hacer el round-trip
    if (Object.keys(updates).length === 0) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_coach_profile')
        .upsert(
          { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

      if (error) {
        console.error('Error actualizando perfil del coach:', error.message)
        return
      }

      // Actualizar estado local sin re-fetch
      setProfile((prev) => ({
        ...prev,
        ...updates,
      } as CoachProfile))
    } catch (err) {
      console.error('Error en updateProfile:', err)
    }
  }, [supabase])

  // ── Construir string de perfil para el prompt ────────────────────────────
  // Devuelve null si no hay nada que agregar (usuario nuevo sin perfil)

  const buildProfileContext = useCallback((): string | null => {
    const lines: string[] = []

    if (profile.objetivo_principal)
      lines.push(`Objetivo principal: ${profile.objetivo_principal}`)
    if (profile.restriccion_conocida)
      lines.push(`Restricciones conocidas: ${profile.restriccion_conocida}`)
    if (profile.contexto_personal)
      lines.push(`Contexto personal: ${profile.contexto_personal}`)
    if (profile.dia_de_cobro)
      lines.push(`Día de cobro: ${profile.dia_de_cobro} de cada mes`)
    if (profile.categoria_problema)
      lines.push(`Categoría históricamente problemática: ${profile.categoria_problema}`)

    if (lines.length === 0) return null

    return `PERFIL DEL USUARIO (datos persistentes de conversaciones anteriores):\n${lines.map((l) => `  ${l}`).join('\n')}`
  }, [profile])

  return {
    profile,
    loaded,
    updateProfile,
    buildProfileContext,
  }
}