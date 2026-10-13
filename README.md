# RoofDesk: Roofing Contractor Portal

Build status: steps 0 to 9 of the implementation plan. Foundation (auth, tenancy, jobs, measurements), estimates and claims, supplier orders, lien waivers with e-signature, payments with a ledger, and notifications, live updates and reporting.

## Stack
- **Web:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, TanStack Query, React Hook Form + Zod
- **API:** Node.js, Express 4, MongoDB (Mongoose), Zod, JWT + rotating refresh tokens, bcryptjs for portable password hashes (legacy Argon2 verification where available)
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
14. **Dashboard** (owner, admin or billing): collected by month, owed and overdue amounts, claim approval rate and cycle time, how long waivers have waited, claims by status, and **CSV exports** for jobs, payments, waivers and the ledger.

## What is built
| Area | Status |
|---|---|
| Auth, rotating refresh tokens, tenancy plugin, RBAC, audit log | Done |
| Jobs and pipeline | Done |
| Measurements (provider adapter, mock provider, idempotent ordering) | Done (in-process, not queued) |
| Estimate engine: line math, O&P, tax, per-line depreciation, ACV/RCV, net claim | Done, 5 assertions run and passing |
| Estimate versions (original, carrier approved, supplement), locking, diff view | Done |
| Claim record, status machine, communication log, deductible sync | Done |
| Printable claim packet (browser print to PDF) | Done, no photos yet |
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
| CSV exports (jobs, payments, waivers, ledger) with spreadsheet-formula protection | Done |
| Marketing page, SEO files, responsive portal | Done |

## Not built yet
1. Photo capture, annotation and document storage (S3/MinIO presigned uploads) and server-side PDF packets with photos.
2. BullMQ workers for measurement and later integrations; real aerial providers.
3. Company price lists and the full line-item library (the engine uses `DEFAULT_PRICES`).
4. Delivery verification, invoice upload and price-variance checks on orders.
5. Waivers: statutory per-state forms (must come from your counsel), automatic reminders and escalation (needs the scheduler and email), SMS/email delivery of links, OTP or notarization, preliminary-notice deadlines, closeout waiver packet export, and a waiver-amount check against real payments.
6. Payments: matching against the gateway's own balance report, dispute evidence packets, payouts to suppliers and crews, receipts by email, an unapproved-waiver check on payouts, a settings page for gating and the refund threshold (they are fields on the company, with sensible defaults), and a strict Content-Security-Policy on payer pages.
7. Step 9 gaps: SMS delivery; automatic waiver and payment reminders and escalation (needs a scheduler); Redis-backed live events so several API servers share one stream (today events stay inside one server process); PDF exports and exports as background jobs; QuickBooks or Xero sync; a material-price-variance report (needs supplier invoice upload); per-user report filters and date ranges; a public API and outgoing webhooks.
8. API integration tests (tenant isolation, state machines, waiver immutability, payment transactions and webhook redelivery against a real MongoDB), CI/CD, deployment.

## Verification status
- The estimate engine, waiver readiness rules, ledger and reconciliation rules, report math and CSV writer, notification preferences, the Stripe webhook signature check and event mapping, and the real email and live-event modules (with their database and logger stubbed) were compiled and executed in the build sandbox, and their assertions pass.
- Everything else was written without installing dependencies (no network there) and has only had a syntax-level TypeScript check. Run `pnpm install && pnpm typecheck && pnpm test` first and expect to fix small issues.

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
