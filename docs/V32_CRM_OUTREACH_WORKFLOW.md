# V32 — CRM lead → reviewed first outreach → inquiry conversion

## User-facing workflow

Open `app.mingeagle.com/app/leads`, click a specific lead, and use the
**客户沟通 · 审核后发送** panel. No outreach API is called automatically on
page load. Click Generate English draft explicitly.

- Uses CRM company/type/city/contact history to tailor product use cases.
- Supports actual discovery types including `BASKETBALL_TRAINING`,
  `BASKETBALL_GYM`, `YOUTH_CLUB`, `INDEPENDENT_COACH`,
  `SPORTS_STORE`, `SPORTS_DISTRIBUTOR`, schools and youth programs.
- First outreach explicitly recommends `https://www.mingeagle.com` and
  asks for interest, approximate quantity and delivery ZIP; it does not
  invent wholesale prices, stock, shipping times, margins or availability.
- Subject and body can be edited in the browser without writing CRM records.
- Copy and `mailto:` are user-initiated; they are **not** recorded as sent
  in CRM because the platform cannot observe whether the user pressed Send
  in an external mail client.
- Gmail server send is enabled only after a checkbox acknowledging review
  and a separate confirmation dialog. Gmail OAuth production secrets are
  required; if unavailable the backend returns an error and the user may
  use their own email client.
- The backend suppresses emails for `DO_NOT_CONTACT`,
  `NOT_INTERESTED`, `NOT_FIT` and contact-level opt-outs.
- The previously existing email queue also uses the discovery customer
  categories and is checked for `DO_NOT_CONTACT` and client opt-outs.
- Automatic follow-ups remain subject to the separate worker-level
  `AUTO_EMAIL_ENABLED` flag; initial cold email drafts remain subject
  to manual approval. No automatic cold sending is introduced by V32.

## Acceptance boundaries

- Unit/fixture tests confirm content, suppression, prompt action wiring and
  no external Gmail calls for excluded customers.
- CI build and Cloudflare deploy status are **not** proof of actual SMTP
  delivery or a real lead's response.
- Do not send a real test to an unrelated commercial contact. If testing
  Gmail, use an owned consenting test mailbox and verify that one
  outbound Gmail message, one CRM message and one follow-up task appear.
- Confirm that no personal contact info is guessed when fields are absent
  and that email/Web/WhatsApp copied from public sources is correctly tied
  to the discovered organization.
- To evaluate conversion, track actual per-segment reply/quote/order counts
  after authorized first outreach. Do not claim improved sales without
  production evidence.

## Operational cost

The composer does no background polling, makes no D1 write when previewing
or editing a draft, and fetches a draft only when the operator clicks Generate.
This is compatible with the D1 free-tier-first design.
