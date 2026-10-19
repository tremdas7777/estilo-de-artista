CREATE TABLE public.rastreios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido TEXT NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  codigo_rastreio TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pedido_recebido',
  data_criacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rastreios_codigo ON public.rastreios(codigo_rastreio);
CREATE INDEX idx_rastreios_status ON public.rastreios(status);
CREATE INDEX idx_rastreios_criacao ON public.rastreios(data_criacao);

GRANT SELECT ON public.rastreios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rastreios TO authenticated;
GRANT ALL ON public.rastreios TO service_role;

ALTER TABLE public.rastreios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rastreios"
ON public.rastreios FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated can manage rastreios"
ON public.rastreios FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);