# RoofDesk India-first MVP workflow

## Release scope

- Geography: Pan-India.
- Customers: residential and commercial roofing contractors, especially small and medium-sized businesses.
- Job types: residential roofing, commercial roofing, and roof repair.
- Solar installation: out of scope for the initial release.
- Market defaults for new companies: India, INR, English (India), Asia/Kolkata, metric; Hindi is available.
- Measurement provider: RoofV, gated behind server-side credentials, feature flag, coordinates, and explicit user consent. Manual/site-measured values remain available.
- Estimate export: line-item CSV and printable PDF for customer quotation review; this is not a vendor-native estimating-project format.
- Payments: mock mode only.
- Operations Intern workspace: included.

## Job workflow

1. Create a residential, commercial, or repair job with Indian address lines, city/locality, district, state/UT, and six-digit PIN. Add a map pin when possible.
2. Add job photos and documents. Assign operational follow-ups to the appropriate team member.
3. Record site measurements or, when enabled and authorized, request a RoofV measurement using the coordinates and consent flow. Review confidence, outline, caveats, and review status before using quantities.
4. Maintain a company price list with locally verified material and labour rates. Do not issue an estimate with blank/zero rates.
5. Prepare a customer quotation and confirm all tax or other charges with the company CA. RoofDesk does not calculate or certify GST.
6. Create supplier orders, record delivery dates, attach invoices, and review price variance against the saved order.
7. Complete assigned follow-up tasks, sync offline photos while online, and review in-app overdue reminders.
8. Record payment status using mock mode only; do not represent a simulation as money collected.

## Legacy records and legal review

Historical U.S. jobs and financial values are retained without conversion. Insurance claim and waiver code remains for compatibility, but it is not an Indian workflow. The Indian interface hides those U.S. screens for India jobs. Do not use old U.S. statutory forms or assume an Indian equivalent without Indian counsel review. Tax and contract behavior require CA/counsel review.

## Forgot-password flow

1. On `/login`, select **Forgot password?** and submit the account email.
2. The app always displays a generic response so account existence is not disclosed.
3. With local `EMAIL_PROVIDER=log`, open the reset link printed in the API terminal. With Resend, use a verified sender and inspect the delivery log.
4. Choose a new password. The link expires after one hour, is single-use, and successful reset revokes active sessions.

## Staging checks

Use invented test customers and a separate Preview database. Verify address validation, INR/metric display, Hindi fallback, RoofV only if credentialed, zero-rate warning, photo sync, invoice variance, operations roles, password reset, and mock payments. Do not test with real customer data or live charges. Production deployment is a separate action.
