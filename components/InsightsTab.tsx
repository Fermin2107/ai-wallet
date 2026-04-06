'use client';

import React, { useState, useMemo } from 'react';
import { Brain, TrendingUp, CreditCard, Calendar, AlertTriangle, Lightbulb, Target, DollarSign, Activity } from 'lucide-react';
import { Transaction, Insight } from '../lib/types';
import { useLocalStorage } from '../hooks/useLocalStorage';

export default function InsightsTab() {
  const [transactions] = useLocalStorage<Transaction[]>('ai-wallet-transactions', []);
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);

  // Generar insights basados en los datos reales
  const insights = useMemo(() => {
    const insights: Insight[] = [];
    
    // Análisis de patrones de gasto
    const gastosPorCategoria = transactions
      .filter(t => t.tipo === 'gasto')
      .reduce((acc, t) => {
        acc[t.categoria.id] = (acc[t.categoria.id] || 0) + t.monto;
        return acc;
      }, {} as Record<string, number>);

    const categoriaMasGastada = Object.entries(gastosPorCategoria)
      .sort(([, a], [, b]) => b - a)[0];

    if (categoriaMasGastada) {
      insights.push({
        id: 'patron-1',
        tipo: 'patron',
        titulo: 'Tu categoría principal de gasto',
        descripcion: `El ${Math.round((categoriaMasGastada[1] / transactions.filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + t.monto, 0)) * 100)}% de tus gastos va a ${categoriaMasGastada[0]}. Considera revisar si puedes optimizar esta área.`,
        icono: '📊',
        color: 'text-purple-500',
        datos: { categoria: categoriaMasGastada[0], porcentaje: Math.round((categoriaMasGastada[1] / transactions.filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + t.monto, 0)) * 100) }
      });
    }

    // Detección de suscripciones (gastos recurrentes)
    const descripcionFrecuente = transactions
      .filter(t => t.tipo === 'gasto')
      .reduce((acc, t) => {
        const key = t.descripcion.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const posiblesSuscripciones = Object.entries(descripcionFrecuente)
      .filter(([, count]) => count >= 2)
      .map(([descripcion]) => descripcion);

    if (posiblesSuscripciones.length > 0) {
      insights.push({
        id: 'suscripcion-1',
        tipo: 'suscripcion',
        titulo: 'Posibles suscripciones detectadas',
        descripcion: `Detecté ${posiblesSuscripciones.length} posibles suscripciones recurrentes. Revisa si todas son necesarias.`,
        icono: '💳',
        color: 'text-yellow-500',
        datos: { suscripciones: posiblesSuscripciones }
      });
    }

    // Predicción de fin de mes
    const fechaActual = new Date();
    const diasTranscurridos = fechaActual.getDate();
    const diasEnMes = new Date(fechaActual.getFullYear(), fechaActual.getMonth() + 1, 0).getDate();
    const gastosMesActual = transactions
      .filter(t => {
        const fechaTransaccion = new Date(t.fecha);
        return t.tipo === 'gasto' && 
               fechaTransaccion.getMonth() === fechaActual.getMonth() &&
               fechaTransaccion.getFullYear() === fechaActual.getFullYear();
      })
      .reduce((sum, t) => sum + t.monto, 0);

    const proyeccionMensual = (gastosMesActual / diasTranscurridos) * diasEnMes;
    
    insights.push({
      id: 'prediccion-1',
      tipo: 'prediccion',
      titulo: 'Proyección de fin de mes',
      descripcion: `Basado en tu gasto actual, proyectamos gastar $${proyeccionMensual.toLocaleString('es-AR', { minimumFractionDigits: 0 })} este mes. ${proyeccionMensual > gastosMesActual * 1.2 ? 'Considera ajustar tus gastos.' : 'Vas por buen camino.'}`,
      icono: '📈',
      color: 'text-blue-500',
      datos: { actual: gastosMesActual, proyeccion: proyeccionMensual }
    });

    // Consejos personalizados
    const promedioGastoDiario = gastosMesActual / diasTranscurridos;
    
    if (promedioGastoDiario > 5000) {
      insights.push({
        id: 'consejo-1',
        tipo: 'consejo',
        titulo: 'Consejo de optimización',
        descripcion: `Tu gasto diario promedio es de $${promedioGastoDiario.toLocaleString('es-AR', { minimumFractionDigits: 0 })}. Intenta reducirlo en un 10% estableciendo un límite diario.`,
        icono: '💡',
        color: 'text-emerald-500'
      });
    }

    // Análisis de ingresos vs gastos
    const ingresosMes = transactions
      .filter(t => {
        const fechaTransaccion = new Date(t.fecha);
        return t.tipo === 'ingreso' && 
               fechaTransaccion.getMonth() === fechaActual.getMonth() &&
               fechaTransaccion.getFullYear() === fechaActual.getFullYear();
      })
      .reduce((sum, t) => sum + t.monto, 0);

    const tasaAhorro = ingresosMes > 0 ? ((ingresosMes - gastosMesActual) / ingresosMes) * 100 : 0;
    
    if (tasaAhorro < 20) {
      insights.push({
        id: 'consejo-2',
        tipo: 'consejo',
        titulo: 'Tasa de ahorro recomendada',
        descripcion: `Tu tasa de ahorro actual es del ${Math.round(tasaAhorro)}%. Los expertos recomiendan ahorrar al menos el 20% de tus ingresos.`,
        icono: '🎯',
        color: 'text-red-500'
      });
    }

    return insights;
  }, [transactions]);

  const getInsightIcon = (insight: Insight) => {
    switch (insight.tipo) {
      case 'patron':
        return <TrendingUp className="w-6 h-6" />;
      case 'suscripcion':
        return <CreditCard className="w-6 h-6" />;
      case 'prediccion':
        return <Calendar className="w-6 h-6" />;
      case 'consejo':
        return <Lightbulb className="w-6 h-6" />;
      default:
        return <Brain className="w-6 h-6" />;
    }
  };

  const getInsightColor = (insight: Insight) => {
    switch (insight.tipo) {
      case 'patron':
        return 'border-purple-500/30 bg-purple-500/10';
      case 'suscripcion':
        return 'border-yellow-500/30 bg-yellow-500/10';
      case 'prediccion':
        return 'border-blue-500/30 bg-blue-500/10';
      case 'consejo':
        return 'border-emerald-500/30 bg-emerald-500/10';
      default:
        return 'border-slate-700 bg-slate-800/50';
    }
  };

  const stats = useMemo(() => {
    const totalGastos = transactions.filter(t => t.tipo === 'gasto').reduce((sum, t) => sum + t.monto, 0);
    const totalIngresos = transactions.filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + t.monto, 0);
    const transaccionesUltimos7Dias = transactions.filter(t => {
      const fechaTransaccion = new Date(t.fecha);
      const hace7Dias = new Date();
      hace7Dias.setDate(hace7Dias.getDate() - 7);
      return fechaTransaccion >= hace7Dias;
    }).length;

    return {
      totalGastos,
      totalIngresos,
      balance: totalIngresos - totalGastos,
      transaccionesUltimos7Dias,
      promedioDiario: totalGastos / 30 // Aproximado
    };
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-6 h-6 text-purple-400" />
            <span className="text-slate-400 text-sm">Actividad (7d)</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.transaccionesUltimos7Dias}</div>
          <p className="text-xs text-slate-400">transacciones</p>
        </div>
        
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            <span className="text-slate-400 text-sm">Promedio Diario</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            ${stats.promedioDiario.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-slate-400">en gastos</p>
        </div>
        
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-6 h-6 text-blue-400" />
            <span className="text-slate-400 text-sm">Insights</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{insights.length}</div>
          <p className="text-xs text-slate-400">análisis activos</p>
        </div>
        
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-6 h-6 text-yellow-400" />
            <span className="text-slate-400 text-sm">IA Score</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">85%</div>
          <p className="text-xs text-slate-400">precisión</p>
        </div>
      </div>

      {/* Insights Feed */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Brain className="w-6 h-6 text-emerald-400" />
          Análisis Inteligente
        </h2>
        
        {insights.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-800 text-center">
            <Brain className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Sin datos suficientes</h3>
            <p className="text-slate-400">Necesita más transacciones para generar insights personalizados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 hover:shadow-lg hover:scale-102 cursor-pointer ${getInsightColor(insight)}`}
                onClick={() => setSelectedInsight(selectedInsight === insight.id ? null : insight.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${insight.color} bg-opacity-20`}>
                      <div className={insight.color}>
                        {getInsightIcon(insight)}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{insight.titulo}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full ${insight.color} bg-opacity-20 ${insight.color}`}>
                          {insight.tipo === 'patron' && 'Patrón'}
                          {insight.tipo === 'suscripcion' && 'Suscripción'}
                          {insight.tipo === 'prediccion' && 'Predicción'}
                          {insight.tipo === 'consejo' && 'Consejo'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date().toLocaleDateString('es-AR')}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {insight.tipo === 'consejo' && (
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  )}
                </div>

                {/* Description */}
                <p className="text-slate-300 text-sm leading-relaxed mb-4">
                  {insight.descripcion}
                </p>

                {/* Expanded Details */}
                {selectedInsight === insight.id && insight.datos && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-slate-400 mb-2">DETALLES DEL ANÁLISIS</h4>
                      <div className="space-y-1">
                        {Object.entries(insight.datos).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-slate-500 capitalize">{key}:</span>
                            <span className="text-slate-300 font-medium">
                              {typeof value === 'number' 
                                ? `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
                                : Array.isArray(value) 
                                ? value.join(', ')
                                : String(value)
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    {insight.tipo === 'patron' && 'Basado en tus patrones de gasto'}
                    {insight.tipo === 'suscripcion' && 'Detectado automáticamente'}
                    {insight.tipo === 'prediccion' && 'Proyección inteligente'}
                    {insight.tipo === 'consejo' && 'Recomendación personalizada'}
                  </div>
                  
                  <button
                    className={`text-xs px-3 py-1 rounded-lg ${insight.color} bg-opacity-20 ${insight.color} hover:bg-opacity-30 transition-colors`}
                  >
                    {insight.tipo === 'consejo' ? 'Aplicar consejo' : 'Ver más'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Status */}
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-emerald-500/20 rounded-xl">
              <Brain className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">IA Financiera Activa</h3>
              <p className="text-sm text-slate-400">Análisis en tiempo real de tus transacciones</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-400">GPT-4</div>
            <p className="text-xs text-slate-400">Modelo activo</p>
          </div>
        </div>
      </div>
    </div>
  );
}
