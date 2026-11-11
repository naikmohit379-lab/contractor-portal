# Roofora Implementation and Production Readiness

**Status checked:** 2026-11-11  
**Purpose:** Current consolidated status of the India-first PRD. This document supersedes older status snapshots where they conflict; dated validation logs remain useful historical evidence. See the [PRD](PRODUCT_REQUIREMENTS.md) for product scope and [India-first scope](INDIA_FIRST_SCOPE.md) for market constraints.

## Current release evidence

- The latest work is on the `staging` branch: `a370807` (payment verification), `44e43ab` (Mongoose security update), and `45db18b` (status documentation).
- GitHub CI run [#70](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42984787171) passed for `45db18b`. CI run [#69](https://github.com/naikmohit379-lab/contractor-portal/actions/runs/42983450104) passed the full code workflow for `44e43ab`: types/tests/build, dependency audit, and browser tests (34 passed, 4 skipped).
- Vercel Preview for `45db18b` was Ready at [the staging deployment](https://contractor-portal-7wmzqyf2z-mohith-c47e.vercel.app/). These commits did not deploy to Production or change Live payment settings.
- Local checks recorded for `44e43ab`: API 125 tests across 24 files; shared package 39 tests across 9 files; estimate engine 5 tests; API and web typechecks; queue relay TypeScript check. Production dependency audit reported two moderate advisories and no high/critical advisories.
- The working tree has a pre-existing untracked `deploy/razorpay-webhook-relay/` folder. It was preserved and is not the active queue-backed relay.

## Production launch gates

These are the most important outstanding actions before enabling Live payments or treating the service as production-ready.

1. **Razorpay’s approved multi-contractor setup — pending.** Razorpay Support opened ticket **21779346** for the Partnership Program. Its final written guidance on Roofora’s shared website, each contractor’s own merchant account, and the approved connection method has not yet been recorded. Keep Live payments disabled until the answer is clear.
2. **Razorpay Test Mode validation — partially complete.** One synthetic ₹100 Test Mode payment reached Paid in Razorpay and Roofora through the signed webhook path. The integration tests cover success, failure, refunds, duplicate delivery, amount mismatch, role restrictions, and tenant boundaries. The actual Razorpay delivery response log was not inspected; hands-on failure/refund/retry and delayed/duplicate deliveries remain to be confirmed in staging. Queue/DLQ operational monitoring also needs a documented check.
3. **Merchant activation — pending per contractor.** Each pilot contractor must complete Razorpay’s account activation/KYC and confirm that the required payment methods, including UPI where desired, are enabled. A Test Mode result does not establish Live eligibility.
4. **Indian CA/counsel review — pending.** GST/tax treatment, invoice wording, customer contracts, privacy notices, retention, and any India-specific legal forms require qualified review. The app must not claim compliance or repurpose legacy U.S. insurance/waiver content as Indian guidance.
5. **Operations validation with Indian users — pending.** Synthetic staging work verified photo upload/sync and invoice variance behavior. Representative contractor workflows and production reminder delivery still need hands-on validation. The authenticated staging reminder cron call was not verified; in-app reminders do not send email/SMS.
6. **Production operations — partially complete.** The Production monitor workflow has successful scheduled runs (latest recorded run #136 on `main`, 2026-11-11). GitHub failure notifications have not been confirmed. Atlas Free does not provide managed backups; manual backup scripts exist, but an encrypted off-device backup is not confirmed. The restore drill is deferred at the owner's request and is not included as active work unless resumed.
7. **Email delivery — reported working; production evidence pending.** The owner reported the password-reset email is working after domain verification. The production sender/environment and a production delivery log have not been recorded as verified in the project docs.

## Existing PRD implementation gaps

These are requirements already present in project documents, not newly proposed features.

### Recently implemented from the existing PRD

**REQ-DOC-4: Attach the original RoofV report to its measurement record.** Automatic retrieval is implemented in source and pushed to the `staging` branch in commit `ac921ae`. After retrieving measurement JSON, the server requests RoofV's saved-job report PDF when the provider returns a RoofV job ID; it verifies PDF bytes/size and stores the file privately with SHA-256 and retrieval metadata on the exact tenant/job/report. Authorized job readers download it through an authenticated route. Manual PDF upload is intentionally excluded. If the PDF is not yet available or the job ID is missing, measurements remain usable without an attachment and a later free report refresh can retry retrieval. Retrieval is audited; measurement values are unchanged. On 2026-11-11, the focused RoofV provider suite passed 6 tests; the complete API suite passed 128 tests across 24 files; shared tests passed 39 across 9 files; estimate tests passed 5; API and web typechecks passed; and the API bundle built. The web production build compiled and generated static pages but failed copying standalone traced files because Windows denied symlink creation. `next lint` reached an interactive ESLint setup prompt because no lint configuration exists; it was canceled without creating a config. Manual staging browser inspection confirmed the automatic PDF section is present and manual PDF upload controls are absent. Refreshing the existing Koramangala RoofV record returned a provider failure; no PDF was attached and no second order was submitted. The staging Vercel alias served the app, but the Vercel dashboard session was logged out, so the exact deployment commit/Ready status and GitHub CI status were not independently confirmed. Provider-success validation remains pending.

### Other existing implementation gaps

- **Document workflow:** Per-job folders and a complete category/lifecycle model are incomplete. Offline notes and a cached offline app shell are not implemented.
- **Supplier invoices:** Current variance is a high-level invoice/order comparison. Invoice-line extraction is not implemented.
- **Reporting:** Large report exports as background jobs are not implemented; current reports are basic/partial.
- **Security/privacy:** The PRD lists MFA/SSO, sensitive-field encryption beyond currently protected provider credentials, malware scanning for uploads, and comprehensive privacy export/deletion controls as missing. Retention and deletion requirements need CA/counsel review before implementation. No specific MFA method has been selected.
- **Localization:** Hindi text exists with English fallback; fluent Hindi product review remains outstanding.
- **RoofV:** The adapter, quota check, ordering, report retrieval, automatic original PDF fetch, and authenticated PDF download exist in source. Manual PDF upload is excluded. Provider access/terms and account limits need confirmation; returned quantities need review/site verification. Ambiguous-building selection and unattended signed-webhook/scheduled report updates are not implemented. The staging UI was checked, but the existing report refresh failed at the provider-read step, so successful PDF retrieval remains unverified; no new order was placed.

## Open product decisions and intentionally later scope

- Confirm one accountable Company Owner and the Project Manager/Operations Intern permissions. The current system permits an Owner to invite another Owner; the exact single-owner/delegation rule is undecided. The long-term Operations Intern role is also undecided.
- The company Admin Panel is currently a read-only, company-scoped triage overview. Direct editing from that panel is not implemented. A cross-company Roofora Platform Admin is not approved in the current PRD.
- Razorpay API refunds, link cancellation, and full provider reconciliation are not implemented. They are later scope; the current test flow does not initiate refunds.
- Supplier API/EDI, delivery verification, returns/reordering, SMS, and large background exports are later scope, not prerequisites for the first MVP unless reprioritized.
- The backup restore drill remains deferred, as previously requested. No database reset or destructive migration is planned.

## Documentation and evidence rules

- Use this file as the current consolidated status. Older dated sections in README and `docs/` record what was known at the time and must not be read as newer than this snapshot.
- “Implemented” means code exists; “tested” requires a recorded command/result; “deployed” requires an environment, commit, and observed status; “validated” requires the described hands-on evidence. A successful CI run or Ready Preview alone does not prove an external provider workflow.
- No Live payment keys, Production payment enablement, or Production deployment are included in the staging work above.
