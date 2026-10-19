CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site settings"
ON public.site_settings FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.site_settings (key, value) VALUES ('whatsapp_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
