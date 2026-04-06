-- ========================================
-- AI Wallet - Fix RLS Permissions
-- ========================================
-- Propósito: Habilitar acceso público a tablas si hay problemas de permisos
-- Author: SRE Database Administrator
-- ========================================

-- 1. Desactivar RLS temporalmente para debugging
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
ALTER TABLE goals DISABLE ROW LEVEL SECURITY;

-- 2. Opción alternativa: Habilitar RLS con políticas públicas
-- Si prefieres mantener RLS activado, ejecuta estas políticas en su lugar:

/*
-- Activar RLS si está desactivado
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para SELECT (lectura para todos)
CREATE POLICY "Enable SELECT for all users" ON transactions FOR SELECT USING (true);
CREATE POLICY "Enable SELECT for all users" ON budgets FOR SELECT USING (true);
CREATE POLICY "Enable SELECT for all users" ON goals FOR SELECT USING (true);

-- Políticas para INSERT, UPDATE, DELETE (si necesitas escritura)
CREATE POLICY "Enable INSERT for all users" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable UPDATE for all users" ON transactions FOR UPDATE USING (true);
CREATE POLICY "Enable DELETE for all users" ON transactions FOR DELETE USING (true);

CREATE POLICY "Enable INSERT for all users" ON budgets FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable UPDATE for all users" ON budgets FOR UPDATE USING (true);
CREATE POLICY "Enable DELETE for all users" ON budgets FOR DELETE USING (true);

CREATE POLICY "Enable INSERT for all users" ON goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable UPDATE for all users" ON goals FOR UPDATE USING (true);
CREATE POLICY "Enable DELETE for all users" ON goals FOR DELETE USING (true);
*/

-- 3. Verificar estructura de tablas
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('transactions', 'budgets', 'goals')
ORDER BY table_name, ordinal_position;

-- 4. Verificar si hay datos
SELECT 'transactions' as table_name, COUNT(*) as row_count FROM transactions
UNION ALL
SELECT 'budgets', COUNT(*) FROM budgets
UNION ALL
SELECT 'goals', COUNT(*) FROM goals;
