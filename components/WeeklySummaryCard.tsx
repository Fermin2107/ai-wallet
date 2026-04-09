'use client'

import { X, TrendingUp } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────
interface WeeklySummaryData {
  totalGastado: number
  totalIngresado: number
  topCategoria: { nombre: string; total: number } | null
  cantidadTransacciones: number
  diasConGastos: number
}

interface WeeklySummaryCardProps {
  data: WeeklySummaryData
  onClose: () => void
  onVerDetalle: () => void
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

// ─── Componente ───────────────────────────────────────────────
export default function WeeklySummaryCard({
  data,
  onClose,
  onVerDetalle,
}: WeeklySummaryCardProps) {
  const promedioDiario =
    data.diasConGastos > 0
      ? Math.round(data.totalGastado / data.diasConGastos)
      : 0

  return (
    <div className="mx-4 mb-2 flex-shrink-0">
      <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp size={13} className="text-amber-400" />
            <span className="text-amber-400 text-xs font-semibold tracking-wide">
              Resumen semana pasada
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-amber-400/40 hover:text-amber-400/80 transition-colors"
            aria-label="Cerrar resumen semanal"
          >
            <X size={14} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 mb-3">
          <StatPill
            label="Gastado"
            value={fmt(data.totalGastado)}
            highlight
          />
          {promedioDiario > 0 && (
            <StatPill label="Por día" value={fmt(promedioDiario)} />
          )}
          {data.topCategoria && (
            <StatPill
              label={data.topCategoria.nombre}
              value={fmt(data.topCategoria.total)}
            />
          )}
        </div>

        {/* Detalle secundario */}
        <p className="text-amber-400/50 text-[11px] mb-2.5">
          {data.cantidadTransacciones} movimiento
          {data.cantidadTransacciones !== 1 ? 's' : ''} en{' '}
          {data.diasConGastos} día
          {data.diasConGastos !== 1 ? 's' : ''} activo
          {data.diasConGastos !== 1 ? 's' : ''}
          {data.totalIngresado > 0
            ? ` · Ingresaste ${fmt(data.totalIngresado)}`
            : ''}
        </p>

        {/* CTA */}
        <button
          onClick={onVerDetalle}
          className="w-full text-xs text-amber-400/70 hover:text-amber-400 border border-amber-500/20 hover:border-amber-500/40 rounded-xl py-1.5 transition-colors"
        >
          Ver análisis detallado →
        </button>
      </div>
    </div>
  )
}

// ─── Sub-componente ───────────────────────────────────────────
function StatPill({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex-1 bg-amber-500/10 rounded-xl px-2.5 py-2 text-center min-w-0">
      <p className="text-amber-400/50 text-[10px] truncate">{label}</p>
      <p
        className={`text-xs font-semibold truncate ${
          highlight ? 'text-amber-400' : 'text-amber-400/80'
        }`}
      >
        {value}
      </p>
    </div>
  )
}