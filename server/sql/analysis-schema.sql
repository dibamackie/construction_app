-- PostgreSQL schema for BuildQuote analysis data.
-- Merged version: preserves the original application structure while adding
-- stronger constraints, automatic updated_at handling, improved indexes,
-- safer approval handling, invoicing tables, and better analysis views.
--
-- IDs remain TEXT so existing app UUID strings and built-in IDs can be imported.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- Utility functions
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- Core tables
-- =========================================================

CREATE TABLE customers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  unit_number text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  province char(2) NOT NULL DEFAULT 'ON',
  postal_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (province = upper(province))
);

CREATE TABLE contractors (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  trade text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  last_assigned_job_date date,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  rate numeric(12,2) NOT NULL DEFAULT 0
    CHECK (rate >= 0),
  rate_type text NOT NULL DEFAULT 'day'
    CHECK (rate_type IN ('project', 'hour', 'day')),
  address text NOT NULL DEFAULT '',
  unit_number text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  province char(2) NOT NULL DEFAULT 'ON',
  postal_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (province = upper(province))
);

CREATE TABLE price_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0
    CHECK (price_per_unit >= 0),
  duration numeric(8,2) NOT NULL DEFAULT 0
    CHECK (duration >= 0),
  category text NOT NULL DEFAULT 'Labor',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_templates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  built_in boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_template_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_template_id text NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  room_name text NOT NULL DEFAULT '',
  quantity numeric(12,3) NOT NULL DEFAULT 1
    CHECK (quantity >= 0),
  duration numeric(8,2) NOT NULL DEFAULT 0
    CHECK (duration >= 0),
  unit text NOT NULL DEFAULT 'each',
  category text NOT NULL DEFAULT 'Labor',
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0
    CHECK (price_per_unit >= 0),
  markup_rate numeric(7,3) NOT NULL DEFAULT 20
    CHECK (markup_rate >= 0 AND markup_rate <= 1000),
  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- Kept as an application-managed integer for compatibility.
  -- Add values through your app or replace this with an identity column later.
  sequence integer NOT NULL CHECK (sequence > 0),

  quote_number text NOT NULL UNIQUE,

  -- Kept as one status column to avoid breaking the current application.
  -- Added draft, sent, rejected, expired, cancelled, and on hold.
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'draft',
      'open',
      'sent',
      'approved',
      'ongoing',
      'on hold',
      'completed',
      'invoiced',
      'rejected',
      'expired',
      'cancelled'
    )),

  title text NOT NULL DEFAULT '',
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  project_address text NOT NULL DEFAULT '',
  quote_date date NOT NULL DEFAULT CURRENT_DATE,
  start_date date,
  tax_rate numeric(7,3) NOT NULL DEFAULT 13
    CHECK (tax_rate >= 0 AND tax_rate <= 100),

  -- Retained for compatibility, but invoices below should be used for
  -- new invoicing functionality.
  invoice_part integer NOT NULL DEFAULT 1
    CHECK (invoice_part >= 1),

  customer_approved_at timestamptz,
  currency_code char(3) NOT NULL DEFAULT 'CAD',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (currency_code = upper(currency_code)),
  CHECK (
    status <> 'approved'
    OR customer_approved_at IS NOT NULL
  )
);

CREATE TABLE quote_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  price_item_id text REFERENCES price_items(id) ON DELETE SET NULL,
  room_template_id text REFERENCES room_templates(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  room_name text NOT NULL DEFAULT '',
  quantity numeric(12,3) NOT NULL DEFAULT 1
    CHECK (quantity >= 0),
  duration numeric(8,2) NOT NULL DEFAULT 0
    CHECK (duration >= 0),
  unit text NOT NULL DEFAULT 'each',
  category text NOT NULL DEFAULT 'Labor',
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0
    CHECK (price_per_unit >= 0),
  markup_rate numeric(7,3) NOT NULL DEFAULT 20
    CHECK (markup_rate >= 0 AND markup_rate <= 1000),
  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE schedule_tasks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_item_id text REFERENCES quote_items(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  suggested_trade text NOT NULL DEFAULT '',
  assigned_contractor_id text REFERENCES contractors(id) ON DELETE SET NULL,

  -- Snapshot fields intentionally preserve the contractor details that
  -- were shown when the assignment was made.
  assigned_contractor_name text NOT NULL DEFAULT '',
  assigned_contractor_trade text NOT NULL DEFAULT '',

  start_date date,
  end_date date,
  completed_at timestamptz,

  status text NOT NULL DEFAULT 'not started'
    CHECK (status IN ('not started', 'scheduled', 'in progress', 'completed')),

  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  ),
  CHECK (
    status <> 'completed'
    OR completed_at IS NOT NULL
  ),
  CHECK (
    completed_at IS NULL
    OR status = 'completed'
  )
);

CREATE TABLE quote_approvals (
  token text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_number text NOT NULL DEFAULT '',
  quote_title text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  total numeric(12,2) NOT NULL DEFAULT 0
    CHECK (total >= 0),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'approved',
      'rejected',
      'expired',
      'revoked'
    )),

  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,

  CHECK (
    expires_at IS NULL
    OR expires_at > sent_at
  ),
  CHECK (
    status <> 'approved'
    OR approved_at IS NOT NULL
  ),
  CHECK (
    status <> 'rejected'
    OR rejected_at IS NOT NULL
  ),
  CHECK (
    status <> 'revoked'
    OR revoked_at IS NOT NULL
  )
);

-- =========================================================
-- Invoice tables
-- =========================================================
-- These work alongside invoice_part so the current app is not broken.
-- New invoice features should use these tables.

CREATE TABLE invoices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quote_id text REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'sent',
      'partially paid',
      'paid',
      'overdue',
      'void'
    )),

  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency_code char(3) NOT NULL DEFAULT 'CAD',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (currency_code = upper(currency_code)),
  CHECK (
    due_date IS NULL
    OR due_date >= issue_date
  )
);

CREATE TABLE invoice_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quote_item_id text REFERENCES quote_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1
    CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'each',
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0
    CHECK (price_per_unit >= 0),
  tax_rate numeric(7,3) NOT NULL DEFAULT 13
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL
    CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'other'
    CHECK (payment_method IN (
      'cash',
      'cheque',
      'credit card',
      'debit',
      'bank transfer',
      'e-transfer',
      'other'
    )),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- Indexes
-- =========================================================

CREATE UNIQUE INDEX idx_quotes_sequence_unique
  ON quotes(sequence);

CREATE INDEX idx_quotes_status
  ON quotes(status);

CREATE INDEX idx_quotes_customer_id
  ON quotes(customer_id);

CREATE INDEX idx_quotes_quote_date
  ON quotes(quote_date DESC);

CREATE INDEX idx_quotes_active_status
  ON quotes(status)
  WHERE archived_at IS NULL;

CREATE INDEX idx_customers_active
  ON customers(id)
  WHERE archived_at IS NULL;

CREATE INDEX idx_contractors_status
  ON contractors(status)
  WHERE archived_at IS NULL;

CREATE INDEX idx_price_items_category
  ON price_items(category)
  WHERE archived_at IS NULL;

CREATE INDEX idx_room_template_items_template_sort
  ON room_template_items(room_template_id, sort_order);

CREATE INDEX idx_quote_items_quote_sort
  ON quote_items(quote_id, sort_order);

CREATE INDEX idx_quote_items_category
  ON quote_items(category);

CREATE INDEX idx_schedule_tasks_quote_sort
  ON schedule_tasks(quote_id, sort_order);

CREATE INDEX idx_schedule_tasks_contractor_id
  ON schedule_tasks(assigned_contractor_id);

CREATE INDEX idx_schedule_tasks_dates
  ON schedule_tasks(start_date, end_date);

CREATE INDEX idx_schedule_tasks_incomplete_end_date
  ON schedule_tasks(end_date)
  WHERE completed_at IS NULL;

CREATE INDEX idx_quote_approvals_quote_id
  ON quote_approvals(quote_id);

CREATE INDEX idx_quote_approvals_status_expiry
  ON quote_approvals(status, expires_at);

CREATE INDEX idx_invoices_quote_id
  ON invoices(quote_id);

CREATE INDEX idx_invoices_customer_id
  ON invoices(customer_id);

CREATE INDEX idx_invoices_status
  ON invoices(status);

CREATE INDEX idx_invoice_items_invoice_sort
  ON invoice_items(invoice_id, sort_order);

CREATE INDEX idx_payments_invoice_id
  ON payments(invoice_id);

-- =========================================================
-- updated_at triggers
-- =========================================================

CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER contractors_set_updated_at
BEFORE UPDATE ON contractors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER price_items_set_updated_at
BEFORE UPDATE ON price_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER room_templates_set_updated_at
BEFORE UPDATE ON room_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER room_template_items_set_updated_at
BEFORE UPDATE ON room_template_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER quotes_set_updated_at
BEFORE UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER quote_items_set_updated_at
BEFORE UPDATE ON quote_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER schedule_tasks_set_updated_at
BEFORE UPDATE ON schedule_tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoice_items_set_updated_at
BEFORE UPDATE ON invoice_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- Quote financial views
-- =========================================================

CREATE VIEW quote_item_financials AS
SELECT
  qi.*,
  round(qi.quantity * qi.price_per_unit, 2) AS base_total,
  round(
    qi.quantity
    * qi.price_per_unit
    * (qi.markup_rate / 100),
    2
  ) AS markup_amount,
  round(
    qi.quantity
    * qi.price_per_unit
    * (1 + qi.markup_rate / 100),
    2
  ) AS line_total
FROM quote_items qi;

CREATE VIEW quote_financials AS
SELECT
  q.id AS quote_id,
  q.quote_number,
  q.status,
  q.customer_id,
  q.quote_date,
  q.start_date,
  q.currency_code,
  COALESCE(SUM(qif.base_total), 0)::numeric(14,2) AS subtotal,
  COALESCE(SUM(qif.markup_amount), 0)::numeric(14,2) AS markup,
  COALESCE(SUM(qif.line_total), 0)::numeric(14,2) AS taxable_amount,
  round(
    COALESCE(SUM(qif.line_total), 0)
    * (q.tax_rate / 100),
    2
  )::numeric(14,2) AS tax,
  round(
    COALESCE(SUM(qif.line_total), 0)
    * (1 + q.tax_rate / 100),
    2
  )::numeric(14,2) AS total
FROM quotes q
LEFT JOIN quote_item_financials qif
  ON qif.quote_id = q.id
GROUP BY
  q.id,
  q.quote_number,
  q.status,
  q.customer_id,
  q.quote_date,
  q.start_date,
  q.currency_code,
  q.tax_rate;

-- =========================================================
-- Invoice financial views
-- =========================================================

CREATE VIEW invoice_item_financials AS
SELECT
  ii.*,
  round(ii.quantity * ii.price_per_unit, 2) AS subtotal,
  round(
    ii.quantity
    * ii.price_per_unit
    * (ii.tax_rate / 100),
    2
  ) AS tax,
  round(
    ii.quantity
    * ii.price_per_unit
    * (1 + ii.tax_rate / 100),
    2
  ) AS total
FROM invoice_items ii;

CREATE VIEW invoice_financials AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.quote_id,
  i.customer_id,
  i.status,
  i.issue_date,
  i.due_date,
  i.currency_code,
  COALESCE(SUM(iif.subtotal), 0)::numeric(14,2) AS subtotal,
  COALESCE(SUM(iif.tax), 0)::numeric(14,2) AS tax,
  COALESCE(SUM(iif.total), 0)::numeric(14,2) AS total,
  COALESCE((
    SELECT SUM(p.amount)
    FROM payments p
    WHERE p.invoice_id = i.id
  ), 0)::numeric(14,2) AS amount_paid,
  (
    COALESCE(SUM(iif.total), 0)
    - COALESCE((
        SELECT SUM(p.amount)
        FROM payments p
        WHERE p.invoice_id = i.id
      ), 0)
  )::numeric(14,2) AS balance_due
FROM invoices i
LEFT JOIN invoice_item_financials iif
  ON iif.invoice_id = i.id
GROUP BY
  i.id,
  i.invoice_number,
  i.quote_id,
  i.customer_id,
  i.status,
  i.issue_date,
  i.due_date,
  i.currency_code;

-- =========================================================
-- Analysis views
-- =========================================================

CREATE VIEW analysis_summary AS
SELECT
  COALESCE(SUM(qf.total), 0)::numeric(14,2) AS total_quote_value,
  COALESCE(AVG(qf.total), 0)::numeric(14,2) AS average_quote_value,
  COUNT(qf.quote_id) AS quote_count,

  COUNT(*) FILTER (
    WHERE qf.status IN ('approved', 'ongoing', 'on hold', 'completed', 'invoiced')
  ) AS accepted_quote_count,

  COALESCE(
    SUM(qf.total) FILTER (
      WHERE qf.status IN ('approved', 'ongoing', 'on hold', 'completed', 'invoiced')
    ),
    0
  )::numeric(14,2) AS accepted_quote_value,

  (SELECT COUNT(*) FROM schedule_tasks) AS scheduled_task_count,

  (
    SELECT COUNT(*)
    FROM schedule_tasks
    WHERE status = 'completed'
  ) AS completed_task_count,

  (
    SELECT COUNT(*)
    FROM schedule_tasks
    WHERE status <> 'completed'
      AND end_date < CURRENT_DATE
  ) AS overdue_task_count

FROM quote_financials qf;

CREATE VIEW analysis_quote_status_counts AS
SELECT
  status,
  COUNT(*) AS quote_count,
  COALESCE(SUM(total), 0)::numeric(14,2) AS quote_value
FROM quote_financials
GROUP BY status;

CREATE VIEW analysis_category_breakdown AS
SELECT
  category,
  COALESCE(SUM(base_total), 0)::numeric(14,2) AS subtotal,
  COALESCE(SUM(markup_amount), 0)::numeric(14,2) AS markup,
  COALESCE(SUM(line_total), 0)::numeric(14,2) AS total
FROM quote_item_financials
GROUP BY category;

CREATE VIEW analysis_delayed_jobs AS
SELECT
  q.id AS quote_id,
  q.quote_number,
  q.title,
  q.status,
  MIN(st.end_date) AS first_late_task_date,
  COUNT(*) AS late_task_count
FROM quotes q
JOIN schedule_tasks st
  ON st.quote_id = q.id
WHERE q.status IN ('approved', 'ongoing', 'on hold')
  AND st.status <> 'completed'
  AND st.completed_at IS NULL
  AND st.end_date < CURRENT_DATE
GROUP BY
  q.id,
  q.quote_number,
  q.title,
  q.status;

CREATE VIEW analysis_invoice_summary AS
SELECT
  COUNT(*) AS invoice_count,
  COALESCE(SUM(total), 0)::numeric(14,2) AS total_invoiced,
  COALESCE(SUM(amount_paid), 0)::numeric(14,2) AS total_paid,
  COALESCE(SUM(balance_due), 0)::numeric(14,2) AS total_outstanding,
  COALESCE(
    SUM(balance_due) FILTER (
      WHERE due_date < CURRENT_DATE
        AND balance_due > 0
    ),
    0
  )::numeric(14,2) AS overdue_balance
FROM invoice_financials;

-- =========================================================
-- Important implementation notes
-- =========================================================
--
-- 1. This version keeps quotes.status instead of splitting it into separate
--    quote_status, project_status, and invoice_status columns. This reduces
--    immediate frontend and API changes.
--
-- 2. invoice_part is retained for compatibility, but new invoicing features
--    should use invoices, invoice_items, and payments.
--
-- 3. category and unit remain TEXT because the existing app likely stores
--    these values directly. Standardize their spelling in the application,
--    or add lookup tables later.
--
-- 4. For a multi-company SaaS release, add organizations, organization_users,
--    organization_id columns, and row-level security before onboarding
--    unrelated businesses.
--
-- 5. This file is intended for a fresh database. Existing databases should
--    use an ALTER TABLE migration rather than rerunning CREATE TABLE commands.