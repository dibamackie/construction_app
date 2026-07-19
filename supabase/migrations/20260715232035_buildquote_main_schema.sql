-- BuildQuote main PostgreSQL schema
-- Run this BEFORE analysis-schema.sql
-- Compatible with PostgreSQL 14+ and Supabase

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Automatically maintain updated_at columns.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'BuildQuote',
  company_type TEXT NOT NULL DEFAULT 'General contractor / renovation company',
  phone TEXT,
  email TEXT,
  address TEXT,
  unit_number TEXT,
  city TEXT,
  province CHAR(2) NOT NULL DEFAULT 'ON',
  postal_code TEXT,
  tax_rate NUMERIC(6, 3) NOT NULL DEFAULT 13.000,
  valid_for_days INTEGER NOT NULL DEFAULT 14,
  expiry_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_amount INTEGER NOT NULL DEFAULT 6,
  expiry_unit TEXT NOT NULL DEFAULT 'months',
  theme_mode TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO companies (id, name, company_type, province, tax_rate)
VALUES ('00000000-0000-0000-0000-000000000001', 'BuildQuote', 'General contractor / renovation company', 'ON', 13.000)
ON CONFLICT (id) DO NOTHING;

-- Optional application profile linked to Supabase Auth.
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'manager', 'estimator', 'member', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  unit_number TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  province CHAR(2) NOT NULL DEFAULT 'ON',
  postal_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  trade TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  last_assigned_job_date DATE,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  rate NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  rate_type TEXT NOT NULL DEFAULT 'hourly'
    CHECK (rate_type IN ('hourly', 'daily', 'fixed', 'unit')),
  address TEXT NOT NULL DEFAULT '',
  unit_number TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  province CHAR(2) NOT NULL DEFAULT 'ON',
  postal_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'each',
  price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_per_unit >= 0),
  duration NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (duration >= 0),
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('material', 'labour', 'equipment', 'subcontractor', 'delivery', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  built_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_template_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  price_item_id TEXT REFERENCES price_items(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'each',
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('material', 'labour', 'equipment', 'subcontractor', 'delivery', 'other')),
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  duration NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (duration >= 0),
  price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_per_unit >= 0),
  markup_rate NUMERIC(7, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  quote_number TEXT NOT NULL DEFAULT '',
  sequence INTEGER,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'sent', 'approved', 'rejected', 'expired', 'ongoing', 'completed', 'invoiced', 'cancelled')),
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date DATE,
  valid_until DATE,
  project_address TEXT NOT NULL DEFAULT '',
  project_city TEXT NOT NULL DEFAULT '',
  project_province CHAR(2) NOT NULL DEFAULT 'ON',
  project_postal_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  markup_rate NUMERIC(7, 3) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(7, 3) NOT NULL DEFAULT 13,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  price_item_id TEXT REFERENCES price_items(id) ON DELETE SET NULL,
  room_template_id TEXT REFERENCES room_templates(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  room_id TEXT,
  room_name TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  duration NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (duration >= 0),
  unit TEXT NOT NULL DEFAULT 'each',
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('material', 'labour', 'equipment', 'subcontractor', 'delivery', 'other')),
  price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_per_unit >= 0),
  markup_rate NUMERIC(7, 3) NOT NULL DEFAULT 0,
  base_total NUMERIC(14, 2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit, 2)) STORED,
  markup_amount NUMERIC(14, 2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit * markup_rate / 100, 2)) STORED,
  line_total NUMERIC(14, 2) GENERATED ALWAYS AS
    (round(quantity * price_per_unit * (1 + markup_rate / 100), 2)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  quote_item_id TEXT REFERENCES quote_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  duration NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (duration >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  suggested_trade TEXT NOT NULL DEFAULT '',
  assigned_contractor_id TEXT REFERENCES contractors(id) ON DELETE SET NULL,
  assigned_contractor_name TEXT NOT NULL DEFAULT '',
  assigned_contractor_trade TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  completed_at DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS quote_approvals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked')),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quote totals used by dashboard and reporting views.
CREATE OR REPLACE VIEW quote_totals AS
SELECT
  q.company_id,
  q.id AS quote_id,
  coalesce(sum(qi.base_total), 0)::NUMERIC(14, 2) AS subtotal,
  coalesce(sum(qi.markup_amount), 0)::NUMERIC(14, 2) AS markup,
  round(
    coalesce(sum(qi.line_total), 0) * q.tax_rate / 100,
    2
  )::NUMERIC(14, 2) AS tax,
  round(
    coalesce(sum(qi.line_total), 0) * (1 + q.tax_rate / 100),
    2
  )::NUMERIC(14, 2) AS total
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
GROUP BY q.company_id, q.id, q.tax_rate;

-- Material-only takeoff used by the takeoff page.
CREATE OR REPLACE VIEW material_takeoff AS
SELECT
  q.company_id,
  q.id AS quote_id,
  q.quote_number,
  q.title AS quote_title,
  qi.name AS material,
  qi.quantity,
  qi.unit,
  qi.price_per_unit,
  qi.line_total AS total
FROM quote_items qi
JOIN quotes q ON q.id = qi.quote_id
WHERE qi.category = 'material';

CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_updated_at ON quotes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_category ON quote_items(category);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_quote_id ON schedule_tasks(quote_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_contractor_id ON schedule_tasks(assigned_contractor_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_dates ON schedule_tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_room_template_items_template_id ON room_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_quote_approvals_quote_id ON quote_approvals(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_approvals_token ON quote_approvals(token);


DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contractors_updated_at ON contractors;
CREATE TRIGGER trg_contractors_updated_at BEFORE UPDATE ON contractors
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_price_items_updated_at ON price_items;
CREATE TRIGGER trg_price_items_updated_at BEFORE UPDATE ON price_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_room_templates_updated_at ON room_templates;
CREATE TRIGGER trg_room_templates_updated_at BEFORE UPDATE ON room_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_room_template_items_updated_at ON room_template_items;
CREATE TRIGGER trg_room_template_items_updated_at BEFORE UPDATE ON room_template_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quote_items_updated_at ON quote_items;
CREATE TRIGGER trg_quote_items_updated_at BEFORE UPDATE ON quote_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_schedule_tasks_updated_at ON schedule_tasks;
CREATE TRIGGER trg_schedule_tasks_updated_at BEFORE UPDATE ON schedule_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quote_approvals_updated_at ON quote_approvals;
CREATE TRIGGER trg_quote_approvals_updated_at BEFORE UPDATE ON quote_approvals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
