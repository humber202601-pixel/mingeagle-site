# MING EAGLE inquiry integration

The custom website form submits to HubSpot's public Forms API. Public identifiers are in `public/inquiry-config.js`; access tokens must never be included in static files. The receiving form is **MING EAGLE Website Inquiry**, portal **247596371**, GUID **eef6eb0b-5533-416f-9bda-7017b3160456**.

The receiver contains all fields listed in `inquiry-setup.json`. Every product's selected size/color is preserved as a separate line in `me_product_configuration`. Reference and request type are dedicated properties. Optional empty contact fields are omitted so repeat inquiries do not erase existing contact details. Inquiry-specific product and quantity fields explicitly show `No product selected` and `Not applicable to this request` when the new request does not supply them, preventing old quote requirements from appearing to belong to a new question. Delivery, campaign and order-support metadata are retained in `me_inquiry_details`. Form submissions preserve the history; contact properties show the latest supplied contact details and latest inquiry requirements.

The live website domain **www.mingeagle.com** is registered in HubSpot Settings → Tracking & Analytics → Advanced Tracking → Additional site domains. Keep this domain registered when replacing the form; HubSpot quarantines submissions from unregistered domains even when its Forms API returns HTTP 200. Bot filtering remains enabled.

The receiver always creates a new contact for a new email, avoiding cookie-based overwrites on shared devices. Matching emails attach submissions to the existing contact. Submission notifications use the existing account recipient. No marketing auto-reply is configured.

The website treats only HTTP 200 from the receiver as accepted. Rejected requests, rate limiting and ambiguous network/server failures keep the request and expose direct-contact options. Ambiguous delivery is described as unconfirmed, not failed. The client reference is persisted with the submission. The confirmation page renders received status only for an accepted submission retained in the current browser session; the reference is not an order-tracking identifier.

If the receiver is replaced, create the same property definitions, add them to a published form, and replace `formId`. To temporarily switch to direct contact, set `enabled:false`. This prepares a readable request with explicit email/WhatsApp sending instructions and never claims it was submitted.

Product source data is `public/product-master.json`; the deploy finalizer applies canonical specs. Customer copy corrections in `admin/inquiry-copy.json` prevent deployment from restoring editorial wording. Site and inquiry script version is `20261007-6`.

## Community submissions

Stories and video links use the same published HubSpot receiver through `forms-core.js` and `community.js`. Request types are `Story submission` and `Video submission`; `message` stores the full story or video caption, media URL, rating/platform and permission choice. `me_inquiry_details` stores the URL and permission metadata together with the source page and campaign. Privacy consent is required for both. Story feature permission stays optional and explicitly records `Not granted; do not publish` when unchecked. Video rights confirmation remains required. Website submission does not publish any content automatically.

The latest contact fields are a snapshot, not the complete case history. Open the contact's form submission events to inspect each earlier reference and submission. Match emails to the existing contact; do not create manual duplicate records for separate submissions. Notification settings remain those of the existing form; actual inbox delivery is a separate check.

Success pages identify inquiry, story or video using an accepted session receipt, never a URL flag alone. Support requests use support steps; community submissions use editorial review steps. Invalid, future-dated or expired receipt data does not render a success claim. Empty inquiry messages and customer categories explicitly identify missing data for the latest request instead of inheriting an earlier submission.

Failures retain entered text, reference and permission selections and show email/WhatsApp options with explicit manual sending. There is no automatic retry after ambiguous delivery. Buttons start disabled until the form handler loads; direct contact remains available without JavaScript.

`public/assets/qa-test-video.mp4` is a three-second synthetic TEST ONLY slate made for delivery verification. It is not customer media, an advertisement or a testimonial. Do not publish it on the creator wall.

## Other page behavior

Tracking supports form/Enter submission, validates basic number format, measures available width and provides a visible 17TRACK fallback link. Embedded results do not prove that an order was shipped or delivered. Site language initialization tolerates blocked browser storage. Pages include canonical URLs, a keyboard skip link and a main landmark; receipts and the custom 404 page are excluded from search indexing. The sitemap contains public content pages only.

After changing the receiving form, verify one clearly labeled QA inquiry from the public site and compare the confirmation reference, contact properties and form submission count. Do not delete existing customer records or trigger external customer emails as part of testing.
