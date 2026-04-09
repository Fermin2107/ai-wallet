interface Category {
  name: string;
  keywords: string[];
  essential: boolean;
  editable: boolean;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  type: 'income' | 'expense';
  essential?: boolean;
}

interface NLPPattern {
  regex: RegExp;
  type: 'income' | 'expense';
  extractAmount: (match: RegExpMatchArray) => number;
  extractDescription: (match: RegExpMatchArray) => string;
}

export class NLPProcessor {
  private categories: Category[] = [
    {
      name: 'alimentación',
      keywords: ['comida', 'super', 'mercado', 'restaurante', 'café', 'pan', 'leche', 'fruta', 'verdura', 'carne', 'pescado', 'arroz', 'pasta', 'desayuno', 'almuerzo', 'cena', 'snack', 'bebida', 'refresco', 'cerveza', 'vino'],
      essential: true,
      editable: true,
      color: '#10b981'
    },
    {
      name: 'vivienda',
      keywords: ['alquiler', 'hipoteca', 'renta', 'casa', 'departamento', 'piso', 'inmobiliaria', 'propiedad', 'expensas', 'mantenimiento'],
      essential: true,
      editable: true,
      color: '#3b82f6'
    },
    {
      name: 'servicios',
      keywords: ['luz', 'agua', 'gas', 'internet', 'teléfono', 'móvil', 'celular', 'electricidad', 'energía', 'cloaca', 'basura', 'cable', 'netflix', 'spotify', 'amazon prime', 'disney+'],
      essential: true,
      editable: true,
      color: '#8b5cf6'
    },
    {
      name: 'transporte',
      keywords: ['transporte', 'uber', 'taxi', 'subte', 'metro', 'colectivo', 'ómnibus', 'bus', 'tren', 'auto', 'nafta', 'gasolina', 'combustible', 'estacionamiento', 'peaje', 'subte', 'metro', 'bici', 'monopatín'],
      essential: true,
      editable: true,
      color: '#f59e0b'
    },
    {
      name: 'salud',
      keywords: ['médico', 'doctor', 'hospital', 'farmacia', 'remedio', 'medicina', 'obra social', 'prepaga', 'dentista', 'psicólogo', 'terapia', 'análisis', 'consulta', 'seguro médico'],
      essential: true,
      editable: true,
      color: '#ef4444'
    },
    {
      name: 'educación',
      keywords: ['universidad', 'colegio', 'escuela', 'curso', 'clase', 'libro', 'utiles', 'matrícula', 'cuota', 'diploma', 'certificado', 'capacitación', 'taller', 'seminario'],
      essential: true,
      editable: true,
      color: '#06b6d4'
    },
    {
      name: 'ropa',
      keywords: ['ropa', 'vestimenta', 'pantalón', 'camisa', 'zapatos', 'zapatillas', 'abrigo', 'campera', 'jeans', 'vestido', 'remera', 'buzo', 'calzado'],
      essential: false,
      editable: true,
      color: '#ec4899'
    },
    {
      name: 'entretenimiento',
      keywords: ['cine', 'película', 'teatro', 'concierto', 'show', 'fiesta', 'bar', 'discoteca', 'boliche', 'juego', 'videojuego', 'consola', 'libro', 'revista', 'música', 'festival'],
      essential: false,
      editable: true,
      color: '#f97316'
    },
    {
      name: 'deportes',
      keywords: ['gimnasio', 'gym', 'fitness', 'deporte', 'fútbol', 'tenis', 'natación', 'yoga', 'pilates', 'carrera', 'running', 'bici', 'ciclismo', 'entrenador', 'clases'],
      essential: false,
      editable: true,
      color: '#84cc16'
    },
    {
      name: 'viajes',
      keywords: ['viaje', 'vacaciones', 'hotel', 'hostel', 'avión', 'pasaje', 'ticket', 'turismo', 'excursión', 'crucero', 'camping', 'alquiler auto', 'guía'],
      essential: false,
      editable: true,
      color: '#0ea5e9'
    },
    {
      name: 'compras personales',
      keywords: ['compra', 'shopping', 'mall', 'tienda', 'local', 'perfume', 'maquillaje', 'cosméticos', 'accesorios', 'joya', 'reloj', 'bolso', 'mochila', 'celular', 'computadora', 'tecnología'],
      essential: false,
      editable: true,
      color: '#a855f7'
    },
    {
      name: 'regalos',
      keywords: ['regalo', 'presente', 'birthday', 'cumpleaños', 'navidad', 'aniversario', 'detalle', 'obsequio'],
      essential: false,
      editable: true,
      color: '#f43f5e'
    },
    {
      name: 'impuestos',
      keywords: ['impuesto', 'contribución', 'municipal', 'provincial', 'nacional', 'tasas', 'aranceles', 'aduana', 'ingresos', 'ganancias', 'propiedad', 'automotor'],
      essential: true,
      editable: true,
      color: '#64748b'
    },
    {
      name: 'seguros',
      keywords: ['seguro', 'cobertura', 'póliza', 'auto', 'casa', 'vida', 'accidentes', 'robo', 'incendio'],
      essential: true,
      editable: true,
      color: '#0f172a'
    },
    {
      name: 'trabajo',
      keywords: ['trabajo', 'laburo', 'empleo', 'sueldo', 'salario', 'jornal', 'honorarios', 'freelance', 'independiente', 'consultoría', 'proyecto', 'cliente', 'empresa', 'negocio', 'oficina', 'remuneración'],
      essential: false,
      editable: true,
      color: '#3b82f6'
    },
    {
      name: 'negocios',
      keywords: ['negocio', 'venta', 'comercio', 'tienda', 'local', 'empresa', 'inversión', 'renta', 'dividendo', 'ganancia', 'beneficio', 'mercado', 'producto', 'servicio', 'cliente', 'proveedor'],
      essential: false,
      editable: true,
      color: '#8b5cf6'
    },
    {
      name: 'otros',
      keywords: ['otro', 'varios', 'misceláneo', 'imprevisto', 'emergencia', 'reparación', 'servicio técnico'],
      essential: false,
      editable: true,
      color: '#6b7280'
    }
  ];

  private patterns: NLPPattern[] = [
    // PATRONES DE INGRESOS (van primero para evitar conflictos)
    { regex: /gan[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+(en|por|de)\s+(.+)/i, type: 'income', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[3] },
    { regex: /gan[eé]\s+(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(en|por|de)\s+(.+)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[2], m[3]), extractDescription: m => m[5] },
    { regex: /gan[eé]\s+(\d+)\s+palos\s+(en|por|de)\s+(.+)/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: m => m[4] },
    { regex: /gan[eé]\s+(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[2], m[3]), extractDescription: () => 'ingreso' },
    { regex: /gan[eé]\s+(\d+)\s+palos/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: () => 'ingreso' },
    { regex: /gan[eé]\s+\$?(\d+(?:[.,]\d+)*)/i, type: 'income', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: () => 'ingreso' },
    { regex: /recib[ií]\s+\$?(\d+(?:[.,]\d+)*)\s+de\s+(.+)/i, type: 'income', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    { regex: /me\s+(pagaron|depositaron|transferieron)\s+\$?(\d+(?:[.,]\d+)*)\s+(por|de)?\s*(.+)/i, type: 'income', extractAmount: m => parseFloat(m[2].replace(',', '.')), extractDescription: m => m[4] ? m[4] : 'transferencia' },
    { regex: /me\s+(pagaron|depositaron|transferieron)\s+(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(por|de)?\s*(.+)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[2], m[3]), extractDescription: m => m[5] ? m[5] : 'transferencia' },
    { regex: /me\s+(pagaron|depositaron|transferieron)\s+(\d+)\s+palos\s+(por|de)?\s*(.+)/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: m => m[4] ? m[4] : 'transferencia' },
    { regex: /(\$\?(\d+(?:[.,]\d+)*)\s+(que\s+)?(entraron|llegaron|cay[ó]eron))/i, type: 'income', extractAmount: m => parseFloat(m[2].replace(',', '.')), extractDescription: () => 'ingreso' },
    { regex: /(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(que\s+)?(entraron|llegaron|cay[ó]eron)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[1], m[2]), extractDescription: () => 'ingreso' },
    { regex: /(\d+)\s+palos\s+(que\s+)?(entraron|llegaron|cay[ó]eron)/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: () => 'ingreso' },
    { regex: /cobr[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[3] ? m[3] : 'pago' },
    { regex: /cobr[eé]\s+(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[2], m[3]), extractDescription: m => m[5] ? m[5] : 'pago' },
    { regex: /cobr[eé]\s+(\d+)\s+palos\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: m => m[4] ? m[4] : 'pago' },
    { regex: /ingres[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[3] ? m[3] : 'ingreso' },
    { regex: /ingres[eé]\s+(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => this.extractAmountFromJerga(m[2], m[3]), extractDescription: m => m[5] ? m[5] : 'ingreso' },
    { regex: /ingres[eé]\s+(\d+)\s+palos\s+(de|por)?\s*(.+)/i, type: 'income', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: m => m[4] ? m[4] : 'ingreso' },

    // PATRONES DE GASTOS (van después)
    { regex: /gast[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+en\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    { regex: /compr[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+de\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    { regex: /pag[ué]\s+\$?(\d+(?:[.,]\d+)*)\s+por\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    
    // Patrones informales/adolescentes
    { regex: /me\s+(gast[eé]|tir[eé]|fum[eé])\s+\$?(\d+(?:[.,]\d+)*)\s+en\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[2].replace(',', '.')), extractDescription: m => m[3] },
    { regex: /(\$\?(\d+(?:[.,]\d+)*)\s+en\s+(.+))/i, type: 'expense', extractAmount: m => parseFloat(m[2].replace(',', '.')), extractDescription: m => m[3] },
    { regex: /sal[ií]\s+\$?(\d+(?:[.,]\d+)*)\s+en\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    { regex: /dej[eé]\s+\$?(\d+(?:[.,]\d+)*)\s+en\s+(.+)/i, type: 'expense', extractAmount: m => parseFloat(m[1].replace(',', '.')), extractDescription: m => m[2] },
    
    // Patrones muy informales/jerga
    { regex: /(\$\?(\d+(?:[.,]\d+)*)\s+(.+))/i, type: 'expense', extractAmount: m => parseFloat(m[2].replace(',', '.')), extractDescription: m => m[3] },
    { regex: /(\d+(?:[.,]\d+)*)\s+(lucas|mangos|pasta|plata)\s+(en|por|para)\s+(.+)/i, type: 'expense', extractAmount: m => this.extractAmountFromJerga(m[1], m[2]), extractDescription: m => m[4] },
    { regex: /(\d+)\s+(lucas|mangos|pasta|plata)\s+(en|por|para)\s+(.+)/i, type: 'expense', extractAmount: m => this.extractAmountFromJerga(m[1], m[2]), extractDescription: m => m[4] },
    { regex: /(\d+)\s+palos\s+(en|por|para)\s+(.+)/i, type: 'expense', extractAmount: m => parseInt(m[1]) * 1000000, extractDescription: m => m[3] },
    { regex: /me\s+com[ií]\s+(.+)\s+por\s+(\d+)\s+(lucas|mangos|pasta|plata)/i, type: 'expense', extractAmount: m => this.extractAmountFromJerga(m[3], m[4]), extractDescription: m => m[1] },
    { regex: /me\s+com[ií]\s+(.+)\s+por\s+(\d+)\s+palos/i, type: 'expense', extractAmount: m => parseInt(m[3]) * 1000000, extractDescription: m => m[1] },
    
    // Patrones implícitos
    { regex: /(.+)\s+(cost[óo]|vali[óo])\s+\$?(\d+(?:[.,]\d+)*)/i, type: 'expense', extractAmount: m => parseFloat(m[3].replace(',', '.')), extractDescription: m => m[1] },
    { regex: /(.+)\s+(me\s+)?sal[ií[ó]\s+\$?(\d+(?:[.,]\d+)*)/i, type: 'expense', extractAmount: m => parseFloat(m[3].replace(',', '.')), extractDescription: m => m[1] },
    // Rest of the code remains the same
  ];

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[¡!¿?.,;:]/g, '') // Remove punctuation
      .trim();
  }

  private extractAmountFromJerga(amount: string, jergaType: string): number {
    const numAmount = parseFloat(amount);
    const jergaMultipliers: { [key: string]: number } = {
      'lucas': 1000,
      'mangos': 1000,
      'pasta': 1000,
      'plata': 1000,
      'pesos': 1
    };
    
    return numAmount * (jergaMultipliers[jergaType] || 1);
  }

  private extractAmount(text: string): number | null {
    // Primero buscar patrones de jerga específica
    const jergaPatterns = [
      { regex: /(\d+)\s+lucas/i, multiplier: 1000 },
      { regex: /(\d+)\s+palos/i, multiplier: 1000000 },
      { regex: /(\d+)\s+mangos/i, multiplier: 1000 },
      { regex: /(\d+)\s+pesos/i, multiplier: 1 },
      { regex: /(\d+)\s+pasta/i, multiplier: 1000 },
      { regex: /(\d+)\s+plata/i, multiplier: 1000 }
    ];

    for (const pattern of jergaPatterns) {
      const match = text.match(pattern.regex);
      if (match) {
        return parseFloat(match[1]) * pattern.multiplier;
      }
    }

    // Si no hay jerga, buscar montos normales
    const amountRegex = /\$?(\d+(?:[.,]\d+)*)/g;
    const matches = text.match(amountRegex);
    
    if (matches && matches.length > 0) {
      return parseFloat(matches[0].replace(',', '.'));
    }
    
    return null;
  }

  categorizeTransaction(description: string, _amount: number, _type: 'income' | 'expense'): { category: string; essential: boolean; confidence: number } {
    const normalizedDesc = this.normalizeText(description);
    
    let bestMatch = { category: 'otros', essential: false, confidence: 0 };
    
    for (const category of this.categories) {
      let score = 0;
      const totalKeywords = category.keywords.length;
      
      for (const keyword of category.keywords) {
        const normalizedKeyword = this.normalizeText(keyword);
        if (normalizedDesc.includes(normalizedKeyword)) {
          score += 1;
        }
      }
      
      const confidence = score / totalKeywords;
      
      if (confidence > bestMatch.confidence && confidence > 0) {
        bestMatch = {
          category: category.name,
          essential: category.essential,
          confidence
        };
      }
    }
    
    return bestMatch;
  }

  processMessage(text: string): { transaction?: Partial<Transaction>; response: string; confidence: number } {
    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        try {
          const amount = pattern.extractAmount(match);
          const description = pattern.extractDescription(match);
          
          if (isNaN(amount) || amount <= 0) {
            continue;
          }
          
          const categorization = this.categorizeTransaction(description, amount, pattern.type);
          
          const transaction: Partial<Transaction> = {
            id: Date.now().toString(),
            description,
            amount,
            category: categorization.category,
            date: new Date(),
            type: pattern.type,
            essential: categorization.essential
          };
          
          const response = this.generateResponse(transaction, categorization.confidence, pattern.type);
          
          return {
            transaction,
            response,
            confidence: categorization.confidence
          };
        } catch (_error) {
          continue;
        }
      }
    }
    
    // Si no hay coincidencia exacta, intentar extraer monto y descripción por separado
    const amount = this.extractAmount(text);
    if (amount) {
      const description = text.replace(/\$?\d+(?:[.,]\d*)/g, '').replace(/(gasté|compré|pagué|me salió|costó|valió)/gi, '').trim();
      
      if (description) {
        const categorization = this.categorizeTransaction(description, amount, 'expense');
        
        const transaction: Partial<Transaction> = {
          id: Date.now().toString(),
          description,
          amount,
          category: categorization.category,
          date: new Date(),
          type: 'expense',
          essential: categorization.essential
        };
        
        const response = this.generateResponse(transaction, categorization.confidence, 'expense');
        
        return {
          transaction,
          response,
          confidence: categorization.confidence * 0.7 // Reducir confianza por extracción parcial
        };
      }
    }
    
    return {
      response: this.generateHelpResponse(text),
      confidence: 0
    };
  }

  private generateResponse(transaction: Partial<Transaction>, confidence: number, type: 'income' | 'expense'): string {
    const essentialText = transaction.essential ? 'esencial' : 'no esencial';
    const confidenceText = confidence > 0.7 ? 'muy seguro' : confidence > 0.4 ? 'bastante seguro' : 'algo seguro';
    
    if (type === 'expense') {
      let response = `¡Perfecto! He registrado un gasto de $${transaction.amount?.toFixed(2)} en "${transaction.category}" (${essentialText}). `;
      
      if (!transaction.essential) {
        response += `Este es un gasto no esencial que podrías considerar reducir si necesitas ajustar tu presupuesto. `;
      }
      
      response += `Estoy ${confidenceText} de esta categorización.`;
      
      return response;
    } else {
      return `¡Excelente! He registrado un ingreso de $${transaction.amount?.toFixed(2)} por "${transaction.description}". Estoy ${confidenceText} de esta clasificación.`;
    }
  }

  private generateHelpResponse(_text: string): string {
    const suggestions = [
      'Intenta decir algo como: "Gasté $500 en supermercado"',
      'Podrías decir: "Me compré ropa por $200"',
      'O: "Pagué $150 de internet"',
      'Para ingresos: "Gané $2000 de salario"',
      'También: "Me depositaron $500 de freelance"'
    ];
    
    return `No pude identificar una transacción en tu mensaje. ${suggestions[Math.floor(Math.random() * suggestions.length)]}`;
  }

  getCategories(): Category[] {
    return this.categories;
  }

  addCategory(category: Omit<Category, 'name'>, name: string): void {
    this.categories.push({ ...category, name });
  }

  updateCategory(name: string, updates: Partial<Category>): void {
    const index = this.categories.findIndex(c => c.name === name);
    if (index !== -1) {
      this.categories[index] = { ...this.categories[index], ...updates };
    }
  }

  deleteCategory(name: string): void {
    this.categories = this.categories.filter(c => c.name !== name);
  }

  generateFinancialAdvice(transactions: Transaction[]): string[] {
    const expenses = transactions.filter(t => t.type === 'expense');
    const essentialExpenses = expenses.filter(t => t.essential);
    const nonEssentialExpenses = expenses.filter(t => !t.essential);
    
    const totalEssential = essentialExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalNonEssential = nonEssentialExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
    
    const advice: string[] = [];
    
    // Consejos basados en proporción de gastos no esenciales
    if (totalNonEssential > totalExpenses * 0.4) {
      advice.push('Tus gastos no esenciales representan más del 40% de tus gastos totales. Considera reducir en áreas como entretenimiento o compras personales.');
    }
    
    // Consejos por categoría
    const categoryTotals: { [key: string]: number } = {};
    nonEssentialExpenses.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });
    
    const topNonEssentialCategory = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (topNonEssentialCategory && topNonEssentialCategory[1] > totalNonEssential * 0.3) {
      advice.push(`Tu mayor gasto no esencial es en "${topNonEssentialCategory[0]}" con $${topNonEssentialCategory[1].toFixed(2)}. ¿Podrías reducir esta categoría?`);
    }
    
    // Consejos generales
    if (totalNonEssential > totalEssential) {
      advice.push('Estás gastando más en cosas no esenciales que en las esenciales. Revisa tu presupuesto.');
    }
    
    if (advice.length === 0) {
      advice.push('¡Buen trabajo! Tus gastos están bien balanceados entre esenciales y no esenciales.');
    }
    
    return advice;
  }
}
