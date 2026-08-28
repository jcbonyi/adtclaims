-- Run in Supabase → SQL Editor (Production).
-- Enables Row Level Security on app tables so the Security Advisor
-- "RLS Disabled in Public" errors clear.
--
-- This app talks to Postgres through the Express backend (DATABASE_URL),
-- not through the anon key. postgres / service_role bypass RLS.
-- After this, PostgREST (anon / authenticated) cannot read these tables.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_financiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_notification_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.claims FROM anon, authenticated;
REVOKE ALL ON TABLE public.claim_remarks FROM anon, authenticated;
REVOKE ALL ON TABLE public.claim_status_history FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_audit_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.quotations FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuers FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuations FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuation_follow_ups FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuation_status_history FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuation_audit_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.valuation_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_policies FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_financiers FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_notification_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_follow_ups FROM anon, authenticated;
REVOKE ALL ON TABLE public.renewal_attachments FROM anon, authenticated;
REVOKE ALL ON TABLE public.claim_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.claim_notification_logs FROM anon, authenticated;
