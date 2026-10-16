# Technical Architecture: Roofing Contractor Portal
Version: 1.0 (Draft) | Date: October 12, 2026 | Stack: React + Next.js (frontend), MERN backend (MongoDB, Express, Node.js) | Companion to: Product Requirements Document v1.0  
## 1. Purpose and Scope
This document describes the technical architecture for the Roofing Contractor Portal: how the system is structured, which technologies are used where, how data flows, and how the four product modules (aerial measurement, insurance claim estimation, supplier order coordination, lien waiver tracking) are implemented. It is the reference for engineering, DevOps and security reviews.  
Items marked [Assumption] are proposals to confirm. Cloud provider and third-party vendors are not yet fixed.  
## 2. Architecture Principles
1. Modular monolith first. One Node.js/Express deployable with strict internal module boundaries. Split into services only when scale or team structure demands it.  
2. Job-centric domain. Almost every entity hangs off a Job; this drives data modelling, permissions and APIs.  
3. Multi-tenant by default. Every record carries a companyId, and every query is tenant-scoped through a single enforced layer.  
4. Integrations behind adapters. Measurement providers, suppliers, e-signature, weather and accounting are swappable behind internal interfaces.  
5. Async for anything slow or unreliable. Third-party calls, PDF generation and notifications run in background jobs, never inside a request.  
6. Auditable and immutable where it matters. Waivers, claim versions and status changes are append-only with an audit trail.  
7. Mobile-first, offline-tolerant UI. Field users capture photos and notes on poor connections.  
8. Type safety end to end. TypeScript on both frontend and backend with shared schemas.  
## 3. Technology Stack
Layer  
Choice  
Notes  
Frontend framework  
Next.js (App Router) + React 18+  
SSR/RSC for dashboards, client components for interactive tools  
Language  
TypeScript (strict)  
Shared types package across web and API  
UI  
Tailwind CSS + shadcn/ui (Radix)  
Accessible components, design tokens  
Server state  
TanStack Query  
Caching, optimistic updates, retries  
Client state  
Zustand  
Local UI state, estimate builder drafts  
Forms and validation  
React Hook Form + Zod  
Zod schemas shared with the backend  
Maps and roof viewer  
Mapbox GL or Google Maps + SVG/Canvas roof diagram  
[Assumption]  
Backend runtime  
Node.js (LTS) + Express  
Modular structure, REST API  
Database  
MongoDB (Atlas) + Mongoose  
Replica set for transactions  
Cache, queues  
Redis + BullMQ  
Jobs, rate limiting, short-lived caches  
File storage  
S3-compatible object storage + CDN  
Photos, PDFs, waivers, reports  
Search  
MongoDB Atlas Search  
Jobs, customers, claims search; avoids a separate cluster  
Auth  
JWT access tokens + rotating refresh tokens (httpOnly cookies); OIDC/SSO later  
Argon2 password hashing  
Real-time  
Server-Sent Events or Socket.IO  
Order, report and waiver status updates  
PDF generation  
Headless Chromium (Puppeteer) worker  
Claim packets, waiver packets  
Email / SMS  
Transactional email provider and SMS provider [Assumption]  
Via notification service  
Observability  
OpenTelemetry, Sentry, structured JSON logs  
Metrics dashboards and alerting  
CI/CD  
GitHub Actions  
Lint, test, build, deploy  
Hosting  
Frontend on Vercel or containerised; backend on containers (ECS/Kubernetes) [Assumption]  
Infrastructure as code with Terraform  
## 4. System Context and High-Level Architecture
The system is organised in five layers:  
1. Clients: Browser (desktop and mobile web, installable as a PWA); external signers (subcontractors, homeowners) using tokenised links.  
2. Edge: CDN, WAF, and TLS termination in front of the Next.js app and the API.  
3. Application: Next.js web app; Express API (modular monolith); background worker processes sharing the same codebase.  
4. Data and infrastructure: MongoDB, Redis, object storage.  
5. External services: Aerial measurement providers, supplier systems, weather data, e-signature, accounting, email/SMS, maps.  
Request flow (typical): Browser, then CDN/WAF, then Next.js (server rendering and route handlers for the BFF layer), then the Express REST API, then MongoDB/Redis. Slow work is enqueued to BullMQ and processed by workers; results are pushed back to the browser via SSE and persisted to the database.  
Deployable units  
Unit  
Responsibility  
Scaling  
web (Next.js)  
UI rendering, BFF route handlers, auth session handling  
Horizontal, stateless  
api (Express)  
Business logic, REST endpoints, webhooks intake  
Horizontal, stateless  
worker  
Report ingestion, PDF generation, notifications, reminders, sync jobs  
Scale by queue depth  
scheduler  
Cron-like jobs (waiver reminders, imagery age checks, nightly reports)  
Single leader  
## 5. Frontend Architecture (React + Next.js)
### 5.1 Rendering Strategy
Area  
Strategy  
Reason  
Marketing / login  
Static or SSR  
Speed, SEO  
Dashboards, job lists  
Server components with streamed data, client hydration for filters  
Fast first paint  
Estimate builder, roof viewer, photo annotator  
Client components  
Heavy interactivity  
Public signing pages (waivers, estimates)  
SSR with token validation  
No account required, mobile friendly  
### 5.2 Project Structure
apps/web/  
  app/  
    (auth)/login, register, reset  
    (portal)/  
      dashboard/  
      jobs/[jobId]/  
        overview/ measurements/ estimate/ claim/  
        orders/ waivers/ documents/ activity/  
      suppliers/ parties/ settings/ reports/  
    sign/[token]/            (public signing flow)  
    api/                     (BFF route handlers, auth callbacks)  
  components/                (ui, forms, tables, roof-viewer, photo-annotator)  
  features/                  (measurements, claims, orders, waivers: hooks, api, schemas)  
  lib/                       (api client, auth, formatters, constants)  
  stores/                    (Zustand stores)  
packages/  
  shared/                    (Zod schemas, types, enums, permission map)  
### 5.3 Data Fetching and State
• Server components fetch initial data through an authenticated server-side API client; mutations go through client-side TanStack Query calls to the API.  
• TanStack Query keys follow [entity, companyId, id, filters]; mutations use optimistic updates for status changes and invalidate related keys.  
• Zustand holds ephemeral drafts such as an in-progress estimate or roof edit, with autosave to the API every few seconds.  
• Real-time: an SSE hook subscribes to /events?jobId= and updates the Query cache when report, order or waiver status changes arrive.  
### 5.4 Authentication and Authorization in the UI
• Access token is held in memory; refresh token in an httpOnly, SameSite cookie. Next.js middleware redirects unauthenticated users.  
• The shared permission map (role to allowed actions) hides or disables UI controls; the API remains the source of truth.  
• Role-aware navigation: Estimator, PM, Billing, Owner, Read-only.  
### 5.5 Key UI Components
• Roof viewer: SVG/Canvas rendering of facets, edges and pitches with editing; emits structured measurement changes.  
• Estimate builder: virtualised line-item grid, live totals, template picker, version compare view.  
• Photo capture and annotator: camera upload, client-side compression, annotation layer, offline queue (IndexedDB) with background sync.  
• Status boards: kanban pipeline for jobs; waiver matrix (party by payment) with colour states.  
• Signing flow: token-based, mobile-first, signature pad, identity and consent capture.  
### 5.6 Performance, Accessibility and PWA
• Route-level code splitting, image optimisation, dynamic import of the roof viewer and annotator.  
• Target Core Web Vitals: LCP under 2.5s, INP under 200ms.  
• WCAG 2.1 AA with Radix primitives and automated axe checks in CI.  
• Service worker caches the shell and queues photo uploads for poor connectivity.  
## 6. Backend Architecture (MERN)
### 6.1 Modular Monolith Structure
apps/api/src/  
  core/          (config, logger, errors, middleware, tenancy, rbac, audit)  
  modules/  
    auth/ users/ companies/ jobs/ customers/ documents/  
    measurements/   (providers/, adapters, parsers)  
    claims/         (estimates, line-items, packets, supplements)  
    orders/         (suppliers, catalog, purchase-orders, deliveries)  
    waivers/        (templates, parties, payments, signing)  
    notifications/ reports/ webhooks/  
  jobs/          (BullMQ queues, processors, schedules)  
  integrations/  (measurement, supplier, esign, weather, accounting, messaging)  
  app.ts, server.ts  
Each module exposes only its service interface and routes; other modules call services, never another module's models directly. Layering inside a module: routes -> controller -> service -> repository (Mongoose).  
### 6.2 API Design
• REST over HTTPS, JSON, versioned at /api/v1.  
• Resource-oriented routes, e.g. /jobs/:jobId/measurements, /jobs/:jobId/estimates/:id/versions, /jobs/:jobId/orders, /payments/:id/waivers.  
• Cursor-based pagination, field filtering and sorting; consistent error envelope with machine-readable codes.  
• Request validation with Zod at the edge of every route; OpenAPI spec generated from schemas and published for the frontend and partners.  
• Idempotency-Key header supported on create endpoints that trigger paid or external actions (report orders, purchase orders, waiver requests).  
• Rate limiting per user, per tenant and per IP using Redis.  
• Webhook endpoints for providers (signature verification, replay protection, quick ack and enqueue).  
### 6.3 Multi-Tenancy and Authorization
• companyId is embedded in the JWT and injected into a request context; a Mongoose plugin automatically applies companyId filters on every read and write, and blocks queries without it.  
• RBAC with permission strings (estimate:write, waiver:approve, order:send). Policies are evaluated in middleware, with resource-level checks (e.g., job assignment) in services.  
• External signers use single-purpose, expiring, hashed tokens scoped to one waiver or document, with rate limiting and optional OTP verification.  
### 6.4 Background Processing
Queue  
Examples  
Notes  
integrations  
Order aerial report, poll provider, send PO to supplier  
Retries with exponential backoff, dead-letter queue  
documents  
Claim packet PDF, waiver packet, photo thumbnails  
CPU heavy; isolated worker pool  
notifications  
Email, SMS, push, in-app events  
Templated, rate limited  
scheduled  
Waiver reminders and escalations, stale imagery checks, status sync  
Leader-elected scheduler  
Jobs are idempotent and keyed by business identifiers to avoid duplicate orders or charges.  
### 6.5 Eventing
Modules publish domain events (MeasurementDelivered, ClaimStatusChanged, OrderConfirmed, WaiverSigned) on an in-process event bus backed by a transactional outbox collection. Consumers update read models, trigger notifications and emit real-time messages. This keeps modules decoupled and leaves a clean path to extracting services later.  
## 7. Data Architecture (MongoDB)
### 7.1 Principles
• Atlas replica set (3 nodes minimum), multi-document transactions only where consistency demands it (e.g., waiver signing plus status update, estimate version creation).  
• Embed data that is read and written together (estimate line items inside an estimate version, facets inside a measurement report); reference data with independent lifecycle (jobs, parties, suppliers).  
• Soft delete for business records; hard delete only for retention-policy purges.  
• Every document has companyId, createdAt, updatedAt, createdBy, and a schemaVersion.  
### 7.2 Core Collections
Collection  
Key fields  
Key indexes  
companies  
name, settings, plan, state licences, price list defaults  
slug unique  
users  
companyId, email, role, status, MFA  
{companyId, email} unique  
jobs  
companyId, customer, property (address, geo), type, stage, assignees, financial summary  
{companyId, stage, updatedAt}, 2dsphere on geo, text/Atlas Search  
measurementReports  
jobId, provider, providerOrderId, status, imageryDate, facets[], linear{}, totals, rawFileKey, overrides[]  
{jobId}, {provider, providerOrderId} unique  
estimates  
jobId, currentVersion, type (retail or claim), totals  
{jobId}  
estimateVersions  
estimateId, versionNo, kind (original, approved, supplement), lineItems[], totals, createdBy  
{estimateId, versionNo} unique  
claims  
jobId, carrier, policyNo, claimNo, dateOfLoss, adjuster, status, statusHistory[], ACV/RCV/depreciation  
{companyId, status}, {claimNo}  
communications  
claimId, channel, direction, body, attachments  
{claimId, createdAt}  
priceLists / lineItemLibrary  
region, items, unit prices, effective dates  
{companyId, region}  
suppliers  
branches, contacts, accounts, delivery zones  
{companyId}  
catalogItems  
supplierId, sku, manufacturer, colour, mapping to line items  
{supplierId, sku} unique  
purchaseOrders  
jobId, supplierId, lines[], status, deliveryWindow, deliveries[], invoices[]  
{jobId}, {status}  
parties  
jobId, type (sub, supplier, GC), contact, contract amount  
{jobId}  
paymentMilestones  
jobId, type, expectedAmount, dueDate, status, requiredWaiverTypes  
{jobId}  
waivers  
milestoneId, partyId, type, templateVersion, amount, throughDate, status, signature{}, documentKey, hash  
{milestoneId, partyId}, {status, dueAt}  
documents  
jobId, type, storageKey, version, tags, checksum  
{jobId, type}  
auditLogs  
actor, entity, action, before, after, ip, at (append-only)  
{entity, entityId, at}  
outbox  
event, payload, status  
{status, createdAt}  
### 7.3 Data Integrity and Retention
• Executed waivers store a SHA-256 hash of the final PDF; any change creates a new versioned record, never an overwrite.  
• Application-level field encryption for sensitive PII (e.g., policy numbers) using a KMS-managed key.  
• Retention policies by document type (minimum 7 years for waivers and contracts [Assumption]), with legal hold support.  
• Backups: continuous cloud backup with point-in-time restore; quarterly restore tests.  
## 8. Module Implementation Designs
### 8.1 Aerial Measurement Integration
Adapter interface: orderReport(address, options), getStatus(orderId), fetchReport(orderId), normalize(raw), plus capability flags per provider.  
Flow  
1. User requests a report; API validates and geocodes the address, creates a measurementReports record (ordered) with an idempotency key.  
2. An integrations job calls the chosen provider adapter.  
3. Completion arrives by provider webhook or polling; a worker downloads the report, stores the raw file in object storage and normalises it into facets, pitches and linear measurements.  
4. An event updates the job, pushes an SSE message to the browser and pre-populates the estimate quantities.  
5. Manual overrides are stored in overrides[] with user, reason and timestamp; the effective value is computed on read.  
Failure handling: retries, fallback-provider prompt, and alerting when provider error rates spike.  
### 8.2 Insurance Claim Estimation
• Estimate engine (pure TypeScript package shared by web and API) computes line-item totals, overhead and profit, tax, depreciation (ACV vs RCV) and deductible so the UI previews and the server validates with identical logic.  
• Versioning: each save of a submitted or approved estimate creates a new estimateVersion; diffs are computed by line-item key for the comparison view and supplement justification.  
• Claim packet: a documents job renders HTML templates (estimate, photo grid, measurement summary, cover letter) to PDF via headless Chromium, merges attachments and stores the final file; the user is notified on completion.  
• Status machine: explicit allowed transitions (Draft, Submitted, Inspection Scheduled, Approved, Partially Approved, Denied, Supplement Filed, Closed) enforced in the service layer with history recorded.  
• Photos: direct-to-storage presigned uploads, server-side thumbnail generation, EXIF capture (time, location) for evidence value.  
### 8.3 Supplier Order Coordination
• Material list generator: maps estimate line items to catalog items using mapping rules, applies waste factors and converts units (squares to bundles).  
• Supplier adapter tiers: (1) email/PDF with a confirmation link that updates order status, (2) supplier API or portal integration where available, (3) EDI via a dedicated connector later.  
• State machine: Draft, Sent, Confirmed, Scheduled, Delivered, Partially Delivered, Backordered, Cancelled.  
• Price variance: supplier invoices ingested (manual upload first, parsed later) and compared against quoted price; variances above the threshold raise a task.  
### 8.4 Lien Waiver Tracking
• Template service: versioned, state-specific templates stored with field maps and statutory text; legal approval flag required before a template can be activated.  
• Generation: pre-fills job address, owner, through-date, amount and party; renders to PDF for signing.  
• Signing: tokenised public page (/sign/[token]) with consent text, signature capture, timestamp, IP and device metadata; optional OTP and notarisation hook. On completion, a transaction writes the executed document, hash, waiver status, audit log and outbox event.  
• Gating: paymentMilestones compute a readiness flag from required waivers; company setting selects warning or hard block.  
• Reminders: the scheduler enqueues reminders and escalations per rules (for example, 3-day reminder, 7-day escalate).  
• Validation: signed amount and through-date compared to expected values; mismatches create a review task.  
## 9. Security Architecture
Concern  
Approach  
Transport  
TLS 1.2+ everywhere, HSTS, secure cookies  
Authentication  
Argon2 hashes, short-lived access tokens, rotating refresh tokens with reuse detection, MFA for admins, SSO later  
Authorization  
Tenant isolation plugin, RBAC, resource-level checks, deny by default  
Input handling  
Zod validation, output encoding, file type and size checks, antivirus scan on uploads  
API protection  
WAF, rate limiting, CORS allow-list, CSRF protection for cookie flows, Helmet headers  
Secrets  
Cloud secrets manager, no secrets in repo, key rotation  
Data protection  
Encryption at rest, field-level encryption for sensitive PII, scoped presigned URLs with short expiry  
Integrations  
Webhook signature verification, IP allow-lists where offered, per-provider credentials by tenant where needed  
Audit  
Append-only audit log of sensitive actions, exportable per job  
Compliance  
ESIGN/UETA evidence capture, privacy controls (export, deletion), SOC 2 readiness roadmap  
Supply chain  
Dependency scanning, lockfiles, SAST in CI, container image scanning  
## 10. Infrastructure and DevOps
Environments: local (Docker Compose with MongoDB, Redis, MinIO), development, staging (production-like, anonymised data), production.  
CI/CD pipeline: lint and type-check, unit tests, integration tests (against ephemeral MongoDB/Redis), build images, security scans, deploy to staging, run end-to-end smoke tests, manual approval, progressive production rollout with automated rollback.  
Repository: a monorepo (pnpm workspaces + Turborepo) with apps/web, apps/api, packages/shared, packages/estimate-engine, packages/config.  
Observability  
• Structured logs with request, tenant and job correlation IDs.  
• Metrics: API latency, queue depth and age, provider success rates, report turnaround, waiver aging.  
• Tracing across web, API and workers via OpenTelemetry.  
• Alerts on error rate, queue backlog, failed webhooks and certificate expiry.  
Disaster recovery targets: RPO 15 minutes, RTO 2 hours [Assumption].  
## 11. Scalability and Performance
• Stateless web and api containers behind autoscaling; workers scale on queue depth.  
• Redis caching for price lists, templates and permission lookups; short TTL with explicit invalidation.  
• MongoDB: compound indexes aligned to tenant-first queries, projection to limit payloads, read replicas for reporting, and a path to sharding by companyId if one cluster becomes insufficient.  
• Large lists use cursor pagination and virtualised tables; heavy reports run as background jobs and cache their results.  
• Capacity targets: 10,000 active jobs per tenant, 1,000 concurrent users, API p95 under 300 ms for standard reads.  
## 12. Testing Strategy
Level  
Tooling  
Focus  
Unit  
Vitest/Jest  
Estimate engine, unit conversions, state machines, permission rules  
Integration  
Supertest + Testcontainers  
API routes, tenancy isolation, repositories, transactions  
Contract  
Pact or schema tests  
Provider adapters against recorded fixtures and sandbox accounts  
End to end  
Playwright  
Lead to estimate to claim to order to waiver journeys, mobile viewport  
Non-functional  
k6, axe, OWASP ZAP  
Load, accessibility, security scanning  
Critical paths (estimate totals, waiver readiness, tenant isolation) require high coverage and run on every pull request.  
## 13. Key Architecture Decisions
ID  
Decision  
Rationale  
Trade-off  
ADR-1  
Modular monolith over microservices  
Faster delivery, simpler operations for a small team  
Needs discipline to keep boundaries; extraction later is possible via the outbox and service interfaces  
ADR-2  
Next.js App Router with a separate Express API  
Matches the required stack; keeps business logic reusable by non-web clients and webhooks  
Two deployables to manage; BFF handlers kept thin  
ADR-3  
MongoDB with embedded versions for estimates  
Natural document shape, simple reads  
Large estimates need size monitoring; careful indexing for reporting  
ADR-4  
BullMQ on Redis for jobs  
Mature, retries and scheduling built in  
Redis becomes a critical dependency; use managed HA Redis  
ADR-5  
Shared Zod schemas and estimate engine package  
One source of truth for validation and calculations  
Requires monorepo versioning discipline  
ADR-6  
Adapter pattern for every external provider  
Vendor flexibility, easier testing  
Extra abstraction up front  
ADR-7  
Append-only waivers and audit logs  
Legal defensibility  
Storage growth; needs retention tooling  
## 14. Risks and Mitigations
Risk  
Mitigation  
Tenant data leakage through a missed filter  
Mandatory tenancy plugin, automated isolation tests, query linting, periodic security review  
Provider outages or schema changes  
Adapters with contract tests, fallback provider, monitoring and alerts  
Document-size or query growth in MongoDB  
Size monitoring, archive old versions, indexes reviewed per release  
PDF generation load spikes  
Dedicated worker pool, queue limits, caching of unchanged packets  
Legal exposure from incorrect waiver templates  
Counsel-approved, versioned templates, activation gate, state-by-state rollout  
Weak field connectivity  
Offline queue, resumable uploads, optimistic UI  
Team scaling inside a monolith  
Module ownership, boundary lint rules, CODEOWNERS  
## 15. Delivery Roadmap (Technical)
Phase  
Focus  
Foundation (weeks 1-4)  
Monorepo, CI/CD, auth, tenancy, RBAC, jobs and customers, document storage, audit log, observability baseline  
MVP (weeks 5-16)  
Measurement adapters (2 providers), roof viewer, estimate engine and builder, basic claim workflow, photo capture, SSE updates  
Phase 2 (weeks 17-32)  
Claim packets and supplements, supplier ordering (email tier), waiver templates, signing flow, reminders, status boards  
Phase 3 (weeks 33-48)  
Supplier API/EDI, payment gating, accounting sync, analytics, performance and security hardening, SOC 2 preparation  
## 16. Open Technical Questions
1. Which cloud provider and region(s) are required, and are there data residency constraints?  
2. Will the Next.js app be hosted on Vercel or self-hosted with the API?  
3. Build or buy e-signature, and does any state require notarisation support at launch?  
4. Which measurement and supplier providers have sandboxes available for early development?  
5. Is offline-first required for estimates, or only for photo and note capture?  
6. Do enterprise customers require SSO (SAML/OIDC) in the first release?  
## 17. Payment Gateway Security
The portal handles homeowner deposits, progress draws, final payments and, optionally, supplier or subcontractor payouts tied to lien waiver readiness. Payment security is designed so that card and bank data never touch our servers.  
### 17.1 Gateway Strategy
Decision  
Approach  
Provider  
A PCI Level 1 certified gateway [Assumption: Stripe as primary; Authorize.net or Adyen as alternates] behind an internal PaymentProvider adapter so vendors can be swapped  
Methods  
Card, ACH/bank debit (preferred for large roofing invoices to cut fees), and optional financing links  
Card data handling  
Hosted fields or hosted checkout (iframe/redirect) so we qualify for PCI DSS SAQ A; no PAN, CVV or bank account numbers are ever received, logged or stored  
Stored payment methods  
Gateway tokens only (customer and payment-method IDs); last four digits and brand kept for display  
Money model  
Amounts stored as integer minor units with ISO currency; no floating point  
### 17.2 Payment Flow
1. The PM or billing admin creates a payment request against a paymentMilestone; the API generates a unique payment intent via the adapter using an idempotency key.  
2. The homeowner receives a secure link and pays on the hosted page, with 3-D Secure / strong customer authentication where required.  
3. The gateway sends a signed webhook; the API verifies the signature and timestamp, acknowledges immediately and enqueues processing.  
4. A worker updates the payment record, ledger entries and milestone status inside a transaction, then emits a PaymentSucceeded event (receipt, notification, waiver-readiness recalculation).  
5. Failures, disputes and refunds follow the same webhook-driven path; the UI never treats a client-side success redirect as proof of payment.  
### 17.3 Security Controls
Control  
Detail  
PCI DSS scope reduction  
SAQ A posture, strict CSP allowing only the gateway domains on payment pages, subresource integrity on gateway scripts, quarterly review of scripts on payment pages  
Webhook security  
Signature verification with a rotated signing secret, 5-minute timestamp tolerance, replay protection via stored event IDs, source IP allow-list where offered, endpoint isolated from user-auth routes  
Idempotency  
Idempotency keys on all create-payment, refund and payout calls; unique index on {provider, providerEventId}  
Authorization  
Separate permissions for payment:request, payment:refund and payment:payout; refunds above a threshold need a second approver  
Amount integrity  
Server computes payable amounts from milestones; client-supplied amounts are never trusted; amount and currency are re-checked against the webhook payload  
Fraud and risk  
Gateway risk tooling (for example Radar rules), velocity limits per payer, AVS and CVC checks, ACH return and dispute monitoring  
Secrets  
API keys in a cloud secrets manager, restricted keys with minimum scopes, separate test and live keys, rotation every 90 days  
Data minimisation  
Mask payment details in logs and error trackers; redact before sending to Sentry; no payment data in analytics  
Reconciliation  
Daily job compares gateway balance transactions to the internal ledger; mismatches raise a high-priority task  
Audit  
Every payment, refund and status change written to the append-only audit log with actor, IP and before/after values  
Disputes and refunds  
Chargeback evidence packet assembled from job, contract, waiver and delivery records; refunds always initiated through the gateway API  
Testing  
Gateway sandbox in staging; automated tests for webhook replay, out-of-order events, duplicate delivery and partial payments  
### 17.4 Ledger and Financial Integrity
• A double-entry style ledgerEntries collection records every money movement (payment received, fee, refund, payout) and is append-only.  
• Payment readiness for lien waiver gating is computed from ledger state, not from UI actions.  
• Financial exports to accounting tools use the ledger as the source of truth.  
## 18. Responsive Design and Cross-Device Experience
Roofing teams work from phones and tablets on roofs and in trucks, while office staff use desktops. The UI is designed mobile-first and verified on real devices.  
### 18.1 Breakpoints and Layout
Breakpoint  
Width  
Typical layout  
Base (mobile)  
0-639 px  
Single column, bottom navigation, full-screen sheets for forms  
sm  
640 px+  
Larger phones, two-up cards  
md  
768 px+  
Tablet: collapsible side navigation, split views  
lg  
1024 px+  
Desktop: persistent sidebar, multi-column job workspace  
xl  
1280 px+  
Wide dashboards, side-by-side estimate and roof viewer  
### 18.2 Responsive Patterns
• Data tables: collapse into stacked cards on mobile with the key fields first; horizontal scroll only inside a bounded container for wide matrices such as the waiver grid.  
• Estimate builder: line-item rows become expandable cards; totals pinned in a sticky footer.  
• Roof viewer: pinch-zoom and pan on touch, with large handles for edge editing; a read-only simplified mode when space is limited.  
• Photo capture: camera-first upload, multi-select from gallery, on-device compression, progress and retry indicators.  
• Signing pages: one-column, large signature pad, readable type, no horizontal scrolling at 320 px width.  
• Navigation: bottom tab bar on mobile for Jobs, Tasks, Photos and More; sidebar on larger screens.  
### 18.3 Standards
Area  
Standard  
Touch targets  
At least 44 x 44 px with adequate spacing  
Typography  
Fluid type scale using clamp(), minimum 16 px for inputs to prevent mobile zoom  
Spacing and safe areas  
Respect device safe-area insets and the on-screen keyboard; avoid fixed elements that cover inputs  
Images  
Next.js image optimisation with responsive sizes, AVIF/WebP, lazy loading  
Orientation  
Works in portrait and landscape; roof viewer favours landscape  
Theming  
Light and dark themes via design tokens, with sufficient contrast outdoors in sunlight (WCAG AA minimum)  
Input modes  
Correct inputmode and autocomplete for numeric, email and address fields  
Connectivity  
PWA shell, offline queue for notes and photos, clear sync status  
### 18.4 Performance Budgets (Mobile, Mid-Range Device on 4G)
Metric  
Budget  
Largest Contentful Paint  
Under 2.5 s  
Interaction to Next Paint  
Under 200 ms  
Cumulative Layout Shift  
Under 0.1  
Initial JavaScript per route  
Under 200 KB compressed  
Photo upload start  
Under 1 s after selection (background upload)  
### 18.5 Verification
• Playwright projects for mobile, tablet and desktop viewports on every pull request.  
• Visual regression snapshots of key screens at three breakpoints.  
• Real-device test matrix: recent iOS Safari, Android Chrome, one low-end Android, an iPad, and desktop Chrome, Safari, Firefox and Edge.  
• Lighthouse CI and axe accessibility checks gate merges.  
## 19. Extended Security Hardening
Section 9 defines the baseline controls. This section adds the application-level hardening, process and testing practices.  
### 19.1 OWASP Top 10 Mapping
Risk  
Mitigation in this system  
Broken access control  
Tenant-scoping plugin, RBAC, resource checks, automated cross-tenant tests, deny by default  
Cryptographic failures  
TLS 1.2+, encryption at rest, field-level encryption for sensitive PII, KMS-managed keys, Argon2  
Injection (including NoSQL)  
Zod validation, Mongoose strict schemas, operator stripping ($ and . keys) via sanitisation middleware, no string-built queries  
Insecure design  
Threat modelling per module, abuse-case reviews for signing and payments  
Security misconfiguration  
Infrastructure as code, hardened container images, Helmet headers, disabled debug endpoints in production  
Vulnerable components  
Automated dependency scanning, lockfiles, weekly update cadence, SBOM generation  
Authentication failures  
Rate limiting and lockout, MFA for privileged roles, refresh-token rotation with reuse detection, breached-password checks  
Integrity failures  
Signed webhooks, signed build artefacts, protected branches, required reviews  
Logging and monitoring failures  
Centralised structured logs, security alerts for auth anomalies, privilege changes, mass exports  
SSRF  
Allow-listed outbound hosts for provider calls, no user-controlled URL fetching, egress filtering  
### 19.2 Browser and Transport Protections
• Strict Content-Security-Policy with nonces, no inline scripts, and an allow-list limited to the app, CDN, maps and payment gateway.  
• Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and frame-ancestors restrictions; clickjacking protection on all authenticated pages.  
• Cookies: httpOnly, Secure, SameSite=Lax or Strict; CSRF tokens on cookie-authenticated state-changing requests.  
• CORS allow-list per environment; no wildcard origins with credentials.  
### 19.3 File Upload and Document Safety
• Direct-to-storage uploads with short-lived presigned URLs bound to content type, size and path.  
• Server-side MIME sniffing, extension allow-list, antivirus scan before a file becomes available, and image re-encoding to strip embedded payloads.  
• Files served from a separate cookieless domain with Content-Disposition controls.  
• Signed-document hashes verified on every download of an executed waiver.  
### 19.4 Identity and Session Management
• Configurable session lifetimes; idle timeout for sensitive roles; device and session list with remote sign-out.  
• Step-up authentication (MFA re-prompt) for refunds, payout changes, role changes and data exports.  
• Invitation and password-reset tokens are single-use, hashed at rest and short-lived.  
• SSO via OIDC/SAML for enterprise customers in a later phase.  
### 19.5 Process and Governance
Practice  
Cadence  
Threat modelling workshop for each new module  
Before design sign-off  
SAST, dependency and container scanning  
Every pull request  
DAST (OWASP ZAP) against staging  
Weekly  
Third-party penetration test  
Before launch and annually  
Access reviews and secret rotation  
Quarterly  
Incident response drill and runbook update  
Twice a year  
Backup restore test  
Quarterly  
Privacy impact review for new PII fields  
Per change  
Incident response: severity levels, on-call rotation, a 72-hour breach-notification workflow aligned with applicable laws, and customer communication templates.  
## 20. SEO Strategy
Most of the portal is authenticated and must not be indexed. SEO focuses on the public surface that brings contractors in, and, if offered, public contractor pages and estimate-request forms.  
### 20.1 Index and No-Index Rules
Area  
Indexing  
Marketing site (home, features, pricing, resources, blog)  
Index  
Module landing pages (measurement, claim estimating, supplier ordering, lien waivers)  
Index  
Public contractor profile and service-area pages [Assumption: optional feature]  
Index  
Login, register, authenticated portal, /api  
noindex, disallowed in robots.txt  
Signing pages (/sign/[token]) and payment pages  
noindex, nofollow, no tokens in referrers, Referrer-Policy: no-referrer  
### 20.2 Technical SEO in Next.js
• Rendering: static generation or ISR for marketing content; server components for dynamic public pages so crawlers receive complete HTML.  
• Metadata: Next.js Metadata API for unique titles, descriptions, canonical URLs, Open Graph and Twitter cards on every public page.  
• Sitemaps and robots: generated sitemap.xml (split by section) and robots.txt per environment; staging fully blocked.  
• Structured data (JSON-LD): Organization, SoftwareApplication, FAQPage, BreadcrumbList; LocalBusiness and Service for contractor pages.  
• URLs: clean, lowercase, hyphenated slugs; canonical tags to avoid duplicates; 301 redirects for changed URLs.  
• Performance: meet the Core Web Vitals budgets in Section 18.4; optimised fonts and images; minimal third-party scripts.  
• Accessibility and semantics: correct heading hierarchy, landmarks, descriptive alt text and link text, which also support search ranking.  
• International and local: hreflang if additional languages are added; service-area pages per city or state with unique content.  
### 20.3 Content and Measurement
• Content plan targeting roofing business topics: aerial measurement accuracy, insurance supplement guides, lien waiver requirements by state, supplier ordering best practices.  
• Resource templates (checklists, state guides) as indexable assets.  
• Google Search Console and Bing Webmaster Tools set up per domain; track impressions, crawl errors and Core Web Vitals.  
• Analytics via a privacy-friendly tool with consent management; no analytics on payment or signing pages.  
• Monthly SEO audit: broken links, index coverage, schema validation and page speed.  
## 21. Step-by-Step Implementation Plan
The plan follows the roadmap in Section 15 and builds the platform in dependency order: foundation first, then the job-centric core, then each module, then payments and hardening. Durations assume a team of about 6-8 engineers (2 frontend, 3 backend, 1 DevOps/QA, 1 designer part-time) [Assumption] and are indicative.  
### 21.1 Plan at a Glance
Step  
Name  
Weeks  
Outcome  
0  
Discovery and decisions  
1-2  
Vendors, cloud, legal scope and designs agreed  
1  
Repository, environments and CI/CD  
2-4  
Monorepo, pipelines, staging live  
2  
Identity, tenancy and RBAC  
4-7  
Secure multi-tenant login and roles  
3  
Core domain: jobs, customers, documents  
6-10  
Working job pipeline with files and audit log  
4  
Aerial measurement module  
9-14  
Order, ingest and edit roof measurements  
5  
Estimate engine and claim workflow  
12-20  
Claim-ready estimates, versions, packets  
6  
Supplier order coordination  
18-26  
Material lists, POs, delivery tracking  
7  
Lien waivers and e-signature  
22-32  
Waiver requests, signing and status board  
8  
Payments and ledger  
28-36  
Secure payments tied to milestones  
9  
Notifications, real-time and reporting  
30-40  
Alerts, SSE updates, dashboards  
10  
Responsive, SEO and accessibility pass  
34-42  
Mobile-ready UI, public site and SEO  
11  
Security hardening and compliance  
38-46  
Pen test fixes, readiness evidence  
12  
Beta, launch and iteration  
44-52  
Pilot customers, production launch  
Step 0: Discovery and Decisions (Weeks 1-2)  
1. Confirm the open questions in Sections 16 of this document and the PRD: launch states, cloud and region, hosting model, e-signature build or buy.  
2. Select and sign up for sandbox accounts with two aerial measurement providers, the payment gateway, an e-signature vendor, email/SMS and weather data.  
3. Engage legal counsel to review lien waiver templates for the launch states and the e-signature approach.  
4. Produce wireframes for the core flows (job, measurement, estimate, claim, order, waiver, payment) and a design system in Figma with tokens and mobile breakpoints.  
5. Write the threat model for authentication, multi-tenancy, signing and payments.  
Exit criteria: signed-off scope for MVP, vendor sandboxes available, designs reviewed, risks logged.  
Step 1: Repository, Environments and CI/CD (Weeks 2-4)  
1. Create the pnpm + Turborepo monorepo with apps/web, apps/api, packages/shared, packages/estimate-engine, packages/config.  
2. Configure TypeScript strict mode, ESLint, Prettier, commit hooks and conventional commits.  
3. Provision infrastructure as code (Terraform): networking, containers, MongoDB Atlas cluster, Redis, object storage, CDN, secrets manager.  
4. Build the CI pipeline: lint, type-check, unit tests, build, container scan; deploy to development and staging automatically.  
5. Set up Docker Compose for local development (MongoDB replica set, Redis, MinIO, mail catcher).  
6. Add baseline observability: structured logging, Sentry, OpenTelemetry traces, health endpoints.  
7. Scaffold the Express app (config, error handling, request context, Zod validation) and the Next.js app (layout, theme tokens, API client).  
Exit criteria: a hello-world feature deploys from pull request to staging with tests, logs and traces visible.  
Step 2: Identity, Tenancy and RBAC (Weeks 4-7)  
1. Implement company and user models, registration, invitations and email verification.  
2. Build login with Argon2, short-lived JWT access tokens and rotating refresh tokens in httpOnly cookies; add MFA for admins.  
3. Add the tenancy Mongoose plugin that enforces companyId on every query, and write automated cross-tenant leakage tests.  
4. Implement the permission map and RBAC middleware; share it with the frontend.  
5. Build Next.js auth flows: login, logout, password reset, session refresh, route protection middleware.  
6. Add the audit log service and the outbox/event bus skeleton.  
7. Set rate limiting and lockout rules with Redis.  
Exit criteria: two tenants cannot see each other's data in tests; roles restrict actions in UI and API.  
Step 3: Core Domain: Jobs, Customers and Documents (Weeks 6-10)  
1. Model and build APIs for customers, properties and jobs, including the configurable pipeline stages.  
2. Build the job list, kanban and job detail workspace in Next.js with TanStack Query.  
3. Implement document storage with presigned uploads, antivirus scanning, thumbnails and versioning.  
4. Add the activity timeline, tasks and comments on jobs.  
5. Add Atlas Search for jobs, customers and documents; add global search UI.  
6. Set up SSE infrastructure and a base notification service (in-app first).  
Exit criteria: an estimator can create a job, upload photos and see an activity trail on mobile and desktop.  
Step 4: Aerial Measurement Module (Weeks 9-14)  
1. Define the MeasurementProvider adapter interface and build a mock provider for tests.  
2. Implement provider one: address validation and geocoding, order, webhook/polling, report download and normalisation.  
3. Implement provider two and the provider selection and fallback logic.  
4. Create the measurementReports model, raw report storage and the effective-value calculation with overrides.  
5. Build the roof viewer (SVG/Canvas) with facet, pitch and edge editing and a change log.  
6. Show order status live via SSE; add imagery age warnings and cost tracking.  
7. Write contract tests with recorded fixtures and a sandbox smoke test.  
Exit criteria: an address produces parsed measurements in the job within the provider's turnaround, and overrides are audited.  
Step 5: Estimate Engine and Claim Workflow (Weeks 12-20)  
1. Build the shared estimate-engine package: line-item math, waste, overhead and profit, tax, ACV/RCV, depreciation and deductible, with heavy unit tests.  
2. Create price lists, the line-item library and estimate templates by roof type.  
3. Build the estimate builder UI (virtualised grid, live totals, templates) and versioning (original, approved, supplement) with a comparison view.  
4. Implement the claim model, status machine, communication log and adjuster contacts.  
5. Build the photo annotator and damage documentation checklists with required fields.  
6. Implement claim packet generation with the Chromium PDF worker and a status notification on completion.  
7. Add supplement workflow with variance highlighting and justification notes.  
8. Add homeowner estimate approval via a tokenised page (shares the signing framework in Step 7 where possible).  
Exit criteria: an estimator moves a job from measurement to a submitted claim packet; versions and diffs are correct against test cases.  
Step 6: Supplier Order Coordination (Weeks 18-26)  
1. Build the supplier directory, branches, contacts and catalog mapping (line item to SKU).  
2. Implement the material list generator with waste factors and unit conversion (squares to bundles).  
3. Create purchase orders with an optional approval step and PDF/email transmission through the notification service.  
4. Add the supplier confirmation link (no account required) and the order status machine.  
5. Add delivery scheduling, delivery verification with photos, and backorder handling.  
6. Implement invoice upload and price variance detection; link invoices to job costs.  
7. Prototype one supplier API integration behind the adapter tier model.  
Exit criteria: an approved estimate becomes a sent order with a confirmed delivery window and tracked receipt.  
Step 7: Lien Waivers and E-Signature (Weeks 22-32)  
1. Define payment milestones on jobs and the party registry (GC, subcontractors, suppliers).  
2. Build the template service: versioned state templates, field maps and a legal approval gate.  
3. Implement waiver generation, PDF rendering and requests by email/SMS.  
4. Build the public signing flow with tokenised links, consent capture, signature pad, optional OTP and IP/device evidence.  
5. Implement the transactional completion step: store executed PDF, SHA-256 hash, update status, audit entry, outbox event.  
6. Build the waiver status board (party by milestone) and validation checks (amount, through-date, signer).  
7. Add reminders and escalation rules through the scheduler; add the closeout waiver packet export.  
8. Implement payment readiness gating with a warning or hard-block company setting.  
Exit criteria: a progress payment cannot be marked ready without required waivers (per setting), and signed waivers are immutable and verifiable.  
Step 8: Payments and Ledger (Weeks 28-36)  
1. Implement the PaymentProvider adapter for the primary gateway and a mock for tests.  
2. Build hosted-field payment pages and payment-request links; configure the strict CSP for them.  
3. Build the webhook endpoint with signature verification, replay protection and queue-based processing.  
4. Implement the ledgerEntries model, payment records and milestone status updates in transactions.  
5. Add refunds with the dual-approval rule and step-up authentication; add dispute evidence packets.  
6. Build the reconciliation job and finance exception queue.  
7. Complete the payment security test suite: duplicate and out-of-order webhooks, tampered amounts, partial payments.  
8. Obtain the PCI SAQ A attestation and document the scope.  
Exit criteria: end-to-end sandbox payments reconcile to the ledger and update waiver readiness with no card data on our systems.  
Step 9: Notifications, Real-Time and Reporting (Weeks 30-40)  
1. Build notification templates and preferences for email, SMS and in-app, with rate limits and unsubscribe handling.  
2. Extend SSE events to measurement, claims, orders, waivers and payments.  
3. Build owner dashboards: pipeline, claim cycle time, approved vs requested, material variance, waiver aging, receivables.  
4. Add exports (CSV/PDF) as background jobs and accounting sync (QuickBooks/Xero) using the ledger.  
5. Add the public API and webhooks if included in scope.  
Exit criteria: dashboards load within the performance budget and match source data in validation checks.  
Step 10: Responsive, SEO and Accessibility Pass (Weeks 34-42)  
1. Audit every screen at 320, 768, 1024 and 1280 px; convert tables to cards on mobile and fix touch targets.  
2. Finish PWA support: app shell caching, offline photo and note queue, sync status UI.  
3. Optimise bundles, images and fonts to hit the Section 18.4 budgets; add Lighthouse CI gates.  
4. Build the marketing site and module landing pages with the Metadata API, sitemap, robots and JSON-LD.  
5. Apply noindex and no-referrer rules to the portal, signing and payment pages.  
6. Run accessibility audits (axe plus manual screen reader tests) and fix issues to WCAG 2.1 AA.  
7. Run real-device testing on the device matrix.  
Exit criteria: performance, accessibility and responsive gates pass in CI; search console set up and sitemaps submitted.  
Step 11: Security Hardening and Compliance (Weeks 38-46)  
1. Complete a full threat-model review and close findings.  
2. Enable DAST on staging and fix findings; run dependency and container scans to zero critical issues.  
3. Commission an external penetration test and remediate; retest.  
4. Finalise encryption, key rotation, backup restore tests and the disaster recovery runbook (RPO 15 min, RTO 2 h).  
5. Complete incident response runbooks and run a tabletop exercise.  
6. Run load tests (k6) to the capacity targets in Section 11; tune indexes and autoscaling.  
7. Start SOC 2 readiness: policies, access reviews, evidence collection.  
Exit criteria: no open critical or high findings; load, restore and failover tests passed.  
Step 12: Beta, Launch and Iteration (Weeks 44-52)  
1. Onboard 3-5 pilot roofing companies with training materials and a feedback channel.  
2. Monitor error rates, provider failures, queue health, report turnaround and waiver turnaround daily.  
3. Fix priority issues; tune templates, price lists and notification rules from real usage.  
4. Complete go-live checklist: legal approvals, support process, status page, billing, backups verified.  
5. Launch in the first states, then expand states and supplier integrations in monthly releases.  
6. Review success metrics from the PRD at 30, 90 and 180 days and reprioritise the backlog.  
Exit criteria: pilots live on production with metrics tracked and a prioritised post-launch roadmap.  
### 21.2 Cross-Cutting Practices Throughout
• Definition of done: code reviewed, tests written, accessibility and responsive checks passed, security checklist ticked, docs updated.  
• Release cadence: two-week sprints, feature flags for incomplete modules, staged rollouts with automatic rollback.  
• Quality gates: minimum coverage on the estimate engine, tenancy and waiver logic; end-to-end tests for each core journey.  
• Documentation: OpenAPI spec, architecture decision records, runbooks, onboarding guide.  
• Risk review: a fortnightly review of the Section 14 risks and open vendor dependencies.  
