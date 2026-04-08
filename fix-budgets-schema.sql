-- ============================================================
-- AI Wallet — Fix budgets schema
-- Run this in the Supabase SQL editor ONCE.
-- ============================================================

-- 1. Add month_period column if it doesn't exist
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS month_period VARCHAR(7);

-- 2. Backfill NULL values using created_at so existing rows are valid
UPDATE budgets
SET month_period = TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE month_period IS NULL;

-- 3. Make column NOT NULL with a sensible default going forward
ALTER TABLE budgets
  ALTER COLUMN month_period SET DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');

ALTER TABLE budgets
  ALTER COLUMN month_period SET NOT NULL;

-- 4. Drop the old global UNIQUE(category) constraint that blocks multi-month budgets
ALTER TABLE budgets
  DROP CONSTRAINT IF EXISTS budgets_category_key;

-- 5. Add the correct constraint: one budget per user+category+month
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'budgets_user_category_month_unique'
  ) THEN
    ALTER TABLE budgets
      ADD CONSTRAINT budgets_user_category_month_unique
      UNIQUE (user_id, category, month_period);
  END IF;
END $$;
