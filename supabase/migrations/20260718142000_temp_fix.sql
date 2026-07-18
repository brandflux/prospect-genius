-- Temporarily revert has_role to its original simple SQL format to test if PL/pgSQL changes caused the signup error
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql stable security definer set search_path = public AS $$
  SELECT exists (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Temporarily restore execute permissions to triggers to verify if permission restrictions caused the auth block
GRANT EXECUTE ON FUNCTION public.sync_api_provider_has_key() TO public;
GRANT EXECUTE ON FUNCTION public.handle_single_active_provider() TO public;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO public;
