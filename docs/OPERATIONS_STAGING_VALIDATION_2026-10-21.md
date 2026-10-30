# Operations Staging Validation — 2026-10-21

## Final validation pass — 2026-10-22

This section supersedes the earlier Oct 22 invoice and image-preview results below. All writes used the synthetic QA job and private Preview storage; Production was not touched.

| Feature | Final result | Evidence / remaining boundary |
| --- | --- | --- |
| Offline photo flow | **Preview upload, sync, reload, and image display passed** | Uploaded `tmp-qa-preview.png` through the Photos upload control. The record appeared in the job and its detail view displayed an image. After reloading the job, the photo record and thumbnail remained. The earlier synthetic `synthetic-roof.jpg` still says “Preview not available”; this is specific to that old fixture, while a valid image now renders. The scheduled/offline transition was not forced in this pass; the earlier test confirmed saving to the browser queue while offline. |
| Supplier invoice and variance | **Passed** | Uploaded synthetic invoice `QA-2026-1022-RETRY` for `$1,237.50` to PO `PO-13F4D0` (`$1,125.00`). The job showed `$112.50` variance (10%), and the Dashboard’s Supplier Invoice Price Variance report showed the same job, PO, invoice, totals, and variance. The invoice remained recorded after reloading. |
| Overdue reminders | **In-app behavior and de-duplication passed; scheduled Preview execution not applicable** | The existing synthetic overdue task and unread reminders were left untouched. `apps/api/test/reminders.test.ts` passed its test that creates one in-app reminder for the first run and suppresses a duplicate on the second run for the same task/day. The Preview cron was not invoked; Vercel schedules this cron only for Production. |

### Test run

- `pnpm exec vitest run test/invoice-variance.test.ts test/reminders.test.ts` from `apps/api`: **2 files, 3 tests passed**.
- The restricted shell initially blocked the in-memory database's loopback socket and temporary-file access. Re-running with the approved local test permissions worked; this was a machine sandbox limitation, not an application test failure.

No real suppliers, customers, payments, or Production records were used. The invoice and image are synthetic QA artifacts in Preview. Do not treat the old malformed-looking JPEG fixture as a representative image upload.

## Follow-up — 2026-10-22

### Storage setup and deployment

- Created the private Vercel Blob store `contractor-portal-blob` in `iad1` and connected it to Preview only. Its read/write token is scoped to Preview; Production remains unchecked.
- Set `STORAGE_DRIVER=vercel-blob` for Preview branch `staging`.
- Redeployed commit `622581a` as Preview deployment `7CiYGUmL6LNeooKxsAJLb2D7LY4W`. Deployment status is **Ready**.
- `/api/v1/ready` initially returned `{"ok":false}` before the saved Preview settings were active. After redeploy, it returned `{"ok":true}`.

### Hands-on validation

| Feature | Result | Evidence / follow-up |
| --- | --- | --- |
| Offline photo sync | **Sync and record persistence passed; image preview needs follow-up** | The pre-existing synthetic `synthetic-roof.jpg` queue item synced to the synthetic QA job. After navigating away and reloading, the photo record remained in the Photos tab. RoofDesk displays “Preview not available,” so the stored file's image rendering/content still needs inspection. |
| Supplier invoice and variance | **Blocked** | Submitted a synthetic invoice (`QA-2026-1022`, `$1,237.50`) against the `$1,125.00` QA purchase order. The UI returned “Failed to fetch.” Reloading showed the QA purchase order still Draft and invoice fields empty, confirming no invoice was recorded. Expected variance remains `$112.50` (10%). Vercel runtime logs include 300-second API timeout events in the same validation window, but they have not been correlated to this specific request. Do not call this feature validated until the request completes and the variance report is checked. |
| Overdue reminders | **Partially validated** | In-app notifications show one overdue follow-up reminder per day for the synthetic QA task from Oct 16 through Oct 21. No Oct 22 reminder was present during this check. Reminder de-duplication across the visible dates looks correct; the scheduled trigger was not validated because the Vercel cron schedule is Production-only. Notifications were left unread. |

Only the synthetic QA job and data were used. No Production environment or customer data was changed. The validation deployment and Blob credentials are Preview-only.

## Scope and safety

Earlier manual validation was performed against the Vercel staging Preview and the existing synthetic QA job only. No production records were changed. No real supplier, customer, or payment information was used. The Oct 21 invoice did not persist; the queued synthetic photo later synced on Oct 22 and is now visible as a photo record after reload, though its preview is unavailable.

## Results

| Feature | Result | Evidence / follow-up |
| --- | --- | --- |
| Overdue Operations reminders | **Partially validated** | The synthetic overdue task had five in-app reminder notifications dated October 16–20. The app documentation says Vercel Cron runs on Production only, so this does not establish that the scheduled trigger ran in Preview. Validate the scheduled run in Production after promotion, or add a safe staging-only trigger if needed. Notifications were left unread. |
| Supplier invoice and variance | **Blocked by Preview upload error** | Tried a synthetic PDF for `$1,237.50` against a `$1,125.00` purchase order (expected variance `$112.50`, 10%). `POST /api/v1/jobs/6ad1d45ffd979adfafa3fbbd/orders/6ad1d4d4fd979adfafa3fc10/invoice` returned HTTP 500 twice. Reload confirmed the invoice was not saved. |
| Offline photo queue | **Offline save passed; server sync blocked** | A synthetic JPEG was saved in browser storage while offline and stayed queued after reconnect. `Sync now` attempted `POST /api/v1/jobs/6ad1d45ffd979adfafa3fbbd/documents`, which returned HTTP 500. The photo remains queued in this browser; do not clear site data before retrying. |

## Storage implementation and configuration

The API now supports a **private Vercel Blob** store (`@vercel/blob` 2.3) as well as S3-compatible storage. The private Blob adapter keeps file reads behind RoofDesk's authenticated API route. The staging store and Preview-only variables are configured and deployed. Do not use a public Blob store for claim or customer documents. Vercel Hobby includes up to 1 GB-month storage, 2,000 advanced operations, and 10 GB Blob transfer per month; if limits are exceeded, Blob access is paused until the next 30-day period. Check current plan usage before live use.

Alternatively, to use S3-compatible storage, configure these in Vercel Preview (keep values private):

- `STORAGE_DRIVER=s3`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT` only when using an S3-compatible service other than AWS S3
- `S3_PATH_STYLE=true` only when required by the storage provider

Do not use the production database for further checks. The remaining staging action is to diagnose the invoice request timeout, then re-submit with a synthetic PDF and confirm the variance report shows `$112.50`.

## Next validation pass

1. Investigate the invoice API request timeout using the Vercel runtime trace/log details; the invoice did not persist.
2. Inspect why the synced synthetic photo record says “Preview not available,” and verify a valid image can be opened after reload.
3. Retry supplier invoice upload after the timeout is fixed; verify invoice metadata and the `$112.50` variance report.
4. Confirm reminder de-duplication and the scheduled trigger separately; Preview does not run the Production cron schedule.
5. Keep the Blob token Preview-only and record results here without including credentials or tokens.
