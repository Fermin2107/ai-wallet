-- Verificar cuántos registros tienen user_id null
SELECT 'transactions' as tabla, COUNT(*) as sin_usuario FROM transactions WHERE user_id IS NULL
UNION ALL
SELECT 'budgets' as tabla, COUNT(*) as sin_usuario FROM budgets WHERE user_id IS NULL
UNION ALL
SELECT 'goals' as tabla, COUNT(*) as sin_usuario FROM goals WHERE user_id IS NULL;

-- OPCIÓN DESARROLLO: Deshabilitar RLS temporalmente
-- ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE goals DISABLE ROW LEVEL SECURITY;
