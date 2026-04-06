-- ========================================
-- AI Wallet - Schema de Base de Datos
-- ========================================
-- Created for Supabase PostgreSQL
-- Author: Senior Full-Stack Developer
-- ========================================

-- Habilitar extensión UUID si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- TABLA PRINCIPAL: Transactions
-- ========================================
CREATE TABLE IF NOT EXISTS transactions (
  -- Primary Key con UUID auto-generado
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Datos de la transacción
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  category VARCHAR(50) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('gasto', 'ingreso')),
  
  -- Fechas
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Estado y metadatos
  confirmed BOOLEAN DEFAULT false,
  source VARCHAR(20) DEFAULT 'voice' CHECK (source IN ('voice', 'text', 'manual')),
  original_message TEXT, -- Mensaje original del usuario (texto o transcrito)
  ai_confidence DECIMAL(3, 2) DEFAULT 0.95 CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  
  -- Relaciones (para futuras expansiones)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Cuando implementen auth
  budget_id UUID, -- Para futura relación con presupuestos
  goal_id UUID -- Para futura relación con metas
);

-- ========================================
-- ÍNDICES para optimización
-- ========================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ========================================
-- TRIGGER para updated_at automático
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ========================================
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Política por defecto (solo lectura para usuarios no autenticados)
CREATE POLICY "Transactions are viewable by everyone" ON transactions
    FOR SELECT USING (true);

-- Política para insertar (cualquiera puede insertar por ahora, cambiar cuando implementen auth)
CREATE POLICY "Transactions are insertable by everyone" ON transactions
    FOR INSERT WITH CHECK (true);

-- Política para actualizar (solo el dueño puede actualizar)
CREATE POLICY "Users can update own transactions" ON transactions
    FOR UPDATE USING (auth.uid() = user_id);

-- Política para eliminar (solo el dueño puede eliminar)
CREATE POLICY "Users can delete own transactions" ON transactions
    FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- VISTAS ÚTILES
-- ========================================
-- Vista para resumen mensual
CREATE OR REPLACE VIEW monthly_summary AS
SELECT 
    DATE_TRUNC('month', transaction_date) as month,
    type,
    category,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    AVG(amount) as average_amount
FROM transactions 
WHERE confirmed = true
GROUP BY month, type, category
ORDER BY month DESC, total_amount DESC;

-- Vista para balance acumulado
CREATE OR REPLACE VIEW balance_summary AS
SELECT 
    transaction_date,
    SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) as daily_income,
    SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END) as daily_expense,
    SUM(CASE WHEN type = 'ingreso' THEN amount ELSE -amount END) as daily_balance
FROM transactions 
WHERE confirmed = true
GROUP BY transaction_date
ORDER BY transaction_date DESC;

-- ========================================
-- COMENTARIOS
-- ========================================
COMMENT ON TABLE transactions IS 'Tabla principal de transacciones financieras de AI Wallet';
COMMENT ON COLUMN transactions.id IS 'UUID único auto-generado para cada transacción';
COMMENT ON COLUMN transactions.description IS 'Descripción legible por humanos de la transacción';
COMMENT ON COLUMN transactions.amount IS 'Monto en formato decimal (12,2) para precisión monetaria';
COMMENT ON COLUMN transactions.category IS 'Categoría predefinida (alimentación, transporte, etc.)';
COMMENT ON COLUMN transactions.type IS 'Tipo: gasto o ingreso';
COMMENT ON COLUMN transactions.transaction_date IS 'Fecha de la transacción (no confundir con created_at)';
COMMENT ON COLUMN transactions.created_at IS 'Timestamp de creación en la base de datos';
COMMENT ON COLUMN transactions.updated_at IS 'Timestamp de última actualización';
COMMENT ON COLUMN transactions.confirmed IS 'Estado de confirmación (para permitir deshacer)';
COMMENT ON COLUMN transactions.source IS 'Origen: voice, text, o manual';
COMMENT ON COLUMN transactions.original_message IS 'Mensaje original del usuario antes del procesamiento';
COMMENT ON COLUMN transactions.ai_confidence IS 'Confianza del modelo IA (0.0 a 1.0)';

-- ========================================
-- DATOS DE EJEMPLO (opcional, para testing)
-- ========================================
INSERT INTO transactions (description, amount, category, type, source, original_message) VALUES
('Comida en restaurante', 2500.00, 'alimentación', 'gasto', 'voice', 'almorcé por 800'),
('Sueldo mensual', 150000.00, 'sueldo', 'ingreso', 'text', 'me depositaron el sueldo'),
('Carga de nafta', 8000.00, 'transporte', 'gasto', 'voice', 'cargué nafta 5000')
ON CONFLICT DO NOTHING;
