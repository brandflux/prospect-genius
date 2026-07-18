CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
  arr text[] := '{}';
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LOOP
    arr := array_append(arr, r.table_name::text);
  END FOR;
  RETURN arr;
END $$;
