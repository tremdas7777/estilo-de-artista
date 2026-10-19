
CREATE TABLE public.funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  path TEXT,
  bundle_id TEXT,
  bundle_name TEXT,
  value NUMERIC,
  referrer TEXT,
  user_agent TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_events_created_at ON public.funnel_events (created_at DESC);
CREATE INDEX idx_funnel_events_session ON public.funnel_events (session_id);
CREATE INDEX idx_funnel_events_type ON public.funnel_events (event_type);

GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert events"
ON public.funnel_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.funnel_events;
ALTER TABLE public.funnel_events REPLICA IDENTITY FULL;
