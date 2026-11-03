# Product Requirements Document: Roofora India-First Roofing Platform

**Version:** 2.0
**Updated:** November 3, 2026
**Status:** India-first product direction; implementation and external approvals are tracked per requirement below.

This document replaces the U.S.-focused October 12, 2026 draft as the active product requirements document. Historical U.S. records and code may be retained for compatibility, but U.S.-specific workflows are not requirements for the India launch. See [India-First Product Scope](INDIA_FIRST_SCOPE.md) for the current market direction and [MVP Workflow](MVP_WORKFLOW.md) for the intended user journey.

## 1. Product overview

Roofora is a job and operations platform for residential and commercial roofing contractors across India, especially small and medium-sized businesses. It brings customer and property details, roof measurements, estimates and quotations, supplier orders, job photos and documents, team coordination, and payment tracking together in one workspace.

**Product goal:** Help Indian roofing businesses organize projects, prepare professional quotations using their own verified prices, and keep their teams informed throughout a job.

**Market:** Pan-India.
**Languages:** English and Hindi, with English fallback for untranslated interface text.
**Currency:** INR for new Indian companies and transactions.
**Measurement preference:** Metric for new Indian companies; preserve stored historical values and show them using the owning company's settings.
**Roof measurement provider:** RoofV is the required aerial measurement provider for the India MVP. The application must support manual site measurements as a fallback and require users to review provider output before relying on it.
**Payments:** Razorpay is the selected future gateway target. Current payment behavior remains simulated; Razorpay is not yet integrated and live payments must not be enabled without testing and explicit authorization.

## 2. Target users

- Roofing company Owner or authorized company administrator.
- Project Manager coordinating jobs, suppliers, and operational follow-ups.
- Estimator preparing measurements, price lists, estimates, and quotations.
- Office or billing staff tracking invoices and payment status.
- Field staff who capture job photos and complete assigned work.
- Suppliers and customers may receive limited links or documents where a workflow supports them; they do not receive general company-workspace access by default.

An Operations Intern role exists in the current application. Whether this role remains in the long-term role model is an open product decision, not a required role for every company.

## 3. Goals and non-goals

### Goals

- Keep each roofing job's customer, property, measurements, estimate, orders, documents, tasks, and payment status connected.
- Support Indian residential roofing, commercial roofing, and roof repair jobs.
- Make INR, Indian addresses, metric units, and Asia/Kolkata time the defaults for newly registered Indian companies.
- Let contractors maintain their own material and labour rates and use them to prepare itemized quotations.
- Support field photo capture, offline queuing, and later sync when connectivity returns.
- Provide company-scoped views for operational oversight, with access controlled by user role.
- Keep money, audit events, and customer documents tenant-isolated.

### Non-goals for the initial India release

- Supporting a different aerial measurement provider in the initial release.
- U.S. insurance-claim workflows, U.S. statutory waivers, Texas forms, or U.S.-specific price formats.
- Automated Indian tax advice, GST determination, or legally authoritative contract/waiver generation.
- Rooftop-solar installation workflows.
- Live payments before the Razorpay integration and payment-recipient model are tested and approved.
- A global Roofora Platform Admin with unrestricted access to every company's records until that role and its safeguards are separately approved.

## 4. India-first company, customer, and property requirements

### Company settings

New Indian companies default to:

- Country: India (`IN`).
- Currency: Indian rupee (`INR`).
- Locale: English (India), with Hindi (India) available.
- Time zone: `Asia/Kolkata`.
- Measurement preference: metric.

Existing companies' market settings must not be silently changed. Historical financial amounts must not be relabeled or converted. A country/currency change that could reinterpret existing records requires a reviewed migration or a separate company workspace.

### Customer and property records

Support Indian contact and property information, including:

- Customer or organization name and contact details.
- Address lines, locality, city/town, district, State or Union Territory, and six-digit PIN code.
- Optional landmark and geographic coordinates/map pin.
- Country code, defaulting to India for new India workspaces.
- Job type: residential roofing, commercial roofing, or roof repair.

Validation must not require a U.S. state abbreviation or ZIP code. Existing U.S. records remain readable where practical and must not be rewritten as Indian records.

## 5. Core job workflow

1. Create a job and enter customer and Indian property details.
2. Record site-verified roof dimensions manually, including sections, area, pitch, linear measurements, waste allowance, and the source/date where known. Measurements must be clearly identified as manually entered and should be checked on site before purchasing materials.
3. Add job photos and documents. Queue selected photos locally when offline and sync them after the device reconnects.
4. Prepare an estimate from the company's versioned price list. Generate CSV and printable PDF quotation outputs for review and sharing.
5. Record supplier orders, requested delivery details, invoices, and price variance against the purchase order.
6. Assign work and follow-up tasks, track job stage, and show overdue operational tasks to authorized company users.
7. Track payment milestones and status. In the current release, payment outcomes are simulated and are not proof that money moved.
8. Close the job after the company confirms its work and financial records.

## 6. Functional requirements and current status

Status terms: **Implemented** means code exists; **Partially implemented** means core flow exists with documented gaps; **Pending** means not implemented or not yet validated. A code status does not imply production readiness.

### 6.1 Accounts, roles, and company access

- **REQ-ACC-1 — Tenant isolation:** Users may access records belonging to their authorized company only. **Implemented; continue security testing.**
- **REQ-ACC-2 — Authentication:** Sign-up, sign-in, password hashing, session refresh, and sign-out. **Implemented.**
- **REQ-ACC-3 — Password reset:** Single-use, expiring reset link; successful reset revokes active sessions. **Implemented; user has reported email working, but confirm the current Production sender and delivery logs.**
- **REQ-ACC-4 — Team invitations:** Invitees receive a single-use setup link and create their own password. **Implemented.**
- **REQ-ACC-5 — Company roles:** Apply least privilege to owners, administrators, project managers, and operational users. **Partially implemented; role hierarchy is under product review.** Current code allows an Owner to invite another Owner, so it does not enforce the proposed single-owner rule.
- **REQ-ACC-6 — Owner/delegation model:** Desired direction is one accountable Company Owner with optional delegated sub-owner/company-admin access. Exact permissions and whether to enforce exactly one Owner remain **open for approval**.
- **REQ-ACC-7 — Platform-wide administration:** A Roofora Platform Admin who can access all companies is **not implemented** and remains a separate product/security decision. Do not confuse it with the company-scoped Admin Panel.
- **REQ-ACC-8 — Operations Intern:** Available in the current product, but its ongoing necessity is **open for product confirmation**.

### 6.2 Jobs, stages, and documents

- **REQ-JOB-1 — Job record:** Maintain customer, Indian address, job type, stage, assignees, measurements, estimates, orders, documents, and tasks. **Implemented.**
- **REQ-JOB-2 — Job stages:** Owners/Admins can rename the fixed standard stages. Adding, removing, or reordering stages is **not implemented**.
- **REQ-DOC-1 — Private job documents:** Store photos and files with company/job association and access checks. **Implemented; validate production storage configuration and limits.**
- **REQ-DOC-2 — Document history:** Tags and replacement versions are partially supported. Per-job folders and a complete category/lifecycle model are **not implemented**.
- **REQ-DOC-3 — Offline photos:** Queue and sync photos from the current browser profile. **Implemented; pending files are not backed up until upload completes.** Offline notes and a cached offline app shell are **not implemented**.
- **REQ-DOC-4 — Original measurement-report attachment:** Attaching a third-party roof report directly to its measurement record is **not implemented**.

### 6.3 Measurements and estimates

- **REQ-MEAS-1 — Manual measurement fallback:** Enter verified site dimensions and preserve source notes when provider data is unavailable or needs correction. **Implemented.**
- **REQ-MEAS-2 — Required RoofV provider:** RoofV is the required aerial measurement integration for India. The API adapter, quota preflight, ordering, and existing-report retrieval flows are implemented; enablement and end-to-end verification depend on valid server-side credentials, provider access/terms, and staging validation. Do not submit paid or quota-consuming measurements without user authorization. **Partially implemented; operational enablement and validation pending.**
- **REQ-EST-1 — Company price list:** Maintain versioned contractor-entered material and labour prices. **Implemented; each contractor is responsible for checking its rates.**
- **REQ-EST-2 — Quotation:** Prepare itemized estimates/quotations and export line-item CSV and printable PDF. **Implemented.** These are not Xactimate/ESX exports, which are outside the India-first scope unless separately requested.
- **REQ-EST-3 — Indian tax treatment:** Tax behavior must not be presented as certified or legally authoritative. Obtain CA review before implementing tax calculations or invoice rules. **Professional review pending.**

### 6.4 Supplier and operations workflows

- **REQ-SUP-1 — Orders:** Create and track supplier purchase orders and delivery windows. **Implemented.**
- **REQ-SUP-2 — Invoices and variance:** Upload supplier invoices and compare totals with saved order pricing. **Implemented as a high-level comparison; detailed invoice-line extraction is not implemented.**
- **REQ-SUP-3 — Supplier integrations:** Supplier API/EDI connections, automatic order submission, quantity/photo delivery verification, returns, and reorder automation are **not implemented**.
- **REQ-OPS-1 — Tasks and assignments:** Manage company operational tasks and assignments with role checks. **Implemented.**
- **REQ-OPS-2 — Overdue reminders:** Create in-app reminders for overdue open/blocked tasks. **Implemented; authenticated staging cron execution and production scheduled delivery still require verification.** Reminders do not send email/SMS.
- **REQ-OPS-3 — User validation:** Supplier variance, offline photo sync, and reminder behavior have prior synthetic staging checks, but ongoing validation with representative Indian contractor users remains **pending**.

### 6.5 Payments and refunds

- **REQ-PAY-1 — Current behavior:** Keep payments in mock mode; show clear messaging that simulations are not real transactions. **Implemented.**
- **REQ-PAY-2 — Selected future provider:** Razorpay is the selected integration target for India. **Not integrated.** Do not claim that Razorpay is connected or accept live payments yet.
- **REQ-PAY-3 — Merchant/funds model:** Roofora will collect customer payments through its Razorpay platform account and route contractor proceeds through Razorpay Route linked accounts. **Product decision confirmed; Razorpay Route approval/onboarding and each contractor's linked-account setup are pending.** The platform commission/split rule remains open.
- **REQ-PAY-4 — Razorpay test integration:** Implement Route-enabled test-mode checkout, server-side secret storage, INR/paise-safe amounts, signed webhook verification, idempotent event handling, refunds/reversals, and reconciliation. **Pending; requires Route access, test credentials, an approved split rule, and staging testing.**
- **REQ-PAY-5 — Live payment activation:** Requires end-to-end test-mode validation, business/account onboarding, relevant CA/counsel review, and explicit authorization. **Disabled.**

### 6.6 Admin and reporting

- **REQ-ADM-1 — Company Admin Panel:** Show company-scoped activity and triage counts for authorized Owners/Admins. **Implemented as a read-only overview with links to existing workspaces.**
- **REQ-ADM-2 — Direct admin editing:** Editing records, changing team roles, and approving financial actions from the Admin Panel is **not implemented**; those actions use their existing authorized workspaces.
- **REQ-ADM-3 — Global Platform Admin:** Cross-company search and editing are **not part of this approved PRD revision**. Treat as a separate, pending security and product decision.
- **REQ-RPT-1 — Company reports:** Basic operational and payment summaries exist. **Partially implemented.**
- **REQ-RPT-2 — Global search:** Search across jobs, customers, and documents is **not implemented**.
- **REQ-RPT-3 — Export jobs:** Large reporting exports as background jobs are **not implemented**.

### 6.7 Localization and notifications

- **REQ-LOC-1 — Locale defaults:** New Indian companies use INR, English (India), Asia/Kolkata, and metric settings; Hindi is available with English fallback. **Implemented.**
- **REQ-LOC-2 — Interface translation coverage:** Core translations exist; complete Hindi coverage and professional review remain **pending**.
- **REQ-LOC-3 — Email:** Resend is available for transactional email. Password reset and invitation emails require verified sender/configuration and delivery checks in the target Vercel environment. **Implementation exists; production delivery verification should be recorded.**
- **REQ-LOC-4 — SMS:** SMS provider and delivery workflows are **not implemented**.

## 7. India legal, tax, and privacy boundaries

- Roofora must not invent Indian statutory waiver templates or describe legacy U.S. forms as valid in India.
- The current U.S. insurance claim and lien-waiver modules remain legacy compatibility functionality, not India-first workflows.
- Indian tax treatment, GST calculations, invoice wording, customer contracts, privacy notices, and retention practices require qualified India-based CA/counsel review before they are represented as compliant.
- Store only the customer/job data needed for the service; enforce company-level access and audit sensitive actions. Retention, deletion, and privacy export procedures need a reviewed policy.

## 8. Security, reliability, and operations requirements

- Enforce authentication, role permissions, tenant-scoped database access, input validation, secure file access, password hashing, audit logging, and secret handling on the server.
- Verify webhook signatures before applying provider events; deduplicate events and avoid treating browser redirects as proof of payment.
- Production monitoring workflow exists. Confirm its first successful production run and configure failure notifications.
- Atlas Free tier has no managed Cloud Backup. Manual backup scripts exist; an encrypted off-device backup and restore rehearsal are **not confirmed**. The restore drill was previously deferred by the project owner and remains deferred unless they resume it.
- Load, availability, measurement accuracy, and business success targets have not been established through production measurements or load tests.
- Admin MFA/SSO, sensitive-field encryption, file malware scanning, and comprehensive privacy export/deletion controls are **not implemented**.

## 9. Roadmap

### India MVP (current product focus)

- India-first company and job setup, INR/metric display, English/Hindi interface.
- Manual site measurement, job files/photos, estimates, CSV/PDF quotations, supplier orders/invoice variance, tasks, and in-app reminders.
- Payment workflow stays simulated.
- RoofV is the required aerial measurement provider; preserve manual measurement entry as a fallback.
- Razorpay integration is a future target and cannot go live before the decisions and checks in REQ-PAY-3 through REQ-PAY-5.

### Later, subject to approval and resources

- Razorpay test-mode integration after the merchant/funds model is settled.
- Supplier API/EDI and invoice-line extraction.
- Stronger offline/PWA support and additional document lifecycle tools.
- Global search, public partner APIs/webhooks, accounting integrations, and background report exports.
- Broader administration features, including any cross-company Platform Admin, only after role boundaries and safeguards are agreed.

## 10. Open decisions

1. Confirm the company role design: one accountable Owner, optional delegated sub-owner/company admin, and Project Manager permissions. The current system does not enforce a single Owner.
2. Decide whether a global Platform Admin should be built and define the permitted access, approvals, audit history, and emergency-access rules.
3. Confirm whether the Operations Intern role should remain a supported product role.
4. Decide the Roofora platform fee amount or percentage before implementing Route transfer calculations. **Intentionally deferred by the project owner on November 3, 2026; do not hard-code a fee.**
5. Obtain Razorpay Route approval and confirm its onboarding and operating requirements with Razorpay.
6. Define CA/counsel-approved tax, privacy, terms, and document requirements before claiming compliance.
7. Decide future reporting, supplier, and offline/PWA priorities.

## 11. Historical U.S. compatibility

The active market and requirements above are India-first. Existing U.S. records and U.S.-specific code may remain for backward compatibility. Do not convert historic USD amounts to INR, rewrite historical addresses or timestamps, delete U.S. records, or treat legacy insurance/waiver documents as Indian forms. Any future U.S. market return requires a separately approved scope.
