-- Per-organisation salary history for people on the People page.
-- Apply to the external Supabase database (EXT_SUPABASE_*) via psql.

CREATE TABLE IF NOT EXISTS public.org_member_salary_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF')),
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'annual', 'hourly')),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_member_salary_history_org_user_date_idx
  ON public.org_member_salary_history (org_id, user_id, effective_date DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_member_salary_history TO authenticated;
GRANT ALL ON public.org_member_salary_history TO service_role;

ALTER TABLE public.org_member_salary_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read salaries" ON public.org_member_salary_history;
CREATE POLICY "org members read salaries" ON public.org_member_salary_history
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id, public.current_profile_id())
    OR public.is_superuser()
  );

DROP POLICY IF EXISTS "org managers manage salaries" ON public.org_member_salary_history;
CREATE POLICY "org managers manage salaries" ON public.org_member_salary_history
  FOR ALL TO authenticated
  USING (
    public.has_org_permission(org_id, public.current_profile_id(), 'change_titles')
    OR user_id = public.current_profile_id()
    OR public.is_superuser()
  )
  WITH CHECK (
    public.has_org_permission(org_id, public.current_profile_id(), 'change_titles')
    OR user_id = public.current_profile_id()
    OR public.is_superuser()
  );
