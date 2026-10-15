# Product Requirements Document: Roofing Contractor Portal
Version: 1.0 (Draft) | Date: October 12, 2026 | Status: For review  
## 1. Overview
The Roofing Contractor Portal is a web-based platform that lets roofing contractors run the revenue-critical parts of a job from one place: measuring the roof, building and defending an insurance claim estimate, ordering materials, and collecting lien waivers so payment is not delayed.  
The portal is built around four capabilities:  
1. Aerial satellite measurement integrations  
2. Insurance claim estimation workflows  
3. Material supplier order coordination  
4. Lien waiver tracking  
Assumptions are flagged as [Assumption] and collected in Section 14 for confirmation.  
## 2. Problem Statement
Roofing contractors, especially storm-restoration and residential re-roof companies, juggle disconnected tools: a measurement vendor's website, spreadsheets or desktop estimating software, emails with adjusters, phone calls to supplier branches, and paper or PDF lien waivers. This causes:  
• Slow quoting: manual or site-visit measurements delay estimates by days.  
• Underpaid claims: missed line items and weak documentation lead to adjuster pushback and supplements.  
• Material errors: wrong quantities, late deliveries, and unclear pricing cause waste and crew downtime.  
• Payment delays and legal exposure: missing or incorrect lien waivers hold up draws and final payments, and can expose contractors to mechanic's lien disputes.  
## 3. Goals and Non-Goals
### 3.1 Goals
• Cut time from lead to accurate estimate to under 24 hours without a site visit for standard roofs.  
• Increase insurance claim approval accuracy and reduce supplement cycles.  
• Reduce material ordering errors and returns.  
• Ensure every payment milestone has the correct lien waiver status visible and tracked.  
• Give owners and office managers a single view of job profitability and cash-flow blockers.  
### 3.2 Non-Goals (v1)
• Full accounting or payroll (integrate with existing accounting tools instead).  
• Crew scheduling and GPS fleet tracking.  
• Homeowner-facing marketplace or lead generation.  
• Building our own aerial imagery or measurement engine.  
• Providing legal advice on lien law; the portal tracks and generates forms but does not replace counsel.  
## 4. Target Users and Personas
Persona  
Description  
Primary needs  
Owner / Operator  
Runs a 5-100 person roofing company  
Profit visibility, fewer payment delays, scalable process  
Estimator / Sales Rep  
Measures roofs and writes estimates  
Fast accurate measurements, reusable templates, claim-ready documentation  
Project Manager  
Coordinates jobs from contract to completion  
Material ordering, delivery tracking, waiver status  
Office / Billing Admin  
Handles claims paperwork, invoicing, collections  
Claim status, waiver collection, payment readiness  
Supplier Rep (external)  
Distributor branch rep  
Clear orders, confirmations, delivery windows  
Subcontractor (external)  
Crews, gutter, or solar installers  
Simple way to sign and submit waivers  
Homeowner (external, limited)  
Property owner  
Sign documents, approve estimates, view status  
## 5. Product Scope Summary
Module  
Summary  
Release  
Core platform  
Accounts, roles, jobs, customers, documents, notifications  
MVP  
Aerial measurement  
Order and import satellite/aerial roof measurements  
MVP  
Insurance claim estimation  
Build, document, submit, and track claim estimates  
MVP  
Supplier order coordination  
Generate material lists, place and track orders  
Phase 2  
Lien waiver tracking  
Request, collect, e-sign, and track waivers by payment  
Phase 2  
Reporting and analytics  
Job margin, claim cycle time, waiver aging  
Phase 3  
## 6. Core Platform Requirements
ID  
Requirement  
Priority  
CP-1  
Multi-tenant company accounts with role-based access (Owner, Admin, Estimator, PM, Billing, Read-only)  
Must  
CP-2  
Job record as the central object: customer, property address, job type (retail, insurance, commercial), stage, assigned team  
Must  
CP-3  
Job pipeline with configurable stages (Lead, Measured, Estimated, Claim Filed, Approved, Materials Ordered, In Progress, Complete, Paid)  
Must  
CP-4  
Document storage with versioning, tagging, and per-job folders (photos, contracts, claim files, waivers)  
Must  
CP-5  
Activity log and audit trail on every job, estimate, order, and waiver  
Must  
CP-6  
Email and SMS notifications, plus in-app task reminders  
Should  
CP-7  
Mobile-responsive web UI usable on a phone on the roof or in the truck  
Must  
CP-8  
Public API and webhooks for job and status events  
Could  
## 7. Module 1: Aerial Satellite Measurement Integrations
### 7.1 Objective
Provide accurate roof measurements from aerial or satellite imagery, ordered and ingested directly into the job, so estimators avoid climbing roofs for standard projects.  
### 7.2 User Stories
• As an estimator, I enter an address and receive a roof report with area, pitch, ridges, hips, valleys, eaves, and rakes so I can estimate immediately.  
• As an estimator, I can compare reports from two providers when a roof is complex.  
• As a PM, I can correct measurements on site and have the corrections flow into the estimate and material list.  
### 7.3 Functional Requirements
ID  
Requirement  
Priority  
AM-1  
Integrate with at least two aerial measurement providers [Assumption: e.g., EagleView, Hover, GAF QuickMeasure, or similar] through a provider-agnostic adapter layer  
Must  
AM-2  
Order a report from within a job using the verified property address; show order status (ordered, processing, delivered, failed)  
Must  
AM-3  
Parse delivered reports into structured data: total area, facets, pitch per facet, linear measurements by type, waste factor suggestion, structures on property  
Must  
AM-4  
Store the original report PDF and imagery references with the job  
Must  
AM-5  
Interactive roof diagram viewer showing facets and edges, with ability to edit lengths, pitches, and add or remove facets  
Should  
AM-6  
Manual measurement entry and override, with a change log showing who changed what and why  
Must  
AM-7  
Address validation and geocoding; flag mismatched or multi-structure properties  
Should  
AM-8  
Cost tracking per report and optional pass-through to the job cost  
Should  
AM-9  
Handle provider failures gracefully: retries, fallback provider prompt, user alert  
Must  
AM-10  
Imagery date display so users know how current the aerial image is, with a warning when imagery is older than a configurable threshold  
Should  
### 7.4 Acceptance Criteria (selected)
• Given a valid address, when the user orders a report, then the job shows a pending order within 5 seconds and updates automatically on delivery.  
• Given a delivered report, when it is parsed, then measurements appear in the job without manual entry, and total area matches the provider report within 0.5%.  
• Given a manual override, the system records the original value, new value, user, timestamp, and reason.  
## 8. Module 2: Insurance Claim Estimation Workflows
### 8.1 Objective
Guide contractors through building a defensible, line-item estimate for insurance claims, assembling supporting evidence, and tracking the claim through approval and supplements.  
### 8.2 User Stories
• As an estimator, I generate a claim-ready estimate from measurements using regional price lists and standard roofing line items.  
• As an estimator, I attach photos and annotate damage so the adjuster sees what I saw.  
• As a billing admin, I track claim status, adjuster communications, and supplements in one timeline.  
• As an owner, I see approved versus requested amounts by claim.  
### 8.3 Functional Requirements
ID  
Requirement  
Priority  
IC-1  
Claim record linked to a job: carrier, policy number, claim number, date of loss, adjuster contact, deductible, claim status  
Must  
IC-2  
Estimate builder with line items, quantities auto-populated from measurements, unit pricing from configurable regional price lists  
Must  
IC-3  
Line-item library covering tear-off, underlayment, shingles, flashing, drip edge, ridge cap, ventilation, code upgrades, steep and high charges, debris haul-off, and permits, with templates by roof type  
Must  
IC-4  
Import and export estimates in an industry-standard format [Assumption: Xactimate-compatible ESX/PDF where licensing permits]  
Should  
IC-5  
Photo capture and upload with annotation (arrows, text, damage markers) and automatic organization by roof slope or area  
Must  
IC-6  
Damage documentation checklist (hail hits per test square, wind creasing, missing shingles) with required fields before submission  
Should  
IC-7  
Claim packet generator: estimate, photos, measurement report, weather or storm event data, code citations, and cover letter  
Should  
IC-8  
Claim status workflow: Draft, Submitted, Inspection Scheduled, Approved, Partially Approved, Denied, Supplement Filed, Closed  
Must  
IC-9  
Estimate versioning to compare original, carrier-approved, and supplement versions with differences highlighted  
Must  
IC-10  
Supplement workflow: identify variances from the carrier scope, attach justification, and track outcome  
Should  
IC-11  
Communication log: record emails, calls, and notes with adjusters; upload carrier correspondence  
Must  
IC-12  
Deductible and depreciation handling: recoverable and non-recoverable depreciation tracking, ACV and RCV amounts  
Should  
IC-13  
Homeowner approval and e-signature of estimate, contract, and assignment of benefits where legally permitted by state  
Should  
IC-14  
Compliance guardrails: configurable state rules (e.g., restrictions on deductible waivers or public adjusting activity) with warnings  
Could  
### 8.4 Acceptance Criteria (selected)
• Given a job with measurements, when the user starts an estimate from a template, then quantities are populated and the total updates live as line items change.  
• Given a claim in Approved status, when a supplement is created, then the system shows a side-by-side comparison with the approved scope.  
• A claim packet can be generated as a single PDF in under 60 seconds for up to 100 photos.  
## 9. Module 3: Material Supplier Order Coordination
### 9.1 Objective
Convert approved estimates into accurate material orders, send them to suppliers, and track delivery to the job site.  
### 9.2 User Stories
• As a PM, I generate a material list from the approved estimate and adjust for waste and color selections.  
• As a PM, I send the order to my preferred supplier branch and receive confirmation with a delivery window.  
• As a billing admin, I match supplier invoices to orders and the job budget.  
### 9.3 Functional Requirements
ID  
Requirement  
Priority  
SO-1  
Supplier directory with branches, contacts, delivery zones, and account numbers  
Must  
SO-2  
Auto-generate a material list from estimate and measurements with configurable waste factors, bundles, and package sizes (e.g., squares to bundles)  
Must  
SO-3  
Product catalog mapping contractor line items to supplier SKUs, with manufacturer, color, and product line selection  
Must  
SO-4  
Purchase order creation, approval workflow (optional), and PDF/email transmission to the supplier  
Must  
SO-5  
Supplier integration options in priority order: (a) email/PDF with structured confirmation link, (b) supplier portal or API where available [Assumption: major distributors], (c) EDI for large accounts  
Should  
SO-6  
Delivery scheduling: requested date and time window, drop location instructions (roof load, driveway), and confirmation tracking  
Must  
SO-7  
Order status tracking: Draft, Sent, Confirmed, Scheduled, Delivered, Partially Delivered, Backordered, Cancelled  
Must  
SO-8  
Price tracking: quoted versus invoiced price, flag variances above a configurable threshold  
Should  
SO-9  
Delivery verification with photo upload and quantity check on receipt  
Should  
SO-10  
Returns and reorders: create a return request for unused material and a supplemental order for shortages  
Could  
SO-11  
Link supplier invoices to the job for margin calculation and lien waiver generation (conditional waivers need supplier amounts)  
Should  
### 9.4 Acceptance Criteria (selected)
• Given an approved estimate, when the user generates a material list, then all roofing materials are listed with correct package units and the user can edit before ordering.  
• Given a sent order, when a supplier confirms, then status and delivery window update on the job and a notification goes to the PM.  
## 10. Module 4: Lien Waiver Tracking
### 10.1 Objective
Ensure that every payment on a job is backed by the right lien waivers from the right parties, with clear status and automated follow-up, so contractors get paid on time and reduce lien risk.  
### 10.2 User Stories
• As a billing admin, I request conditional waivers from suppliers and subcontractors before a draw and receive unconditional waivers after payment.  
• As a PM, I can see at a glance which parties have not submitted waivers and block payment release until they do.  
• As a subcontractor, I can sign a waiver from my phone via a link without creating an account.  
### 10.3 Functional Requirements
ID  
Requirement  
Priority  
LW-1  
Waiver types: conditional progress, unconditional progress, conditional final, unconditional final  
Must  
LW-2  
State-specific waiver form templates [Assumption: launch with states covering target customers; some states, such as CA, TX, FL, AZ, GA and others, mandate statutory forms], versioned and reviewed by legal counsel  
Must  
LW-3  
Party registry per job: general contractor, subcontractors, suppliers, and optionally lower-tier parties, with contact info and contract amounts  
Must  
LW-4  
Payment schedule per job (deposit, progress draws, final) with expected amounts and dates; waivers link to each payment  
Must  
LW-5  
Waiver request workflow: auto-generate pre-filled waivers (job address, owner, through-date, amount) and send via email or SMS  
Must  
LW-6  
E-signature and notarization support where required; capture signer identity, timestamp, and IP  
Must  
LW-7  
Status board by job and by party: Not Requested, Requested, Viewed, Signed, Rejected, Expired  
Must  
LW-8  
Automated reminders and escalation rules (e.g., 3-day reminder, 7-day escalate to PM)  
Should  
LW-9  
Payment gating: configurable warning or hard block that flags a payment as not ready when required waivers are missing  
Should  
LW-10  
Validation checks: signed amount matches expected payment, through-date is correct, signer is an authorized party; flag discrepancies  
Should  
LW-11  
Preliminary notice and notice-of-intent deadline tracking where applicable by state [Assumption: Phase 3]  
Could  
LW-12  
Exportable waiver packet per job for closeout, owner, lender, or title company  
Should  
LW-13  
Immutable storage of executed waivers with tamper-evident audit trail  
Must  
### 10.4 Acceptance Criteria (selected)
• Given a scheduled progress payment, when the user requests waivers, then each required party receives a pre-filled form and status shows Requested.  
• Given an unsigned required waiver, when a user marks the payment as ready, then the system displays a warning (or blocks, per company setting) listing the missing parties.  
• Given a signed waiver, the stored document cannot be edited and any replacement creates a new version with an audit entry.  
## 11. Cross-Module User Flow
1. Lead created: Estimator adds the customer and address; the job opens in Lead stage.  
2. Measure: Estimator orders an aerial report; measurements import automatically.  
3. Estimate: Estimator builds a line-item estimate, attaches photos, and generates a claim packet.  
4. Claim: Billing admin submits to the carrier, logs the adjuster inspection, and tracks approval or supplements.  
5. Contract: Homeowner e-signs; the payment schedule is created.  
6. Order: PM generates the material list, sends the PO, and confirms delivery.  
7. Build: Crew completes work; photos are uploaded for closeout.  
8. Collect: Waivers are requested for each draw; payments are marked ready only when waivers are in.  
9. Close: Final waivers collected, final payment received, job closed, margin report generated.  
## 12. Non-Functional Requirements
Area  
Requirement  
Performance  
Pages load in under 2 seconds on a typical 4G connection; estimate recalculation under 500 ms  
Availability  
99.9% monthly uptime for core features  
Security  
Encryption in transit (TLS 1.2+) and at rest; SSO option; MFA for admins; role-based permissions; least-privilege access to documents  
Privacy and compliance  
Handle homeowner PII, policy and claim data responsibly; data retention and deletion controls; applicable privacy laws; SOC 2 readiness as a medium-term goal  
Legal records  
E-signature compliance (ESIGN, UETA); waiver and contract retention of at least 7 years or as legally required  
Scalability  
Support 10,000 active jobs per tenant and 1,000 concurrent users without degradation  
Reliability  
Integration calls use retries with backoff, idempotency keys, and dead-letter queues; no duplicate paid report orders  
Accessibility  
WCAG 2.1 AA for core workflows  
Auditability  
All status, amount, and document changes recorded with user and timestamp  
Offline tolerance  
Photo capture and notes queue locally on mobile and sync when connectivity returns  
## 13. Data Model (High Level)
• Company has many Users and Jobs.  
• Job has one Customer/Property, many MeasurementReports, Estimates, Claims, PurchaseOrders, PaymentMilestones, Documents, and Parties.  
• MeasurementReport has many Facets and LinearMeasurements, and a Provider reference.  
• Estimate has many EstimateVersions, each with LineItems.  
• Claim has Carrier, Adjuster, StatusHistory, Supplements, and Communications.  
• PurchaseOrder has Supplier, OrderLines, DeliveryEvents, and Invoices.  
• PaymentMilestone has many Waivers; each Waiver belongs to a Party and has a Type, Template version, Amount, ThroughDate, Status, and SignatureRecord.  
## 14. Integrations and Assumptions
Integrations  
• Aerial measurement providers (via adapter layer)  
• Weather and storm history data provider for claim support  
• Supplier systems (email, portal, API, EDI)  
• E-signature service (build or buy)  
• Accounting software (QuickBooks, Xero) for invoices and payments  
• Email, SMS, and push notification services  
• Maps and geocoding  
Assumptions to confirm  
1. Primary market is US residential and light commercial roofing; insurance work is a major share of revenue.  
2. Specific vendor choices (measurement, e-signature, weather data) are not yet fixed.  
3. Xactimate compatibility depends on licensing and may be limited to PDF export in v1.  
4. Lien waiver forms are reviewed by legal counsel for each launch state.  
5. Supplier API availability varies; email-based ordering is the baseline.  
## 15. Success Metrics
Metric  
Target (6 months after launch)  
Time from address entry to estimate  
Under 24 hours median, under 2 hours for standard roofs  
Measurement accuracy vs. on-site verification  
Within 3% on area for 90% of roofs  
Claim supplement success rate  
Improve by 15% over customer baseline  
Average claim cycle time  
Reduce by 20%  
Material order error or return rate  
Below 3% of orders  
Waivers collected before payment  
At least 95% of payments  
Median waiver turnaround  
Under 3 business days  
Weekly active users per customer  
At least 70% of licensed seats  
Net Promoter Score  
40 or higher  
## 16. Release Plan
Phase  
Timeline  
Scope  
MVP  
Months 0-4  
Core platform, aerial measurement (2 providers), estimate builder, basic claim tracking, photo documentation  
Phase 2  
Months 5-8  
Claim packets and supplements, supplier ordering with email workflow, lien waiver requests, e-signature, status board  
Phase 3  
Months 9-12  
Supplier API/EDI, payment gating, deadline tracking, accounting sync, analytics dashboards  
Phase 4  
Months 12+  
Homeowner portal, AI-assisted damage detection, predictive supply pricing  
## 17. Risks and Mitigations
Risk  
Impact  
Mitigation  
Measurement provider cost, rate limits, or contract terms  
Margin pressure, lock-in  
Adapter layer, multi-provider support, pass-through pricing  
Inaccurate measurements on complex roofs or outdated imagery  
Wrong estimates and orders  
Imagery date warnings, manual override, on-site verification workflow  
State-by-state lien law complexity  
Legal exposure  
Counsel-reviewed templates, phased state rollout, clear disclaimers  
Carrier-specific estimate rules and licensing (price lists, formats)  
Weak claim acceptance  
Configurable price lists, partnerships, PDF-first export  
Supplier integration fragmentation  
Slow adoption of ordering  
Email baseline, incremental API integrations  
Low field adoption  
Data gaps  
Mobile-first UX, offline photo capture, short onboarding  
Sensitive data breach  
Trust and legal harm  
Security program, access controls, audit logs  
## 18. Open Questions
1. Which states and which roofing segments (storm restoration, retail, commercial) do we launch with first?  
2. Do we build e-signature in-house or integrate a third-party service?  
3. Is Xactimate interoperability a launch requirement or a later enhancement?  
4. Should payment gating be a hard block by default or a configurable warning?  
5. What is the pricing model: per seat, per job, or per report order?  
6. Which accounting systems must be supported at launch?  
7. Do subcontractors and suppliers need accounts, or should link-based access be sufficient?  
## 19. Appendix: Glossary
• ACV / RCV: Actual Cash Value / Replacement Cost Value.  
• ESX: Xactimate estimate file format.  
• Supplement: A request to the carrier for additional scope or payment after the initial approval.  
• Conditional waiver: Waives lien rights upon receipt of payment.  
• Unconditional waiver: Waives lien rights immediately, regardless of payment.  
• Square: 100 square feet of roof area.  
• EDI: Electronic Data Interchange, a standard for business-to-business documents.  

## Implementation Addendum: Admin Panel

> Added October 15, 2026. This addendum documents the current RoofDesk implementation and the owner/admin dashboard requested for the project. It does not change the original PRD's release priorities.

### Available now

- **Access:** The `/admin` page is shown to Owners and Admins. The API requires the `user:manage` permission and returns data scoped to the signed-in company.
- **Company overview:** Counts jobs, active claims awaiting follow-up, requested/viewed waivers, flagged/failed/disputed payments, late supplier orders, overdue open/blocked Operations tasks, jobs with no uploaded files, and active accounts.
- **Recent activity:** Shows up to six recently updated jobs and eight recent audit events. Payment amounts and audit metadata are excluded from this overview.
- **Triage links:** Queue cards route managers to the existing job, payment, supplier, team, and Operations workspaces to review and resolve the underlying work.
- **Related controls:** Team invitations and job assignments are handled in their existing workspaces. Payment waiver-gating and refund-approval threshold settings are available under Settings.

### Current limits

- The Admin Panel is a read-only triage view; it does not edit roles, job records, claim records, payment records, or approve refunds.
- The missing-upload count means a job has no uploaded files at all. It does not validate a claim-document checklist.
- Company user/role management remains in Team access; company policy settings remain in Settings.
- Access is limited to Owners and Admins in this implementation; other manager roles use their own workspaces and queues.

## Remaining PRD Work and Release Readiness

The items below reflect the current code and the agreed first-release decisions recorded in `docs/MVP_WORKFLOW.md`. The original PRD is a draft and assigns some modules to later phases; the project later chose to include some of those modules in its MVP.

### Agreed first-release gaps

1. **Live aerial measurements:** The application currently uses a mock provider. EagleView ordering, report retrieval/normalization, and provider credentials are not configured. The originally proposed second provider was deferred by the project decision.
2. **Xactimate-compatible estimate export:** No confirmed ESX interchange/export is implemented. Confirm the required format and licensing with the recipient/vendor before calling an export compatible. This was made a launch requirement in the project decisions.
3. **Texas statutory waivers:** The four waiver workflow types exist, but the default wording is generic. Counsel must supply/review and approve Texas conditional/unconditional progress/final wording before the forms are used.
4. **Unsigned-waiver reminders and escalation:** The scheduled daily reminder covers overdue Operations follow-up tasks only. It does not remind or escalate on unsigned waivers; email/SMS reminders and the 3-day/7-day rules in the PRD remain.
5. **Waiver closeout packet and notarization/OTP:** Exporting a closeout waiver packet, notarization, and signer OTP are not implemented.
6. **Claims evidence completion:** The claim workflow, estimate versions, communications, and photo annotations are present, but a required damage checklist and a generated all-in-one claim PDF with the full PRD contents (including weather/storm data, code citations, and cover letter) are not complete.
7. **Homeowner approval and state compliance:** Token-based homeowner approval/e-signing for estimates/contracts and configurable state compliance guardrails are not implemented.
8. **Supplier workflow extras:** Supplier API/EDI integrations, delivery verification with quantity checks/photos, returns/reorders, and invoice line-item parsing are not complete. Current invoice variance is a high-level comparison against saved PO prices.
9. **Platform integrations:** Public API/outgoing webhooks, QuickBooks/Xero accounting sync, weather data, and a real e-signature/notarization provider are not connected.

### Other PRD requirements not yet complete

- **Configurable job pipeline (partial):** Owners/Admins can now rename the nine standard stages, and those labels appear across the dashboard and job views. Adding, removing, or reordering stages and company-specific stage transitions are not supported yet.
- **Document lifecycle (partial):** Users with job write access can add up to 12 tags to each document, upload same-kind replacement versions, review version metadata, and download an older version. Per-job folders and distinct document categories remain unimplemented; versions preserve file bytes and checksums, while annotations apply only to the current photo.
- **Search:** Global search across jobs, customers, and documents (including Atlas Search) is not implemented.
- **Offline field work:** Photos can queue locally and sync after connectivity returns, but offline notes and a cached PWA shell are not implemented. Pending photos remain only in that browser profile until sync completes.
- **Platform API:** The public partner API and outgoing job/status webhooks are not implemented.
- **Security and privacy controls:** Admin MFA/SSO, field-level encryption for sensitive claim data, retention/deletion and privacy-export workflows, and strict payer-page CSP are not in place.
- **Acceptance and service targets:** PRD goals such as 99.9% uptime, 10,000 active jobs per tenant, 1,000 concurrent users, measurement-accuracy targets, and business success metrics have not been load-tested or measured in production.
### Later-phase or production-hardening gaps

- SMS notifications; user-facing waiver email reminders and escalation; reporting exports as background jobs.
- Upload antivirus scanning and server-generated image thumbnails.
- Redis/BullMQ background workers, transactional outbox processing, retries/dead-letter handling, and shared live events for multiple API instances.
- Automated browser/accessibility runs and real-device checks for the release; sustained performance and uptime targets have not been measured.
- Vercel production availability checks and Atlas backup/restore scripts are implemented. Still enable GitHub failed-run notifications, confirm the first production monitor run, create and store an off-device backup, and rehearse an isolated restore before relying on the process.

### Explicitly accepted MVP constraints

- Payments remain in mock mode by project decision; no real charges are made.
- A second measurement provider is deferred.
- The Operations Intern workspace is included. Daily in-app overdue Operations-task reminders are deployed; they do not send email/SMS.
