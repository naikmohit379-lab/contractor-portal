# Roofora India-First Product Scope

Status: Current product direction for the India launch. This scope supersedes U.S.-focused assumptions in the October 12, 2026 draft PRD and architecture notes.

## Target users and geography

Roofora is for residential and commercial roofing contractors across India, including small and medium-sized businesses. Solar installation is outside the initial scope.

## India-first behavior

- New companies use India, INR, English (India), Asia/Kolkata, and metric units. Hindi is available with English fallback.
- New jobs use Indian address fields: address lines, locality/city, district, state or Union Territory, six-digit PIN code, optional landmark, and map coordinates.
- Job types are residential roofing, commercial roofing, and roof repair.
- RoofV is the selected measurement provider. Requests are coordinate-first, explicitly consented, and remain disabled until server credentials and the feature flag are configured. Preliminary estimates must be distinguishable from technician-reviewed measurements.
- Estimates are itemized customer quotations using company-entered, locally verified material and labour rates. Roofora does not determine GST or other Indian tax treatment; a chartered accountant must confirm any rates and handling.
- Payments default to simulation; no Razorpay API integration or live-payment enablement is configured by default.
- Payment MVP: each contractor creates a Payment Link in its own Razorpay account; the contractor is the payee and receives funds directly. Roofora does not collect, split, or route funds. Route and a platform commission are out of scope for this model.
- English/Hindi interface text may fall back to English. Legal forms and tax wording are not treated as approved translations.

## Existing data and U.S.-specific history

Existing U.S. records and stored amounts are retained as historical data. The app must not relabel USD amounts as INR, rewrite timestamps, or convert legal documents. New job creation and active marketing are India-only. U.S. claim and waiver screens are hidden for Indian jobs; historical records remain stored for a future compatible read path. A company with historical U.S. financial data should use a separate India workspace unless a reviewed, record-by-record migration is approved.

## Security and release constraints

Keep tenant isolation, role checks, audit logging, password hashing, single-use reset links, and server-only provider credentials. Do not enable live payments, fabricate Indian legal or tax rules, or put API credentials in browser code. Keep RoofV disabled if the key or access is missing.

## Current implementation limitations

- The internal estimate engine and legacy U.S. claims/waiver APIs remain in the codebase for data compatibility. They are not an approved Indian insurance/legal workflow.
- RoofV credentialed requests and reviewed-result lifecycle still require staging verification with the vendor account.
- INR unit prices must be entered and checked by each contractor. No default price list is certified for India.
- Forgot-password links can be tested with the local log email provider. Actual Resend delivery needs a verified sender and configured production/preview environment values.
- Mock payments remain the default. A feature-flagged contractor-owned Razorpay Link flow is implemented; `RAZORPAY_LINKS_ENABLED` defaults to `false`. Follow-up dependency fixes upgrade Zod to 4.6.7 and pin body-parser to 1.20.9; local pnpm 9.12 typecheck, shared/estimate tests (44), API tests (107), and high-severity production audit passed (two moderate advisories remain). GitHub CI for `59a48d9` stopped at frozen-install metadata mismatch; the root pnpm override has been aligned, and local frozen install now succeeds. The local API bundle built; Next.js compiled and generated static pages, but Windows denied standalone trace symlink creation (`EPERM`). CI for `0e7852b` passed install, typecheck, shared/API tests, build, and audit, but browser E2E reported 3 failures, 1 flaky test, and 29 passes. CI for `77ca5f5` passed the non-browser checks but browser E2E still had 3 failures (30 passed), including contrast on the marketing CTA, muted text, and success text. CI for `f9e8a6b` passed non-browser checks and 32 browser tests, with one disabled-button contrast failure. The disabled primary button now has explicit slate background, light text, and full opacity; fresh CI and deployment are pending. The local runner has pnpm 11 rather than the pinned 9.12, and local typecheck could not complete because a workspace symlink was denied (`EPERM`). Hands-on Razorpay account validation remains pending.
- When enabled, authorized staff manually record a payment only after verifying captured status and matching amount/currency in Razorpay. This is not automatic verification: webhooks, refunds, link deactivation, and provider reconciliation are not implemented. Handle refunds and deactivate links directly in the contractor's Razorpay account; refunds will not automatically update Roofora's ledger or payment reports.
- Keep the feature flag off until staging tests with Razorpay test-mode links are complete. Do not treat a payer return or entered Payment ID as provider-verified proof; the authorized operator is attesting that Razorpay shows captured status and the matching amount.
