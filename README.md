# Roofora — Roofing Contractor Platform

Roofora is an India-first job and operations workspace for residential and commercial roofing contractors. The current launch scope supports Indian addresses, INR, English/Hindi, metric units, roof measurements, estimates/quotations, supplier orders, photos, tasks, and simulated payment tracking. Razorpay Test Mode API links are implemented in the current local source behind a disabled-by-default feature flag, using each contractor's own merchant account; Roofora does not collect or route those funds. Live payments remain disabled.

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
6. Payment defaults to simulation. The existing Razorpay manual-link option and the new Test Mode API option are off by default. The Test Mode API option creates links in each contractor's own account, stores test credentials encrypted per company, and uses a signed webhook to update the app. It must be enabled only for staging tests; no Live keys or Production enablement are included.

## Global search

The Portal's Search page finds jobs by job number, customer name/contact details, or property address, and finds job files by filename, caption, or tag. Results stay within the signed-in company; Operations users only see jobs assigned to them. Search requires at least two characters and returns up to eight matching jobs and eight files. This first version uses tenant-filtered MongoDB queries; for very large company datasets, evaluate indexed or Atlas Search before scaling.

## Market/data compatibility

New jobs accept Indian addresses only. Legacy U.S. jobs and financial records remain in storage and are not converted. Historical USD values must not be read as INR. If a company already contains U.S. financial history, use a separate India workspace unless an explicitly reviewed migration is prepared.

Legacy insurance-claim and waiver code remains for compatibility; it is not represented as valid Indian legal or insurance guidance. Indian legal forms and tax behavior require review by qualified Indian counsel/CA before implementation.

## Password reset

**Implemented:** `/login` links to `/forgot-password`; users can request a reset and set a new password from a one-hour, single-use link. The API stores only a hash of the token and revokes active refresh sessions after a successful reset. Automated API and browser checks for the reset flow passed in the 2026-10-30 verification below. The local test provider logs the secure link.

**Email delivery status:** The app returning a generic success message does not prove that an email was delivered. Resend delivery must be checked in the Resend logs using a verified sender and the correct Vercel environment variables. Never paste API keys into source or chat.

## Implemented feature status

The current implementation includes India-first company defaults and job addresses, INR/metric formatting, English/Hindi translation fallback, RoofV measurement requests behind server configuration and user consent, estimate and quotation workflows, supplier invoice variance, offline photo queuing and sync, in-app overdue Operations reminders, mock payments, and the gated contractor-owned Razorpay Link MVP. Razorpay Test Mode API links are implemented with `RAZORPAY_API_ENABLED=false` by default; a Vercel Preview-only override is configured for the `staging` branch. On 2026-11-05, API and web typechecks passed; all API tests passed (115 tests/21 files), shared tests passed (39), estimate-engine tests passed (5), and Razorpay integration tests passed (4). GitHub CI #61 passed its build, audit, and browser jobs (33 browser tests passed, 3 skipped). Vercel staging Preview redeploy `DEQ9ehLaAmASSaqogVSW9sekhXuf` for commit `393f3e2` reached Ready at [the staging site](https://contractor-portal-git-staging-mohith-c47e.vercel.app/). One staging company shows Test credentials saved in Settings. The Razorpay Test webhook is enabled with the four requested events and now reports a secret provided; the stored values cannot be compared by viewing either dashboard, so signed delivery remains unverified. India payment milestone creation/readiness has been added in local source; direct web TypeScript check passed with `apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`. Workspace test and build commands have not been completed, and this UI change is not deployed; the current staging app still lacks this path. No end-to-end Test payment has been made. Production remains unchanged and Live payments remain disabled. See [Razorpay Test Mode setup and status](docs/RAZORPAY_TEST_MODE.md), [MVP workflow](docs/MVP_WORKFLOW.md), and [staging validation history](docs/OPERATIONS_STAGING_VALIDATION_2026-10-21.md). A feature being deployed does not by itself mean its external provider has been validated.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `docs/INDIA_FIRST_SCOPE.md` for provider, legal/tax, data compatibility, and release limitations.

## Verification on 2026-11-06

Against staging base commit 3e059a6, after adding company-scoped global search:

- npx --yes pnpm@9.12.0 typecheck: passed for all four workspace packages.
- npx --yes pnpm@9.12.0 test: passed: 118 API tests, 39 shared tests, and 5 estimate-engine tests (162 total). The API suite includes three global-search integration cases for validation, document/job search, tenant isolation, and Operations assignment scope.
- npx --yes pnpm@9.12.0 --filter @roofdesk/web exec playwright test: 34 passed and 4 skipped across desktop and phone. The new search E2E passed; the existing layout/accessibility checks passed.
- npx --yes pnpm@9.12.0 build: API production bundle passed; Next.js compiled, lint/type checks and static page generation passed, but the overall command failed in standalone tracing when Windows denied dependency symlink creation (EPERM). This is an environment packaging limitation; the complete production build is not recorded as passing.

## Verification on 2026-10-30

- `pnpm test`: passed (138 unit/integration tests across the API, shared package, and estimate engine), including reset-token use/reuse and session revocation.
- `pnpm typecheck`: passed for all workspace packages.
- Focused Playwright run for main screens/accessibility, forgot-password request, and Indian job creation: 5 passed; 1 phone-only data-entry test skipped by design.
- The Next.js production compilation and static generation passed with standalone packaging temporarily disabled. Windows denied the symlinks used to create the standalone deployment folder; the committed `output: "standalone"` setting was restored afterward.
- `pnpm lint` currently opens Next.js's first-time ESLint setup prompt because the repository has no ESLint configuration. It needs a one-time project lint configuration before it can run unattended.

Forgot-password email delivery has not been confirmed through Resend. Local integration tests use the log email provider; verify the sender and Vercel environment configuration before expecting external email delivery.

## Payment MVP follow-up (2026-11-03)

GitHub CI for `16f1a5c` failed because the lockfile used Next.js 15.5.24 and the isolated RoofV quota test loaded unrelated required API environment settings at module import. Commit `53c3f47` fixed those issues; GitHub CI passed typecheck, shared/API tests, and production build. The audit identified Zod and body-parser advisories; follow-up updates Zod to 4.6.7, adapts the optional notification-group schema, and pins body-parser to 1.20.9. CI for `59a48d9` stopped at frozen-install metadata mismatch; the root override configuration is now aligned. Local pnpm 9.12 frozen install, typecheck, 44 shared/estimate tests, 107 API tests, and high-severity production audit passed (two moderate advisories remain). The web build compiles and generates all static pages locally, but Windows blocks standalone tracing symlinks with `EPERM`; Linux CI must verify packaging. CI for `0e7852b` passed install, typecheck, shared/API tests, production build, and dependency audit, but browser E2E still found contrast issues (3 failed, 1 flaky, 29 passed). CI for `77ca5f5` passed those same non-browser checks but still reported 3 browser failures (30 passed), including primary CTA contrast and muted/green text. CI for `f9e8a6b` passed the non-browser checks and 32 browser tests, with one failure on a disabled primary button. The disabled state now explicitly sets a contrasting slate background, light text, and full opacity; fresh CI and deployment are pending. The current runner has pnpm 11 rather than the pinned pnpm 9.12 and cannot complete local workspace checks because a required symlink is denied (`EPERM`). The Razorpay feature flag remains off and no Razorpay account flow has been validated.

## CI follow-up — 2026-11-05

The pasted Playwright output for `400a577` reported four browser-test failures (desktop and phone scans on `/jobs` and `/`), with 29 passed and 3 skipped. Axe observed primary-button foreground/background values changing between retries during CSS color transitions. E2E accessibility scans now request reduced motion, move the pointer away from interactive controls, and wait briefly before running axe. Local web typecheck (`apps/web/node_modules/.bin/tsc.cmd --noEmit -p apps/web/tsconfig.json`), `git diff --check`, and Playwright test discovery (`apps/web/node_modules/.bin/playwright.cmd test --list`, 36 tests listed) passed. Commit `057df3900e7e993a6edb155bdbdeaaec0a44baee` was pushed to `main`; GitHub CI run [42006274678](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42006274678) passed dependency audit, types/tests/build, and browser tests. Vercel Production reports Ready at https://contractor-portal-e1i3bmk6r-mohith-c47e.vercel.app. The separate self-hosted Docker deployment run [42006968318](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42006968318) failed in its web-image build, so its server deploy was skipped; detailed logs require repository admin access and the cause remains unverified.

## RoofV quota preflight

The Measurements tab includes **Check RoofV free quota**. It calls the authenticated `/api/v1/providers/roofv/quota` endpoint, which requests RoofV's free `/me` account summary from the API server and returns only quota fields. This check does not send a property's address or place an order. The RoofV key remains server-side. A successful local mocked test does not confirm that the Preview key is valid; use the staging page to check the live quota before ordering a report.

Pending RoofV reports are read by their existing `roof_id`, at most every five minutes while the job is open. If a read times out, use **Check existing RoofV report** to retry the free lookup; it does not place another measurement order.

Staging validation on 2026-10-31 returned a preliminary, unreviewed RoofV area of 110.93 m² for the Koramangala sample. The 6/12 pitch was the value supplied by the user interface; RoofV does not infer pitch from satellite imagery. Verify the roof and pitch on site before estimating or ordering. The report did not include linear edge lengths or an imagery date, so Roofora now labels those as unavailable instead of displaying false zero lengths or today's date.
