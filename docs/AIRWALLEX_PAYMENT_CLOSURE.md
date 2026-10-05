# MING EAGLE Airwallex payment closure

Release target: V18 payment closure

## Customer flow

1. Website inquiry enters CRM.
2. Admin prepares and sends a quote.
3. Customer opens the secure quote URL.
4. Customer accepts the quote; one order is created for that quote.
5. Order starts as `PAYMENT_PENDING / UNPAID`.
6. Customer chooses secure online checkout or bank transfer.
7. Online checkout creates/reuses an Airwallex PaymentIntent for the exact outstanding order balance.
8. Airwallex Hosted Payment Page handles card/wallet/local payment details. MING EAGLE never stores card numbers.
9. Webhook is the source of truth for payment completion.
10. `payment_intent.succeeded` creates an immutable payment record and reconciles the order.
11. Fully paid order becomes `PAID`; payment task closes; fulfillment task opens; lead becomes `WON`; company becomes `CUSTOMER`.
12. Admin progresses the order through PROCESSING -> READY_TO_SHIP -> SHIPPED -> DELIVERED -> COMPLETED -> REORDER.

## Cloudflare Pages environment variables

Configure these as encrypted production secrets for the project that serves `app.mingeagle.com`:

- `AIRWALLEX_CLIENT_ID`
- `AIRWALLEX_API_KEY`
- `AIRWALLEX_WEBHOOK_SECRET`
- `AIRWALLEX_ENV`

Use `AIRWALLEX_ENV=sandbox` for testing and `AIRWALLEX_ENV=prod` only after the production account and payment methods are active.

Never commit API credentials to GitHub.

## Webhook

Notification URL:

`https://app.mingeagle.com/api/payments/airwallex/webhook`

Subscribe at minimum to:

- `payment_intent.succeeded`
- `payment_intent.pending`
- `payment_intent.pending_review`
- `payment_intent.requires_customer_action`
- `payment_intent.requires_payment_method`
- `payment_intent.payment_failed`
- `payment_intent.cancelled`

The endpoint verifies Airwallex `x-timestamp` and `x-signature` against the raw request body, rejects stale/invalid signatures, records webhook event IDs for retry-safe processing, and keeps provider PaymentIntent status attached to the order.

## Payment safety rules

- Charge amount is always calculated from the server-side order balance.
- A browser cannot supply or change the amount.
- Existing active PaymentIntent sessions are reused for up to two hours to reduce accidental duplicate intents.
- Pending/Pending Review payments block a second online payment attempt.
- Payment success is never inferred only from browser redirect.
- Webhook retries are idempotent.
- Provider payment references are unique in the payment ledger.
- Overpayment is recorded and creates an urgent review task rather than being silently ignored.
- Manual ACH/Wise/bank transfers can still be recorded by an admin and use the same order payment ledger.

## Sandbox acceptance test

Run all of these before switching to production:

1. Successful card payment.
2. Failed card payment and retry.
3. 3DS/customer-action flow.
4. Pending/asynchronous payment flow if available.
5. Close the browser before return; verify webhook still marks the order paid.
6. Re-send the same webhook event; verify no duplicate payment is created.
7. Double-click checkout; verify the active PaymentIntent is reused or blocked while pending.
8. Verify customer page changes from UNPAID to PAID.
9. Verify admin order payment history contains provider `AIRWALLEX` and the PaymentIntent ID.
10. Verify fulfillment task is created only after payment success.

## Go-live gate

Do not set `AIRWALLEX_ENV=prod` until:

- Airwallex Payments is activated.
- Required payment methods are Active/Enabled.
- Production Client ID/API Key are created.
- Production webhook subscription is active and delivery test succeeds.
- Sandbox acceptance tests pass.
- A low-value real production transaction is tested and reconciled before normal customer use.
