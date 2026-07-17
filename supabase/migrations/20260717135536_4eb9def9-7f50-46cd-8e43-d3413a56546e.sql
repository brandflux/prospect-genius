
-- Extend companies for OSM data + new score/opportunity model
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS osm_id text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opportunity text NOT NULL DEFAULT 'baixa';

CREATE UNIQUE INDEX IF NOT EXISTS companies_user_osm_uidx
  ON public.companies(user_id, osm_id) WHERE osm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_user_favorite_idx
  ON public.companies(user_id, favorite) WHERE favorite = true;

-- searches: add total_results alias
ALTER TABLE public.searches
  ADD COLUMN IF NOT EXISTS total_results integer NOT NULL DEFAULT 0;

-- New scoring: sem site +50, telefone +20, email +20, categoria comercial +10
CREATE OR REPLACE FUNCTION public.compute_company_score(_company public.companies)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  score integer := 0;
  commercial_categories text[] := ARRAY[
    'restaurant','cafe','bar','fast_food','bakery','pub','food_court',
    'hairdresser','beauty','beauty_salon','dentist','doctors','clinic',
    'pharmacy','veterinary','optician','shop','supermarket','convenience',
    'clothes','shoes','jewelry','florist','bicycle','car_repair','car',
    'gym','fitness_centre','hotel','guest_house','hostel','marketplace'
  ];
BEGIN
  IF _company.website IS NULL OR length(trim(_company.website)) = 0 THEN
    score := score + 50;
  END IF;
  IF _company.phone IS NOT NULL AND length(trim(_company.phone)) > 0 THEN
    score := score + 20;
  END IF;
  IF _company.email IS NOT NULL AND length(trim(_company.email)) > 0 THEN
    score := score + 20;
  END IF;
  IF _company.category IS NOT NULL AND lower(_company.category) = ANY(commercial_categories) THEN
    score := score + 10;
  END IF;
  IF score > 100 THEN score := 100; END IF;
  RETURN score;
END $$;

CREATE OR REPLACE FUNCTION public.set_company_score()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.lead_score := public.compute_company_score(NEW);
  NEW.opportunity := CASE
    WHEN NEW.lead_score >= 80 THEN 'alta'
    WHEN NEW.lead_score >= 50 THEN 'media'
    ELSE 'baixa'
  END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS companies_score_trigger ON public.companies;
CREATE TRIGGER companies_score_trigger
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_company_score();
