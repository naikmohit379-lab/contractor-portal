# Razorpay Staging Webhook Relay Security Status

Status date: 2026-11-09

## Scope

During a staging-only synthetic webhook probe, the Vercel API request logger serialized request headers, including the deployment-protection bypass header. The probe had an intentionally invalid Razorpay signature; the API rejected it with HTTP 400. Cloudflare's relay timed out after 4.5 seconds and returned HTTP 502. No payment was created or marked paid by this probe.

## Mitigation

- **Implemented locally:** HTTP request logs now include only request ID, method, URL, and remote address/port. Request headers are excluded, preventing authorization credentials, cookies, webhook signatures, and proxy bypass values from entering request logs.
- **Regression coverage:** `apps/api/src/core/logger.test.ts` checks that sensitive request headers are absent from serialized request logs.
- **Credential response:** On 2026-11-09, the user reported rotating the exposed Vercel deployment-protection credential and saving its replacement in the Cloudflare Worker secret store. This dashboard state has not been independently verified; no credential value is recorded in the repository.
- **Webhook state:** The user confirmed the Razorpay Test webhook is paused/disabled. Keep it paused until this logging fix is deployed to the staging Preview.

## Verification and release state

- `apps/api/node_modules/.bin/vitest.cmd run src/core/logger.test.ts` — **passed, 1 test**, with local test environment placeholders.
- `apps/api/node_modules/.bin/tsc.cmd --noEmit -p apps/api/tsconfig.json` — **passed**.
- `git diff --check` — **passed**; Git emitted only line-ending normalization warnings.
- Commit `1620a10` was pushed to `staging`; its Vercel Preview reached **Ready**. GitHub Actions CI run #64 failed because the new test imported `logger.ts`, which parses required application environment variables during module initialization. The other 22 API test files passed (118 tests); the focused logger test failed before running its assertion. The dependency audit passed. A local follow-up moves the pure serializer into `apps/api/src/core/requestLogger.ts`, so the regression test no longer imports application configuration. The focused test and API typecheck pass after this change; the follow-up is not yet committed or deployed. Production settings and deployments were not changed.
- Do not resume webhook tests until the fix is deployed. The relay's 4.5-second timeout remains shorter than Razorpay's 5-second acknowledgment requirement; response time must be addressed before relying on signed webhook delivery.

## Next steps

1. Commit and push the follow-up serializer/test fix and this updated status note to `staging`.
2. Confirm the resulting GitHub CI run passes and the Vercel Preview is Ready.
3. Review the webhook request path and latency, then resume the Razorpay Test webhook and validate a signed event against synthetic staging data.
4. Confirm Roofora's payment state changed from that signed event. Do not create another payment without separate approval.
