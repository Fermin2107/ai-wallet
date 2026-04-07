'use client'

import React, { useState } from 'react'
import { useSimpleSupabase } from '../hooks/useSimpleSupabase'
import { supabase } from '../lib/supabase'

interface OnboardingProps {
  onComplete: () => void
}

interface OnboardingData {
  nombre: string
  ingreso: number
  categorias: string[]
  medioPago: 'efectivo' | 'debito' | 'credito' | 'mixto'
  objetivo: number
  suenio: string
}

const CATEGORIAS = [
  { id: 'alimentacion',   emoji: '🍔', label: 'Comida y delivery' },
  { id: 'supermercado',   emoji: '🛒', label: 'Supermercado' },
  { id: 'transporte',     emoji: '🚌', label: 'Transporte y nafta' },
  { id: 'salidas',        emoji: '🎉', label: 'Salidas' },
  { id: 'servicios',      emoji: '💡', label: 'Servicios básicos' },
  { id: 'suscripciones',  emoji: '📱', label: 'Suscripciones' },
  { id: 'salud',          emoji: '🏥', label: 'Salud' },
  { id: 'otros',          emoji: '📦', label: 'Otros' },
]

const MEDIOS_PAGO = [
  {
    id: 'efectivo' as const,
    emoji: '💵',
    label: 'Efectivo',
    desc: 'Pago todo o casi todo en cash',
  },
  {
    id: 'debito' as const,
    emoji: '💳',
    label: 'Débito',
    desc: 'Uso la tarjeta de débito',
  },
  {
    id: 'credito' as const,
    emoji: '🏦',
    label: 'Crédito',
    desc: 'Pago con tarjeta de crédito',
  },
  {
    id: 'mixto' as const,
    emoji: '🔀',
    label: 'Mixto',
    desc: 'Combino varios medios',
  },
]

// Porcentajes realistas por categoría sobre el dinero disponible (ingreso - ahorro)
const BUDGET_PCT: Record<string, number> = {
  alimentacion: 0.28,
  supermercado: 0.22,
  transporte:    0.15,
  salidas:       0.12,
  servicios:     0.10,
  suscripciones: 0.05,
  salud:         0.08,
  otros:         0.10,
}

function calcularDistribucion(
  categorias: string[],
  disponible: number
): Record<string, number> {
  if (categorias.length === 0) return {}

  // Sumar los pesos de las categorías seleccionadas
  const totalPeso = categorias.reduce((s, c) => s + (BUDGET_PCT[c] ?? 0.10), 0)

  return categorias.reduce<Record<string, number>>((acc, cat) => {
    const peso = BUDGET_PCT[cat] ?? 0.10
    acc[cat] = Math.round((peso / totalPeso) * disponible)
    return acc
  }, {})
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}` 

// ─── Pasos: 0=bienvenida 1=nombre 2=ingreso 3=categorias 4=medioPago 5=objetivo 6=suenio 7=resumen
const TOTAL_PASOS = 6 // pasos con input (excluye bienvenida y resumen)

// ─── Sub-componentes ─────────────────────────────────────────

interface NavButtonsProps {
  onBack: () => void
  onNext: () => void
  nextDisabled: boolean
  nextLabel?: string
}

function NavButtons({ onBack, onNext, nextDisabled, nextLabel = 'Continuar →' }: NavButtonsProps) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onBack}
        className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl transition-colors hover:bg-white/10"
      >
        ← Anterior
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-xl transition-colors"
      >
        {nextLabel}
      </button>
    </div>
  )
}

interface RowProps {
  label: string
  value: string
  highlight?: 'green'
}

function Row({ label, value, highlight }: RowProps) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50 text-sm">{label}</span>
      <span className={`text-sm font-semibold ${highlight === 'green' ? 'text-[#00C853]' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<OnboardingData>({
    nombre: '',
    ingreso: 0,
    categorias: [],
    medioPago: 'mixto',
    objetivo: 0,
    suenio: '',
  })

  const { createBudget, createGoal } = useSimpleSupabase()

  const porcentajeAhorro =
    formData.ingreso > 0
      ? Math.round((formData.objetivo / formData.ingreso) * 100)
      : 0

  const toggleCategoria = (id: string) =>
    setFormData(prev => ({
      ...prev,
      categorias: prev.categorias.includes(id)
        ? prev.categorias.filter(c => c !== id)
        : [...prev.categorias, id],
    }))

  const handleConfirmar = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null

      const disponible = formData.ingreso - formData.objetivo
      const distribucion = calcularDistribucion(formData.categorias, disponible)
      const mesActual = new Date().toISOString().slice(0, 7)

      // 1. Guardar perfil en Supabase (upsert por user_id)
      if (userId) {
        await supabase.from('user_profiles').upsert({
          user_id: userId,
          nombre: formData.nombre.trim(),
          ingreso_mensual: formData.ingreso,
          objetivo_ahorro: formData.objetivo,
          medio_pago_habitual: formData.medioPago,
          categorias: formData.categorias,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      }

      // 2. Crear budgets
      for (const [categoria, monto] of Object.entries(distribucion)) {
        await createBudget(categoria, monto, mesActual)
      }

      // 3. Crear goal del sueño
      if (formData.suenio.trim().length > 0) {
        await createGoal({
          name: formData.suenio.trim(),
          target_amount: formData.objetivo * 12,
          current_amount: 0,
          icon: '🎯',
          color: 'text-emerald-500',
        })
      }

      // 4. Crear fondo de emergencia
      await createGoal({
        name: 'Fondo de emergencia 🚨',
        target_amount: formData.objetivo * 6,
        current_amount: 0,
        icon: '🚨',
        color: 'text-emerald-500',
      })

      // 5. localStorage — mantener para compatibilidad con buildFinancialContext
      //    que lo lee sincrónicamente desde el cliente
      const key = userId
        ? `ai_wallet_onboarding_${userId}` 
        : 'ai_wallet_onboarding'

      localStorage.setItem(key, JSON.stringify({
        onboarding_completed: true,
        nombre: formData.nombre.trim(),
        ingreso_mensual: formData.ingreso,
        objetivo_ahorro: formData.objetivo,
        medio_pago_habitual: formData.medioPago,
        categorias: formData.categorias,
        userId,
      }))

      onComplete()
    } catch (err) {
      console.error('Error en onboarding:', err)
    } finally {
      setSaving(false)
    }
  }

  // ─── Progreso visual (solo pasos con input)
  const progressStep = Math.max(0, step - 1) // paso 0 = bienvenida, no cuenta
  const progressPct = step === 0 ? 0 : Math.min(100, Math.round((progressStep / TOTAL_PASOS) * 100))

  const renderStep = () => {
    switch (step) {
      // ── 0: Bienvenida ──────────────────────────────────────
      case 0:
        return (
          <div className="text-center space-y-6 pt-8">
            <div className="w-20 h-20 bg-[#00C853]/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">🤖</span>
            </div>
            <h2 className="text-3xl font-bold text-white">
              ¡Hola! Soy tu coach financiero 👋
            </h2>
            <p className="text-white/60 text-lg leading-relaxed">
              Estoy acá para ayudarte a ahorrar más, sin que tengas que entender de finanzas.
            </p>
            <p className="text-white/40">
              Te hago unas preguntas rápidas y te armo un plan personalizado 🎯
            </p>
            <button
              onClick={() => setStep(1)}
              className="w-full bg-[#00C853] hover:bg-[#00C853]/80 text-black font-semibold py-4 rounded-xl text-lg transition-colors"
            >
              ¡Dale! 🚀
            </button>
          </div>
        )

      // ── 1: Nombre ──────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿Cómo querés que te llame? 😊
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                Así el coach te habla de forma más personal
              </p>
            </div>
            <input
              type="text"
              value={formData.nombre}
              onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter' && formData.nombre.trim().length >= 2) setStep(2)
              }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Tu nombre o apodo"
              autoFocus
              maxLength={30}
            />
            <NavButtons
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
              nextDisabled={formData.nombre.trim().length < 2}
            />
          </div>
        )

      // ── 2: Ingreso ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿Cuánto ganás por mes, {formData.nombre}?
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                No tiene que ser exacto 😊
              </p>
            </div>
            <input
              type="number"
              value={formData.ingreso || ''}
              onChange={e =>
                setFormData(prev => ({ ...prev, ingreso: parseFloat(e.target.value) || 0 }))
              }
              onKeyDown={e => {
                if (e.key === 'Enter' && formData.ingreso > 0) setStep(3)
              }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Ej: 500000"
              autoFocus
            />
            <p className="text-white/30 text-xs text-center">
              Solo para entender tu situación, nadie más lo ve 🔒
            </p>
            <NavButtons
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              nextDisabled={formData.ingreso <= 0}
            />
          </div>
        )

      // ── 3: Categorías ──────────────────────────────────────
      case 3:
        return (
          <div className="space-y-5 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿En qué se te va más la plata? 🛍
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                Elegí todas las que aplican
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIAS.map(cat => {
                const selected = formData.categorias.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategoria(cat.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selected
                        ? 'border-[#00C853] bg-[#00C853]/10 text-white'
                        : 'border-white/10 bg-[#141A17] text-white/60 hover:border-white/30'
                    }`}
                  >
                    <div className="text-2xl mb-1">{cat.emoji}</div>
                    <div className="text-xs leading-tight">{cat.label}</div>
                  </button>
                )
              })}
            </div>
            <NavButtons
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
              nextDisabled={formData.categorias.length === 0}
              nextLabel={`Continuar (${formData.categorias.length} elegidas)`}
            />
          </div>
        )

      // ── 4: Medio de pago ───────────────────────────────────
      case 4:
        return (
          <div className="space-y-5 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿Cómo pagás habitualmente?
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                Así el coach te ayuda a registrar gastos más rápido
              </p>
            </div>
            <div className="space-y-3">
              {MEDIOS_PAGO.map(medio => {
                const selected = formData.medioPago === medio.id
                return (
                  <button
                    key={medio.id}
                    onClick={() => setFormData(prev => ({ ...prev, medioPago: medio.id }))}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                      selected
                        ? 'border-[#00C853] bg-[#00C853]/10'
                        : 'border-white/10 bg-[#141A17] hover:border-white/30'
                    }`}
                  >
                    <span className="text-2xl">{medio.emoji}</span>
                    <div>
                      <p className={`font-semibold text-sm ${selected ? 'text-white' : 'text-white/70'}`}>
                        {medio.label}
                      </p>
                      <p className="text-white/40 text-xs">{medio.desc}</p>
                    </div>
                    {selected && (
                      <span className="ml-auto text-[#00C853] text-lg">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
            <NavButtons
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
              nextDisabled={false}
            />
          </div>
        )

      // ── 5: Objetivo de ahorro ──────────────────────────────
      case 5: {
        const badgeConfig =
          porcentajeAhorro >= 20
            ? { color: 'border-[#00C853]/20 bg-[#00C853]/10 text-[#00C853]', texto: `Excelente — ahorrás el ${porcentajeAhorro}% de tus ingresos 🔥` }
            : porcentajeAhorro >= 10
            ? { color: 'border-[#FFD740]/20 bg-[#FFD740]/10 text-[#FFD740]', texto: `Bien. Los expertos sugieren apuntar al 20% 💡` }
            : porcentajeAhorro > 0
            ? { color: 'border-white/10 bg-white/5 text-white/40', texto: `Arrancar con algo es mejor que nada. Meta: llegar al 20% 🙌` }
            : null

        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿Cuánto querés ahorrar por mes?
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                Sé realista — empezamos por algo alcanzable 🎯
              </p>
            </div>
            <input
              type="number"
              value={formData.objetivo || ''}
              onChange={e =>
                setFormData(prev => ({ ...prev, objetivo: parseFloat(e.target.value) || 0 }))
              }
              onKeyDown={e => {
                if (
                  e.key === 'Enter' &&
                  formData.objetivo > 0 &&
                  formData.objetivo < formData.ingreso
                )
                  setStep(6)
              }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder={`Ej: ${Math.round(formData.ingreso * 0.15).toLocaleString('es-AR')}`}
              autoFocus
            />
            {porcentajeAhorro > 0 && badgeConfig && (
              <div className={`border rounded-xl px-4 py-3 text-sm text-center ${badgeConfig.color}`}>
                {badgeConfig.texto}
              </div>
            )}
            {formData.objetivo >= formData.ingreso && formData.objetivo > 0 && (
              <p className="text-[#FF5252] text-sm text-center">
                El objetivo no puede superar tus ingresos
              </p>
            )}
            <NavButtons
              onBack={() => setStep(4)}
              onNext={() => setStep(6)}
              nextDisabled={
                formData.objetivo <= 0 || formData.objetivo >= formData.ingreso
              }
            />
          </div>
        )
      }

      // ── 6: Sueño ───────────────────────────────────────────
      case 6:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">
                ¿Para qué estás ahorrando, {formData.nombre}? 🎯
              </h2>
              <p className="text-white/40 text-center text-sm mt-2">
                Tener un objetivo claro hace toda la diferencia
              </p>
            </div>
            <input
              type="text"
              value={formData.suenio}
              onChange={e => setFormData(prev => ({ ...prev, suenio: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter' && formData.suenio.trim().length >= 3) setStep(7)
              }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-lg placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Ej: viaje a Brasil, auto nuevo, fondo de emergencia..."
              autoFocus
              maxLength={100}
            />
            <NavButtons
              onBack={() => setStep(5)}
              onNext={() => setStep(7)}
              nextDisabled={formData.suenio.trim().length < 3}
            />
          </div>
        )

      // ── 7: Resumen ─────────────────────────────────────────
      case 7: {
        const disponible = formData.ingreso - formData.objetivo
        const distribucion = calcularDistribucion(formData.categorias, disponible)
        const medioLabel = MEDIOS_PAGO.find(m => m.id === formData.medioPago)?.label ?? ''

        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">
              Tu plan, {formData.nombre} 🎉
            </h2>

            {/* Resumen numérico */}
            <div className="bg-[#141A17] border border-white/8 rounded-2xl p-4 space-y-3">
              <Row label="Ingreso mensual" value={fmt(formData.ingreso)} />
              <Row label="Objetivo de ahorro" value={fmt(formData.objetivo)} highlight="green" />
              <Row label="Disponible para gastos" value={fmt(disponible)} />
              <Row label="Medio de pago habitual" value={medioLabel} />
            </div>

            {/* Distribución por categoría */}
            <div className="bg-[#141A17] border border-white/8 rounded-2xl p-4">
              <p className="text-white/50 text-xs mb-3 uppercase tracking-wide">
                Distribución sugerida
              </p>
              <div className="space-y-2">
                {Object.entries(distribucion).map(([cat, monto]) => {
                  const info = CATEGORIAS.find(c => c.id === cat)
                  const pct = Math.round((monto / disponible) * 100)
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-lg w-7 text-center">{info?.emoji}</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-white/70 text-xs">{info?.label ?? cat}</span>
                          <span className="text-white text-xs font-semibold">{fmt(monto)}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00C853]/60 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(6)}
                className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl"
              >
                ← Cambiar algo
              </button>
              <button
                onClick={handleConfirmar}
                disabled={saving}
                className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-50 text-black font-semibold py-3 rounded-xl transition-colors"
              >
                {saving ? 'Guardando...' : 'Empecemos ✅'}
              </button>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0F0D] flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#00C853]/20 rounded-full flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">AI Wallet</h3>
          <p className="text-white/60 text-xs">Coach financiero personal</p>
        </div>
      </div>

      {/* Barra de progreso */}
      {step > 0 && step < 7 && (
        <div className="px-6 mb-2">
          <div className="flex justify-between text-xs text-white/30 mb-1">
            <span>Paso {progressStep} de {TOTAL_PASOS}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00C853] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-md mx-auto space-y-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
