# Custom Logo

Customer studio at `public/custom-logo.html`, linked from desktop and mobile navigation.
Default copy is English; the existing site language selector translates the studio in all nine supported languages without discarding the current design.

Model source: approved `MING_EAGLE_LOGO_V0.3_Eight_Panel_Twin_Ellipse_2026-10-08.zip`.
The accepted vertex and fragment shaders are unchanged. Opposite ellipses use the same scale (0.83383796); the eight-panel geometry, ball colors, centered placement, relative ball sizes, fonts and print color rules are retained.

Supported products: flocked silent basketball set and weighted flocked silent basketball. Fabric-covered balls and soccer balls are excluded. Transparent or simple uniform image backgrounds can be removed locally. Complex artwork should use a transparent source file.

Confirmed designs remain available during the current visit. Customers can download SVG artwork and a JSON design record, then transfer validated product and design details into the existing quote form. This release does not claim automatic CRM artwork storage or manufacturing approval. Print dimensions and placement are illustrative until confirmed with the quote.

Verification runs during deployment using `scripts/deploy-finalize.py`: existing product/inquiry checks plus geometry, processing, localization, download and quote handoff checks. No live customer requests are sent by these tests.

When WebGL is unavailable, the Canvas compatibility renderer uses the same sphere, opposite-ellipse seam distance, orthographic projection, decal placement and lighting equations. The WebGL shaders remain unchanged. A flat artwork preview remains the final fallback if neither renderer is available.
