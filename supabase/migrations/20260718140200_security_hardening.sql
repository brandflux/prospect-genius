-- 1. Endurecimento da função has_role para impedir consultas horizontais de privilégios por usuários autenticados comuns
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE plpgsql stable security definer set search_path = public AS $$
BEGIN
  -- Permite a verificação se o executor for o próprio usuário consultado ou se for um administrador
  IF _user_id = auth.uid() OR exists (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  ) THEN
    RETURN exists (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
  END IF;
  
  RETURN false;
END $$;

-- 2. Alteração de calculate_lead_score para SECURITY INVOKER para impedir bypass das políticas RLS
CREATE OR REPLACE FUNCTION public.calculate_lead_score(_company_id uuid)
RETURNS integer language plpgsql security invoker set search_path = public as $$
declare c public.companies; score integer := 0;
begin
  select * into c from public.companies where id = _company_id;
  if not found then return 0; end if;
  if not c.has_website then score := score + 50; end if;
  if c.rating is not null and c.rating > 4.5 then score := score + 20; end if;
  if c.reviews_count is not null and c.reviews_count > 100 then score := score + 15; end if;
  if c.phone is not null and length(trim(c.phone)) > 0 then score := score + 10; end if;
  if c.whatsapp is not null and length(trim(c.whatsapp)) > 0 then score := score + 10; end if;
  if score > 100 then score := 100; end if;
  update public.companies set lead_score = score, updated_at = now() where id = _company_id;
  return score;
end $$;

-- 3. Revogação de privilégios de execução direta nas funções críticas e gatilhos para usuários comuns
REVOKE EXECUTE ON FUNCTION public.sync_api_provider_has_key() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_single_active_provider() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
