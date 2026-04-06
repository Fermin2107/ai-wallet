import { NLPProcessor } from './nlp-processor';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  type: 'income' | 'expense';
  essential?: boolean;
}

interface ProcessedTransaction {
  transaction: Partial<Transaction>;
  response: string;
  confidence: number;
}

export class MultiTransactionProcessor {
  private nlpProcessor: NLPProcessor;

  constructor() {
    this.nlpProcessor = new NLPProcessor();
  }

  processMultipleTransactions(text: string): ProcessedTransaction[] {
    const results: ProcessedTransaction[] = [];
    
    // Mejorar el regex para separar por ", y", "y", "e", o ","
    const parts = text.split(/,\s*y\s+|\s+(?:y|e)\s+|,\s*/).filter(part => part.trim());
    
    if (parts.length > 1) {
      // Si hay múltiples partes, procesar cada una individualmente
      for (const part of parts) {
        let processedPart = part.trim();
        
        // Si la parte no tiene verbo de acción, inferirlo del contexto
        if (!/\b(gast[eé]|gan[eé]|perd[ií]|compr[eé]|pag[ué]|cobr[eé]|recib[ií]|ingres[eé]|me\s+(gast[eé]|tir[eé]|fum[eé]|pagaron|depositaron|transferieron)|sal[ií]|dej[eé])\b/i.test(processedPart)) {
          // Buscar el tipo de transacción en el texto original
          if (/\b(gast[eé]|compr[eé]|pag[ué]|me\s+(gast[eé]|tir[eé]|fum[eé])|sal[ií]|dej[eé])\b/i.test(text)) {
            processedPart = `gasté ${processedPart}`;
          } else if (/\b(gan[eé]|cobr[eé]|recib[ií]|ingres[eé]|me\s+(pagaron|depositaron|transferieron))\b/i.test(text)) {
            processedPart = `gané ${processedPart}`;
          } else if (/\b(perd[ií])\b/i.test(text)) {
            processedPart = `perdí ${processedPart}`;
          }
        }
        
        // Si todavía no tiene verbo, intentar inferir por posición
        if (!/\b(gast[eé]|gan[eé]|perd[ií]|compr[eé]|pag[ué]|cobr[eé]|recib[ií]|ingres[eé]|me\s+(gast[eé]|tir[eé]|fum[eé]|pagaron|depositaron|transferieron)|sal[ií]|dej[eé])\b/i.test(processedPart)) {
          // Si empieza con $, es probablemente un gasto
          if (/^\$/.test(processedPart)) {
            processedPart = `gasté ${processedPart}`;
          }
        }
        
        const transaction = this.nlpProcessor.processMessage(processedPart);
        if (transaction.transaction) {
          results.push({
            transaction: transaction.transaction,
            response: transaction.response,
            confidence: transaction.confidence
          });
        }
      }
      
      // Si encontramos múltiples transacciones válidas, devolverlas
      if (results.length > 1) {
        return results;
      }
    }

    // Si no hay múltiples transacciones válidas, procesar como una sola
    const singleResult = this.nlpProcessor.processMessage(text);
    if (singleResult.transaction) {
      return [{
        transaction: singleResult.transaction,
        response: singleResult.response,
        confidence: singleResult.confidence
      }];
    }

    return [];
  }

  generateSummaryResponse(transactions: ProcessedTransaction[]): string {
    if (transactions.length === 0) {
      return 'No pude identificar transacciones en tu mensaje. Intenta ser más específico.';
    }
    
    if (transactions.length === 1) {
      return transactions[0].response;
    }
    
    const expenses = transactions.filter(t => t.transaction?.type === 'expense');
    const incomes = transactions.filter(t => t.transaction?.type === 'income');
    
    let summary = `📊 **Procesé ${transactions.length} transacciones:**\n\n`;
    
    if (incomes.length > 0) {
      const totalIncome = incomes.reduce((sum, t) => sum + (t.transaction?.amount || 0), 0);
      summary += `💵 **Ingresos (${incomes.length}):** $${totalIncome.toFixed(2)}\n`;
      incomes.forEach(t => summary += `   • ${t.response}\n`);
    }
    
    if (expenses.length > 0) {
      const totalExpenses = expenses.reduce((sum, t) => sum + (t.transaction?.amount || 0), 0);
      summary += `\n💸 **Gastos (${expenses.length}):** $${totalExpenses.toFixed(2)}\n`;
      expenses.forEach(t => summary += `   • ${t.response}\n`);
    }
    
    const netTotal = incomes.reduce((sum, t) => sum + (t.transaction?.amount || 0), 0) - 
                   expenses.reduce((sum, t) => sum + (t.transaction?.amount || 0), 0);
    
    summary += `\n🎯 **Neto:** $${netTotal.toFixed(2)} ${netTotal >= 0 ? '✅' : '⚠️'}`;
    
    return summary;
  }
}
