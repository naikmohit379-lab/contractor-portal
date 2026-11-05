# Razorpay Test Mode API Integration

Status date: 2026-11-05

## Business and safety model

- Each roofing company connects its own Razorpay merchant account and receives payments in its own account. Roofora does not collect, split, or route contractor funds. Razorpay Route and a Roofora fee are not part of this design.
- The API integration is **Test Mode only**. `RAZORPAY_API_ENABLED` defaults to `false`; the existing manual link feature also stays disabled by default. No Production environment variables were changed, and no live transaction was made.
- A Razorpay Test Key ID must begin with `rzp_test_`. The server stores its key ID and encrypts the Test Key Secret and Webhook Secret using AES-256-GCM with a server-only 32-byte key. Secret fields are excluded from normal MongoDB reads and are never returned by the connection-status API.
- The shared encryption key is configured as `RAZORPAY_CREDENTIALS_ENCRYPTION_KEY`; rotating it without re-encrypting every company credential would make those credentials unreadable. Keep it in the deployment secret store and back it up securely. Never commit or paste it into chat.
- API-created payment links use INR paise, do not enable partial payments, and suppress Razorpay SMS/email notifications (Roofora may send its own payer email). Razorpay's current Standard Payment Link documentation describes amounts in currency subunits; its current Payment Link help text specifies ₹100 as the minimum. Roofora enforces that minimum in API mode. See [Create Standard Payment Link](https://razorpay.com/docs/api/payments/payment-links/create-standard/) and [Razorpay Payment Link documentation](https://razorpay.com/docs/payments/payment-links/).
- Status changes come only from signed webhooks. Browser return pages and payer claims do not mark a payment as paid. Raw-body HMAC-SHA256 verification and timing-safe comparison are used before parsing the event. Razorpay recommends validating the original webhook body and authenticating with the configured secret; see [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

## Configuration for an isolated staging test

1. Keep `PAYMENT_PROVIDER=mock` and `RAZORPAY_LINKS_ENABLED=false`.
2. In a non-production environment only, set `RAZORPAY_API_ENABLED=true` and create `RAZORPAY_CREDENTIALS_ENCRYPTION_KEY` with a secure random 32-byte value encoded as Base64. Store it only in the platform's secret manager. `RAZORPAY_API_ENABLED=true` will fail closed if this key is absent or malformed.
3. Set `PUBLIC_API_URL` to the public HTTPS origin that serves the Express API. The Settings screen displays each company's webhook endpoint. The endpoint is `/api/v1/webhooks/razorpay/<company-id>`; configure it in that company's Razorpay Test Mode account.
4. Subscribe to `payment_link.paid`, `payment.failed`, `refund.processed`, and `payment.captured`. Copy that endpoint's generated webhook secret into Roofora Settings together with that company's Razorpay **Test** Key ID and Key Secret. The UI sends these values to the authenticated API over HTTPS; the API saves only encrypted secret values.
5. In an India/INR company, mark a milestone ready and create a Test Mode payment. The customer follows the hosted Razorpay Test link. Validate captured and failed payments, duplicate webhook delivery, amount mismatch, refund notifications, and tenant isolation. No real funds should move.
6. Remove the test company connection or rotate its Test keys after testing. Keep the feature disabled until the staging checks below are complete.

## Implementation state

- **Implemented in source:** encrypted per-company Test credentials; Owner/Admin-only connection settings; Test Key ID prefix validation; INR Test Payment Link creation; minimum amount check; per-company webhook endpoints; raw-body signature verification; requested event normalization; idempotent handling through the existing provider-event and ledger service; public payer link; API/web settings controls; mock/manual payment paths retained.
- **Typechecked:** `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json` and the corresponding web project command — passed on 2026-11-05.
- **Unit tested:** `razorpay.test.ts` — 4 passed (AES-GCM encryption/tamper detection, Payment Link request construction, raw signature check, requested event normalization).
- **Integration tested:** `razorpay-test-mode.test.ts` — 4 passed with local MongoDB access; it covers encrypted credential storage and status-only responses, INR link creation, signed success webhook and duplicate delivery, invalid signatures, tenant boundaries, and role restrictions.
- **Broader tests:** full API suite — 115 passed across 21 files; shared package — 39 passed across 9 files; estimate engine — 5 passed.
- **Web production build:** Next.js compilation, type/lint phase, and static page generation completed, but standalone trace packaging failed on Windows with `EPERM` while creating dependency symlinks. A successful Linux CI/Vercel build remains pending.
- **External provider validation:** pending. No credentials were provided to or entered into Roofora in this session; no Razorpay network call was made.
- **Deployment:** not deployed. No commit or push was made.

## Known limits and follow-up before broader use

- Refund processing and link cancellation remain manual in the contractor's Razorpay account; only the configured refund event can reflect a refund in Roofora. The app does not issue refunds through the API or reconcile full Razorpay statements.
- The Test-mode SaaS arrangement and each merchant's website/activation requirements still need Razorpay confirmation. Do not assume that one Roofora site can be registered across all contractor merchant accounts.
- Check Razorpay's actual Test webhook payloads in staging. Events that cannot be safely correlated to a stored payment are acknowledged as `unmatched` and do not change the ledger. Verify `payment.failed` and `refund.processed` correlation against delivered payloads before relying on those status updates.
- Run/confirm the Linux CI and Vercel build for the published staging revision, then configure staging-only Test Mode environment settings and run the provider's end-to-end payment and webhook flow. Production and Live keys require a separate explicit approval.
- The displayed INR amounts remain in the existing minor-unit integer field historically named `amountCents`; a future storage rename is out of scope for this increment.
