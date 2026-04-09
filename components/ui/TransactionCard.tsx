'use client';

import React from 'react';
import { Transaction } from '../../lib/types';

interface TransactionCardProps {
  transaction: Transaction;
  onDeshacer?: (id: string) => void;
  mostrarDeshacer?: boolean;
}

export default function TransactionCard({ transaction, onDeshacer, mostrarDeshacer = false }: TransactionCardProps) {
  const categoria = transaction.categoria;
  const esGasto = transaction.tipo === 'gasto';
  
  return (
    <div className="group relative bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10">
      <div className="flex items-center justify-between">
        {/* Izquierda: Icono y descripción */}
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center ${categoria.color}`}>
            <span className="text-lg">{categoria.icono}</span>
          </div>
          <div>
            <p className="text-white font-medium">{transaction.descripcion}</p>
            <p className="text-gray-400 text-sm">{categoria.nombre}</p>
          </div>
        </div>
        
        {/* Derecha: Monto y acciones */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <p className={`font-bold text-lg ${esGasto ? 'text-red-400' : 'text-emerald-400'}`}>
              {esGasto ? '-' : '+'}${Math.abs(transaction.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-gray-500 text-xs">
              {new Date(transaction.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          
          {mostrarDeshacer && onDeshacer && (
            <button
              onClick={() => onDeshacer(transaction.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-2 py-1 text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
            >
              Deshacer
            </button>
          )}
        </div>
      </div>
      
      {/* Efecto sutil de borde para transacciones recientes */}
      {transaction.confirmado === false && (
        <div className="absolute inset-0 rounded-xl border-2 border-emerald-500/30 pointer-events-none animate-pulse" />
      )}
    </div>
  );
}
