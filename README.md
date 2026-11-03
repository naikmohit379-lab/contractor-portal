# Roofora — Roofing Contractor Platform

Roofora is an India-first job and operations workspace for residential and commercial roofing contractors. The current launch scope supports Indian addresses, INR, English/Hindi, metric units, roof measurements, estimates/quotations, supplier orders, photos, tasks, and simulated payment tracking. An optional, disabled-by-default India MVP supports a contractor-owned Razorpay Payment Link with manual payment confirmation; Roofora does not collect or route those funds. Solar installation and automatic payment verification/refunds are out of scope for this release.

See [India-first product scope](docs/INDIA_FIRST_SCOPE.md), [PRD](docs/PRODUCT_REQUIREMENTS.md), [India job workflow](docs/MVP_WORKFLOW.md), and [deployment guide](docs/DEPLOYMENT.md).

## Stack

- Web: Next.js App Router, React, TypeScript, Tailwind, TanStack Query
- API: Node.js, Express, TypeScript, MongoDB/Mongoose, Zod, JWT sessions
- Shared schemas and estimate calculations live in `packages/shared` and `packages/estimate-engine`

## Local start

Requirements: Node.js 20+, pnpm 9, MongoDB replica set for transaction-based payment tests.

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Set MONGODB_URI and a random JWT_ACCESS_SECRET in apps/api/.env
pnpm dev
```

The web app is served on port 3000 and API on port 4000. For local password-reset testing, leave `EMAIL_PROVIDER=log`; the reset URL is printed in the API terminal. Resend delivery requires a verified sender and server-only `RESEND_API_KEY`/`EMAIL_FROM` configuration.

## India-first job flow

1. Register a company; new workspaces default to India, INR, English (India), Asia/Kolkata, and metric units.
2. Create a residential, commercial, or repair job using an Indian address and six-digit PIN. Add verified map coordinates when available.
3. Enter site measurements or request a RoofV report only when the server flag and credential are configured and the user consents. Review the report and its caveats.
4. Build an estimate from verified quantities and the company price list. Add and confirm local material/labour prices before sharing a quotation. Ask a CA to confirm tax treatment; the app does not certify GST.
5. Coordinate suppliers, photos, assignments, follow-up tasks, and invoice variance from the job.
6. Payment defaults to simulation. The gated Razorpay Link option is off by default; when enabled, the contractor collects directly into its own Razorpay account and an authorized user must manually check a captured payment before recording it. Do not treat a pasted link or payer return as proof of payment.

## Market/data compatibility

New jobs accept Indian addresses only. Legacy U.S. jobs and financial records remain in storage and are not converted. Historical USD values must not be read as INR. If a company already contains U.S. financial history, use a separate India workspace unless an explicitly reviewed migration is prepared.

Legacy insurance-claim and waiver code remains for compatibility; it is not represented as valid Indian legal or insurance guidance. Indian legal forms and tax behavior require review by qualified Indian counsel/CA before implementation.

## Password reset

**Implemented:** `/login` links to `/forgot-password`; users can request a reset and set a new password from a one-hour, single-use link. The API stores only a hash of the token and revokes active refresh sessions after a successful reset. Automated API and browser checks for the reset flow passed in the 2026-10-30 verification below. The local test provider logs the secure link.

**Email delivery status:** The app returning a generic success message does not prove that an email was delivered. Resend delivery must be checked in the Resend logs using a verified sender and the correct Vercel environment variables. Never paste API keys into source or chat.

## Implemented feature status

The current implementation includes India-first company defaults and job addresses, INR/metric formatting, English/Hindi translation fallback, RoofV measurement requests behind server configuration and user consent, estimate and quotation workflows, supplier invoice variance, offline photo queuing and sync, in-app overdue Operations reminders, mock payments, and the gated contractor-owned Razorpay Link MVP. The Razorpay MVP is typechecked and covered by shared/API tests (including synthetic integration tests); the `RAZORPAY_LINKS_ENABLED` flag remains off by default. Local Next.js compilation succeeded, but Windows standalone tracing could not create symlinks, so the full production build still needs its Linux CI/Vercel result. The feature has not been exercised against a Razorpay account. See [MVP workflow](docs/MVP_WORKFLOW.md), [Operations workspace](docs/OPERATIONS_WORKSPACE.md), and [staging validation history](docs/OPERATIONS_STAGING_VALIDATION_2026-10-21.md) for boundaries and verification evidence. A feature being implemented does not by itself mean its external provider or production delivery has been validated.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `docs/INDIA_FIRST_SCOPE.md` for provider, legal/tax, data compatibility, and release limitations.

## Verification on 2026-10-30

- `pnpm test`: passed (138 unit/integration tests across the API, shared package, and estimate engine), including reset-token use/reuse and session revocation.
- `pnpm typecheck`: passed for all workspace packages.
- Focused Playwright run for main screens/accessibility, forgot-password request, and Indian job creation: 5 passed; 1 phone-only data-entry test skipped by design.
- The Next.js production compilation and static generation passed with standalone packaging temporarily disabled. Windows denied the symlinks used to create the standalone deployment folder; the committed `output: "standalone"` setting was restored afterward.
- `pnpm lint` currently opens Next.js's first-time ESLint setup prompt because the repository has no ESLint configuration. It needs a one-time project lint configuration before it can run unattended.

Forgot-password email delivery has not been confirmed through Resend. Local integration tests use the log email provider; verify the sender and Vercel environment configuration before expecting external email delivery.

## Payment MVP follow-up (2026-11-03)

GitHub CI for `16f1a5c` failed because the lockfile used Next.js 15.5.24 and the isolated RoofV quota test loaded unrelated required API environment settings at module import. Commit `53c3f47` fixed those issues; GitHub CI passed typecheck, shared/API tests, and production build. The audit identified Zod and body-parser advisories; follow-up updates Zod to 4.6.7, adapts the optional notification-group schema, and pins body-parser to 1.20.9. CI for `59a48d9` stopped at frozen-install metadata mismatch; the root override configuration is now aligned. Local pnpm 9.12 frozen install, typecheck, 44 shared/estimate tests, 107 API tests, and high-severity production audit passed (two moderate advisories remain). The web build compiles and generates all static pages locally, but Windows blocks standalone tracing symlinks with `EPERM`; Linux CI must verify packaging. CI for `0e7852b` passed install, typecheck, shared/API tests, production build, and dependency audit, but browser E2E still found contrast issues (3 failed, 1 flaky, 29 passed). A follow-up contrast adjustment now uses black text on orange primary buttons and removes the hero button's orange shadow; its CI and deployment status are pending. The current runner has pnpm 11 rather than the pinned pnpm 9.12 and cannot complete local workspace checks because a required symlink is denied (`EPERM`). Do not consider the visual fix tested or deployed until CI and deployment results are confirmed. The Razorpay feature flag remains off and no Razorpay account flow has been validated.

## RoofV quota preflight

The Measurements tab includes **Check RoofV free quota**. It calls the authenticated `/api/v1/providers/roofv/quota` endpoint, which requests RoofV's free `/me` account summary from the API server and returns only quota fields. This check does not send a property's address or place an order. The RoofV key remains server-side. A successful local mocked test does not confirm that the Preview key is valid; use the staging page to check the live quota before ordering a report.

Pending RoofV reports are read by their existing `roof_id`, at most every five minutes while the job is open. If a read times out, use **Check existing RoofV report** to retry the free lookup; it does not place another measurement order.

Staging validation on 2026-10-31 returned a preliminary, unreviewed RoofV area of 110.93 m² for the Koramangala sample. The 6/12 pitch was the value supplied by the user interface; RoofV does not infer pitch from satellite imagery. Verify the roof and pitch on site before estimating or ordering. The report did not include linear edge lengths or an imagery date, so Roofora now labels those as unavailable instead of displaying false zero lengths or today's date.
