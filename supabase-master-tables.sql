-- ========================================
-- AI Wallet - Tablas Maestras (Budgets & Goals)
-- ========================================
-- Created for Supabase PostgreSQL
-- Author: Senior Data Architect
-- ========================================

-- ========================================
-- TABLA: Budgets (Presupuestos)
-- ========================================
CREATE TABLE IF NOT EXISTS budgets (
  -- Primary Key con UUID auto-generado
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Datos del presupuesto
  category VARCHAR(50) NOT NULL UNIQUE,
  limit_amount DECIMAL(12, 2) NOT NULL CHECK (limit_amount > 0),
  period VARCHAR(20) NOT NULL DEFAULT 'mensual' CHECK (period IN ('mensual', 'semanal', 'anual')),
  
  -- Fechas y estado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  -- Relaciones (para futuras expansiones)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ========================================
-- TABLA: Goals (Metas)
-- ========================================
CREATE TABLE IF NOT EXISTS goals (
  -- Primary Key con UUID auto-generado
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Datos de la meta
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  
  -- Fechas y estado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  target_date DATE,
  is_active BOOLEAN DEFAULT true,
  is_completed BOOLEAN DEFAULT false,
  
  -- Metadatos
  description TEXT,
  icon VARCHAR(50) DEFAULT '🎯',
  color VARCHAR(20) DEFAULT 'text-emerald-500',
  
  -- Relaciones (para futuras expansiones)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ========================================
-- ÍNDICES para optimización
-- ========================================
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_is_active ON budgets(is_active);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_is_active ON goals(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_is_completed ON goals(is_completed);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date);

-- ========================================
-- TRIGGER para updated_at automático (Budgets)
-- ========================================
CREATE TRIGGER update_budgets_updated_at 
    BEFORE UPDATE ON budgets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- TRIGGER para updated_at automático (Goals)
-- ========================================
CREATE TRIGGER update_goals_updated_at 
    BEFORE UPDATE ON goals 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- POLÍTICAS DE SEGURIDAD (RLS) - Budgets
-- ========================================
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Budgets are viewable by everyone" ON budgets
    FOR SELECT USING (true);

CREATE POLICY "Budgets are insertable by everyone" ON budgets
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own budgets" ON budgets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets" ON budgets
    FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- POLÍTICAS DE SEGURIDAD (RLS) - Goals
-- ========================================
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goals are viewable by everyone" ON goals
    FOR SELECT USING (true);

CREATE POLICY "Goals are insertable by everyone" ON goals
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own goals" ON goals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON goals
    FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- VISTA ACTUALIZADA: Presupuestos con gastos reales
-- ========================================
CREATE OR REPLACE VIEW budget_summary AS
SELECT 
    b.id,
    b.category,
    b.limit_amount,
    b.period,
    b.is_active,
    -- Calcular gastos reales del mes actual
    COALESCE(
        SUM(
            CASE 
                WHEN t.type = 'gasto' 
                AND t.category = b.category 
                AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
                AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                AND t.confirmed = true
                THEN t.amount 
                ELSE 0 
            END
        ), 0
    ) as spent_amount,
    -- Calcular porcentaje gastado
    CASE 
        WHEN b.limit_amount > 0 
        THEN ROUND(
            (COALESCE(
                SUM(
                    CASE 
                        WHEN t.type = 'gasto' 
                        AND t.category = b.category 
                        AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
                        AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                        AND t.confirmed = true
                        THEN t.amount 
                        ELSE 0 
                    END
                ), 0
            ) / b.limit_amount) * 100, 2
        )
        ELSE 0 
    END as percentage_used,
    -- Monto restante
    b.limit_amount - COALESCE(
        SUM(
            CASE 
                WHEN t.type = 'gasto' 
                AND t.category = b.category 
                AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
                AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                AND t.confirmed = true
                THEN t.amount 
                ELSE 0 
            END
        ), 0
    ) as remaining_amount,
    -- Estado del presupuesto
    CASE 
        WHEN b.limit_amount - COALESCE(
            SUM(
                CASE 
                    WHEN t.type = 'gasto' 
                    AND t.category = b.category 
                    AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
                    AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                    AND t.confirmed = true
                    THEN t.amount 
                    ELSE 0 
                END
            ), 0
        ) <= 0 THEN 'excedido'
        WHEN (b.limit_amount - COALESCE(
            SUM(
                CASE 
                    WHEN t.type = 'gasto' 
                    AND t.category = b.category 
                    AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
                    AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                    AND t.confirmed = true
                    THEN t.amount 
                    ELSE 0 
                END
            ), 0
        )) / b.limit_amount <= 0.1 THEN 'casi_límite'
        ELSE 'seguro'
    END as status
FROM budgets b
LEFT JOIN transactions t ON b.category = t.category
WHERE b.is_active = true
GROUP BY b.id, b.category, b.limit_amount, b.period, b.is_active
ORDER BY b.category;

-- ========================================
-- VISTA ACTUALIZADA: Metas con progreso real
-- ========================================
CREATE OR REPLACE VIEW goals_summary AS
SELECT 
    g.id,
    g.name,
    g.target_amount,
    g.current_amount,
    g.target_date,
    g.icon,
    g.color,
    g.is_active,
    g.is_completed,
    -- Calcular porcentaje de progreso
    CASE 
        WHEN g.target_amount > 0 
        THEN ROUND((g.current_amount / g.target_amount) * 100, 2)
        ELSE 0 
    END as progress_percentage,
    -- Monto restante
    g.target_amount - g.current_amount as remaining_amount,
    -- Días restantes hasta la meta
    CASE 
        WHEN g.target_date IS NOT NULL 
        THEN GREATEST(0, EXTRACT(DAYS FROM g.target_date - CURRENT_DATE)::INTEGER)
        ELSE NULL 
    END as days_remaining,
    -- Estado de la meta
    CASE 
        WHEN g.is_completed THEN 'completada'
        WHEN g.current_amount >= g.target_amount THEN 'completada'
        WHEN g.target_date IS NOT NULL AND CURRENT_DATE > g.target_date THEN 'vencida'
        WHEN g.target_date IS NOT NULL AND EXTRACT(DAYS FROM g.target_date - CURRENT_DATE) <= 7 THEN 'urgente'
        ELSE 'en_progreso'
    END as status,
    -- Progreso diario necesario para alcanzar la meta
    CASE 
        WHEN g.target_date IS NOT NULL 
        AND CURRENT_DATE < g.target_date 
        AND g.current_amount < g.target_amount
        THEN ROUND(
            (g.target_amount - g.current_amount) / 
            GREATEST(1, EXTRACT(DAYS FROM g.target_date - CURRENT_DATE))
        , 2)
        ELSE 0 
    END as daily_needed
FROM goals g
WHERE g.is_active = true
ORDER BY g.target_date ASC NULLS LAST, g.created_at DESC;

-- ========================================
-- COMENTARIOS
-- ========================================
COMMENT ON TABLE budgets IS 'Tabla de presupuestos por categoría y período';
COMMENT ON COLUMN budgets.category IS 'Categoría del presupuesto (alimentación, transporte, etc.)';
COMMENT ON COLUMN budgets.limit_amount IS 'Límite máximo de gasto para el período';
COMMENT ON COLUMN budgets.period IS 'Período del presupuesto: mensual, semanal, anual';

COMMENT ON TABLE goals IS 'Tabla de metas de ahorro financieras';
COMMENT ON COLUMN goals.name IS 'Nombre descriptivo de la meta';
COMMENT ON COLUMN goals.target_amount IS 'Monto objetivo a alcanzar';
COMMENT ON COLUMN goals.current_amount IS 'Monto acumulado actualmente';
COMMENT ON COLUMN goals.target_date IS 'Fecha límite para alcanzar la meta';

-- ========================================
-- DATOS DE PRUEBA: Budgets
-- ========================================
INSERT INTO budgets (category, limit_amount, period) VALUES
('Alimentación', 50000.00, 'mensual'),
('Transporte', 30000.00, 'mensual'),
('Ocio', 25000.00, 'mensual'),
('Servicios', 40000.00, 'mensual'),
('Otros', 20000.00, 'mensual')
ON CONFLICT (category) DO NOTHING;

-- ========================================
-- DATOS DE PRUEBA: Goals
-- ========================================
INSERT INTO goals (name, target_amount, current_amount, target_date, description, icon, color) VALUES
('Vacaciones en Brasil', 200000.00, 45000.00, '2024-12-31', 'Ahorro para viaje familiar a Brasil', '✈️', 'text-emerald-500'),
('Fondo de Emergencia', 150000.00, 75000.00, '2024-06-30', 'Fondo para imprevistos', '🛡️', 'text-blue-500'),
('Nuevo Notebook', 120000.00, 30000.00, '2024-09-15', 'Notebook para trabajo freelance', '💻', 'text-purple-500'),
('Curso Inglés', 80000.00, 20000.00, '2024-08-01', 'Curso intensivo de inglés', '📚', 'text-yellow-500')
ON CONFLICT DO NOTHING;

-- ========================================
-- FUNCIÓN PARA ACTUALIZAR MONTO DE META DESDE TRANSACCIONES
-- ========================================
CREATE OR REPLACE FUNCTION update_goal_from_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Si es un ingreso, buscar metas activas y actualizar el monto actual
    IF NEW.type = 'ingreso' AND NEW.confirmed = true THEN
        -- Actualizar todas las metas activas no completadas
        UPDATE goals 
        SET current_amount = current_amount + NEW.amount,
            is_completed = CASE 
                WHEN current_amount + NEW.amount >= target_amount THEN true 
                ELSE is_completed 
            END
        WHERE is_active = true AND is_completed = false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TRIGGER PARA ACTUALIZAR METAS AUTOMÁTICAMENTE
-- ========================================
CREATE TRIGGER trigger_update_goal_from_transaction
    AFTER INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_goal_from_transaction();
