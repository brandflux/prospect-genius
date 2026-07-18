-- 1. Criar a tabela de assinaturas (subscriptions)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'inactive', -- active, trialing, inactive
  price_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_owner_all" ON public.subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Criar a tabela de uso do trial (trial_usage)
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

CREATE POLICY "trial_usage_owner_all" ON public.trial_usage
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Atualizar a função trigger handle_new_user para criar registros automáticos
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
    (NEW.email = 'brandfluxsm@gmail.com') -- Auto-aprova o admin
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

-- 4. Povoar dados retroativamente para usuários existentes
INSERT INTO public.subscriptions (user_id, status)
SELECT id, 'inactive' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.trial_usage (user_id, searches_used, results_viewed, trial_finished)
SELECT id, 0, 20, false FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
