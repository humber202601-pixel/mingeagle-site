# MING EAGLE V2 Architecture

## Goal
Build a zero-monthly-cost commercial operating system around MING EAGLE Silent Ball products.

One ecosystem, two interfaces, one database:

- `www.mingeagle.com` — customer-facing website
- `app.mingeagle.com` — internal Growth Engine / sales operations
- Cloudflare Pages + Pages Functions — hosting and API
- Cloudflare D1 — primary operational database
- GitHub — source of truth for code
- HubSpot Free — optional sync for qualified CRM records only

## Core customer loop

Visitor -> Product -> Inquiry / Sample -> Lead -> Quote -> Accept -> Order -> Payment record -> Shipment -> Delivery -> Reorder

## Public website

- Home
- Silent Ball product family
- Product detail
- Wholesale
- Sample request
- FAQ
- Contact
- Quote view / acceptance
- Order status
- Customer account (phase 2)

## Internal app

### Dashboard
- New leads
- Open inquiries
- Quotes waiting
- Orders in progress
- Follow-ups due
- Reorder opportunities

### Growth
- Find Customers
- Leads
- Companies
- Contacts
- Lead scoring
- Data sources and evidence

### Sales
- Inbox
- Follow-ups
- Tasks
- Inquiries
- Samples
- Quotes
- Orders

### Commerce
- Products
- SKUs
- Pricing tiers
- Inventory status
- Shipping / tracking

### Customers
- Customer profile
- Full activity timeline
- Order history
- Reorders

### Automation
- Next Best Action
- Follow-up rules
- Lead scoring rules
- Reorder reminders
- HubSpot sync rules
- Email templates

## Data ownership
D1 is the system of record. HubSpot is not the primary database.

Only qualified leads should be synced to HubSpot. Deals are created only when there is a real buying signal such as a positive reply, sample request, price request, wholesale inquiry or quote discussion.

## Zero-cost rule
The core app must continue operating without paid APIs.

Paid enrichment, AI APIs, email services and payment processors must be optional enhancements, never hard dependencies.

If a free quota is exhausted, the affected feature should fail safely or pause rather than automatically create paid usage.

## Security principles
- Never commit secrets to GitHub.
- Use Cloudflare environment secrets/bindings.
- Admin and customer auth use secure password hashing / sessions.
- Every public form is validated server-side.
- Add Turnstile before public launch of write-heavy forms.
- All record mutations keep timestamps and activity history.
