# Deploying RoofDesk

This guide describes an optional self-hosted Docker deployment on a server you rent (about 2 CPU, 4 GB memory, 40 GB disk to start). The current live deployment is on Vercel with MongoDB Atlas; use its readiness and Atlas backup instructions below instead of the Docker backup container.

None of this has been run end to end yet. Do the first deployment on a throwaway server and a throwaway domain, and test a restore, before you trust it with real customers.

## What you need
- A Linux server (Ubuntu 24.04 is assumed) with Docker and the Docker Compose plugin installed.
- A domain name, with an `A` record pointing at the server.
- This code in a GitHub repository.
- Keep the Next.js dependency on a patched release in the 15.5 line. The lockfile currently
  pins 15.5.28; GitHub dependency-audit results are the release gate for security advisories.
- Payment simulation is the default (`PAYMENT_PROVIDER=mock`). Both Razorpay flags remain false by default in source. `RAZORPAY_API_ENABLED=true` is configured only as a Vercel Preview override for the `staging` branch; Production is unchanged and must remain disabled. The Test Mode integration and India milestone creation/readiness path are deployed to staging commit `505b224`; its CI run #63 passed and the Vercel Preview is Ready. One staging company has Test credentials saved in Settings. On 2026-11-11, one ₹100 synthetic Test Mode payment completed; Razorpay showed Paid and Roofora showed ₹100 collected / Paid, confirming the webhook signature-validation and payment-update path. The Test webhook was disabled again at 1:01 PM IST; its individual HTTP delivery response was not separately inspected. Local payment test additions remain outside CI #63. Each contractor account receives its own payments directly; Roofora does not collect or split funds. Legacy Stripe settings apply only to the existing Stripe provider path.

## Vercel scheduled reminders

`vercel.json` schedules `/api/v1/cron/reminders` daily at 09:00 UTC. Vercel Cron invokes scheduled routes only on Production deployments, not Preview deployments. Before promoting this schedule to production, add a `CRON_SECRET` environment variable to the Vercel Production environment (at least 32 random characters; for example, generate with `openssl rand -hex 32`) and redeploy. The endpoint fails closed if the secret is missing or invalid. Each run creates at most one in-app reminder per overdue open/blocked Operations task, recipient, and UTC day. It does not send email or SMS. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) and [securing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The photo upload queue stores pending files in IndexedDB in the current browser profile (up to 100 MB) and retries when connectivity returns while the user is signed in. Files are not backed up remotely until the upload completes. Clearing site data or losing the device can remove pending files.

## 1. Prepare the server (once)
```bash
sudo mkdir -p /opt/roofdesk && sudo chown $USER /opt/roofdesk && cd /opt/roofdesk
# copy these from the repository: docker-compose.prod.yml, deploy/ (Caddyfile, backup.sh, restore.sh), .env.production.example
cp .env.production.example .env && chmod 600 .env
openssl rand -base64 756 > deploy/mongo-keyfile && chmod 400 deploy/mongo-keyfile   # lets the database nodes trust each other
```
Edit `.env`: set `DOMAIN`, `IMAGE_PREFIX` (`ghcr.io/<your-github-name>/<your-repo>`), `MONGO_PASSWORD` (`openssl rand -hex 24`), `JWT_ACCESS_SECRET` (`openssl rand -hex 32`), and email and payment settings. The API refuses to start in production if the secret still looks like a placeholder, if `WEB_ORIGIN` is not https, or if Stripe or Resend is chosen without its keys.

Open only ports 80 and 443 in the firewall (and 22 for SSH). The database is not exposed outside Docker.

## 2. Connect GitHub to the server (once)
In the repository, under Settings:
- **Environments**: create `production` and add yourself under *Required reviewers*. Every deployment then waits for your click.
- **Variables**: `DOMAIN` (the same as in `.env`).
- **Secrets**: `DEPLOY_HOST` (server address), `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a private key whose public half is in the server's `~/.ssh/authorized_keys`), `GHCR_PULL_TOKEN` (a GitHub token with only `read:packages`, so the server can pull images).
- After the first run, make the two published packages (`api`, `web`) accessible to the token.

Use a deploy-only SSH key, not your personal one. Consider pinning the actions in the workflow files to full commit versions.

## 3. Ship
Merge to `main`. CI runs the tests, then the Deploy workflow builds the images, waits for your approval, updates the server and checks `https://<domain>/ready`. If the check fails it switches back to the previous version automatically.

The first time, start things by hand so you can watch them: `docker compose -f docker-compose.prod.yml up -d && docker compose -f docker-compose.prod.yml logs -f`.

## 4. Payment flows
### India contractor-owned Razorpay Payment Links
1. Keep `PAYMENT_PROVIDER=mock`; set `RAZORPAY_LINKS_ENABLED=true` only in a non-production environment after review. No Razorpay API key is stored by Roofora for this MVP.
2. Each contractor creates a Razorpay Payment Link in its own account for the exact INR amount and pastes its secure short link (`https://rzp.io/i/...`) while requesting payment. The payer page identifies the contractor as service provider and opens Razorpay; funds go directly to that contractor.
3. An Owner/Admin checks Razorpay Dashboard for **Captured**, the exact amount/currency, and the Payment ID, then records it in Roofora with step-up password confirmation. Roofora cannot verify that assertion automatically.
4. Refunds and link deactivation must be done directly in Razorpay. External refunds will not update Roofora's ledger or payment reports. Automatic webhooks, refunds, reconciliation, and external link cancellation are not implemented. Test this full flow with Razorpay test mode before considering production.

### Razorpay API-created Test Mode links (integration and India milestone UI deployed to Preview)

The API integration is enabled in Vercel Preview for branch `staging` only. The India milestone creation path is included in commit `505b224`, whose Preview is Ready at https://contractor-portal-git-staging-mohith-c47e.vercel.app/. GitHub CI run #63 passed for that commit. Production remains unchanged. The focused and full API test results, plus the external validation still pending, are recorded in [Razorpay Test Mode setup and status](RAZORPAY_TEST_MODE.md).

1. Keep `PAYMENT_PROVIDER=mock` and `RAZORPAY_LINKS_ENABLED=false`. **Completed for Vercel Preview branch `staging` on 2026-11-05:** `RAZORPAY_API_ENABLED=true`, a secret 32-byte Base64 `RAZORPAY_CREDENTIALS_ENCRYPTION_KEY`, and `PUBLIC_API_URL=https://contractor-portal-git-staging-mohith-c47e.vercel.app` are configured. The key is stored only in Vercel and is not recorded here. The key was rotated before the latest redeploy; no company credentials had been encrypted with the earlier value. Never put the encryption key in source control or chat.
2. Each Indian company Owner/Admin connects that company's Razorpay Test Key ID (`rzp_test_...`), Test Key Secret, and Test webhook secret in Settings. Secrets are encrypted per company and not returned after save. One staging company now shows its credentials saved; the app has not yet verified them against a payment or webhook request.
3. Add a Razorpay Test Mode webhook to the per-company URL displayed in Roofora Settings, for `payment_link.paid`, `payment.failed`, `refund.processed`, and `payment.captured`.
4. Run success, failure, duplicate/delayed webhook, amount mismatch, refund notification, and tenant isolation checks with synthetic staging data. A payment is marked paid only after a valid signed event. Refunds and link deactivation remain manual in Razorpay; API refunds and full provider reconciliation are not implemented.
5. On 2026-11-06, the focused Razorpay tests passed (15/15) and the full API suite passed (121 tests across 22 files); API typecheck passed. GitHub CI run #63 passed for commit `505b224`, and its staging Preview reached **Ready**. One staging company has Test credentials saved. On 2026-11-11, one ₹100 Test Mode transaction updated the synthetic Roofora payment to Paid through the signature-verifying webhook path; the Test webhook was disabled again at 1:01 PM IST. The webhook's individual HTTP response log was not separately reviewed. The expanded test changes and relay work are local and not included in CI run #63. Still test failed/duplicate/delayed/refund/mismatch events and tenant isolation. Do not enable Live keys.

## Release verification status (2026-11-03)

- Commit `16f1a5c` added the feature-gated contractor-owned Razorpay Payment Link MVP and was pushed to `main`.
- Its GitHub CI run failed: dependency audit flagged the pinned Next.js 15.5.24 release, and the isolated RoofV quota test failed during import because it parsed unrelated required API environment values.
- Follow-up changes pin Next.js to 15.5.28, defer API environment loading until the provider needs it, upgrade Zod to 4.6.7, and lock body-parser to 1.20.9. The local `pnpm audit --prod --audit-level=high` reports no high/critical vulnerabilities (two moderate advisories remain).
- GitHub CI for commit `53c3f47` passed typecheck, shared/API tests, and production build; its audit ran before the Zod/body-parser follow-up. CI for `59a48d9` stopped at frozen install because the pnpm override metadata did not match the repo's declared pnpm 9.12. The override has been aligned with the root package configuration; local frozen install now succeeds.
- Local pnpm 9.12 checks with the updated dependencies: typecheck passed; shared/estimate tests passed (44); API tests passed (107); high-severity production audit passed (two moderate advisories remain).
- The local web build with Next.js 15.5.28 compiled and generated all static pages, but standalone trace packaging failed because Windows denied symlink creation (`EPERM`). The API production bundle built successfully. Use the Linux CI build as the packaging verification.
- The browser suite for `53c3f47`, `6368067`, `0e7852b`, `77ca5f5`, and `f9e8a6b` found color-contrast violations. CI for `f9e8a6b` passed install, typecheck, shared/API tests, production build, and dependency audit; browser E2E passed 32 tests but found one disabled-primary-button contrast failure. The current follow-up sets an explicit slate background, light text, and full opacity for disabled primary buttons. Await fresh CI before deployment. Local typecheck was blocked because available pnpm is 11 rather than the pinned 9.12 and workspace symlink creation was denied (`EPERM`).
- Keep `RAZORPAY_LINKS_ENABLED=false` in all environments and `RAZORPAY_API_ENABLED=false` in Production. The API-created Test Mode flow is enabled only in Preview for branch `staging`; no contractor account Test flow has yet been validated in Roofora and no Live Razorpay flow is approved.

### Legacy Stripe provider path
1. In Stripe test mode, set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
2. In the Stripe dashboard add a webhook to `https://<domain>/api/v1/webhooks/stripe` for: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Run a test payment, a failed card, and a refund. Check the Payments page reconciliation. Only then use live keys.

## Backups and restore

The Vercel production app uses MongoDB Atlas; the Docker backup service below applies only to the separate self-hosted Compose deployment. Atlas Free (`M0`) does not provide managed Atlas backups, so create manual archives with `deploy/backup-atlas.ps1` and rehearse a non-destructive restore with `deploy/restore-atlas-drill.ps1`. Follow [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for setup and the restore drill. For automated Atlas snapshots and point-in-time recovery, use a cluster tier that supports Cloud Backup.

### Self-hosted Docker deployment only

- The `backup` service writes a compressed database copy to `/opt/roofdesk/backups` every 24 hours and keeps `BACKUP_KEEP_DAYS` days.
- **Copy those off the server** (another machine or a storage bucket). A backup on the same disk does not survive losing the server.
- Uploaded files are in the `uploads` Docker volume (unless `STORAGE_DRIVER=s3`). Back it up too:
  `docker run --rm -v roofdesk_uploads:/data -v $PWD/backups:/b alpine tar czf /b/uploads-$(date +%F).tgz -C /data .`
- Restore: stop the API, run `./deploy/restore.sh backups/<file>`, start the API. **Practise this once** on a test server.

## Monitoring

The `Production monitor` GitHub Actions workflow checks the production site, API liveness and database readiness every 15 minutes. It targets the project's Production domain and is enabled after this workflow reaches the repository's default branch. Enable GitHub Actions failure notifications for your account/repository so failed checks alert the owner. See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for interpreting probes and the recovery checklist.

## Day-to-day
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`
- Roll back by hand: set `TAG=<an earlier 12-character version>` in `.env`, then `docker compose -f docker-compose.prod.yml up -d`.
- Updates to the server's operating system and Docker are your job; turn on automatic security updates.

## Known limits
- One server, one API process. Live updates and rate limits are kept in that process's memory; running several API servers needs Redis first (see the README).
- GitHub Actions availability checks do not replace a dedicated uptime provider or Atlas alerting. Configure Atlas alerts for database availability, storage thresholds and backup failures when the cluster tier supports managed backups.
- The Docker images and compose file have not been built or run in the environment this was written in.

## CI follow-up — 2026-11-05

The pasted browser-test output for `400a577` showed 4 failures, 29 passed, and 3 skipped. Failures were axe contrast scans on `/jobs` (primary button) and `/` (marketing signup button) in desktop and phone projects. The reported foreground/background values varied across retries, consistent with scans sampling an in-progress color transition. E2E scans now request reduced motion, move the pointer away, and briefly wait before axe runs. Local web typecheck (`apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`), `git diff --check`, and Playwright test discovery (`apps/web/node_modules/.bin/playwright.cmd test --list`, 36 tests listed) passed. Commit `057df3900e7e993a6edb155bdbdeaaec0a44baee` was pushed to `main`; GitHub CI run [42006274678](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42006274678) passed all three jobs: dependency audit, types/tests/build, and browser tests. Vercel Production reports Ready at https://contractor-portal-e1i3bmk6r-mohith-c47e.vercel.app. The separate self-hosted deployment run [42006968318](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42006968318) failed while building the web image; its server-deploy job was skipped. The Actions log endpoint returned 403 for lack of repository admin rights, so the precise cause is not verified.
