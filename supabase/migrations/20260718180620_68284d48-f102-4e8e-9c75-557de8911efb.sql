
-- ============ searches / companies extra fields + admin roles ============
ALTER TABLE public.searches
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_contact_at timestamptz;

-- ============ profiles: phone + is_approved ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

UPDATE public.profiles SET is_approved = true WHERE email = 'brandfluxsm@gmail.com';

-- ============ companies unique index ============
DROP INDEX IF EXISTS public.companies_user_osm_uidx;
CREATE UNIQUE INDEX companies_user_osm_uidx ON public.companies (user_id, osm_id);

-- ============ subscriptions ============
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'inactive',
  price_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_owner_all" ON public.subscriptions;
CREATE POLICY "subscriptions_owner_all" ON public.subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ trial_usage ============
CREATE TABLE IF NOT EXISTS public.trial_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  searches_used integer NOT NULL DEFAULT 0,
  results_viewed integer NOT NULL DEFAULT 20,
  trial_finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_usage TO authenticated;
GRANT ALL ON public.trial_usage TO service_role;
ALTER TABLE public.trial_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial_usage_owner_all" ON public.trial_usage;
CREATE POLICY "trial_usage_owner_all" ON public.trial_usage
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ api_providers ============
CREATE TABLE IF NOT EXISTS public.api_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  has_key_configured boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'inactive',
  last_connection_test timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_providers TO authenticated;
GRANT ALL ON public.api_providers TO service_role;
ALTER TABLE public.api_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_providers_owner_all" ON public.api_providers;
CREATE POLICY "api_providers_owner_all" ON public.api_providers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ api_provider_keys ============
CREATE TABLE IF NOT EXISTS public.api_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.api_providers(id) ON DELETE CASCADE UNIQUE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT, UPDATE, DELETE ON public.api_provider_keys TO authenticated;
GRANT ALL ON public.api_provider_keys TO service_role;
ALTER TABLE public.api_provider_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_provider_keys_owner_write" ON public.api_provider_keys;
CREATE POLICY "api_provider_keys_owner_write" ON public.api_provider_keys
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.api_providers WHERE id = provider_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.api_providers WHERE id = provider_id AND user_id = auth.uid()));

-- ============ triggers helpers ============
CREATE OR REPLACE FUNCTION public.sync_api_provider_has_key()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.api_providers SET has_key_configured = true WHERE id = NEW.provider_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.api_providers SET has_key_configured = false WHERE id = OLD.provider_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_sync_api_provider_has_key ON public.api_provider_keys;
CREATE TRIGGER tr_sync_api_provider_has_key
AFTER INSERT OR DELETE ON public.api_provider_keys
FOR EACH ROW EXECUTE FUNCTION public.sync_api_provider_has_key();

CREATE OR REPLACE FUNCTION public.handle_single_active_provider()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active = true THEN
    UPDATE public.api_providers
    SET active = false
    WHERE user_id = NEW.user_id AND provider != NEW.provider;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_single_active_provider ON public.api_providers;
CREATE TRIGGER tr_single_active_provider
BEFORE INSERT OR UPDATE OF active ON public.api_providers
FOR EACH ROW EXECUTE FUNCTION public.handle_single_active_provider();

-- ============ companies / searches provider columns ============
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openstreetmap';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS provider_reference text;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openstreetmap';

-- ============ handle_new_user (final resilient version) ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, is_approved)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'phone',
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

    INSERT INTO public.subscriptions (user_id, status)
    VALUES (NEW.id, 'inactive') ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.trial_usage (user_id, searches_used, results_viewed, trial_finished)
    VALUES (NEW.id, 0, 20, false) ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.api_providers (user_id, provider, display_name, active, connection_status)
    VALUES (NEW.id, 'openstreetmap', 'OpenStreetMap', true, 'connected')
    ON CONFLICT (user_id, provider) DO NOTHING;

    IF NEW.email = 'brandfluxsm@gmail.com' THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_single_active_provider() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_api_provider_has_key() TO public, anon, authenticated;

-- ============ grants for auth trigger ============
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, SELECT, UPDATE ON public.profiles TO supabase_auth_admin;

-- ============ backfill existing users ============
INSERT INTO public.subscriptions (user_id, status)
SELECT id, 'inactive' FROM public.profiles ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.trial_usage (user_id, searches_used, results_viewed, trial_finished)
SELECT id, 0, 20, false FROM public.profiles ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.api_providers (user_id, provider, display_name, active, connection_status)
SELECT id, 'openstreetmap', 'OpenStreetMap', true, 'connected' FROM public.profiles
ON CONFLICT (user_id, provider) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE email = 'brandfluxsm@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
