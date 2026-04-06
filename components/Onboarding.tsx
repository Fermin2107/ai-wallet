'use client';

import React, { useState, useEffect } from 'react';
import { useSimpleSupabase } from '../hooks/useSimpleSupabase';
import { supabase } from '../lib/supabase';

interface OnboardingProps {
  onComplete: () => void;
}

interface OnboardingData {
  ingreso: number;
  categorias: string[];
  objetivo: number;
  suenio: string;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [formData, setFormData] = useState<OnboardingData>({
    ingreso: 0,
    categorias: [],
    objetivo: 0,
    suenio: ''
  });

  const { createBudget, createGoal } = useSimpleSupabase();

  // Mensajes del asistente por paso
  const assistantMessages = [
    {
      step: 0,
      message: "¡Hola! Soy tu coach financiero 👋",
      delay: 600
    },
    {
      step: 0,
      message: "Estoy acá para ayudarte a ahorrar más, sin que tengas que entender de finanzas 😊",
      delay: 1400
    },
    {
      step: 0,
      message: "Te hago 4 preguntas rápidas y te armo un plan personalizado 🎯",
      delay: 2400
    },
    {
      step: 1,
      message: "¿Cuánto ganás por mes, más o menos?",
      delay: 600
    },
    {
      step: 1,
      message: "No te preocupes si no es exacto, después lo ajustamos juntos 📊",
      delay: 1400
    },
    {
      step: 2,
      message: "¿En qué se te va más la plata? Podés elegir más de una 👇",
      delay: 600
    },
    {
      step: 2,
      message: "Podés elegir varias, no te preocupes 🎯",
      delay: 1400
    },
    {
      step: 3,
      message: "¿Cuánto querés ahorrar por mes? Sé realista, empezamos por algo pequeño 🎯",
      delay: 600
    },
    {
      step: 3,
      message: "Un buen objetivo es entre el 10% y 20% de tus ingresos 💡",
      delay: 1400
    },
    {
      step: 4,
      message: "¿Para qué estás ahorrando? Contame tu sueño 🎯",
      delay: 600
    },
    {
      step: 4,
      message: "Ej: 'viaje a Brasil', 'auto nuevo', 'emergencia'... 🚀✈️",
      delay: 1400
    },
    {
      step: 5,
      message: "¡Perfecto! Armé tu plan personalizado 🎉",
      delay: 600
    }
  ];

  const currentMessage = assistantMessages.find(msg => msg.step === step && msg.delay === 600);

  // Categorías disponibles
  const categoriasDisponibles = [
    { id: 'alimentacion', nombre: '🍔 Comida y delivery', color: 'bg-orange-500' },
    { id: 'transporte', nombre: '🚌 Transporte y nafta', color: 'bg-blue-500' },
    { id: 'salidas', nombre: '🎉 Salidas y entretenimiento', color: 'bg-purple-500' },
    { id: 'supermercado', nombre: '🛒 Supermercado', color: 'bg-green-500' },
    { id: 'servicios', nombre: '💡 Servicios básicos', color: 'bg-yellow-500' },
    { id: 'suscripciones', nombre: '📱 Suscripciones', color: 'bg-red-500' },
    { id: 'otros', nombre: '📦 Otros gastos', color: 'bg-gray-500' }
  ];

  // Manejo de selección de categorías
  const toggleCategoria = (categoriaId: string) => {
    setFormData(prev => ({
      ...prev,
      categorias: prev.categorias.includes(categoriaId)
        ? prev.categorias.filter(c => c !== categoriaId)
        : [...prev.categorias, categoriaId]
    }));
  };

  // Cálculo de distribución del presupuesto
  const calcularDistribucion = () => {
    const disponible = formData.ingreso - formData.objetivo;
    const categoriasSeleccionadas = categoriasDisponibles.filter(cat => 
      formData.categorias.includes(cat.id)
    );

    if (categoriasSeleccionadas.length === 0) return {};

    const presupuestoPorCategoria = disponible / categoriasSeleccionadas.length;

    return categoriasSeleccionadas.reduce((acc, cat) => {
      acc[cat.id] = presupuestoPorCategoria;
      return acc;
    }, {} as Record<string, number>);
  };

  // Manejo del siguiente paso
  const handleNext = () => {
    if (step === 0) {
      // Bienvenida → avanzar siempre
      setStep(1)
    } else if (step === 1) {
      // Ingreso → validar que sea > 0
      if (formData.ingreso > 0) setStep(2)
    } else if (step === 2) {
      // Categorías → validar al menos 1
      if (formData.categorias.length > 0) setStep(3)
    } else if (step === 3) {
      // Objetivo → validar rango
      if (formData.objetivo > 0 && formData.objetivo < formData.ingreso) setStep(4)
    } else if (step === 4) {
      // Sueño → validar longitud
      if (formData.suenio.trim().length >= 3) setStep(5)
    }
  }

  // Confirmación del onboarding
  const handleConfirmar = async () => {
    try {
      // Obtener userId UNA sola vez
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id || null

      // Calcular distribución
      const disponible = formData.ingreso - formData.objetivo
      const distribucion: Record<string, number> = {}
      
      const porcentajes: Record<string, number> = {
        alimentacion: 0.30,
        supermercado: 0.30,
        transporte: 0.15,
        salidas: 0.15,
      }
      
      let totalAsignado = 0
      formData.categorias.forEach(cat => {
        if (porcentajes[cat]) {
          distribucion[cat] = Math.round(disponible * porcentajes[cat])
          totalAsignado += distribucion[cat]
        }
      })
      
      // Lo que sobre va a "otros"
      if (totalAsignado < disponible) {
        distribucion['otros'] = disponible - totalAsignado
      }

      // Crear budgets — UNO por categoría, sin duplicados
      for (const [categoria, monto] of Object.entries(distribucion)) {
        await createBudget(
          categoria,
          monto,
          new Date().toISOString().slice(0, 7)
        )
      }

      // Crear goal del sueño — UNA sola vez
      if (formData.suenio && formData.suenio.trim().length > 0) {
        await createGoal({
          name: formData.suenio.trim(),
          target_amount: formData.objetivo * 12,
          current_amount: 0,
          icon: '🎯',
          color: 'text-emerald-500'
        })
      }

      // Crear goal de ahorro base — SIEMPRE, UNA sola vez
      await createGoal({
        name: 'Fondo de ahorro 💰',
        target_amount: formData.objetivo * 6,
        current_amount: 0,
        icon: '💰',
        color: 'text-emerald-500'
      })

      localStorage.setItem('ai_wallet_onboarding', JSON.stringify({
  onboarding_completed: true,
  ingreso_mensual: formData.ingreso,
  objetivo_ahorro: formData.objetivo,
  categorias: formData.categorias
}))

      onComplete()
    } catch (error) {
      console.error('Error en onboarding:', error);
    }
  };

  // UI según el paso
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center space-y-6 pt-8">
            <div className="w-20 h-20 bg-[#00C853]/20 rounded-full 
                            flex items-center justify-center mx-auto">
              <span className="text-4xl">🤖</span>
            </div>
            <h2 className="text-3xl font-bold text-white">
              ¡Hola! Soy tu coach financiero 👋
            </h2>
            <p className="text-white/60 text-lg">
              Estoy acá para ayudarte a ahorrar más, 
              sin que tengas que entender de finanzas.
            </p>
            <p className="text-white/40">
              Te hago 4 preguntas rápidas y te armo 
              un plan personalizado 🎯
            </p>
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleNext}
                className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 
                           text-black font-semibold py-4 rounded-xl 
                           text-lg transition-colors"
              >
                ¡Dale! 🚀
              </button>
              <button
                onClick={handleNext}
                className="flex-1 bg-white/10 border border-white/20 
                           text-white py-4 rounded-xl text-lg 
                           transition-colors hover:bg-white/20"
              >
                Sí, vamos
              </button>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center">
              ¿Cuánto ganás por mes, más o menos?
            </h2>
            <p className="text-white/40 text-center text-sm">
              No tiene que ser exacto 😊
            </p>
            <input
              type="number"
              value={formData.ingreso || ''}
              onChange={e => setFormData(prev => ({ 
                ...prev, ingreso: parseFloat(e.target.value) || 0 
              }))}
              className="w-full bg-[#141A17] border border-white/10 
                         rounded-xl px-4 py-4 text-white text-xl
                         placeholder-white/30 focus:outline-none 
                         focus:border-[#00C853]/40"
              placeholder="Ej: 250000"
              autoFocus
            />
            <p className="text-white/30 text-xs text-center">
              Solo para entender tu situación, nadie más lo ve 🔒
            </p>
            <button
              onClick={handleNext}
              disabled={formData.ingreso <= 0}
              className="w-full bg-[#00C853] hover:bg-[#00C853]/80 
                         disabled:opacity-30 disabled:cursor-not-allowed
                         text-black font-semibold py-4 rounded-xl 
                         text-lg transition-colors"
            >
              Continuar →
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center">
              ¿En qué se te va más la plata? 👇
            </h2>
            <p className="text-white/40 text-center text-sm">
              Podés elegir más de una
            </p>
            <div className="grid grid-cols-2 gap-3">
              {categoriasDisponibles.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategoria(cat.id)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    formData.categorias.includes(cat.id)
                      ? 'border-[#00C853] bg-[#00C853]/10 text-white'
                      : 'border-white/10 bg-[#141A17] text-white/60 hover:border-white/30'
                  }`}
                >
                  <div className="text-2xl mb-1">{cat.nombre.split(' ')[0]}</div>
                  <div className="text-xs leading-tight">
                    {cat.nombre.split(' ').slice(1).join(' ')}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-white/5 border border-white/10 
                           text-white/50 py-3 rounded-xl"
              >
                ← Anterior
              </button>
              <button
                onClick={handleNext}
                disabled={formData.categorias.length === 0}
                className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 
                           disabled:opacity-30 disabled:cursor-not-allowed
                           text-black font-semibold py-3 rounded-xl 
                           transition-colors"
              >
                Continuar →
              </button>
            </div>
          </div>
        );

      case 3:
        const porcentajeAhorro = formData.ingreso > 0 
          ? Math.round((formData.objetivo / formData.ingreso) * 100)
          : 0

        const badgeConfig = 
          porcentajeAhorro >= 20 
            ? { color: 'border-[#00C853]/20 bg-[#00C853]/10 text-[#00C853]',
                texto: `¡Excelente! Ahorrás el ${porcentajeAhorro}% de tus ingresos 🔥` }
          : porcentajeAhorro >= 10
            ? { color: 'border-[#FFD740]/20 bg-[#FFD740]/10 text-[#FFD740]',
                texto: `Bien. Los expertos sugieren ahorrar al menos el 20% 💡` }
          : porcentajeAhorro > 0
            ? { color: 'border-white/10 bg-white/5 text-white/40',
                texto: `Arrancar con algo es mejor que nada. Meta: llegar al 20% 🙌` }
            : null

        return (
          <div className="space-y-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center">
              ¿Cuánto querés ahorrar por mes?
            </h2>
            <input
              type="number"
              value={formData.objetivo || ''}
              onChange={e => setFormData(prev => ({ 
                ...prev, objetivo: parseFloat(e.target.value) || 0 
              }))}
              className="w-full bg-[#141A17] border border-white/10 
                         rounded-xl px-4 py-4 text-white text-xl
                         placeholder-white/30 focus:outline-none 
                         focus:border-[#00C853]/40"
              placeholder="Ej: 50000"
              autoFocus
            />
            {porcentajeAhorro > 0 && badgeConfig && (
              <div className={`border rounded-xl px-4 py-3 text-sm 
                           text-center ${badgeConfig.color}`}>
                {badgeConfig.texto}
              </div>
            )}
            {formData.objetivo >= formData.ingreso && formData.objetivo > 0 && (
              <p className="text-[#FF5252] text-sm text-center">
                El objetivo no puede superar tus ingresos
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)}
                className="flex-1 bg-white/5 border border-white/10 
                           text-white/50 py-3 rounded-xl">
                ← Anterior
              </button>
              <button
                onClick={handleNext}
                disabled={formData.objetivo <= 0 || formData.objetivo >= formData.ingreso}
                className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 
                           disabled:opacity-30 disabled:cursor-not-allowed
                           text-black font-semibold py-3 rounded-xl 
                           transition-colors"
              >
                Continuar →
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 pt-4">
            <h2 className="text-2xl font-bold text-white text-center">
              ¿Para qué estás ahorrando? 🎯
            </h2>
            <p className="text-white/40 text-center text-sm">
              Contame tu sueño
            </p>
            <input
              type="text"
              value={formData.suenio}
              onChange={e => setFormData(prev => ({ 
                ...prev, suenio: e.target.value 
              }))}
              maxLength={100}
              className="w-full bg-[#141A17] border border-white/10 
                         rounded-xl px-4 py-4 text-white text-lg
                         placeholder-white/30 focus:outline-none 
                         focus:border-[#00C853]/40"
              placeholder="Ej: viaje a Brasil, auto nuevo, emergencia..."
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(3)}
                className="flex-1 bg-white/5 border border-white/10 
                           text-white/50 py-3 rounded-xl">
                ← Anterior
              </button>
              <button
                onClick={handleNext}
                disabled={formData.suenio.trim().length < 3}
                className="flex-1 bg-[#00C853] hover:bg-[#00C853]/80 
                           disabled:opacity-30 disabled:cursor-not-allowed
                           text-black font-semibold py-3 rounded-xl 
                           transition-colors"
              >
                Continuar →
              </button>
            </div>
          </div>
        );

      case 5:
        const distribucionCalculada = calcularDistribucion();
        const disponible = formData.ingreso - formData.objetivo;
        
        return (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              ¡Perfecto! Armé tu plan personalizado 🎉
            </h2>
            
            <div className="bg-white/10 rounded-lg p-6 border border-white/20">
              <h3 className="text-lg font-semibold text-white mb-4">🎯 Tu Plan Personalizado</h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-white/80">Ingreso mensual:</span>
                  <span className="text-white font-bold">${formData.ingreso.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">Objetivo de ahorro:</span>
                  <span className="text-white font-bold">${formData.objetivo.toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">Disponible para gastos:</span>
                  <span className="text-white font-bold text-green-400">${disponible.toLocaleString('es-AR')}</span>
                </div>
              </div>
              
              <div className="border-t border-white/20 pt-4">
                <h4 className="text-white font-semibold mb-3">Sugerencia de distribución:</h4>
                <div className="space-y-2">
                  {Object.entries(distribucionCalculada).map(([categoria, monto]) => {
                    const categoriaInfo = categoriasDisponibles.find(cat => cat.id === categoria);
                    return (
                      <div key={categoria} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <span className="text-xl">{categoriaInfo?.nombre.split(' ')[0]}</span>
                          <span className="text-white/60 text-xs">{categoriaInfo?.nombre.split(' ').slice(1).join(' ')}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold">${(monto as number).toLocaleString('es-AR')}</div>
                          <div className="text-white/60 text-xs">
                            {(((monto as number) / formData.ingreso) * 100).toFixed(1)}% del ingreso
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="bg-white/10 rounded-lg p-4 border border-white/20">
                <p className="text-white/60 text-sm mb-3">
                  ¿Te parece bien este plan?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(4)}
                    className="flex-1 bg-white/10 border border-white/20 text-white/70 py-3 rounded-lg"
                  >
                    Quiero cambiar algo
                  </button>
                  <button
                    onClick={handleConfirmar}
                    className="flex-1 bg-[#00C853] hover:bg-[#00A040] text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Se ve bien ✅
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F0D] flex flex-col">
      {/* Header mínimo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#00C853]/20 rounded-full flex items-center justify-center">
          <span className="text-lg">🤖</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Coach AI Wallet</h3>
          <p className="text-white/60 text-xs">Tu asistente financiero</p>
        </div>
      </div>

      {/* Área de mensajes con scroll interno */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-md mx-auto space-y-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
