# RoofDesk India-First Product Scope

Status: Current product direction for the India launch. This scope supersedes U.S.-focused assumptions in the October 12, 2026 draft PRD and architecture notes.

## Target users and geography

RoofDesk is for residential and commercial roofing contractors across India, including small and medium-sized businesses. Solar installation is outside the initial scope.

## India-first behavior

- New companies use India, INR, English (India), Asia/Kolkata, and metric units. Hindi is available with English fallback.
- New jobs use Indian address fields: address lines, locality/city, district, state or Union Territory, six-digit PIN code, optional landmark, and map coordinates.
- Job types are residential roofing, commercial roofing, and roof repair.
- RoofV is the selected measurement provider. Requests are coordinate-first, explicitly consented, and remain disabled until server credentials and the feature flag are configured. Preliminary estimates must be distinguishable from technician-reviewed measurements.
- Estimates are itemized customer quotations using company-entered, locally verified material and labour rates. RoofDesk does not determine GST or other Indian tax treatment; a chartered accountant must confirm any rates and handling.
- Payments remain simulated. No live payment gateway is enabled.
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
- Payment processing remains mock-only.
