'use client'

import { Lightbulb, TrendingDown, AlertTriangle, Target } from 'lucide-react'

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  type: 'income' | 'expense';
  essential?: boolean;
}

interface FinancialAdviceProps {
  transactions: Transaction[];
}

export default function FinancialAdvisor({ transactions }: FinancialAdviceProps) {
  const generateAdvice = () => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const essentialExpenses = expenses.filter(t => t.essential);
    const nonEssentialExpenses = expenses.filter(t => !t.essential);
    
    const totalEssential = essentialExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalNonEssential = nonEssentialExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
    
    const advice = [];
    
    // Análisis de proporción de gastos
    if (totalNonEssential > totalExpenses * 0.5) {
      advice.push({
        type: 'warning',
        title: 'Gastos no esenciales elevados',
        message: `Tus gastos no esenciales representan el ${((totalNonEssential / totalExpenses) * 100).toFixed(1)}% de tus gastos totales. Considera reducir en áreas como entretenimiento o compras personales.`,
        icon: AlertTriangle,
        color: 'text-danger-600 bg-danger-50 border-danger-200'
      });
    }
    
    // Análisis por categoría
    const categoryTotals: { [key: string]: { total: number; essential: boolean } } = {};
    expenses.forEach(t => {
      if (!categoryTotals[t.category]) {
        categoryTotals[t.category] = { total: 0, essential: t.essential || false };
      }
      categoryTotals[t.category].total += t.amount;
    });
    
    const sortedCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b.total - a.total);
    
    const topCategory = sortedCategories[0];
    if (topCategory && !topCategory[1].essential && topCategory[1].total > totalNonEssential * 0.3) {
      advice.push({
        type: 'suggestion',
        title: 'Categoría destacada',
        message: `Tu mayor gasto no esencial es en "${topCategory[0]}" con $${topCategory[1].total.toFixed(2)}. ¿Podrías establecer un límite mensual para esta categoría?`,
        icon: Target,
        color: 'text-primary-600 bg-primary-50 border-primary-200'
      });
    }
    
    // Consejos de ahorro
    if (totalNonEssential > 0) {
      const potentialSavings = totalNonEssential * 0.2; // 20% de reducción
      advice.push({
        type: 'tip',
        title: 'Potencial de ahorro',
        message: `Si reduces tus gastos no esenciales en un 20%, podrías ahorrar $${potentialSavings.toFixed(2)} mensualmente.`,
        icon: TrendingDown,
        color: 'text-success-600 bg-success-50 border-success-200'
      });
    }
    
    // Balance positivo
    if (totalNonEssential <= totalEssential * 0.5) {
      advice.push({
        type: 'success',
        title: 'Buen balance financiero',
        message: '¡Excelente! Tus gastos están bien balanceados entre esenciales y no esenciales. Sigue así.',
        icon: Lightbulb,
        color: 'text-success-600 bg-success-50 border-success-200'
      });
    }
    
    return advice;
  };

  const advice = generateAdvice();

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Lightbulb className="w-5 h-5" />
        Consejos Financieros
      </h3>
      
      {advice.length === 0 ? (
        <div className="text-center py-8">
          <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">Agrega más transacciones para recibir consejos personalizados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {advice.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className={`p-4 rounded-lg border ${item.color}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-gray-700">{item.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Resumen rápido */}
      {transactions.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Resumen Rápido</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-danger-600">
                ${transactions.filter(t => t.type === 'expense' && !t.essential)
                  .reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">Gastos No Esenciales</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-success-600">
                ${transactions.filter(t => t.type === 'expense' && t.essential)
                  .reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">Gastos Esenciales</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
