-- Preserve the seller's documented sales-tax basis for each B2B quotation.
-- This is an audit note, not a government registration or exemption.
ALTER TABLE quotes ADD COLUMN tax_basis TEXT;
