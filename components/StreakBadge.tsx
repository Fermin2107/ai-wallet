'use client'

// ============================================================
// AI Wallet — StreakBadge
// components/StreakBadge.tsx
//
// Reemplaza el chip {streak} 🔥 del header.
// Muestra: días actuales + barra de progreso al próximo hito.
// Al tocar: modal con historial y hitos alcanzados.
// ============================================================

import { useState } from 'react'
import { Flame, X, Trophy, Target } from 'lucide-react'
import { STREAK_MILESTONES, getNextMilestone } from '../hooks/useStreak'
import type { StreakData } from '../hooks/useStreak'

interface StreakBadgeProps {
  streak: StreakData
}

export default function StreakBadge({ streak }: StreakBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false)

  if (streak.currentStreak < 1) return null

  const nextMilestone  = getNextMilestone(streak.currentStreak)
  const prevMilestone  = [...STREAK_MILESTONES]
    .reverse()
    .find((m) => m.dias <= streak.currentStreak)
  const baseStreak     = prevMilestone?.dias ?? 0
  const targetStreak   = nextMilestone?.dias ?? streak.currentStreak
  const progressInSegment = targetStreak > baseStreak
    ? ((streak.currentStreak - baseStreak) / (targetStreak - baseStreak)) * 100
    : 100

  return (
    <>
      {/* ── Badge clickeable ── */}
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF6D00]/15 border border-[#FF6D00]/20 hover:bg-[#FF6D00]/20 transition-colors active:scale-95"
      >
        <Flame size={11} className="text-[#FF6D00]" />
        <span className="text-[#FF6D00] text-[11px] font-semibold">
          {streak.currentStreak}
        </span>
        {/* Mini barra de progreso al próximo hito */}
        {nextMilestone && (
          <div className="w-10 h-1 bg-[#FF6D00]/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF6D00] rounded-full transition-all duration-500"
              style={{ width: `${progressInSegment}%` }}
            />
          </div>
        )}
      </button>

      {/* ── Modal ── */}
      {modalOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto">
            <div className="bg-[#0D1410] border border-white/8 rounded-t-3xl p-6">
              {/* Header modal */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-[#FF6D00]" />
                  <span className="text-white font-semibold text-base">Tu racha</span>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <StatCard
                  label="Racha actual"
                  value={`${streak.currentStreak}`}
                  unit="días"
                  color="#FF6D00"
                />
                <StatCard
                  label="Mejor racha"
                  value={`${streak.longestStreak}`}
                  unit="días"
                  color="#FFD740"
                />
                <StatCard
                  label="Total activo"
                  value={`${streak.totalDaysActive}`}
                  unit="días"
                  color="rgba(255,255,255,0.5)"
                />
              </div>

              {/* Próximo hito */}
              {nextMilestone && (
                <div className="mb-5 p-4 rounded-2xl border border-[#FF6D00]/20 bg-[#FF6D00]/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target size={13} className="text-[#FF6D00]" />
                      <span className="text-xs text-[#FF6D00] font-semibold">
                        Próximo hito: {nextMilestone.titulo}
                      </span>
                    </div>
                    <span className="text-xs text-[#FF6D00]/60">
                      {nextMilestone.dias - streak.currentStreak} días
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#FF6D00]/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#FF6D00] transition-all duration-700"
                      style={{ width: `${progressInSegment}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                    &ldquo;{nextMilestone.mensaje}&rdquo;
                  </p>
                </div>
              )}

              {/* Hitos alcanzados */}
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">
                  Hitos alcanzados
                </p>
                <div className="space-y-2">
                  {STREAK_MILESTONES.map((m) => {
                    const reached = streak.milestonesReached.includes(m.dias)
                    return (
                      <div
                        key={m.dias}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                          reached
                            ? 'border-[#FFD740]/25 bg-[#FFD740]/5'
                            : 'border-white/5 bg-transparent opacity-40'
                        }`}
                      >
                        <Trophy
                          size={14}
                          className={reached ? 'text-[#FFD740]' : 'text-white/20'}
                        />
                        <div className="flex-1">
                          <p className={`text-xs font-semibold ${reached ? 'text-white/80' : 'text-white/30'}`}>
                            {m.titulo}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${reached ? 'text-white/35' : 'text-white/15'}`}>
                            {m.dias} días consecutivos
                          </p>
                        </div>
                        {reached && (
                          <span className="text-[10px] text-[#FFD740]/70 font-medium">
                            ✓
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Pie */}
              <p className="text-[10px] text-white/20 text-center mt-5">
                Registrá todos los días para no perder la racha
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: string
  unit: string
  color: string
}) {
  return (
    <div className="bg-[#141A17] border border-white/5 rounded-xl p-3 text-center">
      <p className="text-[10px] text-white/30 mb-1">{label}</p>
      <p className="font-bold text-xl leading-none" style={{ color }}>
        {value}
      </p>
      <p className="text-[10px] text-white/25 mt-1">{unit}</p>
    </div>
  )
}