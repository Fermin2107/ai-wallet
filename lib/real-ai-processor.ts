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
  transactions?: Partial<Transaction>[];
  transaction?: Partial<Transaction>;
  response: string;
  confidence: number;
}

export class RealAIProcessor {
  private apiUrl = '/api/ai';

  constructor() {
    // El constructor no necesita apiKey, la lee de process.env
  }

  async processWithAI(text: string): Promise<ProcessedTransaction> {
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text })
      });

      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la API');
      }

      const data = await response.json();
      
      const aiResponse = data.data;

      // Procesar la respuesta de la IA
      const transactions: Partial<Transaction>[] = [];
      
      if (aiResponse.transactions && Array.isArray(aiResponse.transactions)) {
        
        for (const tx of aiResponse.transactions) {
          
          const transaction: Partial<Transaction> = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            description: tx.description || 'Transacción sin descripción',
            amount: tx.amount || 0,
            category: tx.category || 'otros',
            date: new Date(),
            type: tx.type as 'income' | 'expense',
            essential: tx.essential
          };
          
          // Si es una pérdida, tratarla como gasto
          if (tx.type === 'loss') {
            transaction.type = 'expense';
          }
          
          // Validar monto
          if (typeof transaction.amount !== 'number' || isNaN(transaction.amount)) {
            transaction.amount = 0;
          }
          
          transactions.push(transaction);
        }
      }

      const result = {
        transactions: transactions.length > 1 ? transactions : [transactions[0]],
        transaction: transactions[0], // Primera transacción para compatibilidad
        response: aiResponse.summary || 'Procesé tus transacciones con IA.',
        confidence: 0.95
      };

      return result;

    } catch (error) {
      
      // Fallback a procesamiento básico
      return {
        response: 'No pude conectar con la IA. Usando procesamiento básico.',
        confidence: 0
      };
    }
  }

  // Método para configurar la API key
  static isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  static getAPIKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }
}
