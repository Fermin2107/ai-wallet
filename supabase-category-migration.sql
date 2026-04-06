-- ========================================
-- AI Wallet - Migración de Categorías
-- ========================================
-- Archivo: supabase-category-migration.sql
-- Propósito: Migrar categorías viejas a las nuevas canónicas
-- Author: SRE Full-Stack Developer
-- ========================================

-- PRIMERO: Eliminar budgets viejos que causarían duplicados
-- Conservar solo los budgets más recientes por categoría
DELETE FROM budgets b1
USING budgets b2
WHERE b1.category IN ('supermercado', 'compras', 'comida', 'ocio', 'entretenimiento', 'fiesta', 'bar', 'restaurante', 'netflix', 'spotify', 'apps', 'membresia', 'farmacia', 'medico', 'clinica', 'indumentaria', 'zapatillas', 'accesorios', 'varios', 'general', 'imprevistos')
AND b2.category IN ('alimentacion', 'salidas', 'suscripciones', 'salud', 'ropa', 'otros')
AND (
  (b1.category = b2.category AND b1.id < b2.id) OR
  (b1.category = 'supermercado' AND b2.category = 'alimentacion') OR
  (b1.category = 'compras' AND b2.category = 'alimentacion') OR
  (b1.category = 'comida' AND b2.category = 'alimentacion') OR
  (b1.category = 'ocio' AND b2.category = 'salidas') OR
  (b1.category = 'entretenimiento' AND b2.category = 'salidas') OR
  (b1.category = 'fiesta' AND b2.category = 'salidas') OR
  (b1.category = 'bar' AND b2.category = 'salidas') OR
  (b1.category = 'restaurante' AND b2.category = 'salidas') OR
  (b1.category = 'netflix' AND b2.category = 'suscripciones') OR
  (b1.category = 'spotify' AND b2.category = 'suscripciones') OR
  (b1.category = 'apps' AND b2.category = 'suscripciones') OR
  (b1.category = 'membresia' AND b2.category = 'suscripciones') OR
  (b1.category = 'farmacia' AND b2.category = 'salud') OR
  (b1.category = 'medico' AND b2.category = 'salud') OR
  (b1.category = 'clinica' AND b2.category = 'salud') OR
  (b1.category = 'indumentaria' AND b2.category = 'ropa') OR
  (b1.category = 'zapatillas' AND b2.category = 'ropa') OR
  (b1.category = 'accesorios' AND b2.category = 'ropa') OR
  (b1.category = 'varios' AND b2.category = 'otros') OR
  (b1.category = 'general' AND b2.category = 'otros') OR
  (b1.category = 'imprevistos' AND b2.category = 'otros')
);

-- AHORA SÍ: Migrar categorías de budgets a las nuevas canónicas
UPDATE budgets SET category = 'alimentacion' 
WHERE category IN ('supermercado', 'compras', 'comida');

UPDATE budgets SET category = 'salidas'
WHERE category IN ('ocio', 'entretenimiento', 'fiesta', 'bar', 'restaurante');

UPDATE budgets SET category = 'suscripciones'
WHERE category IN ('netflix', 'spotify', 'apps', 'membresia');

UPDATE budgets SET category = 'salud'
WHERE category IN ('farmacia', 'medico', 'clinica');

UPDATE budgets SET category = 'ropa'
WHERE category IN ('indumentaria', 'zapatillas', 'accesorios');

UPDATE budgets SET category = 'otros'
WHERE category IN ('varios', 'general', 'imprevistos');

-- Migrar categorías de transactions (sin restricción de unique)
UPDATE transactions SET category = 'alimentacion' 
WHERE category IN ('supermercado', 'compras', 'comida');

UPDATE transactions SET category = 'salidas'
WHERE category IN ('ocio', 'entretenimiento', 'fiesta', 'bar', 'restaurante');

UPDATE transactions SET category = 'suscripciones'
WHERE category IN ('netflix', 'spotify', 'apps', 'membresia');

UPDATE transactions SET category = 'salud'
WHERE category IN ('farmacia', 'medico', 'clinica');

UPDATE transactions SET category = 'ropa'
WHERE category IN ('indumentaria', 'zapatillas', 'accesorios');

UPDATE transactions SET category = 'otros'
WHERE category IN ('varios', 'general', 'imprevistos');

-- Verificar resultados
SELECT 'budgets' as table_name, category, COUNT(*) as count 
FROM budgets 
GROUP BY category 
ORDER BY count DESC;

SELECT 'transactions' as table_name, category, COUNT(*) as count 
FROM transactions 
GROUP BY category 
ORDER BY count DESC;
