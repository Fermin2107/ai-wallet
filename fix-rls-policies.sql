-- ========================================
-- AI Wallet - Fix RLS Policies para user_id null
-- ========================================
-- Propósito: Eliminar políticas permisivas y exigir user_id autenticado
-- Author: SRE Full-Stack Developer
-- ========================================

-- Eliminar políticas permisivas que permiten inserts sin user_id
DROP POLICY IF EXISTS "Budgets are insertable by everyone" ON budgets;
DROP POLICY IF EXISTS "Goals are insertable by everyone" ON goals;
DROP POLICY IF EXISTS "Budgets are viewable by everyone" ON budgets;
DROP POLICY IF EXISTS "Goals are viewable by everyone" ON goals;

-- Nuevas políticas que exigen user_id autenticado para Budgets
CREATE POLICY "Users can insert own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- Nuevas políticas que exigen user_id autenticado para Goals
CREATE POLICY "Users can insert own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- Verificar que las políticas se hayan creado correctamente
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
WHERE tablename IN ('budgets', 'goals')
ORDER BY tablename, policyname;
