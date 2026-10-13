# Static performance regression budget (laboratory precursor)

The public website is hosted on GitHub Pages from the `main` branch. Run `node scripts/check-performance-budget.cjs` against the built `public/` tree, after the existing image and content generators. The checker has **no network calls** and **does not modify website files or send customer data**.

It compares raw file sizes against conservative budgets reflecting the site's 2026-10-13 baseline (public ~4.46MB, images ~3.11MB, JavaScript ~0.82MB). Budgets are: all public files <=5.7MB; product assets images <=3.8MB; first-party JS <=1.1MB; one image <=330KB; one homepage product hero <=280KB; one JS asset <=550KB. This aims to catch accidental large binary or inline JS growth before deployment, not to prevent justified, reviewed design changes.

**Critical distinction:** static bytes are *not* compressed transfer size, Core Web Vitals, Lighthouse mobile performance, or end-user load times. Google CrUX isn't configured for this property and currently has insufficient verified field metrics here. Do not claim an LCP/INP/CLS improvement from these tests alone. A separate, controlled field or laboratory audit is still needed. The large `custom-logo-model.js` is presently loaded only on the custom-logo design page; avoid breaking the working customer 3D studio in pursuit of cosmetic score gains.
