# Operations Staging Validation — 2026-10-21

## Scope and safety

Manual validation was performed against the Vercel staging Preview and the existing synthetic QA job only. No production records were changed. No real supplier, customer, or payment information was used. The test invoice did not persist. One synthetic photo remains queued in the current browser's local offline queue so it can be retried after the upload issue is fixed.

## Results

| Feature | Result | Evidence / follow-up |
| --- | --- | --- |
| Overdue Operations reminders | **Partially validated** | The synthetic overdue task had five in-app reminder notifications dated October 16–20. The app documentation says Vercel Cron runs on Production only, so this does not establish that the scheduled trigger ran in Preview. Validate the scheduled run in Production after promotion, or add a safe staging-only trigger if needed. Notifications were left unread. |
| Supplier invoice and variance | **Blocked by Preview upload error** | Tried a synthetic PDF for `$1,237.50` against a `$1,125.00` purchase order (expected variance `$112.50`, 10%). `POST /api/v1/jobs/6ad1d45ffd979adfafa3fbbd/orders/6ad1d4d4fd979adfafa3fc10/invoice` returned HTTP 500 twice. Reload confirmed the invoice was not saved. |
| Offline photo queue | **Offline save passed; server sync blocked** | A synthetic JPEG was saved in browser storage while offline and stayed queued after reconnect. `Sync now` attempted `POST /api/v1/jobs/6ad1d45ffd979adfafa3fbbd/documents`, which returned HTTP 500. The photo remains queued in this browser; do not clear site data before retrying. |

## Likely configuration issue

The Vercel project environment-variable list has no S3 storage variables configured for Preview. The API's `STORAGE_DRIVER` defaults to `local`, and its configuration warns that local uploads need a persistent server disk. A Vercel function's local filesystem is not suitable for durable uploaded files. This makes missing object-storage configuration the leading explanation for the two upload failures, but the generic Vercel 500 log did not expose the exception, so this needs confirmation after storage is configured.

To use S3-compatible storage, configure these in Vercel Preview (keep values private):

- `STORAGE_DRIVER=s3`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT` only when using an S3-compatible service other than AWS S3
- `S3_PATH_STYLE=true` only when required by the storage provider

Redeploy the staging Preview after adding storage configuration, then retry the queued photo and invoice upload with synthetic data. Confirm the invoice variance report shows the expected `$112.50` variance. Do not use the production database for these checks.

## Next validation pass

1. Add persistent object storage configuration to the Vercel Preview environment.
2. Retry the queued synthetic photo; verify it appears in the job's Photos tab after sync and remains available after a reload.
3. Upload a new synthetic supplier invoice; verify invoice metadata and the variance report.
4. Confirm reminder de-duplication and the scheduled trigger separately; Preview does not run the production cron schedule.
5. Record the new deployment and outcomes here without including credentials or tokens.
