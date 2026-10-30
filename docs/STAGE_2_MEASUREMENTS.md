# Stage 2: India measurement workflow

## Implemented foundation

- A user with the existing `measurement:order` permission can enter values from a third-party roof report or verified site measurement.
- Each report stores roof facets, pitch, linear measurements, waste allowance, optional imagery date, and a source note.
- Users enter values in the company's configured measurement system. Metric area and lengths are converted to the application's existing square-foot/foot storage before estimates consume them; existing U.S. records are unchanged.
- Manual entries are marked as such and included in the existing company-scoped audit log.
- Generated mock reports are labelled as sample data with a warning that they are not a real survey and must not be used for quotes or material orders.

## RoofV integration: adapter implemented, live ordering gated

RoofV's support response confirms India coverage and describes the output. The public [RoofV developer guide](https://roofv.ai/developers) and [OpenAPI document](https://roofv.ai/api/public/v1/openapi.json) describe the API contract. The account-specific email says Bengaluru and other metros have been tested, and recommends GPS/map-pin coordinates because Indian street addresses can resolve imprecisely. The OpenAPI spec also recommends sending coordinates outside the US/Canada.

Confirmed API facts: base URL `https://roofv.ai/api/public/v1`; API key from RoofV **Settings → API**; `GET /me` is a free authentication/quota check; `POST /measurements` can accept GPS coordinates, address label, and pitch; RoofV supports `measurement.reviewed` webhooks; results carry sqft and metric values. Measurement requests consume the included allowance or credits, so this code must not issue live requests during development checks.

The integration code is now present behind `ROOFV_ENABLED=false` by default. It provides a server-side adapter, India-only ordering, map-coordinate capture on job creation or the Measurements tab, a per-request disclosure and consent checkbox, a pitch field, and background reads while the page is open for pending reports. The API key is read only by the backend from `ROOFV_API_KEY`; it is never sent to the browser. The server stores the RoofV roof/job IDs and reads full job measurements when available. RoofV does not support arbitrary idempotency headers, so the UI warns users not to blindly retry a timed-out request.

Before enabling production calls:

1. Create a dedicated, expiring RoofDesk API key with write permission, then keep it only in Vercel Preview/server environment variables. Never paste it into chat, commit it, or expose it to the browser.
2. Add `ROOFV_API_KEY` to the API server's Preview environment, then set `ROOFV_ENABLED=true` only in Preview. Confirm the returned fields against the account's actual OpenAPI responses and exercise the ambiguous-building flow. No live calls have been made by this development work.
3. Confirm the account's current trial/plan limits and concurrency with RoofV before testing real measurements. The vendor's email gives plan prices and a two-request concurrency limit; treat those as account-specific until confirmed in the RoofV account.
4. Verify a real India address only after the implementation is in Preview and the user explicitly chooses to send that property's address/coordinates. The API has no separate sandbox according to the vendor email.

Never commit or paste provider credentials into source control or chat. Production remains disabled until Preview validation succeeds and the user explicitly authorizes enabling it.

## Current limitations

- Manual entry is not a RoofV import. The user transcribes values from the vendor's report.
- The application stores normalized area and lengths in its existing internal units; the UI converts them based on company settings.
- There is no raw report PDF/image attachment on this measurement record yet.
- RoofV's signed webhook is not implemented. Pending-report refresh runs only while a user is viewing the Measurements tab; Vercel background execution and scheduled polling are not configured.
- RoofV response normalization handles common documented fields, but must be checked against real account responses before use for estimates. Preliminary results are not yet clearly distinguished from reviewed results in the database/UI; treat all RoofV output as requiring verification.
- Ambiguous RoofV buildings currently return an error; choose-and-resubmit UI for candidates is not implemented.
- Environment variables have not been added to Vercel. This code has not been type-checked or built in this turn, and has not been committed, pushed, or deployed.
- This work has not been pushed or deployed. Keep it on the local Stage 2 work until type-check/build and focused manual workflow validation are run.
