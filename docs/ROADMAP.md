# MING EAGLE V2 Development Roadmap

## Phase 0 — Foundation
Status: IN PROGRESS

- Safe development branch
- Architecture document
- React/Vite frontend shell
- Cloudflare Pages Functions API shell
- D1 database schema
- Shared types
- Environment/config conventions

Exit criteria: local/buildable project with `/`, `/app`, `/api/health` and database migrations committed.

## Phase 1 — Public Silent Ball website

- Restore and improve the proven Silent Ball storefront
- Product family pages
- Retail / wholesale CTAs
- Sample request
- Wholesale inquiry
- FAQ / shipping / returns / privacy
- SEO metadata
- Mobile-first layout

Exit criteria: a visitor can understand the products and submit a structured inquiry or sample request.

## Phase 2 — Core internal sales backend

- Admin dashboard
- Companies
- Contacts
- Leads
- Inquiries
- Tasks / follow-ups
- Activity timeline
- Search / filters
- Lead status lifecycle

Lifecycle:
DISCOVERED -> QUALIFIED -> READY_TO_CONTACT -> CONTACTED -> REPLIED -> INTERESTED -> SAMPLE -> QUOTE -> NEGOTIATION -> WON

Side states:
NOT_FIT / NO_RESPONSE / NOT_INTERESTED / LOST / DO_NOT_CONTACT

Exit criteria: every website inquiry automatically appears in the internal backend and can be managed to the next action.

## Phase 3 — Quotes and orders

- Quote builder
- Quote items / shipping / discounts / validity
- Shareable quote URL
- Quote view tracking
- Accept quote
- Convert quote to order
- Order status workflow
- Payment recording
- Shipping carrier / tracking
- Delivery / completion

Order lifecycle:
DRAFT -> CONFIRMED -> PAYMENT_PENDING -> PAID -> PROCESSING -> READY_TO_SHIP -> SHIPPED -> DELIVERED -> COMPLETED

Exit criteria: one inquiry can be taken from quote to completed order without external spreadsheets.

## Phase 4 — Customer portal and reorder

- Customer account
- My inquiries
- My quotes
- My orders
- Tracking
- Reorder
- Saved product configuration
- Customer messages

Exit criteria: an existing buyer can see history and start a repeat order with minimal data entry.

## Phase 5 — Growth Engine

- Find Customers search workspace
- Company discovery
- Website intelligence
- Decision-maker records
- Public contact evidence
- Deduplication
- Lead scoring
- Contact quality score
- Opportunity score
- Next Best Action

Lead Score: product fit + decision maker + contactability + order potential + activity + friction.

Exit criteria: discovered prospects can enter the same CRM and sales workflow as inbound website leads.

## Phase 6 — Outreach and reply automation

- Email templates
- Outreach sequences
- Manual approval mode first
- Follow-up schedule
- Reply intent classification
- Stop rules
- Unsubscribe / do-not-contact
- Inbox timeline
- Automatic task creation

Exit criteria: outbound sales can be managed from one internal system without losing message context.

## Phase 7 — Automation and learning

- Rule engine
- Lead-score recalculation
- Follow-up reminders
- Stale-lead alerts
- Reorder reminders
- Quote expiry reminders
- Shipping follow-up
- Conversion analytics
- Query / source yield tracking
- Product/customer segment learning

Exit criteria: the system continuously suggests the next action and reduces repeated manual checking.

## Phase 8 — Optional integrations

Only if useful and still free / economically justified:

- HubSpot qualified-lead sync
- Stripe payment links or checkout (transaction fee only)
- Gmail / business email integration
- Apollo / Hunter enrichment
- AI reply assistance
- R2 file storage

These are optional and must never be required for the core operating system to function.
