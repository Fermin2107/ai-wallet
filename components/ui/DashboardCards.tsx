'use client';

import React from 'react';
import { Transaction } from '../../lib/types';
import { TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react';

interface DashboardCardsProps {
  transactions: Transaction[];
}

export default function DashboardCards({ transactions }: DashboardCardsProps) {
  const ingresos = transactions
    .filter(t => t.tipo === 'ingreso')
    .reduce((sum, t) => sum + t.monto, 0);
    
  const gastos = transactions
    .filter(t => t.tipo === 'gasto')
    .reduce((sum, t) => sum + t.monto, 0);
    
  const balance = ingresos - gastos;

  const cards = [
    {
      title: 'Balance',
      value: balance,
      icon: Wallet,
      color: balance >= 0 ? 'text-emerald-400' : 'text-red-400',
      bgColor: 'bg-gray-900/50',
      borderColor: balance >= 0 ? 'border-emerald-500/20' : 'border-red-500/20',
      prefix: balance >= 0 ? '' : '-'
    },
    {
      title: 'Ingresos',
      value: ingresos,
      icon: TrendingUp,
      color: 'text-emerald-400',
      bgColor: 'bg-gray-900/50',
      borderColor: 'border-emerald-500/20',
      prefix: ''
    },
    {
      title: 'Gastos',
      value: gastos,
      icon: TrendingDown,
      color: 'text-red-400',
      bgColor: 'bg-gray-900/50',
      borderColor: 'border-red-500/20',
      prefix: '-'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`${card.bgColor} backdrop-blur-sm rounded-2xl p-6 border ${card.borderColor} hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 group`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-2 rounded-lg bg-gray-800/50 group-hover:bg-gray-800/70 transition-colors duration-200`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <span className="text-gray-400 text-sm font-medium">{card.title}</span>
          </div>
          
          <div className="space-y-1">
            <p className={`text-2xl font-bold ${card.color} transition-all duration-300 group-hover:scale-105 inline-block`}>
              {card.prefix}${Math.abs(card.value).toLocaleString('es-AR', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
            {card.title === 'Balance' && (
              <p className={`text-xs ${balance >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                {balance >= 0 ? 'Positivo' : 'Negativo'}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
