'use client'

// ============================================================
// AI Wallet — Chat UI Cards
// components/chat/ChatUICards.tsx
//
// Regla de oro: estos componentes solo RENDERIZAN datos.
// Nunca calculan nada. Todos los números vienen pre-calculados
// desde buildFinancialContext vía enrichUIData en ChatTab.tsx
// ============================================================

import { CATEGORIA_EMOJI } from '../lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString('es-AR')}`

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n))
}

// ─── Dispatcher principal ─────────────────────────────────────────────────────

interface ChatUICardProps {
  type: string
  data: Record<string, unknown>
}

export default function ChatUICard({ type, data }: ChatUICardProps) {
  switch (type) {
    case 'progress_bar':
      return <ProgressBarCard data={data} />
    case 'category_chips':
      return <CategoryChipsCard data={data} />
    case 'goal_card':
      return <GoalProgressCard data={data} />
    case 'budget_alert':
      return <BudgetAlertCard data={data} />
    case 'daily_limit':
      return <DailyLimitCard data={data} />
    case 'plan_mensual':
      return <PlanMensualCard data={data} />
    default:
      return null
  }
}

// ─── 1. ProgressBarCard ───────────────────────────────────────────────────────
// Muestra gastado / ahorro / libre como barra segmentada horizontal.
// Inputs: gastado, ingreso, libre, objetivo_ahorro, va_a_llegar, estado, dias_restantes

interface ProgressBarData {
  gastado?: number
  ingreso?: number
  libre?: number
  objetivo_ahorro?: number
  va_a_llegar?: boolean
  estado?: 'bien' | 'cuidado' | 'mal'
  dias_restantes?: number
}

function ProgressBarCard({ data }: { data: Record<string, unknown> }) {
  const d = data as ProgressBarData
  const gastado = d.gastado ?? 0
  const ingreso = d.ingreso ?? 0
  const libre = d.libre ?? 0
  const ahorro = d.objetivo_ahorro ?? 0
  const estado = d.estado ?? 'bien'
  const diasRestantes = d.dias_restantes ?? 0

  if (ingreso <= 0) return null

  const pctGastado = clamp((gastado / ingreso) * 100)
  const pctAhorro = clamp((ahorro / ingreso) * 100)
  const pctLibre = clamp(100 - pctGastado - pctAhorro)

  const colorGastado =
    estado === 'bien' ? '#00C853' : estado === 'cuidado' ? '#FFD740' : '#FF5252'

  return (
    <div className="mt-2 rounded-2xl border border-white/8 bg-[#0D1410] p-4 space-y-3">
      {/* Barra */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
        {pctGastado > 0 && (
          <div
            className="rounded-full transition-all duration-700"
            style={{ width: `${pctGastado}%`, background: colorGastado }}
          />
        )}
        {pctAhorro > 0 && (
          <div
            className="rounded-full transition-all duration-700 bg-[#00ACC1]"
            style={{ width: `${pctAhorro}%` }}
          />
        )}
        {pctLibre > 0 && (
          <div
            className="rounded-full transition-all duration-700 bg-white/10"
            style={{ width: `${pctLibre}%` }}
          />
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <LegendItem color={colorGastado} label="Gastado" value={fmt(gastado)} />
        {ahorro > 0 && (
          <LegendItem color="#00ACC1" label="Ahorro" value={fmt(ahorro)} />
        )}
        <LegendItem color="rgba(255,255,255,0.25)" label="Libre" value={fmt(libre)} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-white/25">
          {diasRestantes} días restantes
        </span>
        <span
          className="text-[10px] font-semibold"
          style={{ color: d.va_a_llegar ? '#00C853' : '#FF5252' }}
        >
          {d.va_a_llegar ? '✓ Llegás a fin de mes' : '✗ No llegás a fin de mes'}
        </span>
      </div>
    </div>
  )
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span className="text-[11px] text-white/40">{label}</span>
      <span className="text-[11px] font-semibold text-white/80">{value}</span>
    </div>
  )
}

// ─── 2. CategoryChipsCard ─────────────────────────────────────────────────────
// Top 3 categorías como pills con emoji + monto + % del total.
// Inputs: categorias [{category, total}], total

interface CategoryData {
  categorias?: Array<{ category: string; total: number }>
  total?: number
}

function CategoryChipsCard({ data }: { data: Record<string, unknown> }) {
  const d = data as CategoryData
  const categorias = d.categorias ?? []
  const total = d.total ?? 0

  if (categorias.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {categorias.slice(0, 3).map((cat) => {
        const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0
        const emoji = CATEGORIA_EMOJI[cat.category.toLowerCase()] ?? '📦'
        return (
          <div
            key={cat.category}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/8 bg-[#0D1410]"
          >
            <span className="text-base leading-none">{emoji}</span>
            <div>
              <p className="text-[11px] text-white/50 capitalize leading-none mb-0.5">
                {cat.category}
              </p>
              <p className="text-xs font-semibold text-white leading-none">
                {fmt(cat.total)}{' '}
                <span className="text-white/30 font-normal">{pct}%</span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 3. GoalProgressCard ──────────────────────────────────────────────────────
// Progreso de metas activas con barra individual.
// Inputs: metas [{name, target, current, percentComplete}]

interface GoalData {
  metas?: Array<{
    name: string
    target: number
    current: number
    remaining: number
    percentComplete: number
    monthsToComplete?: number | null
  }>
}

function GoalProgressCard({ data }: { data: Record<string, unknown> }) {
  const d = data as GoalData
  const metas = (d.metas ?? []).slice(0, 3)

  if (metas.length === 0) return null

  return (
    <div className="mt-2 rounded-2xl border border-white/8 bg-[#0D1410] p-4 space-y-3">
      {metas.map((meta) => {
        const pct = clamp(meta.percentComplete)
        const isNearComplete = pct >= 80
        return (
          <div key={meta.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/70 truncate max-w-[60%]">
                {meta.name}
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: isNearComplete ? '#00C853' : 'rgba(255,255,255,0.5)' }}
              >
                {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: isNearComplete
                    ? '#00C853'
                    : 'linear-gradient(90deg, #00C853 0%, #69F0AE 100%)',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/25">
                {fmt(meta.current)} de {fmt(meta.target)}
              </span>
              {meta.remaining > 0 && (
                <span className="text-[10px] text-white/25">
                  Falta {fmt(meta.remaining)}
                  {meta.monthsToComplete
                    ? ` · ~${meta.monthsToComplete} mes${meta.monthsToComplete !== 1 ? 'es' : ''}`
                    : ''}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 4. BudgetAlertCard ───────────────────────────────────────────────────────
// Presupuestos en riesgo (>60%) con semáforo y barra de uso.
// Inputs: budgets [{category, limit, spent, percentUsed, status}]

interface BudgetData {
  budgets?: Array<{
    category: string
    limit: number
    spent: number
    remaining: number
    percentUsed: number
    status: string
  }>
}

function BudgetAlertCard({ data }: { data: Record<string, unknown> }) {
  const d = data as BudgetData
  const budgets = d.budgets ?? []

  if (budgets.length === 0) return null

  return (
    <div className="mt-2 rounded-2xl border border-white/8 bg-[#0D1410] p-4 space-y-3">
      {budgets.map((b) => {
        const pct = clamp(b.percentUsed)
        const emoji = CATEGORIA_EMOJI[b.category.toLowerCase()] ?? '📦'
        const { color, dot } = statusColors(b.status)

        return (
          <div key={b.category} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{emoji}</span>
                <span className="text-xs text-white/70 capitalize">{b.category}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]">{dot}</span>
                <span className="text-xs font-semibold" style={{ color }}>
                  {pct}%
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/25">
                {fmt(b.spent)} de {fmt(b.limit)}
              </span>
              {b.remaining > 0 ? (
                <span className="text-[10px] text-white/25">
                  Queda {fmt(b.remaining)}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-[#FF5252]">
                  Excedido {fmt(Math.abs(b.remaining))}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function statusColors(status: string): { color: string; dot: string } {
  switch (status) {
    case 'excedido':
      return { color: '#FF5252', dot: '🔴' }
    case 'rojo':
      return { color: '#FF6D00', dot: '🟠' }
    case 'amarillo':
      return { color: '#FFD740', dot: '🟡' }
    default:
      return { color: '#00C853', dot: '🟢' }
  }
}

// ─── 5. DailyLimitCard ────────────────────────────────────────────────────────
// Límite diario recomendado vs gasto real.
// Inputs: recomendado, real, dias_restantes

interface DailyLimitData {
  recomendado?: number
  real?: number
  dias_restantes?: number
}

function DailyLimitCard({ data }: { data: Record<string, unknown> }) {
  const d = data as DailyLimitData
  const recomendado = d.recomendado ?? 0
  const real = d.real ?? 0
  const diasRestantes = d.dias_restantes ?? 0

  if (recomendado <= 0) return null

  const estaBien = real <= recomendado
  const pctUso = recomendado > 0 ? clamp((real / recomendado) * 100) : 100

  return (
    <div className="mt-2 rounded-2xl border border-white/8 bg-[#0D1410] p-4">
      <div className="flex items-stretch gap-3">
        {/* Recomendado */}
        <div className="flex-1 text-center">
          <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wide">
            Recomendado
          </p>
          <p className="text-xl font-bold text-[#00C853]">{fmt(recomendado)}</p>
          <p className="text-[10px] text-white/25 mt-0.5">por día</p>
        </div>

        {/* Separador con flecha */}
        <div className="flex flex-col items-center justify-center px-1 text-white/20">
          <span className="text-xs">{estaBien ? '≥' : '<'}</span>
        </div>

        {/* Real */}
        <div className="flex-1 text-center">
          <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wide">
            Gastando
          </p>
          <p
            className="text-xl font-bold"
            style={{ color: estaBien ? 'rgba(255,255,255,0.7)' : '#FF5252' }}
          >
            {fmt(real)}
          </p>
          <p className="text-[10px] text-white/25 mt-0.5">promedio/día</p>
        </div>
      </div>

      {/* Mini barra de uso */}
      <div className="mt-3 space-y-1.5">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pctUso}%`,
              background: estaBien ? '#00C853' : '#FF5252',
            }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-white/25">
            {estaBien
              ? `Margen de ${fmt(recomendado - real)}/día`
              : `Exceso de ${fmt(real - recomendado)}/día`}
          </span>
          <span className="text-[10px] text-white/25">
            {diasRestantes} días restantes
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 6. PlanMensualCard ───────────────────────────────────────────────────────
// Muestra la distribución de un plan mensual.
// Inputs: distribucion {ahorro, categorias, libre}, ingreso_detectado, libre

interface PlanData {
  ingreso_detectado?: number
  libre?: number
  ingreso?: number
  distribucion?: {
    ahorro: number
    categorias: Record<string, number>
    libre: number
  }
}

function PlanMensualCard({ data }: { data: Record<string, unknown> }) {
  const d = data as PlanData
  const dist = d.distribucion
  const ingreso = d.ingreso_detectado ?? d.ingreso ?? 0

  if (!dist || ingreso <= 0) return null

  const categorias = Object.entries(dist.categorias ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="mt-2 rounded-2xl border border-[#00C853]/20 bg-[#0D1410] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/60">Plan del mes</span>
        <span className="text-xs font-bold text-[#00C853]">{fmt(ingreso)}</span>
      </div>

      {/* Separador */}
      <div className="h-px bg-white/5" />

      {/* Distribución */}
      <div className="space-y-2">
        {/* Ahorro */}
        {dist.ahorro > 0 && (
          <PlanRow
            emoji="💰"
            label="Ahorro"
            value={dist.ahorro}
            ingreso={ingreso}
            color="#00ACC1"
          />
        )}
        {/* Categorías */}
        {categorias.map(([cat, monto]) => (
          <PlanRow
            key={cat}
            emoji={CATEGORIA_EMOJI[cat.toLowerCase()] ?? '📦'}
            label={cat}
            value={monto}
            ingreso={ingreso}
            color="rgba(255,255,255,0.5)"
          />
        ))}
        {/* Libre */}
        {dist.libre > 0 && (
          <PlanRow
            emoji="🆓"
            label="Libre"
            value={dist.libre}
            ingreso={ingreso}
            color="#69F0AE"
          />
        )}
      </div>
    </div>
  )
}

function PlanRow({
  emoji,
  label,
  value,
  ingreso,
  color,
}: {
  emoji: string
  label: string
  value: number
  ingreso: number
  color: string
}) {
  const pct = ingreso > 0 ? clamp((value / ingreso) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm leading-none w-5 text-center">{emoji}</span>
      <span className="text-[11px] text-white/50 capitalize w-24 truncate">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-semibold text-white/70 w-20 text-right">
        {fmt(value)}
      </span>
    </div>
  )
}