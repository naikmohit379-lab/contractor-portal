# Razorpay Staging Webhook Relay Security Status

Status date: 2026-11-09

## Scope

During a staging-only synthetic webhook probe, the Vercel API request logger serialized request headers, including the deployment-protection bypass header. The probe had an intentionally invalid Razorpay signature; the API rejected it with HTTP 400. Cloudflare's relay timed out after 4.5 seconds and returned HTTP 502. No payment was created or marked paid by this probe.

## Mitigation

- **Implemented locally:** HTTP request logs now include only request ID, method, URL, and remote address/port. Request headers are excluded, preventing authorization credentials, cookies, webhook signatures, and proxy bypass values from entering request logs.
- **Regression coverage:** `apps/api/src/core/logger.test.ts` checks that sensitive request headers are absent from serialized request logs.
- **Credential response:** On 2026-11-09, the user reported rotating the exposed Vercel deployment-protection credential and saving its replacement in the Cloudflare Worker secret store. This dashboard state has not been independently verified; no credential value is recorded in the repository.
- **Webhook state:** The user confirmed the Razorpay Test webhook is paused/disabled. Keep it paused until relay latency and signed delivery are safely verified.
- **Staging probe (2026-11-09):** A synthetic `payment_link.paid` request with a deliberately invalid signature was sent to the staging relay. It returned **HTTP 400 in 1.567 seconds**; this is the expected rejection, and it did not create or change a payment. Vercel runtime logs for this request contained only the safe request fields and no request headers. This verifies invalid-signature rejection and header omission for the observed request only; it does not verify a valid signature or end-to-end payment update.
- **Latency caveat:** Vercel logs also showed an earlier POST with approximately 5.6 seconds TTFB. The exact request/result could not be reliably attributed to the malformed initial probe, so it is not counted as a successful relay check. The later warm probe was fast, but cold-start/latency behavior remains unresolved against Razorpay's 5-second acknowledgment requirement.

## Verification and release state

- `apps/api/node_modules/.bin/vitest.cmd run src/core/logger.test.ts` — **passed, 1 test**, with local test environment placeholders.
- `apps/api/node_modules/.bin/tsc.cmd --noEmit -p apps/api/tsconfig.json` — **passed**.
- `git diff --check` — **passed**; Git emitted only line-ending normalization warnings.
- Commit `1620a10` was pushed to `staging`; its Vercel Preview reached **Ready**. GitHub Actions CI run #64 failed because the new test imported `logger.ts`, which parses required application environment variables during module initialization. The other 22 API test files passed (118 tests); the focused logger test failed before running its assertion. The dependency audit passed. The follow-up moved the pure serializer into `apps/api/src/core/requestLogger.ts`, so the regression test no longer imports application configuration.
- Commit `b15c809` is pushed to `staging`; Vercel Preview [`contractor-portal-lqtswjl4o-mohith-c47e.vercel.app`](https://contractor-portal-lqtswjl4o-mohith-c47e.vercel.app/) reached **Ready**. GitHub Actions run [42617531576](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42617531576) completed successfully: typecheck, shared tests, API unit/integration tests, production build, dependency audit, and browser tests all passed.
- A documentation-only follow-up, commit `5cf0802`, was pushed to `staging`; its Vercel Preview [`contractor-portal-d9nbjy43c-mohith-c47e.vercel.app`](https://contractor-portal-d9nbjy43c-mohith-c47e.vercel.app/) reached **Ready**. Its GitHub Actions run was still in progress at the last check; do not treat that run as passed without checking its final status. This is the last verified deployment before the current documentation update.
- Production was not changed. No valid signed Razorpay event was sent, and successful webhook delivery/payment-state reconciliation remain unverified. The user-reported replacement bypass secret was not independently checked.
- Keep the Test webhook paused. The relay's configured 4.5-second timeout is below Razorpay's 5-second acknowledgment limit, and the earlier ~5.6-second TTFB observation means cold-start/latency behavior must be resolved before a valid signed delivery test.

## Next steps

1. Check the final status of the documentation-only GitHub Actions run for `5cf0802`.
2. Resolve the 5-second acknowledgment/timeout risk, including cold-start timing, before enabling webhook delivery.
3. After the relay is consistently timely, resume the Razorpay Test webhook and validate a signed event with existing synthetic staging data.
4. Confirm Roofora's payment state changed from that signed event. Do not create another payment without separate approval.
