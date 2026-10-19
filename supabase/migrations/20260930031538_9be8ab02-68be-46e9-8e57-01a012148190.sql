CREATE TABLE public.pix_orders (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'waiting_payment',
  amount_cents integer NOT NULL,
  customer jsonb NOT NULL,
  bundle_id text NOT NULL,
  bundle_name text NOT NULL,
  utm jsonb,
  fbp text,
  fbc text,
  ip text,
  ua text,
  url text,
  paid_reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pix_orders TO service_role;
ALTER TABLE public.pix_orders ENABLE ROW LEVEL SECURITY;