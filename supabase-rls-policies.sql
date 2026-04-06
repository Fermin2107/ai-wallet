-- ========================================
-- AI Wallet - RLS Policies por Usuario
-- ========================================
-- Propósito: Implementar seguridad por usuario real
-- Author: SRE Security Engineer
-- ========================================

-- ========================================
-- TRANSACTIONS
-- ========================================
-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Transactions are viewable by everyone" ON transactions;
DROP POLICY IF EXISTS "Transactions are insertable by everyone" ON transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

-- Crear nuevas políticas por usuario
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- BUDGETS
-- ========================================
-- Eliminar políticas existentes (si existen)
DROP POLICY IF EXISTS "Budgets are viewable by everyone" ON budgets;
DROP POLICY IF EXISTS "Budgets are insertable by everyone" ON budgets;
DROP POLICY IF EXISTS "Users can update own budgets" ON budgets;
DROP POLICY IF EXISTS "Users can delete own budgets" ON budgets;

-- Crear nuevas políticas por usuario
CREATE POLICY "Users can view own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- GOALS
-- ========================================
-- Eliminar políticas existentes (si existen)
DROP POLICY IF EXISTS "Goals are viewable by everyone" ON goals;
DROP POLICY IF EXISTS "Goals are insertable by everyone" ON goals;
DROP POLICY IF EXISTS "Users can update own goals" ON goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON goals;

-- Crear nuevas políticas por usuario
CREATE POLICY "Users can view own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- VERIFICACIÓN
-- ========================================
-- Verificar que las políticas están activas
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('transactions', 'budgets', 'goals')
ORDER BY tablename, policyname;
