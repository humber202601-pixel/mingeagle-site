# Nationwide payment availability and merchant tax configuration

`RETAIL_NATIONWIDE_STRIPE_TAX_ENABLED=true` is an explicit merchant-controlled
payment availability setting. It accepts all 50 US states and DC for the
existing verified one-unit P1-S3/P1-S7 China-direct DDP baskets. It is not a
government registration, no-nexus determination or blanket tax exemption.

This mode always uses Stripe automatic tax, the actual saved delivery address,
the physical-goods/shipping tax codes and the signed tax/amount reconciliation.
It does not set a product or customer as tax-exempt and does not manufacture a
zero-sales or no-US-presence owner declaration. Merchant facts stay private.

Stripe collects in its configured active jurisdictions. An unregistered state
may return zero with `not_collecting`; that is not evidence that the merchant
has no obligation. Tax assessment and necessary government registrations remain
merchant work. A state explicitly marked `COLLECT_WITH_STRIPE_TAX` still requires
a verified active same-mode registration; nationwide availability cannot
override that known collection requirement.

Before first activation, verify real customer permissions, location resolution
and a live automatic-tax Checkout Session with an owner-authenticated diagnostic.
The diagnostic uses the business address already configured in Stripe, creates
no CRM order and never exposes the payable URL. It expires the unpaid session
and deletes only its own purpose/nonce-tagged diagnostic customer. Use the
single-purpose temporary scope, then close the entry point and delete its token.

Payment availability must not be reported as completed US tax registration.
The existing no-collection/startup policy remains available when this explicit
mode is disabled. The merchant's stock and DDP limits are unchanged.

Primary references:
- https://docs.stripe.com/tax/checkout/page
- https://docs.stripe.com/tax/zero-tax
- https://docs.stripe.com/tax/customer-locations
