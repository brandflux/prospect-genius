-- Remover o índice condicional antigo
DROP INDEX IF EXISTS public.companies_user_osm_uidx;

-- Criar um índice único padrão em (user_id, osm_id) para suportar ON CONFLICT na upsert
CREATE UNIQUE INDEX companies_user_osm_uidx ON public.companies (user_id, osm_id);
