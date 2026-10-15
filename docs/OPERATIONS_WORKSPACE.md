# Operations workspace

The Operations Intern workspace is the authenticated `/dashboard` view for users with the `operations` role. It shows assigned jobs and operational queues for jobs with no uploaded files, claims awaiting follow-up, requested/viewed waivers, supplier orders in progress, and open follow-up tasks.

## Onboard an intern

1. An owner or admin opens **Operations Interns** from the portal navigation.
2. Invite the intern by name and work email. RoofDesk emails a single-use setup link that expires after 48 hours. If the email provider is not configured, copy the link and share it securely with the intended recipient.
3. The intern accepts the invitation and sets a password of at least 10 characters, then signs in.
4. An owner, admin, or project manager opens a job and assigns the intern under **Operations assignment**.
5. The intern sees only jobs assigned to her. The API also checks assignment before allowing access to a job or its nested resources.

## Intern permissions

Operations Interns can view assigned job records and queues, create internal follow-up tasks for assigned jobs, and update tasks attached to those assigned jobs. They cannot edit job or claim details, create estimates or orders, request waivers, request or refund payments, view company reports, invite users, or change company settings. The existing app has no dedicated field-staff task scheduler; these tasks are internal follow-up records, not automated reminders.

Owners, admins, and project managers see the company-wide operations queues and can create or update tasks. Job assignment changes are recorded in the audit log.
