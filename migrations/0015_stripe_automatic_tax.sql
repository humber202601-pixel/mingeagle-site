-- Snapshot the exact tax confirmed by Stripe before a customer can pay.
ALTER TABLE payment_provider_sessions ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE payment_provider_sessions ADD COLUMN base_amount_cents INTEGER;
ALTER TABLE payment_provider_sessions ADD COLUMN tax_amount_cents INTEGER;
ALTER TABLE payment_provider_sessions ADD COLUMN tax_state TEXT;
ALTER TABLE payment_provider_sessions ADD COLUMN tax_customer_id TEXT;
