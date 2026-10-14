-- Dedicated guide data only. No writes to customer tables, leads, scoring or billing.
CREATE TABLE IF NOT EXISTS public.focus_guide_sessions (
 id text PRIMARY KEY CHECK (length(id)=64),
 ip_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 spent_usd numeric NOT NULL DEFAULT 0 CHECK (spent_usd>=0 AND spent_usd<=0.12),
 actual_usd numeric NOT NULL DEFAULT 0,
 turns integer NOT NULL DEFAULT 0 CHECK (turns>=0 AND turns<=16),
 busy boolean NOT NULL DEFAULT false,
 approved boolean NOT NULL DEFAULT false,
 state jsonb NOT NULL DEFAULT '{"messages":[],"reply":null}'::jsonb
);
CREATE INDEX IF NOT EXISTS focus_guide_ip_created ON public.focus_guide_sessions(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS public.focus_guide_daily (
 day date PRIMARY KEY,
 reserved_usd numeric NOT NULL DEFAULT 0 CHECK (reserved_usd>=0)
);
ALTER TABLE public.focus_guide_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_guide_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.focus_guide_sessions,public.focus_guide_daily FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.focus_guide_sessions,public.focus_guide_daily TO service_role;

CREATE OR REPLACE FUNCTION public.focus_guide_start(p_id text,p_ip text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('focus-guide-start-'||p_ip,0));
 IF (SELECT count(*) FROM public.focus_guide_sessions WHERE ip_hash=p_ip AND created_at>now()-interval '24 hours')>=6 THEN
  RETURN false;
 END IF;
 INSERT INTO public.focus_guide_sessions(id,ip_hash) VALUES(p_id,p_ip);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.focus_guide_start(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.focus_guide_start(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.focus_guide_reserve(p_id text,p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.focus_guide_sessions; daily numeric;
BEGIN
 -- Shared lock makes per-session and daily reservations atomic across Edge instances.
 PERFORM pg_advisory_xact_lock(hashtextextended('focus-guide-budget',0));
 SELECT * INTO s FROM public.focus_guide_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.created_at<now()-interval '24 hours' THEN RETURN '{"error":"expired"}'::jsonb; END IF;
 IF s.busy THEN RETURN '{"error":"busy"}'::jsonb; END IF;
 IF p_amount<=0 OR p_amount>0.12 OR s.spent_usd+p_amount>0.12 OR s.turns>=16 THEN
  RETURN '{"error":"budget"}'::jsonb;
 END IF;
 INSERT INTO public.focus_guide_daily(day) VALUES(current_date) ON CONFLICT DO NOTHING;
 SELECT reserved_usd INTO daily FROM public.focus_guide_daily WHERE day=current_date FOR UPDATE;
 IF daily+p_amount>2 THEN RETURN '{"error":"daily"}'::jsonb; END IF;
 UPDATE public.focus_guide_daily SET reserved_usd=reserved_usd+p_amount WHERE day=current_date;
 UPDATE public.focus_guide_sessions SET spent_usd=spent_usd+p_amount,turns=turns+1,busy=true WHERE id=p_id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.focus_guide_reserve(text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.focus_guide_reserve(text,numeric) TO service_role;
