# Roofora India-First Product Scope

Status: Current product direction for the India launch. This scope supersedes U.S.-focused assumptions in the October 12, 2026 draft PRD and architecture notes.

For current implementation, validation, deployment, and open launch gates, see [Implementation Status](IMPLEMENTATION_STATUS.md). Historical verification snapshots below do not supersede that consolidated status.

## Target users and geography

Roofora is for residential and commercial roofing contractors across India, including small and medium-sized businesses. Solar installation is outside the initial scope.

## India-first behavior

- New companies use India, INR, English (India), Asia/Kolkata, and metric units. Hindi is available with English fallback.
- New jobs use Indian address fields: address lines, locality/city, district, state or Union Territory, six-digit PIN code, optional landmark, and map coordinates.
- Job types are residential roofing, commercial roofing, and roof repair.
- RoofV is the selected measurement provider. Requests are coordinate-first, explicitly consented, and remain disabled until server credentials and the feature flag are configured. Preliminary estimates must be distinguishable from technician-reviewed measurements.
- Estimates are itemized customer quotations using company-entered, locally verified material and labour rates. Roofora does not determine GST or other Indian tax treatment; a chartered accountant must confirm any rates and handling.
- Payments default to simulation. Razorpay API-created Test Mode links are implemented behind a flag that defaults to `false` in source; Vercel Preview overrides it to `true` for branch `staging` only. Production remains unchanged; no live-payment enablement is configured.
- Payment MVP: each contractor creates a Payment Link in its own Razorpay account; the contractor is the payee and receives funds directly. Roofora does not collect, split, or route funds. Route and a platform commission are out of scope for this model.
- English/Hindi interface text may fall back to English. Legal forms and tax wording are not treated as approved translations.

## Existing data and U.S.-specific history

Existing U.S. records and stored amounts are retained as historical data. The app must not relabel USD amounts as INR, rewrite timestamps, or convert legal documents. New job creation and active marketing are India-only. U.S. claim and waiver screens are hidden for Indian jobs; historical records remain stored for a future compatible read path. A company with historical U.S. financial data should use a separate India workspace unless a reviewed, record-by-record migration is approved.

## Security and release constraints

Keep tenant isolation, role checks, audit logging, password hashing, single-use reset links, and server-only provider credentials. Do not enable live payments, fabricate Indian legal or tax rules, or put API credentials in browser code. Keep RoofV disabled if the key or access is missing.

## Current implementation limitations

- The internal estimate engine and legacy U.S. claims/waiver APIs remain in the codebase for data compatibility. They are not an approved Indian insurance/legal workflow.
- RoofV integration code and one authorized Koramangala sample report exist. The sample was preliminary/unreviewed and needs onsite verification; account limits, provider terms, and production enablement remain to be confirmed.
- INR unit prices must be entered and checked by each contractor. No default price list is certified for India.
- Password-reset email was reported working after domain verification; production sender/delivery-log confirmation is not recorded in the current status document.
- Mock payments remain the default. The contractor-owned manual-link and API-created Test Mode flows are implemented; the API Test Mode flag is enabled only in staging Preview. One successful ₹100 synthetic test payment verified the signed paid-event path. Other manual payment scenarios, Razorpay's delivery response log, Partnership Program clarification, and Live enablement remain pending. See [Razorpay Test Mode setup](RAZORPAY_TEST_MODE.md) and [Implementation Status](IMPLEMENTATION_STATUS.md).

### CI follow-up — 2026-11-05

The pasted Playwright log for `400a577` reported four browser-test failures (desktop and phone accessibility scans on `/jobs` and `/`), with 29 passed and 3 skipped. The observed color values changed between retries while CSS transitions could still be running. The E2E helper now requests reduced motion, moves the pointer away, and briefly waits before axe scans the UI. Local web typecheck, `git diff --check`, and Playwright test discovery (36 tests listed) passed. Commit `057df3900e7e993a6edb155bdbdeaaec0a44baee` was pushed to `main`; GitHub CI run `42006274678` passed all jobs, including browser tests, and Vercel Production reports Ready at https://contractor-portal-e1i3bmk6r-mohith-c47e.vercel.app. The separate self-hosted deployment run `42006968318` failed during the web-image build and skipped server deployment; details remain unavailable without repository admin log access.
