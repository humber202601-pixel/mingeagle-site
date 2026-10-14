# Verified live retail pilot — 14 October 2026

## Intended initial scope

- One P1-S3 set: USD 9.90 goods + USD 11.50 duty-paid China-to-US shipping.
- One P1-S7 set: USD 14.90 goods + USD 14.00 duty-paid China-to-US shipping.
- Delivery to Oregon (OR) or New Hampshire (NH) only for direct online payment.
- Other states, products, quantities, customized goods and wholesale orders use
  confirmed quotations. They are not authorized by this pilot's tax decision.
- Standard retail supply and dispatch within three calendar days were confirmed
  by the owner; transit remains an estimate of 12–15 days after dispatch.

## Government tax basis

Oregon DOR states that Oregon has no general sales or use/transaction tax, and
explains that ordinary online purchases by Oregon residents are not affected by
Wayfair's general sales-tax collection rules. Source, accessed 14 October 2026:
https://www.oregon.gov/dor/programs/businesses/Pages/sales-tax.aspx

New Hampshire DRA states that it has no general sales and use tax. Source,
accessed through the official indexed FAQ on 14 October 2026:
https://www.revenue.nh.gov/licenses-certifications/resale-exempt-certificates
https://www.revenue.nh.gov/faq/does-new-hampshire-have-sales-tax

Application of those general rules to these ordinary basketball/mini-hoop goods
is an inference from the official guidance. This is not a professional nexus
opinion, permit, nationwide exemption, or conclusion about other business taxes.
No general-sales/use-tax policy is allowed to approve states other than OR/NH.
Its source review is bounded to one year; merchant nexus decisions retain the
existing 31-day review limit. Reassess earlier if law, products or seller facts change.

## Actual provider evidence

The current restricted live key retrieved the account and Checkout/webhook data
successfully. Stripe reported `charges_enabled=true`, `payouts_enabled=true`.
The existing exact-URL live endpoint is enabled for all four required Checkout
events on API `2026-09-30.endive`.

A fixed USD 21.40 technical Checkout Session was created in live mode and
immediately expired without exposing its payable URL. Stripe emitted actual
event `evt_1UQPs46ggh6j2Fv0zhng6tbp`; production successfully verified its signature
and processed it at `2026-10-14 10:57:21` UTC. The probe created no CRM order,
payment or fulfillment task, and production Stripe payment count remains zero.
The existing signing secret is therefore retained; no unnecessary rotation occurs.

## Activation and customer terms

Global Stripe activation and the retail activation flag remain disabled until
the checkout UI, the published return policy and the actual security verification
have been checked. The operator can then enable the two flags under the owner's
request to open payment. Wholesale Stripe payment is independently disabled.

The initial standard retail return policy is a launch default chosen while
implementing the owner's delegated setup request, not a claim that the owner
previously supplied those terms: 30-day quality issue review with replacement or
refund; unused complete goods may request a change-of-mind return within 14 days;
buyer pays non-quality return freight, no restocking fee, original freight excluded
from non-quality refund. Quality remedies preserve applicable consumer rights.
Return instructions are obtained from support; no US return center or numerical
infinite stock count is invented. The published policy and checkout links must
be available before the first customer payment.

The short-lived owner launch-check route must be switched off after acceptance.
