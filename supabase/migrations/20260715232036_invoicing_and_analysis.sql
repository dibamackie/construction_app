-- BuildQuote invoicing and analysis migration
-- Run after 20260715232035_buildquote_main_schema.sql

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES companies(id) ON DELETE CASCADE,
  quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency_code CHAR(3) NOT NULL DEFAULT 'CAD',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoices_company_number_unique UNIQUE (company_id, invoice_number),
  CHECK (currency_code = upper(currency_code)),
  CHECK (due_date IS NULL OR due_date >= issue_date)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quote_item_id TEXT REFERENCES quote_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'each',
  price_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_per_unit >= 0),
  tax_rate NUMERIC(7,3) NOT NULL DEFAULT 13 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  base_total NUMERIC(14,2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit, 2)) STORED,
  tax_amount NUMERIC(14,2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit * tax_rate / 100, 2)) STORED,
  line_total NUMERIC(14,2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit * (1 + tax_rate / 100), 2)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'other'
    CHECK (payment_method IN ('cash', 'cheque', 'credit_card', 'debit', 'bank_transfer', 'e_transfer', 'other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_company_id ON invoice_items(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_sort ON invoice_items(invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoice_items_updated_at ON invoice_items;
CREATE TRIGGER trg_invoice_items_updated_at
BEFORE UPDATE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW invoice_totals AS
SELECT
  i.company_id,
  i.id AS invoice_id,
  i.invoice_number,
  i.status,
  i.issue_date,
  i.due_date,
  COALESCE(SUM(ii.base_total), 0)::NUMERIC(14,2) AS subtotal,
  COALESCE(SUM(ii.tax_amount), 0)::NUMERIC(14,2) AS tax,
  COALESCE(SUM(ii.line_total), 0)::NUMERIC(14,2) AS total,
  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)::NUMERIC(14,2) AS paid,
  (
    COALESCE(SUM(ii.line_total), 0)
    - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
  )::NUMERIC(14,2) AS balance
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
GROUP BY i.company_id, i.id, i.invoice_number, i.status, i.issue_date, i.due_date;

CREATE OR REPLACE VIEW analysis_summary AS
WITH quote_rollup AS (
  SELECT
    q.company_id,
    COUNT(*) AS quote_count,
    COUNT(*) FILTER (WHERE q.status IN ('open', 'sent', 'approved', 'ongoing')) AS active_quote_count,
    COUNT(*) FILTER (WHERE q.status = 'completed') AS completed_quote_count,
    COALESCE(SUM(qt.total), 0)::NUMERIC(16,2) AS quoted_total
  FROM quotes q
  LEFT JOIN quote_totals qt ON qt.quote_id = q.id
  GROUP BY q.company_id
),
invoice_rollup AS (
  SELECT
    company_id,
    COUNT(*) AS invoice_count,
    COALESCE(SUM(total), 0)::NUMERIC(16,2) AS invoiced_total,
    COALESCE(SUM(paid), 0)::NUMERIC(16,2) AS paid_total,
    COALESCE(SUM(balance), 0)::NUMERIC(16,2) AS outstanding_total
  FROM invoice_totals
  GROUP BY company_id
)
SELECT
  c.id AS company_id,
  COALESCE(qr.quote_count, 0) AS quote_count,
  COALESCE(qr.active_quote_count, 0) AS active_quote_count,
  COALESCE(qr.completed_quote_count, 0) AS completed_quote_count,
  COALESCE(qr.quoted_total, 0)::NUMERIC(16,2) AS quoted_total,
  COALESCE(ir.invoice_count, 0) AS invoice_count,
  COALESCE(ir.invoiced_total, 0)::NUMERIC(16,2) AS invoiced_total,
  COALESCE(ir.paid_total, 0)::NUMERIC(16,2) AS paid_total,
  COALESCE(ir.outstanding_total, 0)::NUMERIC(16,2) AS outstanding_total
FROM companies c
LEFT JOIN quote_rollup qr ON qr.company_id = c.id
LEFT JOIN invoice_rollup ir ON ir.company_id = c.id;

CREATE OR REPLACE VIEW analysis_quote_status_counts AS
SELECT company_id, status, COUNT(*) AS quote_count
FROM quotes
GROUP BY company_id, status;

CREATE OR REPLACE VIEW analysis_category_breakdown AS
SELECT
  qi.company_id,
  qi.category,
  COUNT(*) AS line_count,
  COALESCE(SUM(qi.base_total), 0)::NUMERIC(16,2) AS base_total,
  COALESCE(SUM(qi.markup_amount), 0)::NUMERIC(16,2) AS markup,
  COALESCE(SUM(qi.line_total), 0)::NUMERIC(16,2) AS total
FROM quote_items qi
GROUP BY qi.company_id, qi.category;

CREATE OR REPLACE VIEW analysis_delayed_jobs AS
SELECT
  st.company_id,
  st.id AS task_id,
  st.quote_id,
  q.quote_number,
  q.title AS quote_title,
  st.name AS task_name,
  st.end_date,
  CURRENT_DATE - st.end_date AS days_late,
  st.assigned_contractor_name
FROM schedule_tasks st
JOIN quotes q ON q.id = st.quote_id
WHERE st.status NOT IN ('completed', 'cancelled')
  AND st.end_date < CURRENT_DATE;

CREATE OR REPLACE VIEW analysis_invoice_summary AS
SELECT
  company_id,
  COUNT(*) AS invoice_count,
  COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
  COALESCE(SUM(total), 0)::NUMERIC(16,2) AS total_invoiced,
  COALESCE(SUM(paid), 0)::NUMERIC(16,2) AS total_paid,
  COALESCE(SUM(balance), 0)::NUMERIC(16,2) AS total_outstanding
FROM invoice_totals
GROUP BY company_id;
