-- 1. Restaura a permissão de execução das funções de gatilho para o público
-- Isso é necessário para que o supabase_auth_admin e os usuários autenticados possam disparar os triggers
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_single_active_provider() TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_api_provider_has_key() TO public, anon, authenticated;

-- 2. Restaura a função has_role de forma segura mas funcional
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE plpgsql stable security definer set search_path = public AS $$
BEGIN
  -- Permite a verificação se o executor for o próprio usuário consultado ou se for um administrador
  IF _user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  ) THEN
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
  END IF;
  
  -- Para fins de criação de conta/gatilhos (quando auth.uid() é nulo)
  IF auth.uid() IS NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
  END IF;

  RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 3. Garante que qualquer usuário existente esteja com acesso aprovado por padrão
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;

