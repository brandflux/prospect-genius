-- 1. Criar a tabela api_providers
CREATE TABLE IF NOT EXISTS public.api_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, -- openstreetmap, google_places, outscraper, serpapi, apify
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  has_key_configured boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'inactive', -- connected, inactive, error
  last_connection_test timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_providers TO authenticated;
GRANT ALL ON public.api_providers TO service_role;
ALTER TABLE public.api_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_providers_owner_all" ON public.api_providers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Criar a tabela api_provider_keys (Tabela isolada e segura para chaves API)
CREATE TABLE IF NOT EXISTS public.api_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.api_providers(id) ON DELETE CASCADE UNIQUE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS para chaves: APENAS escritas são permitidas ao dono via RLS, sem leitura para usuários autenticados comuns!
-- Apenas service_role ou funções SECURITY DEFINER podem ler para preservar as chaves ocultas do browser.
GRANT INSERT, UPDATE, DELETE ON public.api_provider_keys TO authenticated;
GRANT ALL ON public.api_provider_keys TO service_role;
ALTER TABLE public.api_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_provider_keys_owner_write" ON public.api_provider_keys
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.api_providers WHERE id = provider_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.api_providers WHERE id = provider_id AND user_id = auth.uid()
  ));

-- 3. Gatilho para sincronizar has_key_configured
CREATE OR REPLACE FUNCTION public.sync_api_provider_has_key()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.api_providers SET has_key_configured = true WHERE id = NEW.provider_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.api_providers SET has_key_configured = false WHERE id = OLD.provider_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER tr_sync_api_provider_has_key
AFTER INSERT OR DELETE ON public.api_provider_keys
FOR EACH ROW EXECUTE FUNCTION public.sync_api_provider_has_key();

-- 4. Gatilho para garantir apenas um provedor ativo por usuário
CREATE OR REPLACE FUNCTION public.handle_single_active_provider()
RETURNS trigger AS $$
BEGIN
  IF NEW.active = true THEN
    UPDATE public.api_providers 
    SET active = false 
    WHERE user_id = NEW.user_id AND provider != NEW.provider;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER tr_single_active_provider
BEFORE INSERT OR UPDATE OF active ON public.api_providers
FOR EACH ROW EXECUTE FUNCTION public.handle_single_active_provider();

-- 5. Atualizar handle_new_user para criar OpenStreetMap ativo por padrão
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Criar perfil do usuário
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone',
    (NEW.email = 'brandfluxsm@gmail.com')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    phone = COALESCE(profiles.phone, EXCLUDED.phone);

  -- Criar registro de assinatura
  INSERT INTO public.subscriptions (user_id, status)
  VALUES (NEW.id, 'inactive')
  ON CONFLICT (user_id) DO NOTHING;

  -- Criar registro de uso do trial
  INSERT INTO public.trial_usage (user_id, searches_used, results_viewed, trial_finished)
  VALUES (NEW.id, 0, 20, false)
  ON CONFLICT (user_id) DO NOTHING;

  -- Criar OpenStreetMap ativo por padrão
  INSERT INTO public.api_providers (user_id, provider, display_name, active, connection_status)
  VALUES (NEW.id, 'openstreetmap', 'OpenStreetMap', true, 'connected')
  ON CONFLICT (user_id, provider) DO NOTHING;

  -- Configurar role (admin para brandfluxsm@gmail.com, user para outros)
  IF NEW.email = 'brandfluxsm@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

-- 6. Povoar dados retroativamente para usuários existentes
INSERT INTO public.api_providers (user_id, provider, display_name, active, connection_status)
SELECT id, 'openstreetmap', 'OpenStreetMap', true, 'connected' FROM auth.users
ON CONFLICT (user_id, provider) DO NOTHING;

-- 7. Modificar a tabela companies para adicionar dados de provider e provider_reference
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openstreetmap';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS provider_reference text;

-- 8. Modificar a tabela searches para adicionar dados de provider
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openstreetmap';
