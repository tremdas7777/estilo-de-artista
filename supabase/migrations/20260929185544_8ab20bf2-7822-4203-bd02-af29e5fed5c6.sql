CREATE TABLE public.private_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.private_settings TO service_role;
ALTER TABLE public.private_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.private_settings (key, value) VALUES ('meta_pixel_id', '2456602311535795') ON CONFLICT DO NOTHING;