'use client'

import React, { useState, useEffect } from 'react'
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

const ONBOARDING_DRAFT_KEY = (uid: string) => `ai_wallet_onboarding_draft_${uid}`

const CATEGORIAS = [
  { id: 'alimentacion',  emoji: '🍔', label: 'Comida y delivery' },
  { id: 'supermercado',  emoji: '🛒', label: 'Supermercado' },
  { id: 'transporte',    emoji: '🚌', label: 'Transporte y nafta' },
  { id: 'salidas',       emoji: '🎉', label: 'Salidas' },
  { id: 'servicios',     emoji: '💡', label: 'Servicios básicos' },
  { id: 'suscripciones', emoji: '📱', label: 'Suscripciones' },
  { id: 'salud',         emoji: '🏥', label: 'Salud' },
]

const MEDIOS_PAGO = [
  { id: 'efectivo' as const, emoji: '💵', label: 'Efectivo',  desc: 'Pago todo o casi todo en cash' },
  { id: 'debito'   as const, emoji: '💳', label: 'Débito',    desc: 'Uso la tarjeta de débito' },
  { id: 'credito'  as const, emoji: '🏦', label: 'Crédito',   desc: 'Pago con tarjeta de crédito' },
  { id: 'mixto'    as const, emoji: '🔀', label: 'Mixto',     desc: 'Combino varios medios' },
]

const BUDGET_WEIGHTS: Record<string, number> = {
  alimentacion:  0.28,
  supermercado:  0.22,
  transporte:    0.15,
  salidas:       0.12,
  servicios:     0.10,
  suscripciones: 0.05,
  salud:         0.08,
}

const OTROS_MIN_PCT = 0.10

export function calcularDistribucion(categorias: string[], disponible: number): Record<string, number> {
  if (disponible <= 0) return {}
  const reservaOtros   = Math.round(disponible * OTROS_MIN_PCT)
  const paraDistribuir = disponible - reservaOtros
  if (categorias.length === 0) return { otros: disponible }
  const totalPeso = categorias.reduce((s, c) => s + (BUDGET_WEIGHTS[c] ?? 0.10), 0)
  const distribucion: Record<string, number> = {}
  let asignado = 0
  categorias.forEach((cat, idx) => {
    const peso = BUDGET_WEIGHTS[cat] ?? 0.10
    if (idx === categorias.length - 1) {
      distribucion[cat] = paraDistribuir - asignado
    } else {
      const monto = Math.round((peso / totalPeso) * paraDistribuir)
      distribucion[cat] = monto
      asignado += monto
    }
  })
  distribucion['otros'] = reservaOtros
  return distribucion
}

export function recalcularAlAgregar(
  categoriasExistentes: Record<string, number>,
  nuevaCategoria: string,
  disponible: number
): Record<string, number> {
  const peso            = BUDGET_WEIGHTS[nuevaCategoria] ?? 0.10
  const montoNuevo      = Math.round(disponible * peso)
  const totalExistente  = Object.values(categoriasExistentes).reduce((s, v) => s + v, 0)
  const factorReduccion = Math.max(0, (totalExistente - montoNuevo)) / Math.max(1, totalExistente)
  const resultado: Record<string, number> = {}
  Object.keys(categoriasExistentes).forEach(cat => {
    if (cat === 'otros') return
    resultado[cat] = Math.round(categoriasExistentes[cat] * factorReduccion)
  })
  resultado[nuevaCategoria] = montoNuevo
  const yaAsignado = Object.values(resultado).reduce((s, v) => s + v, 0)
  resultado['otros'] = Math.max(Math.round(disponible * OTROS_MIN_PCT), disponible - yaAsignado)
  return resultado
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const TOTAL_PASOS = 6

function NavButtons({ onBack, onNext, nextDisabled, nextLabel = 'Continuar →' }: {
  onBack: () => void; onNext: () => void; nextDisabled: boolean; nextLabel?: string
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onBack} className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl transition-colors hover:bg-white/10">
        ← Anterior
      </button>
      <button onClick={onNext} disabled={nextDisabled} className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-30 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-xl transition-colors">
        {nextLabel}
      </button>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: 'green' }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/50 text-sm">{label}</span>
      <span className={`text-sm font-semibold ${highlight === 'green' ? 'text-[#00C853]' : 'text-white'}`}>{value}</span>
    </div>
  )
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [formData, setFormData] = useState<OnboardingData>({
    nombre: '', ingreso: 0, categorias: [], medioPago: 'mixto', objetivo: 0, suenio: '',
  })
  const [distribucionEditada, setDistribucionEditada] = useState<Record<string, number>>({})

  const { createBudget, createGoal, createAccount } = useSimpleSupabase()

  // Cargar borrador guardado
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (!uid) return
      const draft = localStorage.getItem(ONBOARDING_DRAFT_KEY(uid))
      if (draft) {
        try {
          const parsed = JSON.parse(draft)
          setFormData(prev => ({ ...prev, ...parsed.formData }))
          if (parsed.step > 0) setStep(parsed.step)
        } catch { /* ignorar */ }
      }
    }
    load()
  }, [])

  // Persistencia parcial en cada cambio
  useEffect(() => {
    if (!userId || step === 0) return
    localStorage.setItem(ONBOARDING_DRAFT_KEY(userId), JSON.stringify({ step, formData }))
  }, [step, formData, userId])

  // Recalcular distribución cuando cambian categorías u objetivo
  useEffect(() => {
    if (formData.categorias.length === 0 || formData.ingreso <= 0) return
    const disponible = formData.ingreso - formData.objetivo
    const dist = calcularDistribucion(formData.categorias, disponible)
    setDistribucionEditada(dist)
  }, [formData.categorias, formData.ingreso, formData.objetivo])

  const porcentajeAhorro = formData.ingreso > 0 ? Math.round((formData.objetivo / formData.ingreso) * 100) : 0

  const toggleCategoria = (id: string) =>
    setFormData(prev => ({
      ...prev,
      categorias: prev.categorias.includes(id)
        ? prev.categorias.filter(c => c !== id)
        : [...prev.categorias, id],
    }))

  const editarLimite = (cat: string, valor: number) =>
    setDistribucionEditada(prev => ({ ...prev, [cat]: Math.max(0, valor) }))

  const crearCuentaAutomatica = async () => {
    if (formData.medioPago === 'efectivo') {
      await createAccount({ name: 'Efectivo', type: 'liquid', balance: 0, is_default: true })
    } else if (formData.medioPago === 'debito') {
      await createAccount({ name: 'Cuenta bancaria', type: 'liquid', balance: 0, is_default: true })
    }
    // credito y mixto: el coach pide los datos en el chat
  }

  const handleConfirmar = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id ?? null
      const mesActual = new Date().toISOString().slice(0, 7)

      if (uid) {
        await supabase.from('user_profiles').upsert({
          user_id: uid,
          nombre: formData.nombre.trim(),
          ingreso_mensual: formData.ingreso,
          objetivo_ahorro: formData.objetivo,
          medio_pago_habitual: formData.medioPago,
          categorias: formData.categorias,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      }

      for (const [categoria, monto] of Object.entries(distribucionEditada)) {
        if (monto > 0) await createBudget(categoria, monto, mesActual)
      }

      await crearCuentaAutomatica()

      if (formData.suenio.trim().length > 0) {
        await createGoal({ name: formData.suenio.trim(), target_amount: formData.objetivo * 12, current_amount: 0, icon: '🎯', color: 'text-emerald-500' })
      }

      await createGoal({ name: 'Fondo de emergencia 🚨', target_amount: formData.objetivo * 6, current_amount: 0, icon: '🚨', color: 'text-emerald-500' })

      const key = uid ? `ai_wallet_onboarding_${uid}` : 'ai_wallet_onboarding'
      localStorage.setItem(key, JSON.stringify({
        onboarding_completed: true,
        nombre: formData.nombre.trim(),
        ingreso_mensual: formData.ingreso,
        objetivo_ahorro: formData.objetivo,
        medio_pago_habitual: formData.medioPago,
        categorias: formData.categorias,
        userId: uid,
      }))

      if (uid) localStorage.removeItem(ONBOARDING_DRAFT_KEY(uid))

      onComplete()
    } catch (err) {
      console.error('Error en onboarding:', err)
    } finally {
      setSaving(false)
    }
  }

  const progressStep = Math.max(0, step - 1)
  const progressPct  = step === 0 ? 0 : Math.min(100, Math.round((progressStep / TOTAL_PASOS) * 100))

  const emojiMap: Record<string, string> = {
    alimentacion: '🍔', supermercado: '🛒', transporte: '🚌',
    salidas: '🎉', servicios: '💡', suscripciones: '📱', salud: '🏥', otros: '📦',
  }
  const labelMap: Record<string, string> = {
    alimentacion: 'Comida y delivery', supermercado: 'Supermercado',
    transporte: 'Transporte y nafta', salidas: 'Salidas',
    servicios: 'Servicios básicos', suscripciones: 'Suscripciones',
    salud: 'Salud', otros: 'Varios y otros',
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center space-y-6 pt-8">
            <div className="w-20 h-20 bg-[#00C853]/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">🤖</span>
            </div>
            <h2 className="text-3xl font-bold text-white">¡Hola! Soy tu coach financiero 👋</h2>
            <p className="text-white/60 text-lg leading-relaxed">
              Estoy acá para ayudarte a ahorrar más, sin que tengas que entender de finanzas.
            </p>
            <p className="text-white/40">Son 6 preguntas — menos de 2 minutos y tenés tu plan 🎯</p>
            <button onClick={() => setStep(1)} className="w-full bg-[#00C853] hover:bg-[#00C853]/80 text-black font-semibold py-4 rounded-xl text-lg transition-colors">
              ¡Dale, arrancamos! 🚀
            </button>
          </div>
        )

      case 1:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿Cómo querés que te llame? 😊</h2>
              <p className="text-white/40 text-center text-sm mt-2">Así el coach te habla de forma más personal</p>
            </div>
            <input
              type="text" value={formData.nombre}
              onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && formData.nombre.trim().length >= 2) setStep(2) }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Tu nombre o apodo" autoFocus maxLength={30}
            />
            <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={formData.nombre.trim().length < 2} />
          </div>
        )

      case 2:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿Cuánto ganás por mes, {formData.nombre}?</h2>
              <p className="text-white/40 text-center text-sm mt-2">No tiene que ser exacto 😊</p>
            </div>
            <input
              type="number" value={formData.ingreso || ''}
              onChange={e => setFormData(prev => ({ ...prev, ingreso: parseFloat(e.target.value) || 0 }))}
              onKeyDown={e => { if (e.key === 'Enter' && formData.ingreso > 0) setStep(3) }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Ej: 500000" autoFocus
            />
            <p className="text-white/30 text-xs text-center">Solo para entender tu situación, nadie más lo ve 🔒</p>
            <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={formData.ingreso <= 0} />
          </div>
        )

      case 3:
        return (
          <div className="space-y-5 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿En qué se te va más la plata? 🛍</h2>
              <p className="text-white/40 text-center text-sm mt-2">Elegí todas las que aplican</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIAS.map(cat => {
                const selected = formData.categorias.includes(cat.id)
                return (
                  <button key={cat.id} onClick={() => toggleCategoria(cat.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${selected ? 'border-[#00C853] bg-[#00C853]/10 text-white' : 'border-white/10 bg-[#141A17] text-white/60 hover:border-white/30'}`}>
                    <div className="text-2xl mb-1">{cat.emoji}</div>
                    <div className="text-xs leading-tight">{cat.label}</div>
                  </button>
                )
              })}
            </div>
            <p className="text-white/25 text-xs text-center">📦 &quot;Otros&quot; se agrega automáticamente para gastos varios</p>
            <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} nextDisabled={formData.categorias.length === 0} nextLabel={`Continuar (${formData.categorias.length} elegidas)`} />
          </div>
        )

      case 4:
        return (
          <div className="space-y-5 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿Cómo pagás habitualmente?</h2>
              <p className="text-white/40 text-center text-sm mt-2">Así el coach te ayuda a registrar gastos más rápido</p>
            </div>
            <div className="space-y-3">
              {MEDIOS_PAGO.map(medio => {
                const selected = formData.medioPago === medio.id
                return (
                  <button key={medio.id} onClick={() => setFormData(prev => ({ ...prev, medioPago: medio.id }))}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${selected ? 'border-[#00C853] bg-[#00C853]/10' : 'border-white/10 bg-[#141A17] hover:border-white/30'}`}>
                    <span className="text-2xl">{medio.emoji}</span>
                    <div>
                      <p className={`font-semibold text-sm ${selected ? 'text-white' : 'text-white/70'}`}>{medio.label}</p>
                      <p className="text-white/40 text-xs">{medio.desc}</p>
                    </div>
                    {selected && <span className="ml-auto text-[#00C853] text-lg">✓</span>}
                  </button>
                )
              })}
            </div>
            <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} nextDisabled={false} />
          </div>
        )

      case 5: {
        const badgeConfig =
          porcentajeAhorro >= 20 ? { color: 'border-[#00C853]/20 bg-[#00C853]/10 text-[#00C853]', texto: `Excelente — ahorrás el ${porcentajeAhorro}% de tus ingresos 🔥` }
          : porcentajeAhorro >= 10 ? { color: 'border-[#FFD740]/20 bg-[#FFD740]/10 text-[#FFD740]', texto: `Bien. Los expertos sugieren apuntar al 20% 💡` }
          : porcentajeAhorro > 0  ? { color: 'border-white/10 bg-white/5 text-white/40', texto: `Arrancar con algo es mejor que nada. Meta: llegar al 20% 🙌` }
          : null
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿Cuánto querés ahorrar por mes?</h2>
              <p className="text-white/40 text-center text-sm mt-2">Sé realista — empezamos por algo alcanzable 🎯</p>
            </div>
            <input
              type="number" value={formData.objetivo || ''}
              onChange={e => setFormData(prev => ({ ...prev, objetivo: parseFloat(e.target.value) || 0 }))}
              onKeyDown={e => { if (e.key === 'Enter' && formData.objetivo > 0 && formData.objetivo < formData.ingreso) setStep(6) }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-xl placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder={`Ej: ${Math.round(formData.ingreso * 0.15).toLocaleString('es-AR')}`} autoFocus
            />
            {porcentajeAhorro > 0 && badgeConfig && (
              <div className={`border rounded-xl px-4 py-3 text-sm text-center ${badgeConfig.color}`}>{badgeConfig.texto}</div>
            )}
            {formData.objetivo >= formData.ingreso && formData.objetivo > 0 && (
              <p className="text-[#FF5252] text-sm text-center">El objetivo no puede superar tus ingresos</p>
            )}
            <NavButtons onBack={() => setStep(4)} onNext={() => setStep(6)} nextDisabled={formData.objetivo <= 0 || formData.objetivo >= formData.ingreso} />
          </div>
        )
      }

      case 6:
        return (
          <div className="space-y-6 pt-4">
            <div>
              <h2 className="text-2xl font-bold text-white text-center">¿Para qué estás ahorrando, {formData.nombre}? 🎯</h2>
              <p className="text-white/40 text-center text-sm mt-2">Tener un objetivo claro hace toda la diferencia</p>
            </div>
            <input
              type="text" value={formData.suenio}
              onChange={e => setFormData(prev => ({ ...prev, suenio: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && formData.suenio.trim().length >= 3) setStep(7) }}
              className="w-full bg-[#141A17] border border-white/10 rounded-xl px-4 py-4 text-white text-lg placeholder-white/30 focus:outline-none focus:border-[#00C853]/40"
              placeholder="Ej: viaje a Brasil, auto nuevo, fondo de emergencia..." autoFocus maxLength={100}
            />
            <NavButtons onBack={() => setStep(5)} onNext={() => setStep(7)} nextDisabled={formData.suenio.trim().length < 3} />
          </div>
        )

      case 7: {
        const disponible = formData.ingreso - formData.objetivo
        const medioLabel = MEDIOS_PAGO.find(m => m.id === formData.medioPago)?.label ?? ''
        const cuentaAuto =
          formData.medioPago === 'efectivo' ? 'Te creo una cuenta "Efectivo" para tus gastos — son 2 segundos.' :
          formData.medioPago === 'debito'   ? 'Te creo una cuenta bancaria para tus gastos — son 2 segundos.' :
          'El coach te va a pedir los datos de tu cuenta al llegar al chat.'

        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">Tu plan, {formData.nombre} 🎉</h2>

            <div className="bg-[#141A17] border border-white/8 rounded-2xl p-4 space-y-3">
              <Row label="Ingreso mensual"        value={fmt(formData.ingreso)} />
              <Row label="Objetivo de ahorro"     value={fmt(formData.objetivo)} highlight="green" />
              <Row label="Disponible para gastos" value={fmt(disponible)} />
              <Row label="Medio de pago habitual" value={medioLabel} />
            </div>

            <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs">🏦 {cuentaAuto}</p>
            </div>

            <div className="bg-[#141A17] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/50 text-xs uppercase tracking-wide">Distribución sugerida</p>
                <p className="text-white/25 text-[10px]">Tocá para editar</p>
              </div>
              <div className="space-y-3">
                {Object.entries(distribucionEditada).map(([cat, monto]) => {
                  const isOtros = cat === 'otros'
                  const pct = disponible > 0 ? Math.round((monto / disponible) * 100) : 0
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-lg w-7 text-center shrink-0">{emojiMap[cat] ?? '📦'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className={`text-xs ${isOtros ? 'text-white/40' : 'text-white/70'}`}>
                            {labelMap[cat] ?? cat}
                            {isOtros && <span className="ml-1 text-[10px] text-white/25">(gastos varios)</span>}
                          </span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: isOtros ? 'rgba(255,255,255,0.15)' : '#00C853', opacity: isOtros ? 0.6 : 1 }} />
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30 text-xs">$</span>
                        <input
                          type="number" value={monto || ''}
                          onChange={e => editarLimite(cat, parseFloat(e.target.value) || 0)}
                          className={`w-24 bg-white/5 border border-white/10 rounded-lg pl-5 pr-2 py-1.5 text-xs text-right focus:outline-none focus:border-[#00C853]/40 ${isOtros ? 'text-white/30' : 'text-white'}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-white/20 text-[10px] mt-3">Podés ajustar estos límites en cualquier momento desde la sección de Límites.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(6)} className="flex-1 bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl">
                ← Cambiar algo
              </button>
              <button onClick={handleConfirmar} disabled={saving} className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 disabled:opacity-50 text-black font-semibold py-3 rounded-xl transition-colors">
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
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#00C853]/20 rounded-full flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">AI Wallet</h3>
          <p className="text-white/60 text-xs">Coach financiero personal</p>
        </div>
      </div>

      {step > 0 && step < 7 && (
        <div className="px-6 mb-2">
          <div className="flex justify-between text-xs text-white/30 mb-1">
            <span>Paso {progressStep} de {TOTAL_PASOS}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-[#00C853] rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-md mx-auto space-y-6">
          {renderStep()}
        </div>
      </div>
    </div>
  )
}