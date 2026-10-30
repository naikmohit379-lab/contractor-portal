# RoofDesk Contractor Portal

RoofDesk is an India-first job and operations workspace for residential and commercial roofing contractors. The current launch scope supports Indian addresses, INR, English/Hindi, metric units, roof measurements, estimates/quotations, supplier orders, photos, tasks, and simulated payment tracking. Solar installation and live payments are out of scope for this release.

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
6. Payments are simulated. Do not treat the mock result as a real payment.

## Market/data compatibility

New jobs accept Indian addresses only. Legacy U.S. jobs and financial records remain in storage and are not converted. Historical USD values must not be read as INR. If a company already contains U.S. financial history, use a separate India workspace unless an explicitly reviewed migration is prepared.

Legacy insurance-claim and waiver code remains for compatibility; it is not represented as valid Indian legal or insurance guidance. Indian legal forms and tax behavior require review by qualified Indian counsel/CA before implementation.

## Password reset

`/login` links to `/forgot-password`. The API responds generically, stores only a hash of a one-hour, single-use token, and revokes active refresh sessions after a successful reset. The local test provider logs the secure link. Actual mail delivery is not verified merely because the API returned success; check the Resend sender, delivery logs, and Preview/Production environment configuration. Never paste API keys into source or chat.

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
