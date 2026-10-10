# Cloudflare scheduled Worker build: configuration audit and remediation

## Why this is flagged

The connected Cloudflare Workers Builds status for `mingeagle-followup-scheduler` has failed on multiple commits, while GitHub discovery integration tests and `npx wrangler deploy --config wrangler.scheduler.toml --dry-run` complete successfully. These signals show that local Worker bundling passes, **not** that Cloudflare has deployed the scheduler or that its cron events are executing. The exact remote build log must be inspected before declaring the root cause.

This repository deliberately holds two different Wrangler configurations:

- `wrangler.toml` is for the Cloudflare Pages website (`name = "mingeagle-v2"`, `pages_build_output_dir = "./dist"`).
- `wrangler.scheduler.toml` is for the scheduled Worker (`name = "mingeagle-followup-scheduler"`, `main = "workers/followup-scheduler.ts"`).

Cloudflare Workers Builds normally executes `npx wrangler deploy`. If that is the connected Worker's deploy command, Wrangler may read the Pages configuration instead of the scheduled Worker configuration, leading to a target mismatch. **Verify this with the actual Cloudflare build log.** Do not change the Pages config to work around a Worker-only setup issue.

## Check in Cloudflare

1. Open Cloudflare Dashboard → Workers & Pages → `mingeagle-followup-scheduler` → Settings → Builds.
2. Inspect the failed build log and its current Build/Deploy/Preview commands and production branch.
3. If the default deploy command is being used and the log shows it selects the wrong config, use:
   - Root directory: repository root
   - Production branch: `v2-cloudflare`
   - Deploy command: `npx wrangler deploy --config wrangler.scheduler.toml`
   - Preview command, if editable: `npx wrangler versions upload --config wrangler.scheduler.toml` (or use the platform's supported preview command with the same `--config` flag)
   - Build command: optional; use `npm ci` if separate install is required by the selected workflow
4. Check that the Worker runtime variables and secrets (especially `ADMIN_ACCESS_KEY`) exist in **Worker runtime** settings, not only in Build settings; verify its D1 binding `MINGEAGLE_DB` and cron triggers.
5. Retry the failed build after saving settings. Confirm Worker deployment is green; then inspect Cron Trigger invocation logs and one passive discovery run.
6. Keep automatic outreach disabled until recipient consent and the email workflow have been separately checked. Do not use cron verification to send any customer emails.

The Worker uses `0 13 * * *` for scheduled follow-ups and `* * * * *` for discovery continuation. Every-minute invocations consume resources; review D1 usage and existing idle checks.

## Validation without publishing

```bash
npm ci
npm run test:discovery
npm run build
npx wrangler deploy --config wrangler.scheduler.toml --dry-run --outdir /tmp/mingeagle-scheduler-build
```

Reference: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
