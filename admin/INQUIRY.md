# MING EAGLE inquiry integration

The custom website form submits to HubSpot's public Forms API. Public identifiers are in `public/inquiry-config.js`; access tokens must never be included in static files. The receiving form is **MING EAGLE Website Inquiry**, portal **247596371**, GUID **eef6eb0b-5533-416f-9bda-7017b3160456**.

The receiver contains all fields listed in `inquiry-setup.json`. Every product's selected size/color is preserved as a separate line in `me_product_configuration`. Reference and request type are dedicated properties. Optional empty contact fields are omitted so repeat inquiries do not erase existing contact details. Inquiry-specific product and quantity fields explicitly show `No product selected` and `Not applicable to this request` when the new request does not supply them, preventing old quote requirements from appearing to belong to a new question. Delivery, campaign and order-support metadata are retained in `me_inquiry_details`. Form submissions preserve the history; contact properties show the latest supplied contact details and latest inquiry requirements.

The live website domain **www.mingeagle.com** is registered in HubSpot Settings → Tracking & Analytics → Advanced Tracking → Additional site domains. Keep this domain registered when replacing the form; HubSpot quarantines submissions from unregistered domains even when its Forms API returns HTTP 200. Bot filtering remains enabled.

The receiver always creates a new contact for a new email, avoiding cookie-based overwrites on shared devices. Matching emails attach submissions to the existing contact. Submission notifications use the existing account recipient. No marketing auto-reply is configured.

The website treats only HTTP 200 from the receiver as accepted. Rejected requests, rate limiting and ambiguous network/server failures keep the request and expose direct-contact options. Ambiguous delivery is described as unconfirmed, not failed. The client reference is persisted with the submission. The confirmation page renders received status only for an accepted submission retained in the current browser session; the reference is not an order-tracking identifier.

If the receiver is replaced, create the same property definitions, add them to a published form, and replace `formId`. To temporarily switch to direct contact, set `enabled:false`. This prepares a readable request with explicit email/WhatsApp sending instructions and never claims it was submitted.

Product source data is `public/product-master.json`; the deploy finalizer applies canonical specs. Customer copy corrections in `admin/inquiry-copy.json` prevent deployment from restoring editorial wording. Site and inquiry script version is `20261007-5`.

After changing the receiving form, verify one clearly labeled QA inquiry from the public site and compare the confirmation reference, contact properties and form submission count. Do not delete existing customer records or trigger external customer emails as part of testing.
