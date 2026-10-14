# MING EAGLE — US Retail Stripe Tax Launch Gate (2026-10-14)

Status: **BLOCKED for live charges pending state-by-state nexus assessment and remaining checkout/fulfillment approvals**. On 2026-10-14 the merchant relayed written confirmation from the Kentucky formation/registered-agent provider: **the agent did NOT file Kentucky Sales and Use Tax registration**. Their filing history shows only registered agent and Kentucky renewal services, with no tax registrations. This confirms the **agent did not file**; it is not government account verification that the company holds no permit from any other source, nor a determination that registration is legally required or not required. Do not infer tax nexus, collection authorization or exemption merely from LLC formation, KY registered-agent mailing address, or EIN.

## Confirmed first-sale baseline (merchant statement, 2026-10-14)

- **MING EAGLE COMMERCE LLC was first formed in October 2026.**
- **The LLC has had no sales and no transactions as of 2026-10-14.** For its own operations, the reported direct-sale 2025 and 2026-to-date amounts are USD 0. This is merchant-provided information, **not** verified payment or tax records. Check any sales by a predecessor, related seller, or marketplace that state law may require to be included before making a final nexus conclusion.
- Products are currently fulfilled directly from China; no current US warehouse. The Kentucky address belongs only to the registered-agent service and is not an operating address. No business tax registrations were filed by that agent.
- The USD 100,000 **Kentucky economic-nexus** threshold in current KRS 139.340(2)(g) is therefore not met by the LLC's reported sales history; this **does not decide physical/agent nexus** under KRS 139.340(2)(a)-(f), nor other states' independent tax rules. Written, date-stamped professional/government confirmation is required before a destination state is assigned `NO_COLLECTION_REQUIRED` in production.
- **Do not automatically register for KY sales tax solely to launch Stripe.** Ask a qualified multi-state US tax professional for an initial seller-of-record/nexus opinion, using this factual baseline, and obtain a list of states where the seller has (or lacks) a duty to collect on the planned launch date.
- **Stripe payment processing is distinct from tax registration.** The project can finish mock and isolated test-mode Stripe Checkout work before any live tax registration. Never use the existing live API key for sandbox transactions. Do not bind an isolated test checkout to live D1 order/CRM tables or enable any production payment switches.
- For first live retail transactions, separately verify Stripe account acceptance, state-specific documented tax collection decision, approved single-item DDP freight, actual stock/fulfillment and returns readiness, approved Turnstile, signed webhooks, and order tax/amount/identity reconciliation. A broad zero-tax assertion for all US states is not appropriate.
- Track new direct + marketplace sales by **destination state** and periodically reassess statutory thresholds; Stripe Tax's threshold monitor is informational and primarily uses Stripe-processed transactions, so separately account for sales outside Stripe where relevant.

## A. Verify seller identity and permit before changing tax or payment switches

1. Ask the formation agent for (a) legal entity and jurisdiction documents, (b) whether Kentucky **Sales and Use Tax** registration was actually submitted, (c) the Kentucky DOR account/permit number and effective date, (d) current account status, (e) filing frequency, (f) access or delegated authorization to MyTaxes, and (g) copies of the confirmation/permit (omit sensitive IDs from tickets). A Kentucky Secretary of State filing or EIN alone is **not** a Sales and Use Tax account.
2. Authorized owner/agent: log in to https://mytaxes.ky.gov, inspect the business's actual Kentucky DOR account types, specifically Sales and Use Tax. If absent or inaccessible, the KY Department of Revenue registration branch is +1 502-564-3306; ask them how to confirm an existing account through a verified company representative. Never publish an EIN, permit number or personal login.
3. Get a licensed US sales-tax adviser to assess whether the merchant has physical or economic nexus in KY and each US destination state. Document whether the address is only a registered-agent service, whether the business has employees/inventory/operations in any US state, and previous/current-year direct and marketplace sales by state. Company incorporation or a mailbox is not, by itself, a sufficient conclusion on nexus.
4. If registration is required but absent, file through the state portal and get official evidence. Kentucky DOR distinguishes legal formation from registering business tax accounts. Assess additional states independently and record collection effective dates. **Never invent or backdate registration.**
5. Do not assume either that a non-registered merchant should collect 6% tax or that all sales are automatically exempt. Where no seller collection obligation applies, the buyer may separately owe use tax.

Official references:
- https://revenue.ky.gov/Business/Pages/Register-Business.aspx
- https://revenue.ky.gov/Business/Pages/Additional-Tax-Registration-Information.aspx
- https://revenue.ky.gov/Business/Sales-Use-Tax/Pages/default.aspx
- https://taxanswers.ky.gov/Sales-and-Excise-Taxes/Pages/Remote-Retailers-Marketplace-Providers-FAQs.aspx


**Next decision — do not order the agent to file yet:** verify whether the agent is only a statutory service-of-process address, whether any office/employees/inventory/orders/return handling exists in Kentucky or other US states, and current/previous calendar-year direct and marketplace transactions and revenues **by destination state**. Ask a licensed US sales-tax specialist for a written physical/economic nexus and sales/use-tax-registration opinion, including KY KRS 139.340. **IMPORTANT 2026 LAW UPDATE:** Kentucky HB 757 (2026 Ky. Acts ch. 161, sec. 16) amended KRS 139.340, **effective August 1, 2026**, to REMOVE the old 200-transaction economic-nexus threshold. Under the current law, remote sellers are subject to the economic-nexus test when **gross Kentucky receipts exceed USD 100,000 in the current or prior calendar year**; the former transaction-count test should no longer be used. This is separate from physical/agency nexus under KRS 139.340(2)(a)–(f). The official updated statute is https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=58190 ; HB 757: https://apps.legislature.ky.gov/record/26rs/HB757.html . Kentucky DOR FAQ pages may still mention the obsolete 200-transaction rule; use the revised statute as the primary source. Tax adviser conclusions determine whether to register in KY or any other state.

An absent KY permit does **not by itself** prohibit all US card transactions; what blocks this implementation today is the absence of verified state-specific tax decisions and several separate safety/fulfillment/activation gates. Do not activate a nationwide zero-tax exemption or collect KY 6% without lawful registration when applicable. Store only status and documented tax opinions, not the agent's private correspondence, personal credentials or tax ID.


**Additional merchant-supplied agent reply (2026-10-14):** The Kentucky registered-agent address is used **solely for service of process, registered-agent services and state compliance mail**; the LLC has **no business or operating address on the agent's file** and does not operate at that location. The agent offers neither sales-tax nexus assessment nor KY/other-state sales tax registrations/filings, and cannot quote such fees. Merchant-reported fulfillment is China-direct with no current US warehouse. This evidence narrows the registered-address question but does NOT establish that no physical/agency nexus exists under every statutory criterion or that each destination state has a zero-collection decision. Do not instruct the agent to file any tax permit; engage an independent US multi-state sales-tax adviser or seek KY DOR written guidance. Confirm any US employees, contractors, returns processing and inventory with merchant separately.

## B. Stripe Tax configuration after registration/nexus decisions are documented

- Confirm the **actual seller of record** is MING EAGLE COMMERCE LLC, check Stripe legal entity, principal business address and payout account identity; the merchant's operating location is not automatically the registered-agent's address.
- In Stripe Dashboard, review Stripe Tax settings, the business origin address, sales-tax liability thresholds and registrations. **Add a Stripe Tax state registration only when there is genuine effective registration/collection authority**; creating a Stripe Tax Registration object does not register the business with a government.
- Classify a physical silent basketball, mini hoop and accessories under the verified product tax code; review the shipping/handling tax treatment and all relevant state/local rules. Countrywide flat 0% or blanket KY 6% without address/product review is not acceptable.
- Keep retail base US DDP pricing as separate, tax-exclusive items. Verified **exactly one P1-S3**: goods USD 9.90, CN→US freight USD 11.50, base USD 21.40. Verified **exactly one P1-S7**: goods USD 14.90, freight USD 14.00, base USD 28.90. Freight includes applicable US import clearance and duties, **not** US sales/use tax. Other SKUs or multi-item deliveries need their own DDP approval.
- Test against destination-specific US postal codes and product/fulfillment data. Only add active tax registrations that are independently confirmed. Tax simulation is not proof of an actual governmental permit.
- Official Stripe references: https://docs.stripe.com/api/checkout/sessions/create ; https://docs.stripe.com/api/tax/registrations/create ; https://docs.stripe.com/api/tax_codes

## C. Required backend changes before live Stripe Tax (not yet implemented)

Current architecture deliberately supports **reviewed no-collection states only**:
- `lib/retail-tax-policy.ts` only approves recently reviewed `NO_COLLECTION_REQUIRED` destinations.
- `functions/api/retail/checkout.ts` currently persists `tax=0` and `total=goods+freight` for approved zero-collection states.
- `functions/api/payments/stripe/create.ts` requires exact equality between internal order total and provider Checkout Session amount, with an immutable shipping state.
- `functions/api/payments/stripe/webhook.ts` requires a valid signed event and exact amount/currency/order match before marking payment successful.

Therefore adding `automatic_tax[enabled]=true` **alone is incorrect**: the Stripe total can change while D1 order still expects zero tax, causing a webhook mismatch or broken reconciliation.

Implement and test a single coherent tax-calculation strategy (for example, authoritative address-bound Stripe Tax calculation before a final payable order, or a Stripe-hosted automatic-tax flow with properly persisted and reconciled provider-authoritative totals). Acceptance criteria:
1. Buyer-provided address is verified and tied to this immutable order and approved destination tax policy; no tax calculation or charge occurs for unsupported states.
2. Product, shipping, discount and tax are represented separately in USD cents, all server-side; amounts are confirmed **before** buyer authorization, including changes to taxes and freight.
3. Stripe Checkout amount, D1 quote/order amount, signed webhook session amount, actual paid/received amount and tax detail reconcile exactly; reject changed identity/address, stale rates, retries, under- and over-payments.
4. Test tax-required, genuinely no-collection, invalid address, mismatched tax, shipping taxation, provider error, cancellation, duplicate events and refunds under *synthetic/test* credentials only; no real charge or false registrations.
5. Review order confirmation/return and full fulfillment/stock readiness, Cloudflare Turnstile, Stripe live account approval and webhook delivery.
6. Only then decide whether to set activation flags. A registered tax status is **necessary only where the obligation requires it**, and is not alone sufficient to turn on retail payment.

## D. Environment gate — current operational restriction

Keep `RETAIL_CHECKOUT_ENABLED`, `STRIPE_TAX_POLICY_APPROVED`, `RETAIL_TAX_POLICY_APPROVED`, `RETAIL_STOCK_FULFILLMENT_APPROVED` unset/false until each condition is individually supported by verifiable evidence. A Turnstile site key existing does not mean checkout Turnstile is enabled or passed. Do not use test policy approvals in production.

This document is a technical/tax verification checklist, **not legal advice, a permit, or an authorization to charge customers**.
