-- ========================================
-- AI Wallet - Accounts & Installments Schema
-- ========================================
-- Run this after supabase-schema.sql
-- ========================================

-- ----------------------------------------
-- TABLE: accounts
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  type         VARCHAR(20)  NOT NULL CHECK (type IN ('liquid', 'credit', 'savings')),
  balance      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  credit_limit DECIMAL(12, 2),
  closing_day  INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  due_day      INTEGER CHECK (due_day BETWEEN 1 AND 31),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  currency     VARCHAR(10) NOT NULL DEFAULT 'ARS',
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id   ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_is_default ON accounts(user_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_accounts_type       ON accounts(user_id, type);

-- Enforce at most one default per user at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_one_default
  ON accounts(user_id) WHERE is_default = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select_own" ON accounts;
DROP POLICY IF EXISTS "accounts_insert_own" ON accounts;
DROP POLICY IF EXISTS "accounts_update_own" ON accounts;
DROP POLICY IF EXISTS "accounts_delete_own" ON accounts;

CREATE POLICY "accounts_select_own" ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert_own" ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update_own" ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "accounts_delete_own" ON accounts FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------
-- TABLE: installments
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS installments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES accounts(id)     ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL CHECK (installment_number >= 1),
  total_installments  INTEGER NOT NULL CHECK (total_installments >= 1),
  due_month           VARCHAR(7) NOT NULL,  -- YYYY-MM
  amount              DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  is_paid             BOOLEAN NOT NULL DEFAULT false,
  paid_at             TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installments_user_id       ON installments(user_id);
CREATE INDEX IF NOT EXISTS idx_installments_account_id    ON installments(account_id);
CREATE INDEX IF NOT EXISTS idx_installments_transaction_id ON installments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_month     ON installments(user_id, due_month);
CREATE INDEX IF NOT EXISTS idx_installments_unpaid        ON installments(user_id, is_paid) WHERE is_paid = false;

-- RLS
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "installments_select_own" ON installments;
DROP POLICY IF EXISTS "installments_insert_own" ON installments;
DROP POLICY IF EXISTS "installments_update_own" ON installments;
DROP POLICY IF EXISTS "installments_delete_own" ON installments;

CREATE POLICY "installments_select_own" ON installments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "installments_insert_own" ON installments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "installments_update_own" ON installments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "installments_delete_own" ON installments FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------
-- Add account_id column to transactions
-- (safe: nullable, no existing data broken)
-- ----------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

-- ----------------------------------------
-- DATA MIGRATION
-- Creates a "Cuenta Principal" legacy liquid account for every user
-- that has transactions without account_id, and assigns those transactions.
-- ----------------------------------------
CREATE OR REPLACE FUNCTION migrate_legacy_accounts()
RETURNS void AS $$
DECLARE
  r                RECORD;
  legacy_id        UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM transactions
    WHERE account_id IS NULL
      AND user_id IS NOT NULL
  LOOP
    -- Prefer existing default account; otherwise first active account
    SELECT id INTO legacy_id
    FROM accounts
    WHERE user_id = r.user_id
      AND is_active = true
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    -- No account at all → create one
    IF legacy_id IS NULL THEN
      INSERT INTO accounts (user_id, name, type, balance, is_default, is_active, currency)
      VALUES (r.user_id, 'Cuenta Principal', 'liquid', 0, true, true, 'ARS')
      RETURNING id INTO legacy_id;
    END IF;

    -- Assign orphan transactions
    UPDATE transactions
    SET account_id = legacy_id
    WHERE user_id = r.user_id
      AND account_id IS NULL;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute migration immediately
SELECT migrate_legacy_accounts();

-- ----------------------------------------
-- VIEW: account balances with unpaid credit
-- ----------------------------------------
CREATE OR REPLACE VIEW account_summary AS
SELECT
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.balance,
  a.credit_limit,
  a.is_default,
  a.currency,
  COALESCE(
    (SELECT SUM(i.amount)
     FROM installments i
     WHERE i.account_id = a.id AND i.is_paid = false),
    0
  ) AS unpaid_installments,
  CASE
    WHEN a.type = 'credit' THEN
      COALESCE(a.credit_limit, 0) -
      COALESCE((SELECT SUM(i.amount) FROM installments i WHERE i.account_id = a.id AND i.is_paid = false), 0)
    ELSE a.balance
  END AS available_balance
FROM accounts a
WHERE a.is_active = true;
