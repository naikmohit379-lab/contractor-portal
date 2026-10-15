# RoofDesk first-release workflow

## Agreed release scope

- Geography: Texas.
- Job types: insurance restoration, retail replacement, and repairs.
- Aerial measurement: EagleView is the selected first vendor. The app still uses its mock provider until API access and credentials are available; a second vendor is deferred.
- Estimates: Xactimate-compatible export is required for launch. Confirm the accepted format before implementing or claiming compatibility.
- Waivers: all four Texas conditional/unconditional progress/final forms are in scope, but counsel must supply and approve the wording before a form can be enabled.
- Payments: mock mode for the MVP; no real charges.
- Operations Intern workspace: included in the MVP.
- Staging: Vercel Preview from `staging`, backed by a distinct `roofdesk_staging` database on the existing Atlas cluster. Production remains separately configured.

## Day-to-day job workflow

1. Create the job and confirm its Texas address and job type.
2. Assign an Operations Intern only to the job(s) she is authorized to work on. The API limits her job access to those assignments.
3. Add roof photos and documents. Use the admin/operations queues to surface jobs with no uploads; verify actual claim-file completeness in the job before submission.
4. Order a measurement. Until EagleView access is configured, make clear that the returned measurement is sample/mock data and do not rely on it for a customer estimate.
5. Prepare and review an estimate from the company's versioned price list. Do not describe a CSV or internal estimate as Xactimate-compatible until the export format is confirmed and implemented.
6. Prepare the claim, attach the supporting materials, and track carrier follow-up.
7. Create supplier orders, record any supplier invoice PDF and invoice total, and review the price variance against priced PO lines.
8. Use only waiver templates approved by an owner/admin after counsel review. Obtain signatures and verify required waivers before releasing payment readiness.
9. Keep payments in mock mode in staging and the MVP. Report unresolved payment exceptions to an authorized owner/admin.
10. Review the Admin Panel and Business overview for exceptions, then resolve or assign follow-ups in their source workspaces.

## Admin and intern handoff

- Owners/admins use **Admin Panel** to triage company-wide queues and **Team access** to invite Project Managers or Operations Interns. Only an existing Owner can invite another Owner. Project Managers can assign eligible interns from job details.
- Interns accept a single-use invitation and set their own password. Never share an existing user's password.
- Interns can read assigned jobs and manage internal follow-up tasks, but cannot edit claim/legal/financial records, invite users, or change company settings.
- Overdue open or blocked Operations follow-up tasks get a daily in-app reminder for the task creator and the job's active assignees. This is not an email/SMS reminder and does not change the task status.
- Escalate payments/refunds to the authorized billing/owner process. Escalate waiver form content and legal questions to counsel.

## Staging and release gate

1. Make code changes on `staging`. GitHub Actions CI runs for pushes to `staging` and `main`; Vercel builds the staging branch as Preview.
2. Use invented test data and the `roofdesk_staging` database. Check role access, job assignment boundaries, uploads, invoice comparison, claim follow-up, waiver workflow, and mock payment behavior.
3. Do not use production customer data or real payments for staging checks.
4. Resolve failed CI checks and staging issues before promoting changes to `main`.
5. Production deployment is a separate release action. Before launch, confirm vendor access, Xactimate export format, counsel-approved Texas forms, production secrets, backups/restore, and monitoring.

## Current limits

The Admin Panel is a read-only triage overview. Owners and admins can configure payment waiver gating and the second-approver refund threshold from **Settings**; general role editing is not implemented. The missing-upload queue only detects jobs with zero uploaded files. Invoice variance compares invoice total with saved PO line prices and does not parse invoice lines. Offline photo files remain in browser storage on the device until uploaded, so keep the device and browser profile; they are not part of the server backup until sync completes. Vercel Cron runs only for production deployments, so overdue reminders won't run on staging Preview; configure `CRON_SECRET` in Vercel before promoting the scheduled route to production. EagleView and Xactimate integrations are not live until their prerequisites are complete.
