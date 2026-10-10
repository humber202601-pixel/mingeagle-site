# V30 — Safe activation of Turnstile on MING EAGLE public inquiry forms

## Behavior and safety
- By default Turnstile is **off**, and all existing inquiry flows continue working with current D1 IP throttling and HubSpot backup.
- Cloudflare Pages environment variables for the `app.mingeagle.com` project:
  - `TURNSTILE_SITE_KEY` — public website site key (not secret);
  - `TURNSTILE_SECRET_KEY` — encrypted server-only secret;
  - `TURNSTILE_ENABLED` — set to `1` **only after** the official site, both keys and all accepted hostnames have been configured and tested.
- Create a Turnstile widget for hostnames `www.mingeagle.com`, `mingeagle.com`, `app.mingeagle.com` in the Cloudflare Turnstile console. Use Cloudflare's Managed mode.
- Public clients obtain their sitekey and current enabled mode through `GET https://app.mingeagle.com/api/turnstile-config`; this endpoint never returns secret keys.
- Accepted actions must equal `mingeagle_inquiry`. Server Siteverify rejects empty, expired, reused or otherwise failed challenge tokens and mismatched action/hostname. Failure occurs **before the D1 lead/inquiry is written**.
- Only the protected server-internal HubSpot backup recovery path bypasses browser Turnstile. Raw anonymous POSTs (including missing Origin header) are required to verify once enabled.
- On challenge failure/temporary unavailability the public website must **not** auto-fallback to the HubSpot form without verification. Instead it displays a safe error and the existing manually launched email/WhatsApp options.
- The secondary `app.mingeagle.com/wholesale` and `/sample` forms also obtain a challenge; they do not silently bypass protection.
- The admin-only production health card explicitly shows `Turnstile enabled`, `configured but disabled`, `misconfigured`, or `off`, without surfacing secrets.
- Never enable the toggle by itself. An enabled flag without both keys intentionally blocks public inquiries and warns in the admin panel.
- Official reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ and https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/

## Activation checklist
1. Configure the Turnstile widget hostnames in Cloudflare and copy the site's **public sitekey**.
2. Add both keys to the *production* Cloudflare Pages environment, with `TURNSTILE_SECRET_KEY` encrypted. Do not send secret to ChatGPT or commit it to GitHub.
3. Ensure `TURNSTILE_ENABLED` remains `0` initially. Confirm `/api/turnstile-config` says `enabled:false` and actual customer forms still work.
4. Turn `TURNSTILE_ENABLED` to `1`, deploy/redeploy the Cloudflare Pages configuration, then reload the public website. Confirm the widget appears and returns a challenge token.
5. Submit one authorized test inquiry and confirm the exact matching ME reference in D1. Force an invalid/missing challenge and verify a rejection **without** CRM records or HubSpot fallback.
6. Verify mobile, Chrome and browsers with privacy extensions; if Turnstile cannot load, provide the customer with manual email/WhatsApp contact and fix the provider policy/configuration.
7. Review Turnstile analytics and D1 usage in the Cloudflare dashboard. Any credential failure should be repaired by encrypted env changes, not by placing secrets in browser HTML.

## Important limitations
Cloudflare deployment success or local mocks do **not** demonstrate a real successful challenge at www.mingeagle.com. Production activation and real-world acceptance require an authorized Cloudflare environment configuration and a consenting test request.
