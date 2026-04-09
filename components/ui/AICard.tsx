'use client';

import React from 'react';
import { Transaction } from '../../lib/types';
import { RotateCcw, Check } from 'lucide-react';

interface AICardProps {
  transaction: Transaction;
  onConfirm?: () => void;
  onDeshacer?: () => void;
  estado: 'pendiente' | 'confirmado' | 'deshaciendo';
}

export default function AICard({ transaction, onConfirm, onDeshacer, estado }: AICardProps) {
  const categoria = transaction.categoria;
  const esGasto = transaction.tipo === 'gasto';
  
  if (estado === 'confirmado') {
    return null; // No mostrar nada si ya está confirmado
  }

  return (
    <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/30 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        {/* Izquierda: Icono y detalles */}
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 rounded-xl bg-gray-900/50 flex items-center justify-center ${categoria.color} border border-gray-800`}>
            <span className="text-xl">{categoria.icono}</span>
          </div>
          <div>
            <p className="text-white font-medium text-lg">{transaction.descripcion}</p>
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-400">{categoria.nombre}</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-400">{new Date(transaction.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
        
        {/* Derecha: Monto y acciones */}
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className={`font-bold text-xl ${esGasto ? 'text-red-400' : 'text-emerald-400'}`}>
              {esGasto ? '-' : '+'}${Math.abs(transaction.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-emerald-400 text-xs font-medium">IA detectó</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={onDeshacer}
              disabled={estado === 'deshaciendo'}
              className="p-2 bg-gray-800/50 hover:bg-gray-800/70 text-gray-400 hover:text-red-400 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            
            <button
              onClick={onConfirm}
              disabled={estado === 'deshaciendo'}
              className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Línea de progreso para confirmación automática */}
      {estado === 'pendiente' && (
        <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full animate-pulse" style={{ 
            animation: 'shrink 3s ease-in-out forwards' 
          }} />
        </div>
      )}
    </div>
  );
}
