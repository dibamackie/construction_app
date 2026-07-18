-- BuildQuote Supabase Row Level Security policies
-- Run after the base schema and invoicing/analysis migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.company_id
  FROM public.app_users au
  WHERE au.id = auth.uid() AND au.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.role
  FROM public.app_users au
  WHERE au.id = auth.uid() AND au.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_company_id IS NOT NULL
     AND target_company_id = public.current_company_id();
$$;

CREATE OR REPLACE FUNCTION public.can_edit_company_data(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(target_company_id)
     AND COALESCE(public.current_user_role(), '') IN
       ('owner', 'admin', 'manager', 'estimator', 'member');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_company_member(target_company_id)
     AND COALESCE(public.current_user_role(), '') IN ('owner', 'admin');
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_company_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_workspace(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_company_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_users (id, company_id, full_name, role, is_active)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001'::uuid,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'member',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'buildquote_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END;
$$;

CREATE POLICY buildquote_companies_select
ON public.companies FOR SELECT TO authenticated
USING (public.is_company_member(id));

CREATE POLICY buildquote_companies_update
ON public.companies FOR UPDATE TO authenticated
USING (public.can_manage_workspace(id))
WITH CHECK (public.can_manage_workspace(id));

CREATE POLICY buildquote_app_users_select
ON public.app_users FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_company_member(company_id));

CREATE POLICY buildquote_app_users_insert
ON public.app_users FOR INSERT TO authenticated
WITH CHECK (public.can_manage_workspace(company_id));

CREATE POLICY buildquote_app_users_update_self
ON public.app_users FOR UPDATE TO authenticated
USING (id = auth.uid() AND public.is_company_member(company_id))
WITH CHECK (
  id = auth.uid()
  AND company_id = public.current_company_id()
  AND role = public.current_user_role()
  AND is_active = true
);

CREATE POLICY buildquote_app_users_update_admin
ON public.app_users FOR UPDATE TO authenticated
USING (public.can_manage_workspace(company_id))
WITH CHECK (public.can_manage_workspace(company_id));

CREATE POLICY buildquote_app_users_delete_admin
ON public.app_users FOR DELETE TO authenticated
USING (public.can_manage_workspace(company_id) AND id <> auth.uid());

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'customers', 'contractors', 'price_items', 'room_templates',
    'room_template_items', 'quotes', 'quote_items', 'schedule_tasks',
    'quote_approvals', 'invoices', 'invoice_items', 'payments'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY buildquote_%1$s_select ON public.%1$I FOR SELECT TO authenticated USING (public.is_company_member(company_id))',
      table_name);
    EXECUTE format(
      'CREATE POLICY buildquote_%1$s_insert ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_edit_company_data(company_id))',
      table_name);
    EXECUTE format(
      'CREATE POLICY buildquote_%1$s_update ON public.%1$I FOR UPDATE TO authenticated USING (public.can_edit_company_data(company_id)) WITH CHECK (public.can_edit_company_data(company_id))',
      table_name);
    EXECUTE format(
      'CREATE POLICY buildquote_%1$s_delete ON public.%1$I FOR DELETE TO authenticated USING (public.can_edit_company_data(company_id))',
      table_name);
  END LOOP;
END;
$$;

ALTER VIEW public.quote_totals SET (security_invoker = true);
ALTER VIEW public.material_takeoff SET (security_invoker = true);
ALTER VIEW public.invoice_totals SET (security_invoker = true);
ALTER VIEW public.analysis_summary SET (security_invoker = true);
ALTER VIEW public.analysis_quote_status_counts SET (security_invoker = true);
ALTER VIEW public.analysis_category_breakdown SET (security_invoker = true);
ALTER VIEW public.analysis_delayed_jobs SET (security_invoker = true);
ALTER VIEW public.analysis_invoice_summary SET (security_invoker = true);

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.companies, public.app_users, public.customers, public.contractors,
  public.price_items, public.room_templates, public.room_template_items,
  public.quotes, public.quote_items, public.schedule_tasks,
  public.quote_approvals, public.invoices, public.invoice_items, public.payments
TO authenticated;

GRANT SELECT ON TABLE
  public.quote_totals, public.material_takeoff, public.invoice_totals,
  public.analysis_summary, public.analysis_quote_status_counts,
  public.analysis_category_breakdown, public.analysis_delayed_jobs,
  public.analysis_invoice_summary
TO authenticated;

COMMIT;
