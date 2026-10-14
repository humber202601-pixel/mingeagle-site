# Retail Checkout with destination sales tax

The previous retail route only admitted reviewed no-collection states. This
change also supports an explicitly reviewed `COLLECT_WITH_STRIPE_TAX` decision
with a real registration reference for the same seller. It is not evidence that
the merchant has registered with any state or that nationwide live checkout is
enabled. No merchant facts, sales history, or live registration are invented.

For each collection state, production policy needs a current review and
`registration_references[state]` documenting the actual entity's registration.
The API checks an active, same-mode Stripe `state_sales_tax` registration both
before creating the retail order and before starting payment. A missing or
unreadable registration never becomes a zero-tax decision.

The delivery address is saved to a dedicated Stripe Customer. Checkout uses its
saved shipping address; neither shipping address collection nor customer address
updates are enabled in Checkout. Products and delivery have explicit physical
goods and shipping tax codes, with exclusive tax behavior. Stripe must return a
completed automatic tax calculation and a reconciled USD total before its URL
is exposed. The session stores the base, tax, destination and customer snapshot.

Only a signed successful callback with the same order, customer, destination,
tax calculation and total finalizes quote/order tax and records the full payment.
The customer sees a tax-pending amount until payment, then the actual tax and
total. Provider retries cannot create another receipt or fulfillment task.

Apply migration `0015_stripe_automatic_tax.sql` before deploying the new webhook.
Special registration types (such as local-only registrations) need a separate
review before inclusion. Stripe registration configuration is not a substitute
for government registration. Existing no-collection and bounded startup routes
are unchanged. Actual US business/sales facts remain pending review.

Primary implementation references:
- https://docs.stripe.com/tax/checkout/page
- https://docs.stripe.com/api/customers/create
- https://docs.stripe.com/api/tax/registrations/object
