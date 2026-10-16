# RoofDesk: Roofing Contractor Portal

Build status: all ten steps of the implementation plan, plus claim photos, a company price list, an automated test suite, CI/CD and a production deployment setup. Foundation (auth, tenancy, jobs, measurements), estimates and claims, supplier orders, lien waivers with e-signature, payments with a ledger, notifications, live updates and reporting.

## Stack
- **Web:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, TanStack Query, React Hook Form + Zod
- **API:** Node.js, Express 4, MongoDB (Mongoose), Zod, JWT + rotating refresh tokens, Argon2
- **Packages:** `shared` (Zod schemas, types, permissions, claim and order state machines) and `estimate-engine` (pure money math, templates, diffs, material lists), both used by web and API
- **Local infra:** Docker Compose (MongoDB replica set, Redis, MinIO)

## Quick start
```bash
corepack enable && pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env      # set JWT_ACCESS_SECRET (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                    # web :3000, API :4000
```

## Try the full flow
1. Create a company account, add a job, **Measurements** tab: order an aerial report (mock provider, about 3 seconds).
2. **Estimate** tab: build the estimate from the report, edit lines, O&P, tax, depreciation; totals update live.
3. **Claim** tab: add carrier, policy and claim number; submit the claim (this locks the estimate version), log adjuster calls, move it to Approved with an amount, then create a **supplement** estimate version and file a supplement.
4. **Suppliers** page: add a supplier and map materials to SKUs and prices in its catalog.
5. **Orders** tab: create a purchase order from the estimate's material list, send it, open the one-time link it generates (`/confirm/<token>`) in a private window as the supplier, and confirm with a delivery window.
6. Open **Claim > Open claim packet** and print or save as PDF.
7. **Waiver forms** page (owner or admin): read the generic starter forms, edit them with your counsel, and approve each one. Waivers cannot be requested from an unapproved form.
8. **Waivers** tab on a job: add the suppliers and crews who must sign (with contract amounts), add payments (deposit, draws, final), then **Request missing waivers**. Open each one-time link (`/sign/<token>`) in a private window, type a name, draw a signature and sign.
9. Back on the job, watch the status board update, view a signed document and its integrity check, then **Mark payment ready**. If waivers are missing you are warned (or blocked, if the company setting is `block`).
10. **Payments** tab: a ready payment can now be billed. **Request payment**, copy the link, open it in a private window as the homeowner, press **Pay securely**, then choose **Simulate successful payment** on the test checkout page. The payment turns Paid, the ledger posts, the milestone becomes Paid and the job's collected total updates. (With `PAYMENT_PROVIDER=mock`, the default, no real money moves.)
11. As the owner, **Refund** part of that payment (re-enter your password). Refunds above $1,000 wait on the **Payments** page for a different admin or owner to approve. The same page shows a reconciliation check of the ledger.
12. Open the app in two browser windows (two users, or one normal and one private window with a second login). Sign a waiver or simulate a payment in one window: the other window's tabs refresh on their own, a toast appears, and the bell shows an unread count. Click the bell to jump to the item.
13. **Settings**: choose which kinds of notification are also emailed. With `EMAIL_PROVIDER=log` (default) emails are printed in the API console, including the secure links, so you can click them. Add an email to a waiver party, a payer or a supplier and the link is sent automatically.
14. **Business overview** (owner, admin or billing): collected by month, owed and overdue amounts, claim approval rate and cycle time, waiver aging, claims by status, supplier invoice variance, and **CSV exports** for jobs, payments, waivers and the ledger.
15. **Photos** tab on a job: take or upload photos, click a picture to mark hail hits or wind damage, tag the slope, then open the claim packet to see the marked photos printed with it.
16. **Price list** page: edit your unit prices, or import a CSV from Excel (bad rows are listed by number and nothing is imported). Saving creates a new version. New estimates use it, and the estimate builder can add any item from it.
17. **Admin Panel** (owner or admin): review company-wide job, claim, waiver, payment exception, late order, overdue task, missing-upload, and account counts; jump to recent jobs and inspect recent audit activity. Use **Team access** to invite Project Managers or Operations Interns. An existing Owner can also invite another Owner; admins cannot grant Owner access. Use the job's **Operations assignment** control to assign work. Follow-up due dates display as calendar dates across time zones, and overdue tasks receive daily in-app reminders. See `docs/OPERATIONS_WORKSPACE.md` for the admin and intern workflow.

## What is built
| Area | Status |
|---|---|
| Auth, rotating refresh tokens, tenancy plugin, RBAC, audit log | Done |
| Jobs and pipeline | Done |
| Measurements (provider adapter, mock provider, idempotent ordering) | Done (in-process, not queued) |
| Estimate engine: line math, O&P, tax, per-line depreciation, ACV/RCV, net claim | Done, 5 assertions run and passing |
| Estimate versions (original, carrier approved, supplement), locking, diff view | Done |
| Claim record, status machine, communication log, deductible sync | Done |
| Printable claim packet (browser print to PDF) | Done, includes selected annotated photos |
| Suppliers with SKU/price catalog | Done (catalog embedded in supplier) |
| Material list generator (squares and feet to bundles, rolls, pieces) | Done |
| Purchase orders, status machine, link-based supplier confirmation | Done (link is copied or emailed by the user; no email service yet) |
| Waiver parties, payment milestones, readiness rules (tested) | Done |
| Versioned waiver forms with a counsel-approval gate | Done (one generic form per waiver type, no per-state statutory forms) |
| Waiver requests (single and bulk by contract share), token links, resend, cancel | Done |
| Public signing page: typed name, drawn signature, consent, decline, expiry | Done |
| Immutable signed waivers with SHA-256 fingerprint and integrity check | Done |
| Payment gating: warn with override, or block | Done |
| Payment gateway adapter: hosted checkout only (card and bank details never reach our servers), mock and Stripe providers | Done; Stripe adapter not yet run against a Stripe account |
| Payment requests tied to ready milestones, payer link page, retry after failure | Done |
| Webhook endpoint: raw-body signature check, 5-minute replay window, event-id dedupe, amount re-check | Done; signature check and event mapping executed and passing |
| Double-entry, append-only ledger written in the same transaction as the payment | Done (needs the MongoDB replica set from Docker Compose) |
| Refunds with password re-check, dual approval above a threshold, gateway-side refunds picked up | Done |
| Internal reconciliation (ledger vs payment records, stuck refunds, disputes, stalled payments) | Done; gateway balance-report matching not built |
| In-app notifications (bell, unread count, mark read) for measurements, claims, supplier replies, waivers, payments, disputes and refund approvals | Done |
| Per-person email preferences by notification group | Done |
| Email sending behind an interface: log provider (development) and Resend over HTTP | Done; Resend not yet tried against a real account |
| Secure links emailed automatically to waiver parties, payers and suppliers; link text stripped from stored copies | Done |
| Live updates over Server-Sent Events: data refreshes in other open windows, toasts, notification push | Done; single API instance (see below) |
| Owner dashboard: collected by month, receivables, overdue, claim approval rate and cycle time, waiver aging, claims by status | Done, report math executed and passing |
| Owner/admin operations panel with company-scoped queues, recent jobs and audit activity | Done; API is restricted to owner/admin permissions |
| CSV exports (jobs, payments, waivers, ledger) with spreadsheet-formula protection | Done |
| Photos and PDFs: upload (camera or files), type read from the file's bytes, 15 MB limit, SHA-256, local disk or S3/MinIO storage | Done |
| Damage markers on photos (hail, wind, missing shingle, notes), slope tags, include-in-packet switch, photos in the printable claim packet | Done |
| Company price list: versioned, CSV import with row-by-row error report, CSV export, "add from price list" in the estimate builder, new estimates priced from it | Done |
| Supplier invoice PDF capture and price variance report against saved PO line prices | Done; totals must be reviewed against the uploaded invoice because invoice line OCR/reconciliation is not included |
| API unit and integration tests, shared and estimate rules | 82 API, 28 shared, and 5 estimate tests passed locally |
| Browser tests (desktop and phone, accessibility, golden path) | Passed in GitHub Actions on 16 October 2026 (31 passed, 3 skipped) |
| CI (types, tests, build, dependency audit, browser tests) and a deploy workflow with approval and automatic rollback | GitHub CI passed and Vercel production deployed. The separate Docker workflow built the API image but its web image failed because the GitHub Actions `DOMAIN` variable is unset; self-hosted deployment did not run. |
| Production Docker images, compose file, HTTPS reverse proxy, nightly backups, restore script, deployment guide | Written, not built or run |
| Marketing page, SEO files, responsive portal | Done |

## First-release decisions and remaining work
The agreed first-release scope is Texas insurance restoration, retail replacement and repair jobs. Payments remain in mock mode; the Operations Intern workspace is included in the MVP. EagleView is the selected first aerial measurement provider, but a real connection depends on obtaining vendor API access. Xactimate-compatible estimate export is required at launch. All four Texas waiver types need wording supplied and approved by counsel before use.

## Not built or not ready for live use
1. Real EagleView aerial measurement orders and report ingestion, plus background processing (measurement ordering currently runs in-process against the mock provider).
2. Server-side thumbnails, virus scanning of uploads, and reading EXIF (time and GPS) from photos. The browser now keeps unsent photo files in a local IndexedDB queue (100 MB cap) and syncs when online while the user is signed in.
3. Xactimate-compatible estimate export. Confirm the target interchange format with the intended recipient before calling an export compatible.
4. Texas statutory waiver form wording and approval (all four types; counsel must provide/review the content), reminders for unsigned waivers, email/SMS reminders, escalation, SMS OTP or notarization, preliminary-notice deadlines, and a closeout waiver packet export. Vercel Cron now creates daily in-app reminders for overdue Operations follow-up tasks; it needs `CRON_SECRET` on the production deployment.
5. Payments: matching against the gateway's own balance report, dispute evidence packets, payouts to suppliers and crews, receipts by email, and a strict Content-Security-Policy on payer pages.
6. Several API servers sharing live events (needs Redis), PDF exports and exports as background jobs, QuickBooks or Xero sync, a public API with outgoing webhooks.
7. Production-readiness follow-through: enable GitHub monitor failure notifications, verify production probes, create an off-device Atlas backup, and complete an isolated restore drill. See `docs/PRODUCTION_READINESS.md`. The separate Docker deployment workflow still needs a real server/environment.

## Verification status
**Run and passing in the build sandbox** (compiled and executed with Node, no installs needed): the estimate engine; waiver readiness rules; ledger, refund-approval and reconciliation rules; report math, CSV writer and notification preferences; CSV reader and price list import; the Stripe webhook signature check and event mapping; AWS Signature V4 signing (matches the two examples in AWS's documentation), file type detection and storage drivers; the real email and live-event modules with their database and logger stubbed.

**Verified locally on 15 October 2026:** all three package typechecks passed; the API test suite passed 82 tests, shared rules passed 28 tests, and estimate engine passed 5 tests. The Next.js application compiled and generated pages, but Windows blocked its final standalone packaging step when creating dependency symlinks. Vercel's Preview deployment built successfully.

**Verified in CI and production on 16 October 2026:** the staging and main GitHub Actions checks passed, including typecheck, API/shared tests, build, dependency audit, and browser E2E (31 passed, 3 skipped). The production release was merged at `128bfa3`; this section records the subsequent verification. `/api/v1/health` and `/api/v1/ready` both returned `{"ok":true}`, and the manual production-monitor run passed all probes. The production monitoring workflow and daily in-app reminder cron are now on the default branch. The separate Docker workflow built the API image but could not build the web image because the GitHub Actions `DOMAIN` variable is unset; the self-hosted deployment step was skipped. Backup restore, hands-on validation with real users, and vendor integrations still need separate verification. Stripe and Resend are not part of the first-release live workflow; payments remain mocked.

## Design notes
- Visual language follows the reference: near-black blue surfaces, one burnt-orange accent, Barlow Condensed display type with Barlow for text.
- Money is integer cents everywhere. Estimate totals are computed on read by the shared engine, never stored, so they cannot drift from line items.
- Locked estimate versions are immutable history. Submitting a claim locks the current version; a supplement filing requires a supplement version.
- Supplier confirmation and waiver signing links are random tokens, stored hashed, rate limited, and shown to the sender once. Signing and confirmation pages are `noindex` with no referrer.
- A signed waiver freezes the exact wording shown, the signer's name, signature image, IP and time. The model refuses further edits, and a fingerprint lets you verify it has not changed.
- The starter waiver wording is generic and is not legal advice; several states require specific statutory forms.
- Payments: payers always pay on the gateway's hosted page (PCI SAQ A scope). Webhooks are verified over the raw body with a timestamp tolerance, deduplicated by event id inside the same transaction as the change, and the paid amount must equal the requested amount or the payment is flagged and nothing is posted.
- Money actions (refunds, approvals) re-check the password and are rate limited. The person who requested a refund cannot approve it. The API keys live only in server environment variables.
- Before using Stripe: set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, point a Stripe webhook at `/api/v1/webhooks/stripe` for `checkout.session.*`, `payment_intent.payment_failed`, `charge.refunded` and `charge.dispute.created`, and test in Stripe test mode first.

## Security notes
- Refresh token in an httpOnly cookie; access token in memory only; reuse of a rotated refresh token revokes the session family.
- Every tenant model is scoped by `companyId` through `tenancyPlugin`; an unscoped query throws.
- Mongo operator keys are stripped from input, all bodies and queries are validated with Zod.
- Set a strong `JWT_ACCESS_SECRET`, serve over HTTPS, and review CORS (`WEB_ORIGIN`) before deploying.

## Notifications and live updates: how they work
- Every change that matters calls `touchJob` (refresh these screens) and, where a person should know, `notify` (bell, toast, optional email). Both are in `apps/api/src/core/notify.ts`. `notify` never throws, so a notification problem cannot undo a payment.
- Payment notifications are queued inside the payment transaction and sent only after it commits, so no one is told about a payment that was rolled back.
- The browser holds one stream to `GET /api/v1/events`. It is read with `fetch` (so the access token can be sent), reconnects with backoff, and the server ends it every 10 minutes so a revoked session cannot listen for long. If the stream is down, screens still refresh when you return to the tab.
- Live events are in memory (`core/realtime.ts`). To run more than one API server, replace the body of `publish` and `subscribe` with Redis pub/sub; nothing else changes.
- Emails never store secure links: signing, payment and confirmation links are replaced with `[secure link]` in the outbox record, and in production logs.

## Testing
```bash
pnpm install
pnpm typecheck
pnpm test                                         # shared rules, estimate engine, API unit tests, API integration tests
pnpm --filter @roofdesk/api test:unit             # fast, no database
pnpm --filter @roofdesk/api test:integration      # starts a real in-memory MongoDB replica set (downloads a binary the first time)
docker compose up -d                              # MongoDB (replica set), MinIO bucket
pnpm --filter @roofdesk/web e2e:install           # once: the test browser
pnpm --filter @roofdesk/web e2e                   # starts the API and web app, tests desktop and phone sizes
```
The integration tests cover tenant isolation, login and refresh-token theft detection, roles, the claim state machine and estimate locking, price-list versioning, waiver signing, immutability and tamper detection, payment gating, the payment and refund flows with ledger checks, webhook redelivery and bad signatures, upload safety, live updates and report permissions.

## Deploying
See `docs/DEPLOYMENT.md`: one server, automatic HTTPS (Caddy), nightly database backups, GitHub Actions that build the images and deploy after you approve, and an automatic rollback if the new version does not become ready. `.env.production.example` lists every setting. The API refuses to start in production with a placeholder secret, a non-https address, or a payment or email provider chosen without its keys.
